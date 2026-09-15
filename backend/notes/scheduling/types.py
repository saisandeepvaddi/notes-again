from typing import Literal

# Per-review grade, Anki's own 4-button scale. Distinct from tags.difficulty's
# Difficulty (Easy/Medium/Hard) -- that's a sticky, manually-set note label,
# not a review rating.
Rating = Literal["again", "hard", "good", "easy"]

# Which scheduler produced a note's current scheduling state.
Algorithm = Literal["sm2", "fsrs"]
