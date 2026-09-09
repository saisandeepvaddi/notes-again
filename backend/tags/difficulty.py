from typing import Literal, NamedTuple

Difficulty = Literal["easy", "medium", "hard"]


class DifficultyTagDefaults(NamedTuple):
    name: str
    default_ease_factor: float


# Difficulty tags are sticky, built-in tags every note carries exactly one
# of. Applying one sets the note's starting SM-2 ease factor: a lower ease
# factor grows intervals more slowly, meaning more review iterations before
# a note is considered "learned".
DIFFICULTY_TAGS: dict[Difficulty, DifficultyTagDefaults] = {
    "easy": DifficultyTagDefaults(name="Easy", default_ease_factor=2.8),
    "medium": DifficultyTagDefaults(name="Medium", default_ease_factor=2.5),
    "hard": DifficultyTagDefaults(name="Hard", default_ease_factor=1.8),
}
