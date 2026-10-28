import datetime
import json
import re

from db.models import Note
from notes.title_text import markdown_title_text
from notes.utils import to_utc
from tags.difficulty import DIFFICULTY_TAGS

_FRONTMATTER = re.compile(r"\A---[ \t]*\n(.*?)\n---[ \t]*(?:\n|\Z)", re.DOTALL)
_FRONTMATTER_KEY = re.compile(r"^([A-Za-z0-9_-]+)\s*:")
_TITLE_LINK = re.compile(r"\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
_HEADING_PREFIX = re.compile(r"^\s*#{1,6}\s+")
_FIRST_H1 = re.compile(r"\A#\s+(.+?)\s*#*\s*(?:\n|\Z)")
_FILENAME_UNSAFE = re.compile(r"[^\w\s-]")
_FILENAME_SPACES = re.compile(r"[-\s]+")

_DIFFICULTY_KEYS = {defaults.name: key for key, defaults in DIFFICULTY_TAGS.items()}


def _quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _timestamp(value: datetime.datetime) -> str:
    return to_utc(value).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _status(note: Note) -> str:
    if not note.in_review:
        return "note-only"
    return "paused" if note.paused_at is not None else "in-review"


def _split_frontmatter(content: str) -> tuple[list[str], str]:
    match = _FRONTMATTER.match(content)
    if match is None:
        return [], content
    return match.group(1).splitlines(), content[match.end() :]


def _merge_user_frontmatter(ours: list[str], theirs: list[str]) -> list[str]:
    if not theirs:
        return ours
    their_keys = {
        match.group(1)
        for line in theirs
        if (match := _FRONTMATTER_KEY.match(line)) is not None
    }
    kept = [
        line
        for line in ours
        if (match := _FRONTMATTER_KEY.match(line)) is None
        or match.group(1) not in their_keys
    ]
    return kept + theirs


def _frontmatter(note: Note, title: str) -> list[str]:
    lines = [f"title: {_quote(title)}"]
    source = _TITLE_LINK.search(note.name)
    if source:
        lines.append(f"source: {_quote(source.group(1))}")
    if note.project is not None:
        lines.append(f"project: {_quote(note.project.name)}")
    tags = sorted(
        (tag.name for tag in note.tags if not tag.is_difficulty), key=str.lower
    )
    if tags:
        lines.append(f"tags: [{', '.join(_quote(tag) for tag in tags)}]")
    difficulty = next(
        (_DIFFICULTY_KEYS[t.name] for t in note.tags if t.name in _DIFFICULTY_KEYS),
        None,
    )
    if difficulty:
        lines.append(f"difficulty: {difficulty}")
    status = _status(note)
    lines.append(f"status: {status}")
    live = [r for r in note.reminders if r.deleted_at is None]
    pending = sorted(
        (r.remind_at for r in live if r.reviewed_at is None),
    )
    if status == "in-review" and pending:
        lines.append(f"next_review: {_timestamp(pending[0])}")
    reviews = sum(1 for r in live if r.reviewed_at is not None)
    lines.append(f"reviews: {reviews}")
    lines.append(f"created: {_timestamp(note.created_at)}")
    lines.append(f"updated: {_timestamp(note.updated_at)}")
    return lines


def note_markdown(note: Note) -> str:
    title = (markdown_title_text(note.name) or "").strip() or "Untitled"
    heading = _HEADING_PREFIX.sub("", note.name.strip()) or "Untitled"
    user_frontmatter, body = _split_frontmatter(note.content.replace("\r\n", "\n"))
    body = body.strip("\n")
    first_h1 = _FIRST_H1.match(body)
    if first_h1 and markdown_title_text(first_h1.group(1)) == title:
        body = body[first_h1.end() :].lstrip("\n")

    frontmatter = _merge_user_frontmatter(_frontmatter(note, title), user_frontmatter)
    parts = ["---", *frontmatter, "---", "", f"# {heading}"]
    if body:
        parts += ["", body]
    return "\n".join(parts) + "\n"


def note_filename(note: Note) -> str:
    title = markdown_title_text(note.name) or ""
    slug = _FILENAME_SPACES.sub("-", _FILENAME_UNSAFE.sub("", title)).strip("-_")
    return f"{slug[:80].rstrip('-_') or f'note-{note.id}'}.md"
