"""Bulk note import: parse an uploaded JSON structure, plan what would be
created, and (optionally) write it.

`plan_import` only reads the database, so a dry run and a real import share
exactly the same logic -- the preview is what actually gets written.
"""

import datetime
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func
from sqlmodel import Session, col, select

from db.models import Note, Project, Tag, utcnow
from notes.factory import build_note
from notes.router import get_default_algorithm
from tags.difficulty import DIFFICULTY_TAGS, Difficulty

from .schema import ImportDeckSummary, ImportIssue, ImportResult

MAX_NOTES = 10_000
MAX_PER_DAY = 1_000
MAX_ISSUES = 200
DIFFICULTIES = ("easy", "medium", "hard")


class ImportFileError(ValueError):
    """The file as a whole is unusable (wrong shape, too big, ...)."""


@dataclass
class Row:
    index: int  # 1-based position in the file (decks first, then loose notes)
    name: str
    content: str
    deck: str | None
    tags: list[str]
    difficulty: Difficulty


def _key(name: str) -> str:
    return name.strip().lower()


def _text(value: Any) -> str | None:
    """Stripped non-empty text, or None."""
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _parse_tags(raw: Any) -> list[str] | None:
    """A list of names or one comma-separated string; None if malformed."""
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = raw.split(",")
    if not isinstance(raw, list) or not all(isinstance(t, str) for t in raw):
        return None
    return [t.strip() for t in raw if t.strip()]


@dataclass
class FileRates:
    """How many of each group's notes become due per day, as the file set them.
    A deck's own `per_day` beats the file-level one; anything unset falls back
    to the default chosen at import time."""

    default: int | None = None
    by_deck: dict[str, int] = field(default_factory=dict)  # lowercase deck name -> per_day


def _parse_per_day(value: Any, where: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= MAX_PER_DAY:
        raise ImportFileError(f'"per_day" {where} must be a whole number from 0 to {MAX_PER_DAY}.')
    return value


def normalize(payload: Any) -> tuple[list[Row], list[ImportIssue], FileRates]:
    """Flattens the file into ordered rows. Structural problems raise
    ImportFileError; problems with an individual note become issues and that
    note is skipped."""
    entries: list[tuple[str | None, Any]] = []  # (enclosing deck, raw note)
    rates = FileRates()

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
        # A note's own "deck" (or "project") wins over the deck it's nested in.
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

        rows.append(
            Row(
                index=index,
                name=name,
                content=content,
                deck=deck,
                tags=tags,
                difficulty=difficulty,  # type: ignore[arg-type]
            )
        )
    return rows, issues, rates


@dataclass
class PlannedNote:
    row: Row
    deck_key: str | None
    tag_keys: list[str]
    remind_at: datetime.datetime
    day: int  # 0 = due now


@dataclass
class Plan:
    kept: list[PlannedNote]
    # first-seen casing for anything that doesn't exist yet, keyed by lowercase
    new_decks: dict[str, str]
    new_tags: dict[str, str]
    existing_decks: dict[str, Project]
    existing_tags: dict[str, Tag]
    result: ImportResult


def _today_start_utc(tz_offset_minutes: int) -> datetime.datetime:
    """Start of the user's local "today", as UTC. tz_offset_minutes is the
    browser's getTimezoneOffset()."""
    offset = datetime.timedelta(minutes=tz_offset_minutes)
    local_now = utcnow().replace(tzinfo=None) - offset
    local_midnight = datetime.datetime.combine(local_now.date(), datetime.time.min)
    return (local_midnight + offset).replace(tzinfo=datetime.UTC)


def plan_import(
    session: Session,
    rows: list[Row],
    issues: list[ImportIssue],
    rates: FileRates,
    *,
    per_day: int,
    default_deck: str | None,
    tz_offset_minutes: int,
    dry_run: bool,
) -> Plan:
    existing_decks = {
        _key(p.name): p
        for p in session.exec(select(Project).where(col(Project.deleted_at).is_(None))).all()
    }
    deck_key_by_id = {p.id: key for key, p in existing_decks.items()}
    existing_tags = {_key(t.name): t for t in session.exec(select(Tag)).all()}

    # (deck key or None, lowercase name) for every live note, to skip duplicates
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

    # Stagger first reviews, per deck: a deck's Nth kept note (in file order)
    # falls on day N // its per_day. Day 0 is due now; later days start at the
    # user's local midnight. Notes with no deck form their own group. The
    # millisecond tie-break keeps file order in the review queue (which sorts
    # by remind_at); the "now" base sits a minute in the past so it never lands
    # in the future.
    now = utcnow()
    today_start = _today_start_utc(tz_offset_minutes)
    position_in_group: dict[str | None, int] = {}
    kept: list[PlannedNote] = []
    for i, (row, deck_key, tag_keys) in enumerate(kept_rows):
        rate = rate_for(deck_key)
        position = position_in_group.get(deck_key, 0)
        position_in_group[deck_key] = position + 1
        day = position // rate if rate > 0 else 0
        base = (
            now - datetime.timedelta(minutes=1)
            if day == 0
            else today_start + datetime.timedelta(days=day)
        )
        kept.append(
            PlannedNote(
                row=row,
                deck_key=deck_key,
                tag_keys=tag_keys,
                remind_at=base + datetime.timedelta(milliseconds=i),
                day=day,
            )
        )

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
        first_due=min((p.remind_at for p in kept), default=None),
        last_due=max((p.remind_at for p in kept), default=None),
        due_today=sum(1 for planned in kept if planned.day == 0),
        days_span=max((planned.day for planned in kept), default=-1) + 1,
        issues=all_issues[:MAX_ISSUES],
        issues_truncated=len(all_issues) > MAX_ISSUES,
        warnings=warnings,
    )
    return Plan(kept, new_decks, new_tags, existing_decks, existing_tags, result)


def execute_plan(session: Session, plan: Plan) -> None:
    """Writes the plan in ONE transaction: all or nothing."""
    decks = dict(plan.existing_decks)
    for key, name in plan.new_decks.items():
        project = Project(name=name)
        session.add(project)
        decks[key] = project
    tags = dict(plan.existing_tags)
    for key, name in plan.new_tags.items():
        tag = Tag(name=name)
        session.add(tag)
        tags[key] = tag
    session.flush()  # assigns ids and surfaces any constraint problem early

    difficulty_tags = {
        difficulty: tags[_key(defaults.name)] for difficulty, defaults in DIFFICULTY_TAGS.items()
    }
    algorithm = get_default_algorithm(session)
    session.add_all(
        build_note(
            name=planned.row.name,
            content=planned.row.content,
            algorithm=algorithm,
            difficulty_tag=difficulty_tags[planned.row.difficulty],
            tags=[tags[key] for key in planned.tag_keys],
            project=decks[planned.deck_key] if planned.deck_key is not None else None,
            first_reminder_at=planned.remind_at,
        )
        for planned in plan.kept
    )
    session.commit()
