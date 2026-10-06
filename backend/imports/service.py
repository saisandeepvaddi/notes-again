import datetime
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func
from sqlmodel import Session, col, select

from db.models import Note, Project, Tag
from notes.factory import build_note
from notes.pacing import MAX_PER_DAY, Pacer
from notes.router import get_default_algorithm
from tags.difficulty import DIFFICULTY_TAGS, Difficulty

from .review_state import (
    ReviewState,
    ReviewStateError,
    apply_review,
    parse_datetime,
    parse_review,
)
from .schema import ImportDeckSummary, ImportIssue, ImportResult

MAX_NOTES = 10_000
MAX_ISSUES = 200
DIFFICULTIES = ("easy", "medium", "hard")


class ImportFileError(ValueError):
    pass


@dataclass
class Row:
    index: int
    name: str
    content: str
    deck: str | None
    tags: list[str]
    difficulty: Difficulty
    review: ReviewState | None = None
    created_at: datetime.datetime | None = None
    updated_at: datetime.datetime | None = None


def _key(name: str) -> str:
    return name.strip().lower()


def _text(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _parse_tags(raw: Any) -> list[str] | None:
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = raw.split(",")
    if not isinstance(raw, list) or not all(isinstance(t, str) for t in raw):
        return None
    return [t.strip() for t in raw if t.strip()]


@dataclass
class FileOptions:
    default: int | None = None
    by_deck: dict[str, int] = field(default_factory=dict)
    paused_decks: set[str] = field(default_factory=set)


def _parse_per_day(value: Any, where: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= MAX_PER_DAY:
        raise ImportFileError(f'"per_day" {where} must be a whole number from 0 to {MAX_PER_DAY}.')
    return value


def normalize(payload: Any) -> tuple[list[Row], list[ImportIssue], FileOptions]:
    entries: list[tuple[str | None, Any]] = []
    rates = FileOptions()

    if isinstance(payload, list):
        entries = [(None, item) for item in payload]
    elif isinstance(payload, dict):
        if "decks" not in payload and "notes" not in payload:
            raise ImportFileError(
                'Expected a list of notes, or an object with a "decks" and/or "notes" list.'
            )
        if "per_day" in payload:
            rates.default = _parse_per_day(payload["per_day"], "at the top of the file")
        decks = payload.get("decks", [])
        if not isinstance(decks, list):
            raise ImportFileError('"decks" must be a list.')
        for i, deck in enumerate(decks, start=1):
            if not isinstance(deck, dict):
                raise ImportFileError(f"Deck #{i} must be an object with a name and notes.")
            deck_name = _text(deck.get("name"))
            if deck_name is None:
                raise ImportFileError(f'Deck #{i} is missing a "name".')
            if "per_day" in deck:
                rates.by_deck.setdefault(
                    _key(deck_name), _parse_per_day(deck["per_day"], f'in deck "{deck_name}"')
                )
            deck_paused = deck.get("paused", False)
            if not isinstance(deck_paused, bool):
                raise ImportFileError(f'"paused" in deck "{deck_name}" must be true or false.')
            if deck_paused:
                rates.paused_decks.add(_key(deck_name))
            deck_notes = deck.get("notes", [])
            if not isinstance(deck_notes, list):
                raise ImportFileError(f'"notes" in deck "{deck_name}" must be a list.')
            entries.extend((deck_name, item) for item in deck_notes)
        loose = payload.get("notes", [])
        if not isinstance(loose, list):
            raise ImportFileError('"notes" must be a list.')
        entries.extend((None, item) for item in loose)
    else:
        raise ImportFileError("Expected a JSON list or object.")

    if len(entries) > MAX_NOTES:
        raise ImportFileError(
            f"That file has {len(entries):,} notes; the limit is {MAX_NOTES:,} per import. "
            "Split it into smaller files."
        )

    rows: list[Row] = []
    issues: list[ImportIssue] = []
    for index, (enclosing_deck, item) in enumerate(entries, start=1):
        if not isinstance(item, dict):
            issues.append(ImportIssue(row=index, reason="Not an object."))
            continue

        name = _text(item.get("name"))
        raw_deck = item.get("deck", item.get("project"))
        deck = _text(raw_deck) or enclosing_deck
        if name is None:
            issues.append(ImportIssue(row=index, deck=deck, reason='Missing "name".'))
            continue

        def issue(reason: str, index: int = index, name: str = name, deck: str | None = deck):
            issues.append(ImportIssue(row=index, name=name, deck=deck, reason=reason))

        if raw_deck is not None and not isinstance(raw_deck, str):
            issue('"deck" must be text.')
            continue
        content = item.get("content", "")
        if content is None:
            content = ""
        if not isinstance(content, str):
            issue('"content" must be text.')
            continue
        tags = _parse_tags(item.get("tags"))
        if tags is None:
            issue('"tags" must be a list of text (or one comma-separated string).')
            continue
        raw_difficulty = item.get("difficulty")
        difficulty = "medium" if raw_difficulty is None else str(raw_difficulty).strip().lower()
        if difficulty not in DIFFICULTIES:
            issue(f'Unknown difficulty "{raw_difficulty}" (use easy, medium or hard).')
            continue
        try:
            review = None if item.get("review") is None else parse_review(item["review"])
            created_at = (
                None if item.get("created_at") is None else parse_datetime(item["created_at"], "created_at")
            )
            updated_at = (
                None if item.get("updated_at") is None else parse_datetime(item["updated_at"], "updated_at")
            )
        except ReviewStateError as error:
            issue(str(error))
            continue

        rows.append(
            Row(
                index=index,
                name=name,
                content=content,
                deck=deck,
                tags=tags,
                difficulty=difficulty,  # type: ignore[arg-type]
                review=review,
                created_at=created_at,
                updated_at=updated_at,
            )
        )
    return rows, issues, rates


@dataclass
class PlannedNote:
    row: Row
    deck_key: str | None
    tag_keys: list[str]
    remind_at: datetime.datetime
    day: int
    paused: bool
    in_review: bool = True


@dataclass
class Plan:
    kept: list[PlannedNote]
    new_decks: dict[str, str]
    new_tags: dict[str, str]
    existing_decks: dict[str, Project]
    existing_tags: dict[str, Tag]
    result: ImportResult
    paused: bool = False
    paused_decks: set[str] = field(default_factory=set)


def plan_import(
    session: Session,
    rows: list[Row],
    issues: list[ImportIssue],
    rates: FileOptions,
    *,
    per_day: int,
    default_deck: str | None,
    tz_offset_minutes: int,
    dry_run: bool,
    paused: bool = False,
    in_review: bool = True,
) -> Plan:
    existing_decks = {
        _key(p.name): p
        for p in session.exec(select(Project).where(col(Project.deleted_at).is_(None))).all()
    }
    deck_key_by_id = {p.id: key for key, p in existing_decks.items()}
    existing_tags = {_key(t.name): t for t in session.exec(select(Tag)).all()}

    taken: set[tuple[str | None, str]] = set()
    for project_id, name in session.exec(
        select(Note.project_id, func.lower(func.trim(Note.name))).where(
            col(Note.deleted_at).is_(None)
        )
    ).all():
        if project_id is None:
            taken.add((None, name))
        else:
            taken.add((deck_key_by_id.get(project_id, f"#{project_id}"), name))

    file_default = rates.default if rates.default is not None else per_day

    def rate_for(deck_key: str | None) -> int:
        if deck_key is None:
            return file_default
        return rates.by_deck.get(deck_key, file_default)

    fallback_deck = _text(default_deck)
    new_decks: dict[str, str] = {}
    new_tags: dict[str, str] = {}
    dropped_difficulty_tags: dict[str, int] = {}
    per_deck: dict[str | None, ImportDeckSummary] = {}
    all_issues = list(issues)
    kept_rows: list[tuple[Row, str | None, list[str]]] = []
    duplicates = 0

    def summary(deck_key: str | None, display: str | None) -> ImportDeckSummary:
        if deck_key not in per_deck:
            per_deck[deck_key] = ImportDeckSummary(
                name=display,
                is_new=deck_key is not None and deck_key not in existing_decks,
                per_day=rate_for(deck_key),
                to_create=0,
                skipped=0,
            )
        return per_deck[deck_key]

    for row in rows:
        deck_name = _text(row.deck) or fallback_deck
        deck_key = _key(deck_name) if deck_name else None
        if deck_key is not None and deck_key not in existing_decks and deck_key not in new_decks:
            new_decks[deck_key] = deck_name  # type: ignore[assignment]
        display = None
        if deck_key is not None:
            display = existing_decks[deck_key].name if deck_key in existing_decks else new_decks[deck_key]
        deck_summary = summary(deck_key, display)

        pair = (deck_key, _key(row.name))
        if pair in taken:
            duplicates += 1
            deck_summary.skipped += 1
            where = f'deck "{display}"' if display else "no deck"
            all_issues.append(
                ImportIssue(
                    row=row.index,
                    name=row.name,
                    deck=display,
                    reason=f"Skipped: a note with this name already exists ({where}), "
                    "or appeared earlier in this file.",
                )
            )
            continue
        taken.add(pair)

        tag_keys: list[str] = []
        for tag_name in row.tags:
            key = _key(tag_name)
            if key in tag_keys:
                continue
            existing = existing_tags.get(key)
            if existing is not None and existing.is_difficulty:
                dropped_difficulty_tags[existing.name] = (
                    dropped_difficulty_tags.get(existing.name, 0) + 1
                )
                continue
            if existing is None and key not in new_tags:
                new_tags[key] = tag_name
            tag_keys.append(key)
        deck_summary.to_create += 1
        kept_rows.append((row, deck_key, tag_keys))

    pacer = Pacer(tz_offset_minutes)
    position_in_group: dict[str | None, int] = {}
    kept: list[PlannedNote] = []
    for row, deck_key, tag_keys in kept_rows:
        note_in_review = in_review and (row.review is None or row.review.in_review)
        if not note_in_review:
            remind_at, day = pacer.now, 0
        elif row.review is not None:
            remind_at = row.review.due_at or pacer.due_at(0)
            day = max(0, (remind_at - pacer.today_start) // datetime.timedelta(days=1))
        else:
            position = position_in_group.get(deck_key, 0)
            position_in_group[deck_key] = position + 1
            day = 0 if paused else pacer.day(position, rate_for(deck_key))
            remind_at = pacer.due_at(day)
        kept.append(
            PlannedNote(
                row=row,
                deck_key=deck_key,
                tag_keys=tag_keys,
                remind_at=remind_at,
                day=day,
                paused=note_in_review
                and (paused or (row.review is not None and row.review.paused)),
                in_review=note_in_review,
            )
        )
    scheduled = [planned for planned in kept if planned.in_review]
    reviewing = [planned for planned in scheduled if not planned.paused]

    warnings = [
        f'Tag "{name}" is a built-in difficulty label, so it was ignored on {count} '
        f'note{"" if count == 1 else "s"} (set "difficulty" instead).'
        for name, count in dropped_difficulty_tags.items()
    ]
    all_issues.sort(key=lambda issue: issue.row)
    result = ImportResult(
        dry_run=dry_run,
        notes_created=len(kept),
        duplicates_skipped=duplicates,
        invalid_skipped=len(issues),
        new_decks=len(new_decks),
        new_tags=len(new_tags),
        decks=list(per_deck.values()),
        first_due=min((p.remind_at for p in scheduled), default=None),
        last_due=max((p.remind_at for p in scheduled), default=None),
        due_today=sum(1 for planned in reviewing if planned.day == 0),
        days_span=max((planned.day for planned in reviewing), default=-1) + 1,
        paused=paused and in_review,
        note_only=not in_review,
        restored_reviews=sum(1 for planned in kept if planned.row.review is not None),
        issues=all_issues[:MAX_ISSUES],
        issues_truncated=len(all_issues) > MAX_ISSUES,
        warnings=warnings,
    )
    return Plan(
        kept,
        new_decks,
        new_tags,
        existing_decks,
        existing_tags,
        result,
        paused and in_review,
        rates.paused_decks,
    )


def execute_plan(session: Session, plan: Plan) -> None:
    decks = dict(plan.existing_decks)
    for key, name in plan.new_decks.items():
        project = Project(name=name, paused=plan.paused or key in plan.paused_decks)
        session.add(project)
        decks[key] = project
    tags = dict(plan.existing_tags)
    for key, name in plan.new_tags.items():
        tag = Tag(name=name)
        session.add(tag)
        tags[key] = tag
    session.flush()

    difficulty_tags = {
        difficulty: tags[_key(defaults.name)] for difficulty, defaults in DIFFICULTY_TAGS.items()
    }
    algorithm = get_default_algorithm(session)
    for planned in plan.kept:
        row = planned.row
        note = build_note(
            name=row.name,
            content=row.content,
            algorithm=algorithm,
            difficulty_tag=difficulty_tags[row.difficulty],
            tags=[tags[key] for key in planned.tag_keys],
            project=decks[planned.deck_key] if planned.deck_key is not None else None,
            first_reminder_at=planned.remind_at,
            paused=planned.paused,
            in_review=planned.in_review,
        )
        if row.review is not None:
            apply_review(
                note, row.review, fallback_due=planned.remind_at, in_review=planned.in_review
            )
        if row.created_at is not None:
            note.created_at = row.created_at
        if row.updated_at is not None:
            note.updated_at = row.updated_at
        session.add(note)
    session.commit()
