import sys

from sqlmodel import Session

from db.setup import setup_db
from local_auth.service import reset_local_auth


def main() -> int:
    engine = setup_db()
    if engine is None:
        print("Couldn't open the database.", file=sys.stderr)
        return 1
    with Session(engine) as session:
        record = reset_local_auth(session)
        print("Sign-in reset. Everyone is signed out. Sign in with")
        print(f"  username: {record.username}")
        print(f"  password: {record.initial_password}")
        print("and choose a new username and password.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
