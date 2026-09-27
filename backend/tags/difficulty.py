from typing import Literal, NamedTuple

Difficulty = Literal["easy", "medium", "hard"]


class DifficultyTagDefaults(NamedTuple):
    name: str
    default_ease_factor: float


DIFFICULTY_TAGS: dict[Difficulty, DifficultyTagDefaults] = {
    "easy": DifficultyTagDefaults(name="Easy", default_ease_factor=2.8),
    "medium": DifficultyTagDefaults(name="Medium", default_ease_factor=2.5),
    "hard": DifficultyTagDefaults(name="Hard", default_ease_factor=1.8),
}
