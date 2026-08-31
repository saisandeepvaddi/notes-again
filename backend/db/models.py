import datetime
from typing import Literal

from peewee import (
    CharField,
    DatabaseProxy,
    DateTimeField,
    ForeignKeyField,
    Model,
    TextField,
)

db_proxy = DatabaseProxy()
DBModel = Literal["users", "notes"]


class BaseModel(Model):
    class Meta:
        database = db_proxy


class User(BaseModel):
    username = CharField(unique=True)

    class Meta(BaseModel):  # type: ignore
        table_name = "users"


class Note(BaseModel):
    user = ForeignKeyField(User, backref="username")
    content = TextField()
    created_at = DateTimeField(default=datetime.datetime.now, index=True)
    updated_at = DateTimeField(default=datetime.datetime.now, index=True)
    deleted_at = DateTimeField(default=None)

    class Meta(BaseModel):  # type: ignore
        table_name = "notes"


def get_models_dict() -> dict[DBModel, type[BaseModel]]:
    return {"users": User, "notes": Note}
