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
    in_review: bool = True,
) -> Note:
    note = Note(
        name=name,
        content=content,
        tags=[*tags, difficulty_tag],
        user_id=1,
        algorithm=algorithm,
        in_review=in_review,
        paused_at=utcnow() if paused and in_review else None,
    )
    note.ease_factor = difficulty_tag.default_ease_factor or note.ease_factor
    for field, value in new_note_scheduling_state(algorithm).items():
        setattr(note, field, value)
    if project is not None:
        note.project = project
    if in_review:
        note.reminders = [
            Reminder(remind_at=first_reminder_at, **snapshot_for_new_reminder(note))
        ]
    return note
