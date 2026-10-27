import re
from dataclasses import dataclass

from sqlalchemy import and_, or_, text
from sqlmodel import col

from db.models import Note
from notes.title_text import markdown_title_text

MAX_QUERY_LENGTH = 200
MIN_INDEXED_LENGTH = 3
MARK_START = "\x02"
MARK_END = "\x03"

_FENCE = re.compile(r"^\s*(```|~~~).*$", re.MULTILINE)
_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True)
class SearchTerms:
    indexed: list[str]
    short: list[str]

    @property
    def all(self) -> list[str]:
        return self.indexed + self.short


def parse_terms(raw: str) -> SearchTerms:
    words = raw[:MAX_QUERY_LENGTH].split()
    unique = list(dict.fromkeys(words))
    return SearchTerms(
        indexed=[w for w in unique if len(w) >= MIN_INDEXED_LENGTH],
        short=[w for w in unique if len(w) < MIN_INDEXED_LENGTH],
    )


def match_expression(terms: list[str]) -> str:
    return " AND ".join('"' + term.replace('"', '""') + '"' for term in terms)


def like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def short_term_condition(term: str):
    pattern = like_pattern(term)
    return or_(
        col(Note.name).ilike(pattern, escape="\\"),
        col(Note.content).ilike(pattern, escape="\\"),
    )


def note_search_condition(raw: str):
    terms = parse_terms(raw)
    if not terms.all:
        return None
    conditions = [short_term_condition(term) for term in terms.short]
    if terms.indexed:
        conditions.append(
            col(Note.id).in_(
                text(
                    "SELECT rowid FROM notes_fts WHERE notes_fts MATCH :match"
                ).bindparams(match=match_expression(terms.indexed))
            )
        )
    return and_(*conditions)


def plain_text(markdown: str) -> str:
    text_only = _FENCE.sub(" ", markdown)
    lines = (markdown_title_text(line) or "" for line in text_only.splitlines())
    return _WHITESPACE.sub(" ", " ".join(lines)).strip()


def _term_pattern(terms: list[str]) -> re.Pattern[str] | None:
    if not terms:
        return None
    ordered = sorted(terms, key=len, reverse=True)
    return re.compile("|".join(re.escape(term) for term in ordered), re.IGNORECASE)


def mark(value: str, terms: list[str]) -> str:
    pattern = _term_pattern(terms)
    if pattern is None:
        return value
    return pattern.sub(lambda m: f"{MARK_START}{m.group(0)}{MARK_END}", value)


def snippet(content: str, terms: list[str], before: int = 40, length: int = 160) -> str:
    plain = plain_text(content)
    pattern = _term_pattern(terms)
    found = pattern.search(plain) if pattern else None
    if found is None:
        excerpt = plain[:length]
        return excerpt + ("…" if len(plain) > length else "")
    start = max(0, found.start() - before)
    if start > 0:
        space = plain.find(" ", start)
        start = space + 1 if 0 <= space < found.start() else start
    end = min(len(plain), start + length)
    if end < len(plain):
        space = plain.rfind(" ", found.end(), end)
        end = space if space > 0 else end
    excerpt = plain[start:end]
    return (
        ("…" if start > 0 else "")
        + mark(excerpt, terms)
        + ("…" if end < len(plain) else "")
    )
