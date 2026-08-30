import datetime

from peewee import DateTimeField, ForeignKeyField, Model, SqliteDatabase, TextField

db = SqliteDatabase(":memory:")


class BaseModel(Model):
    class Meta:
        database = db


class User(BaseModel):
    username = TextField(unique=True)


class Note(BaseModel):
    user = ForeignKeyField(User, backref="username")
    content = TextField()
    timestamp = DateTimeField(default=datetime.datetime.now, index=True)
