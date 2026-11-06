use sqlx::Sqlite;
use sqlx::query::{Query, QueryAs, QueryScalar};
use sqlx::sqlite::SqliteArguments;

use crate::time::Ts;

#[derive(Clone, Debug)]
pub enum Value {
    Text(String),
    Int(i64),
    Time(Ts),
}

#[derive(Clone, Debug, Default)]
pub struct Where {
    pub clauses: Vec<String>,
    pub binds: Vec<Value>,
}

impl Where {
    pub fn push(&mut self, clause: impl Into<String>) {
        self.clauses.push(clause.into());
    }

    pub fn push_with(&mut self, clause: impl Into<String>, binds: impl IntoIterator<Item = Value>) {
        self.clauses.push(clause.into());
        self.binds.extend(binds);
    }

    pub fn sql(&self) -> String {
        if self.clauses.is_empty() {
            "1 = 1".into()
        } else {
            self.clauses
                .iter()
                .map(|c| format!("({c})"))
                .collect::<Vec<_>>()
                .join(" AND ")
        }
    }
}

pub fn bind_query<'q>(
    mut query: Query<'q, Sqlite, SqliteArguments>,
    binds: &[Value],
) -> Query<'q, Sqlite, SqliteArguments> {
    for value in binds {
        query = match value {
            Value::Text(text) => query.bind(text.clone()),
            Value::Int(int) => query.bind(*int),
            Value::Time(ts) => query.bind(*ts),
        };
    }
    query
}

pub fn bind_as<'q, O>(
    mut query: QueryAs<'q, Sqlite, O, SqliteArguments>,
    binds: &[Value],
) -> QueryAs<'q, Sqlite, O, SqliteArguments> {
    for value in binds {
        query = match value {
            Value::Text(text) => query.bind(text.clone()),
            Value::Int(int) => query.bind(*int),
            Value::Time(ts) => query.bind(*ts),
        };
    }
    query
}

pub fn bind_scalar<'q, O>(
    mut query: QueryScalar<'q, Sqlite, O, SqliteArguments>,
    binds: &[Value],
) -> QueryScalar<'q, Sqlite, O, SqliteArguments> {
    for value in binds {
        query = match value {
            Value::Text(text) => query.bind(text.clone()),
            Value::Int(int) => query.bind(*int),
            Value::Time(ts) => query.bind(*ts),
        };
    }
    query
}
