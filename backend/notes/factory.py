import datetime

from db.models import Note, Project, Reminder, Tag, utcnow
from notes.scheduling import (
    Algorithm,
    new_note_scheduling_state,
    snapshot_for_new_reminder,
)


def build_note(
    *,
    name: str,
    content: str,
    algorithm: Algorithm,
    difficulty_tag: Tag,
    tags: list[Tag],
    project: Project | None,
    first_reminder_at: datetime.datetime,
    paused: bool = False,
) -> Note:
    """Builds a fully-formed new Note (not yet added to a session): exactly one
    difficulty tag, ease factor seeded from it, algorithm-specific scheduling
    state, and its single pending Reminder. Shared by note creation and bulk
    import so the two can't drift apart.

    `tags` must not contain difficulty tags -- callers filter them out.
    """
    note = Note(
        name=name,
        content=content,
        tags=[*tags, difficulty_tag],
        user_id=1,
        algorithm=algorithm,
        paused_at=utcnow() if paused else None,
    )
    note.ease_factor = difficulty_tag.default_ease_factor or note.ease_factor
    for field, value in new_note_scheduling_state(algorithm).items():
        setattr(note, field, value)
    if project is not None:
        note.project = project
    note.reminders = [Reminder(remind_at=first_reminder_at, **snapshot_for_new_reminder(note))]
    return note
