use std::sync::LazyLock;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::AssertSqlSafe;

use crate::db::models::ProjectResponse;
use crate::error::{ApiResult, Q};
use crate::notes::{ReviewStatus, load_full};
use crate::params::check_range;
use crate::sql::{Value, Where, bind_as, bind_scalar};
use crate::state::AppState;
use crate::text::{char_len, markdown_title_text, python_split, splitlines, take_chars};
use crate::time::Ts;

pub const MAX_QUERY_LENGTH: usize = 200;
const MIN_INDEXED_LENGTH: usize = 3;
pub const MARK_START: char = '\x02';
pub const MARK_END: char = '\x03';
const NAMED_LIMIT: i64 = 5;

static FENCE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^\s*(```|~~~).*$").unwrap());
static WHITESPACE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").unwrap());
static LIST_MARKER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?").unwrap());
static RULE_OR_TABLE_DIVIDER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:[-*_]{3,}|\|?(?:\s*:?-+:?\s*\|)+\s*:?-*:?\s*)$").unwrap());

pub struct SearchTerms {
    pub indexed: Vec<String>,
    pub short: Vec<String>,
}

impl SearchTerms {
    pub fn all(&self) -> Vec<String> {
        self.indexed.iter().chain(&self.short).cloned().collect()
    }

    pub fn is_empty(&self) -> bool {
        self.indexed.is_empty() && self.short.is_empty()
    }
}

pub fn parse_terms(raw: &str) -> SearchTerms {
    let words = python_split(take_chars(raw, MAX_QUERY_LENGTH));
    let unique = crate::params::dedupe(&words.iter().map(|w| w.to_string()).collect::<Vec<_>>());
    SearchTerms {
        indexed: unique
            .iter()
            .filter(|w| char_len(w) >= MIN_INDEXED_LENGTH)
            .cloned()
            .collect(),
        short: unique
            .iter()
            .filter(|w| char_len(w) < MIN_INDEXED_LENGTH)
            .cloned()
            .collect(),
    }
}

pub fn match_expression(terms: &[String]) -> String {
    terms
        .iter()
        .map(|t| format!("\"{}\"", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

pub fn like_pattern(term: &str) -> String {
    let escaped = term
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

pub fn note_search_condition(raw: &str) -> Option<Where> {
    let terms = parse_terms(raw);
    if terms.is_empty() {
        return None;
    }
    let mut condition = Where::default();
    for term in &terms.short {
        let pattern = like_pattern(term);
        condition.push_with(
            "lower(notes.name) LIKE lower(?) ESCAPE '\\' OR lower(notes.content) LIKE lower(?) ESCAPE '\\'",
            [Value::Text(pattern.clone()), Value::Text(pattern)],
        );
    }
    if !terms.indexed.is_empty() {
        condition.push_with(
            "notes.id IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)",
            [Value::Text(match_expression(&terms.indexed))],
        );
    }
    Some(condition)
}

pub fn plain_text(markdown: &str) -> String {
    let text_only = FENCE.replace_all(markdown, " ");
    let lines: Vec<String> = splitlines(&text_only)
        .into_iter()
        .filter(|line| !RULE_OR_TABLE_DIVIDER.is_match(line))
        .map(|line| markdown_title_text(&LIST_MARKER.replace(line, "")).replace('|', " "))
        .collect();
    WHITESPACE
        .replace_all(&lines.join(" "), " ")
        .trim()
        .to_string()
}

fn term_pattern(terms: &[String]) -> Option<Regex> {
    if terms.is_empty() {
        return None;
    }
    let mut ordered = terms.to_vec();
    ordered.sort_by_key(|t| std::cmp::Reverse(char_len(t)));
    let alternation = ordered
        .iter()
        .map(|t| regex::escape(t))
        .collect::<Vec<_>>()
        .join("|");
    Regex::new(&format!("(?i){alternation}")).ok()
}

pub fn mark(value: &str, terms: &[String]) -> String {
    match term_pattern(terms) {
        None => value.to_string(),
        Some(pattern) => pattern
            .replace_all(value, |c: &regex::Captures| {
                format!("{MARK_START}{}{MARK_END}", &c[0])
            })
            .into_owned(),
    }
}

pub fn snippet(content: &str, terms: &[String]) -> String {
    const BEFORE: usize = 40;
    const LENGTH: usize = 160;
    let plain = plain_text(content);
    let chars: Vec<char> = plain.chars().collect();
    let byte_to_char = |byte: usize| plain[..byte].chars().count();
    let found = term_pattern(terms).and_then(|p| {
        p.find(&plain)
            .map(|m| (byte_to_char(m.start()), byte_to_char(m.end())))
    });
    let Some((found_start, found_end)) = found else {
        let excerpt: String = chars.iter().take(LENGTH).collect();
        return excerpt + if chars.len() > LENGTH { "…" } else { "" };
    };
    let mut start = found_start.saturating_sub(BEFORE);
    if start > 0
        && let Some(space) = chars[start..]
            .iter()
            .position(|c| *c == ' ')
            .map(|p| p + start)
        && space < found_start
    {
        start = space + 1;
    }
    let mut end = (start + LENGTH).min(chars.len());
    if end < chars.len() {
        let space = if found_end <= end {
            chars[found_end..end]
                .iter()
                .rposition(|c| *c == ' ')
                .map(|p| p + found_end)
        } else {
            None
        };
        end = match space {
            Some(s) if s > 0 => s,
            _ => end,
        };
    }
    let excerpt: String = chars[start..end.max(start)].iter().collect();
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        mark(&excerpt, terms),
        if end < chars.len() { "…" } else { "" }
    )
}

#[derive(Serialize)]
struct NoteHit {
    id: i64,
    uid: String,
    title: String,
    title_marked: String,
    snippet: String,
    project: Option<ProjectResponse>,
    status: ReviewStatus,
    updated_at: Ts,
}

#[derive(Serialize)]
struct NamedHit {
    id: i64,
    name: String,
    name_marked: String,
    note_count: i64,
}

#[derive(Serialize)]
struct SearchResults {
    notes: Vec<NoteHit>,
    projects: Vec<NamedHit>,
    tags: Vec<NamedHit>,
}

#[derive(Deserialize)]
struct SearchQuery {
    #[serde(default)]
    q: String,
    #[serde(default = "default_limit")]
    limit: i64,
}

fn default_limit() -> i64 {
    20
}

fn name_condition(column: &str, terms: &SearchTerms) -> (String, Vec<Value>) {
    let all = terms.all();
    let clause = all
        .iter()
        .map(|_| format!("lower({column}) LIKE '%' || ? || '%'"))
        .collect::<Vec<_>>()
        .join(" AND ");
    (
        clause,
        all.into_iter()
            .map(|t| Value::Text(t.to_lowercase()))
            .collect(),
    )
}

async fn ranked_note_ids(
    state: &AppState,
    terms: &SearchTerms,
    limit: i64,
) -> Result<Vec<i64>, sqlx::Error> {
    if !terms.indexed.is_empty() {
        let short: String = (0..terms.short.len())
            .map(|_| "AND (notes.name LIKE ? ESCAPE '\\' OR notes.content LIKE ? ESCAPE '\\')")
            .collect::<Vec<_>>()
            .join(" ");
        let sql = format!(
            "WITH ranked AS MATERIALIZED (SELECT rowid AS id, bm25(notes_fts, 8.0, 1.0) AS score \
             FROM notes_fts WHERE notes_fts MATCH ?) \
             SELECT notes.id FROM ranked JOIN notes ON notes.id = ranked.id \
             WHERE notes.deleted_at IS NULL {short} ORDER BY ranked.score, notes.updated_at DESC LIMIT ?"
        );
        let mut binds = vec![Value::Text(match_expression(&terms.indexed))];
        for term in &terms.short {
            binds.push(Value::Text(like_pattern(term)));
            binds.push(Value::Text(like_pattern(term)));
        }
        binds.push(Value::Int(limit));
        return bind_scalar(sqlx::query_scalar(AssertSqlSafe(sql)), &binds)
            .fetch_all(&state.db)
            .await;
    }
    let clause = terms
        .short
        .iter()
        .map(|_| "lower(notes.name) LIKE lower(?) ESCAPE '\\'")
        .collect::<Vec<_>>()
        .join(" AND ");
    let mut binds: Vec<Value> = terms
        .short
        .iter()
        .map(|t| Value::Text(like_pattern(t)))
        .collect();
    binds.push(Value::Int(limit));
    let sql = format!(
        "SELECT id FROM notes WHERE deleted_at IS NULL AND {clause} ORDER BY updated_at DESC LIMIT ?"
    );
    bind_scalar(sqlx::query_scalar(AssertSqlSafe(sql)), &binds)
        .fetch_all(&state.db)
        .await
}

async fn find_projects(
    state: &AppState,
    terms: &SearchTerms,
) -> Result<Vec<NamedHit>, sqlx::Error> {
    let (clause, binds) = name_condition("projects.name", terms);
    let sql = format!(
        "SELECT projects.id, projects.name, coalesce(counts.total, 0) FROM projects \
         LEFT OUTER JOIN (SELECT project_id, count(*) AS total FROM notes WHERE deleted_at IS NULL GROUP BY project_id) AS counts \
         ON counts.project_id = projects.id WHERE projects.deleted_at IS NULL AND {clause} \
         ORDER BY length(projects.name), lower(projects.name) LIMIT {NAMED_LIMIT}"
    );
    let rows: Vec<(i64, String, i64)> = bind_as(sqlx::query_as(AssertSqlSafe(sql)), &binds)
        .fetch_all(&state.db)
        .await?;
    let all = terms.all();
    Ok(rows
        .into_iter()
        .map(|(id, name, total)| NamedHit {
            id,
            name_marked: mark(&name, &all),
            name,
            note_count: total,
        })
        .collect())
}

async fn find_tags(state: &AppState, terms: &SearchTerms) -> Result<Vec<NamedHit>, sqlx::Error> {
    let (clause, binds) = name_condition("tags.name", terms);
    let sql = format!(
        "SELECT tags.id, tags.name, coalesce(counts.total, 0) FROM tags \
         LEFT OUTER JOIN (SELECT note_tags.tag_id AS tag_id, count(*) AS total FROM note_tags \
           JOIN notes ON notes.id = note_tags.note_id WHERE notes.deleted_at IS NULL GROUP BY note_tags.tag_id) AS counts \
         ON counts.tag_id = tags.id WHERE {clause} \
         ORDER BY length(tags.name), lower(tags.name) LIMIT {NAMED_LIMIT}"
    );
    let rows: Vec<(i64, String, i64)> = bind_as(sqlx::query_as(AssertSqlSafe(sql)), &binds)
        .fetch_all(&state.db)
        .await?;
    let all = terms.all();
    Ok(rows
        .into_iter()
        .map(|(id, name, total)| NamedHit {
            id,
            name_marked: mark(&name, &all),
            name,
            note_count: total,
        })
        .collect())
}

async fn search(
    State(state): State<AppState>,
    Q(query): Q<SearchQuery>,
) -> ApiResult<Json<SearchResults>> {
    crate::params::check_len("q", &query.q, MAX_QUERY_LENGTH * 2)?;
    check_range("limit", query.limit, 1, 50)?;
    let terms = parse_terms(&query.q);
    if terms.is_empty() {
        return Ok(Json(SearchResults {
            notes: vec![],
            projects: vec![],
            tags: vec![],
        }));
    }
    let ids = ranked_note_ids(&state, &terms, query.limit).await?;
    let mut conn = state.db.acquire().await?;
    let all = terms.all();
    let notes = load_full(&mut conn, &ids)
        .await?
        .into_iter()
        .map(|full| {
            let title = markdown_title_text(&full.note.name);
            NoteHit {
                id: full.note.id,
                uid: full.note.uid.clone(),
                title_marked: mark(&title, &all),
                title,
                snippet: snippet(&full.note.content, &all),
                project: full.project.as_ref().map(ProjectResponse::from),
                status: ReviewStatus::of(&full.note),
                updated_at: full.note.updated_at,
            }
        })
        .collect();
    Ok(Json(SearchResults {
        notes,
        projects: find_projects(&state, &terms).await?,
        tags: find_tags(&state, &terms).await?,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/search", get(search))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snippets_mark_terms() {
        let text = "intro words here and then the binary search part of the note follows";
        let result = snippet(text, &["binary".to_string()]);
        assert!(result.contains("\x02binary\x03"));
    }

    #[test]
    fn plain_text_drops_markdown() {
        assert_eq!(
            plain_text("# Title\n\n- [x] done item\n```\ncode\n```\n|a|b|\n|---|---|"),
            "Title done item code a b"
        );
        assert_eq!(
            plain_text("- one\n* [x] two\n3. three\n---\n| a | b |\n|---|:-:|\n> **quote**"),
            "one two three a b quote"
        );
    }
}
