from datetime import datetime
from typing import Literal

from peewee import (
    BooleanField,
    CharField,
    DatabaseProxy,
    DateTimeField,
    ForeignKeyField,
    Model,
    TextField,
)

db_proxy = DatabaseProxy()


class DBBaseModel(Model):
    class Meta:
        database = db_proxy


class User(DBBaseModel):
    username = CharField(unique=True)
    created_at = DateTimeField(default=datetime.now, index=True)
    updated_at = DateTimeField(default=datetime.now, index=True)
    deleted_at = DateTimeField(null=True)

    class Meta(DBBaseModel):  # type: ignore
        table_name = "users"


class Note(DBBaseModel):
    user = ForeignKeyField(User, backref="users", on_delete="CASCADE")
    content = TextField()
    created_at = DateTimeField(default=datetime.now, index=True)
    updated_at = DateTimeField(default=datetime.now, index=True)
    deleted_at = DateTimeField(null=True)

    class Meta(DBBaseModel):  # type: ignore
        table_name = "notes"


class Reminder(DBBaseModel):
    note = ForeignKeyField(Note, backref="notes", on_delete="CASCADE")
    remind_at = DateTimeField(index=True)
    is_active = BooleanField(default=True)
    created_at = DateTimeField(default=datetime.now, index=True)
    updated_at = DateTimeField(default=datetime.now, index=True)
    deleted_at = DateTimeField(null=True)

    class Meta:  # type: ignore
        table_name = "reminders"
        indexes = (("note", "remind_at"), True)


DBModel = Literal["users", "notes", "reminders"]


def get_models_dict() -> dict[DBModel, type[DBBaseModel]]:
    return {"users": User, "notes": Note}
