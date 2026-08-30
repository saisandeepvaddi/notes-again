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


class BaseModel(Model):
    class Meta:
        database = db_proxy


class User(BaseModel):
    username = CharField(unique=True)


class Note(BaseModel):
    user = ForeignKeyField(User, backref="username")
    content = TextField()
    created_at = DateTimeField(default=datetime.datetime.now, index=True)
    updated_at = DateTimeField(default=datetime.datetime.now, index=True)
    deleted_at = DateTimeField(default=None)


type DBModel = Literal["user", "note"]


def get_models_dict() -> dict[DBModel, type[BaseModel]]:
    return {"user": User, "note": Note}
