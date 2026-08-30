from backend.db.models import Note, User, db


def setup_db() -> None:
    db.connect()
    db.create_tables([User, Note])


def close_db() -> None:
    db.close()
