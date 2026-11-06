mod review_state;

use std::collections::{HashMap, HashSet};

use axum::extract::State;
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use chrono::Duration;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::AssertSqlSafe;

use crate::db::models::{PROJECT_COLUMNS, ProjectRow, TAG_COLUMNS, TagRow};
use crate::db::{BEGIN_WRITE, Conn};
use crate::difficulty::{DIFFICULTY_TAGS, Difficulty, key_for_tag_name_ci};
use crate::error::{ApiError, ApiResult, Body};
use crate::groups::insert_project;
use crate::notes::pacing::{MAX_PER_DAY, Pacer};
use crate::notes::{NewNote, default_algorithm, insert_note, load_full};
use crate::params::id_list;
use crate::state::AppState;
use crate::text::python_strip;
use crate::time::Ts;
use review_state::{ReviewState, export_review, parse_datetime, parse_review};

const MAX_NOTES: usize = 10_000;
const MAX_ISSUES: usize = 200;

fn key(name: &str) -> String {
    python_strip(name).to_lowercase()
}

fn text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) if !python_strip(s).is_empty() => Some(python_strip(s).to_string()),
        _ => None,
    }
}

fn parse_tags(raw: Option<&Value>) -> Option<Vec<String>> {
    let items: Vec<String> = match raw {
        None | Some(Value::Null) => return Some(vec![]),
        Some(Value::String(s)) => s.split(',').map(str::to_string).collect(),
        Some(Value::Array(items)) => {
            let mut out = vec![];
            for item in items {
                out.push(item.as_str()?.to_string());
            }
            out
        }
        Some(_) => return None,
    };
    Some(
        items
            .iter()
            .map(|t| python_strip(t).to_string())
            .filter(|t| !t.is_empty())
            .collect(),
    )
}

#[derive(Default)]
struct FileOptions {
    default: Option<i64>,
    by_deck: HashMap<String, i64>,
    paused_decks: HashSet<String>,
}

fn parse_per_day(value: &Value, place: &str) -> Result<i64, String> {
    match value.as_i64() {
        Some(v) if !value.is_boolean() && (0..=MAX_PER_DAY).contains(&v) => Ok(v),
        _ => Err(format!(
            "\"per_day\" {place} must be a whole number from 0 to {MAX_PER_DAY}."
        )),
    }
}

type RowExtras = (Option<ReviewState>, Option<Ts>, Option<Ts>);

struct Row {
    index: usize,
    name: String,
    content: String,
    deck: Option<String>,
    tags: Vec<String>,
    difficulty: Difficulty,
    review: Option<ReviewState>,
    created_at: Option<Ts>,
    updated_at: Option<Ts>,
}

#[derive(Serialize, Clone)]
struct ImportIssue {
    row: usize,
    name: Option<String>,
    deck: Option<String>,
    reason: String,
}

fn thousands(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

fn normalize(payload: &Value) -> Result<(Vec<Row>, Vec<ImportIssue>, FileOptions), String> {
    let mut entries: Vec<(Option<String>, Value)> = vec![];
    let mut rates = FileOptions::default();
    match payload {
        Value::Array(items) => entries = items.iter().map(|i| (None, i.clone())).collect(),
        Value::Object(map) => {
            if !map.contains_key("decks") && !map.contains_key("notes") {
                return Err("Expected a list of notes, or an object with a \"decks\" and/or \"notes\" list.".into());
            }
            if let Some(per_day) = map.get("per_day") {
                rates.default = Some(parse_per_day(per_day, "at the top of the file")?);
            }
            let decks = match map.get("decks") {
                None => vec![],
                Some(Value::Array(decks)) => decks.clone(),
                Some(_) => return Err("\"decks\" must be a list.".into()),
            };
            for (i, deck) in decks.iter().enumerate() {
                let i = i + 1;
                let Value::Object(deck) = deck else {
                    return Err(format!(
                        "Deck #{i} must be an object with a name and notes."
                    ));
                };
                let Some(deck_name) = text(deck.get("name")) else {
                    return Err(format!("Deck #{i} is missing a \"name\"."));
                };
                if let Some(per_day) = deck.get("per_day") {
                    let value = parse_per_day(per_day, &format!("in deck \"{deck_name}\""))?;
                    rates.by_deck.entry(key(&deck_name)).or_insert(value);
                }
                match deck.get("paused") {
                    None | Some(Value::Bool(false)) => {}
                    Some(Value::Bool(true)) => {
                        rates.paused_decks.insert(key(&deck_name));
                    }
                    Some(_) => {
                        return Err(format!(
                            "\"paused\" in deck \"{deck_name}\" must be true or false."
                        ));
                    }
                }
                let notes = match deck.get("notes") {
                    None => vec![],
                    Some(Value::Array(notes)) => notes.clone(),
                    Some(_) => {
                        return Err(format!("\"notes\" in deck \"{deck_name}\" must be a list."));
                    }
                };
                entries.extend(notes.into_iter().map(|n| (Some(deck_name.clone()), n)));
            }
            match map.get("notes") {
                None => {}
                Some(Value::Array(notes)) => {
                    entries.extend(notes.iter().map(|n| (None, n.clone())))
                }
                Some(_) => return Err("\"notes\" must be a list.".into()),
            }
        }
        _ => return Err("Expected a JSON list or object.".into()),
    }
    if entries.len() > MAX_NOTES {
        return Err(format!(
            "That file has {} notes; the limit is {} per import. Split it into smaller files.",
            thousands(entries.len()),
            thousands(MAX_NOTES)
        ));
    }

    let mut rows = vec![];
    let mut issues = vec![];
    for (index, (enclosing, item)) in entries.into_iter().enumerate() {
        let index = index + 1;
        let Value::Object(item) = item else {
            issues.push(ImportIssue {
                row: index,
                name: None,
                deck: None,
                reason: "Not an object.".into(),
            });
            continue;
        };
        let name = text(item.get("name"));
        let raw_deck = item.get("deck").or_else(|| item.get("project")).cloned();
        let deck = text(raw_deck.as_ref()).or(enclosing);
        let Some(name) = name else {
            issues.push(ImportIssue {
                row: index,
                name: None,
                deck,
                reason: "Missing \"name\".".into(),
            });
            continue;
        };
        let issue = |reason: String| ImportIssue {
            row: index,
            name: Some(name.clone()),
            deck: deck.clone(),
            reason,
        };
        if raw_deck
            .as_ref()
            .is_some_and(|d| !d.is_null() && !d.is_string())
        {
            issues.push(issue("\"deck\" must be text.".into()));
            continue;
        }
        let content = match item.get("content") {
            None | Some(Value::Null) => String::new(),
            Some(Value::String(s)) => s.clone(),
            Some(_) => {
                issues.push(issue("\"content\" must be text.".into()));
                continue;
            }
        };
        let Some(tags) = parse_tags(item.get("tags")) else {
            issues.push(issue(
                "\"tags\" must be a list of text (or one comma-separated string).".into(),
            ));
            continue;
        };
        let difficulty = match item.get("difficulty") {
            None | Some(Value::Null) => Some(Difficulty::Medium),
            Some(raw) => {
                let rendered = match raw {
                    Value::String(s) => s.clone(),
                    other => python_repr(other),
                };
                let parsed = Difficulty::parse(&python_strip(&rendered).to_lowercase());
                if parsed.is_none() {
                    issues.push(issue(format!(
                        "Unknown difficulty \"{rendered}\" (use easy, medium or hard)."
                    )));
                    continue;
                }
                parsed
            }
        };
        let parsed = (|| -> Result<RowExtras, String> {
            let review = match item.get("review") {
                None | Some(Value::Null) => None,
                Some(raw) => Some(parse_review(raw)?),
            };
            let created = match item.get("created_at") {
                None | Some(Value::Null) => None,
                other => Some(parse_datetime(other, "created_at")?),
            };
            let updated = match item.get("updated_at") {
                None | Some(Value::Null) => None,
                other => Some(parse_datetime(other, "updated_at")?),
            };
            Ok((review, created, updated))
        })();
        let (review, created_at, updated_at) = match parsed {
            Ok(values) => values,
            Err(reason) => {
                issues.push(issue(reason));
                continue;
            }
        };
        rows.push(Row {
            index,
            name,
            content,
            deck,
            tags,
            difficulty: difficulty.expect("checked"),
            review,
            created_at,
            updated_at,
        });
    }
    Ok((rows, issues, rates))
}

fn python_repr(value: &Value) -> String {
    match value {
        Value::Bool(true) => "True".into(),
        Value::Bool(false) => "False".into(),
        Value::Null => "None".into(),
        other => other.to_string(),
    }
}

#[derive(Serialize, Clone)]
struct DeckSummary {
    name: Option<String>,
    is_new: bool,
    per_day: i64,
    to_create: i64,
    skipped: i64,
}

#[derive(Serialize)]
struct ImportResult {
    dry_run: bool,
    notes_created: usize,
    duplicates_skipped: usize,
    invalid_skipped: usize,
    new_decks: usize,
    new_tags: usize,
    decks: Vec<DeckSummary>,
    first_due: Option<Ts>,
    last_due: Option<Ts>,
    due_today: usize,
    days_span: i64,
    paused: bool,
    note_only: bool,
    restored_reviews: usize,
    issues: Vec<ImportIssue>,
    issues_truncated: bool,
    warnings: Vec<String>,
}

struct Planned {
    row: Row,
    deck_key: Option<String>,
    tag_keys: Vec<String>,
    remind_at: Ts,
    day: i64,
    paused: bool,
    in_review: bool,
}

struct Plan {
    kept: Vec<Planned>,
    new_decks: Vec<(String, String)>,
    new_tags: Vec<(String, String)>,
    existing_decks: HashMap<String, ProjectRow>,
    existing_tags: HashMap<String, TagRow>,
    paused: bool,
    paused_decks: HashSet<String>,
}

#[derive(Deserialize)]
struct ImportRequest {
    payload: Value,
    #[serde(default = "default_per_day")]
    per_day: i64,
    #[serde(default)]
    default_deck: Option<String>,
    #[serde(default)]
    tz_offset_minutes: i64,
    #[serde(default)]
    dry_run: bool,
    #[serde(default)]
    paused: bool,
    #[serde(default = "yes")]
    in_review: bool,
}

fn default_per_day() -> i64 {
    10
}

fn yes() -> bool {
    true
}

async fn plan_import(
    conn: &mut Conn,
    rows: Vec<Row>,
    issues: Vec<ImportIssue>,
    rates: FileOptions,
    request: &ImportRequest,
) -> Result<(Plan, ImportResult), sqlx::Error> {
    let projects: Vec<ProjectRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE deleted_at IS NULL"
    )))
    .fetch_all(&mut *conn)
    .await?;
    let mut existing_decks: HashMap<String, ProjectRow> = HashMap::new();
    for project in projects {
        existing_decks.insert(key(&project.name), project);
    }
    let deck_key_by_id: HashMap<i64, String> = existing_decks
        .iter()
        .map(|(k, p)| (p.id, k.clone()))
        .collect();
    let tags: Vec<TagRow> =
        sqlx::query_as(AssertSqlSafe(format!("SELECT {TAG_COLUMNS} FROM tags")))
            .fetch_all(&mut *conn)
            .await?;
    let mut existing_tags: HashMap<String, TagRow> = HashMap::new();
    for tag in tags {
        existing_tags.insert(key(&tag.name), tag);
    }

    let mut taken: HashSet<(Option<String>, String)> = HashSet::new();
    let names: Vec<(Option<i64>, String)> =
        sqlx::query_as("SELECT project_id, lower(trim(name)) FROM notes WHERE deleted_at IS NULL")
            .fetch_all(&mut *conn)
            .await?;
    for (project_id, name) in names {
        let deck = project_id.map(|id| {
            deck_key_by_id
                .get(&id)
                .cloned()
                .unwrap_or_else(|| format!("#{id}"))
        });
        taken.insert((deck, name));
    }

    let file_default = rates.default.unwrap_or(request.per_day);
    let rate_for = |deck: &Option<String>| match deck {
        None => file_default,
        Some(k) => rates.by_deck.get(k).copied().unwrap_or(file_default),
    };
    let fallback_deck = text(
        request
            .default_deck
            .as_ref()
            .map(|d| Value::String(d.clone()))
            .as_ref(),
    );
    let mut new_decks: Vec<(String, String)> = vec![];
    let mut new_tags: Vec<(String, String)> = vec![];
    let mut dropped: Vec<(String, usize)> = vec![];
    let mut per_deck: Vec<(Option<String>, DeckSummary)> = vec![];
    let mut all_issues = issues.clone();
    let mut kept_rows: Vec<(Row, Option<String>, Vec<String>)> = vec![];
    let mut duplicates = 0;

    for row in rows {
        let deck_name = text(row.deck.as_ref().map(|d| Value::String(d.clone())).as_ref())
            .or_else(|| fallback_deck.clone());
        let deck_key = deck_name.as_deref().map(key);
        if let (Some(k), Some(name)) = (&deck_key, &deck_name)
            && !existing_decks.contains_key(k)
            && !new_decks.iter().any(|(nk, _)| nk == k)
        {
            new_decks.push((k.clone(), name.clone()));
        }
        let display = deck_key.as_ref().map(|k| {
            existing_decks
                .get(k)
                .map(|p| p.name.clone())
                .or_else(|| {
                    new_decks
                        .iter()
                        .find(|(nk, _)| nk == k)
                        .map(|(_, n)| n.clone())
                })
                .unwrap_or_default()
        });
        let position = match per_deck.iter().position(|(k, _)| *k == deck_key) {
            Some(p) => p,
            None => {
                per_deck.push((
                    deck_key.clone(),
                    DeckSummary {
                        name: display.clone(),
                        is_new: deck_key
                            .as_ref()
                            .is_some_and(|k| !existing_decks.contains_key(k)),
                        per_day: rate_for(&deck_key),
                        to_create: 0,
                        skipped: 0,
                    },
                ));
                per_deck.len() - 1
            }
        };
        let pair = (deck_key.clone(), key(&row.name));
        if taken.contains(&pair) {
            duplicates += 1;
            per_deck[position].1.skipped += 1;
            let place = match &display {
                Some(d) => format!("deck \"{d}\""),
                None => "no deck".into(),
            };
            all_issues.push(ImportIssue {
                row: row.index,
                name: Some(row.name.clone()),
                deck: display.clone(),
                reason: format!(
                    "Skipped: a note with this name already exists ({place}), or appeared earlier in this file."
                ),
            });
            continue;
        }
        taken.insert(pair);
        let mut tag_keys: Vec<String> = vec![];
        for tag_name in &row.tags {
            let k = key(tag_name);
            if tag_keys.contains(&k) {
                continue;
            }
            if let Some(existing) = existing_tags.get(&k) {
                if existing.is_difficulty {
                    match dropped.iter_mut().find(|(n, _)| *n == existing.name) {
                        Some(entry) => entry.1 += 1,
                        None => dropped.push((existing.name.clone(), 1)),
                    }
                    continue;
                }
            } else if !new_tags.iter().any(|(nk, _)| *nk == k) {
                new_tags.push((k.clone(), tag_name.clone()));
            }
            tag_keys.push(k);
        }
        per_deck[position].1.to_create += 1;
        kept_rows.push((row, deck_key, tag_keys));
    }

    let mut pacer = Pacer::new(request.tz_offset_minutes);
    let mut position_in_group: HashMap<Option<String>, i64> = HashMap::new();
    let mut kept: Vec<Planned> = vec![];
    for (row, deck_key, tag_keys) in kept_rows {
        let note_in_review = request.in_review && row.review.as_ref().is_none_or(|r| r.in_review);
        let (remind_at, day) = if !note_in_review {
            (pacer.now, 0)
        } else if let Some(review) = &row.review {
            let remind_at = match review.due_at {
                Some(due) => due,
                None => pacer.due_at(0),
            };
            let micros = (remind_at.0 - pacer.today_start.0)
                .num_microseconds()
                .unwrap_or(0);
            (
                remind_at,
                micros
                    .div_euclid(Duration::days(1).num_microseconds().unwrap())
                    .max(0),
            )
        } else {
            let position = position_in_group.entry(deck_key.clone()).or_insert(0);
            let current = *position;
            *position += 1;
            let day = if request.paused {
                0
            } else {
                pacer.day(current, rate_for(&deck_key))
            };
            (pacer.due_at(day), day)
        };
        let paused =
            note_in_review && (request.paused || row.review.as_ref().is_some_and(|r| r.paused));
        kept.push(Planned {
            row,
            deck_key,
            tag_keys,
            remind_at,
            day,
            paused,
            in_review: note_in_review,
        });
    }
    let scheduled: Vec<&Planned> = kept.iter().filter(|p| p.in_review).collect();
    let reviewing: Vec<&&Planned> = scheduled.iter().filter(|p| !p.paused).collect();
    let warnings = dropped
        .iter()
        .map(|(name, count)| {
            format!(
                "Tag \"{name}\" is a built-in difficulty label, so it was ignored on {count} note{} (set \"difficulty\" instead).",
                if *count == 1 { "" } else { "s" }
            )
        })
        .collect();
    all_issues.sort_by_key(|i| i.row);
    let result = ImportResult {
        dry_run: request.dry_run,
        notes_created: kept.len(),
        duplicates_skipped: duplicates,
        invalid_skipped: issues.len(),
        new_decks: new_decks.len(),
        new_tags: new_tags.len(),
        decks: per_deck.into_iter().map(|(_, s)| s).collect(),
        first_due: scheduled.iter().map(|p| p.remind_at).min(),
        last_due: scheduled.iter().map(|p| p.remind_at).max(),
        due_today: reviewing.iter().filter(|p| p.day == 0).count(),
        days_span: reviewing.iter().map(|p| p.day).max().unwrap_or(-1) + 1,
        paused: request.paused && request.in_review,
        note_only: !request.in_review,
        restored_reviews: kept.iter().filter(|p| p.row.review.is_some()).count(),
        issues_truncated: all_issues.len() > MAX_ISSUES,
        issues: all_issues.into_iter().take(MAX_ISSUES).collect(),
        warnings,
    };
    let plan = Plan {
        kept,
        new_decks,
        new_tags,
        existing_decks,
        existing_tags,
        paused: request.paused && request.in_review,
        paused_decks: rates.paused_decks,
    };
    Ok((plan, result))
}

async fn execute_plan(conn: &mut Conn, plan: Plan) -> ApiResult<()> {
    let mut decks: HashMap<String, i64> = plan
        .existing_decks
        .iter()
        .map(|(k, p)| (k.clone(), p.id))
        .collect();
    for (k, name) in &plan.new_decks {
        let project =
            insert_project(conn, name, plan.paused || plan.paused_decks.contains(k)).await?;
        decks.insert(k.clone(), project.id);
    }
    let mut tags: HashMap<String, TagRow> = plan.existing_tags.clone();
    for (k, name) in &plan.new_tags {
        let id = sqlx::query(
            "INSERT INTO tags (uid, sync_version, name, created_at, is_difficulty, default_ease_factor) VALUES (?, 0, ?, ?, 0, NULL)",
        )
        .bind(crate::db::models::new_uid())
        .bind(name)
        .bind(Ts::now())
        .execute(&mut *conn)
        .await?
        .last_insert_rowid();
        let tag: TagRow = sqlx::query_as(AssertSqlSafe(format!(
            "SELECT {TAG_COLUMNS} FROM tags WHERE id = ?"
        )))
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
        tags.insert(k.clone(), tag);
    }
    let mut difficulty_tags: HashMap<Difficulty, TagRow> = HashMap::new();
    for defaults in &DIFFICULTY_TAGS {
        let tag = tags
            .get(&key(defaults.name))
            .cloned()
            .ok_or_else(|| ApiError::internal("Difficulty tag missing"))?;
        difficulty_tags.insert(defaults.key, tag);
    }
    let algorithm = default_algorithm(conn).await?;
    for planned in plan.kept {
        let row = planned.row;
        let restored = row.review.as_ref().map(|r| r.restored(planned.remind_at));
        insert_note(
            conn,
            NewNote {
                name: &row.name,
                content: &row.content,
                algorithm,
                difficulty_tag: &difficulty_tags[&row.difficulty],
                tag_ids: planned.tag_keys.iter().map(|k| tags[k].id).collect(),
                project_id: planned.deck_key.as_ref().map(|k| decks[k]),
                first_reminder_at: planned.remind_at,
                paused: planned.paused,
                in_review: planned.in_review,
                created_at: row.created_at,
                updated_at: row.updated_at,
            },
            restored,
        )
        .await?;
    }
    Ok(())
}

async fn import_notes(
    State(state): State<AppState>,
    Body(request): Body<ImportRequest>,
) -> ApiResult<Json<ImportResult>> {
    if !(0..=MAX_PER_DAY).contains(&request.per_day) {
        return Err(ApiError::bad_request(format!(
            "New notes per day must be 0-{MAX_PER_DAY}."
        )));
    }
    if request.tz_offset_minutes.abs() > 24 * 60 {
        return Err(ApiError::bad_request("Invalid timezone offset."));
    }
    let (rows, issues, rates) = normalize(&request.payload).map_err(ApiError::bad_request)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let (plan, result) = plan_import(&mut tx, rows, issues, rates, &request).await?;
    if !request.dry_run && !plan.kept.is_empty() {
        execute_plan(&mut tx, plan).await?;
    }
    tx.commit().await?;
    Ok(Json(result))
}

#[derive(Deserialize)]
struct ExportRequest {
    #[serde(default)]
    project_ids: Vec<i64>,
    #[serde(default)]
    include_no_project: bool,
    #[serde(default)]
    tag_ids: Vec<i64>,
    #[serde(default)]
    note_ids: Option<Vec<i64>>,
    #[serde(default = "yes")]
    include_paused: bool,
    #[serde(default = "yes")]
    include_review: bool,
}

fn export_conditions(options: &ExportRequest) -> String {
    let mut conditions = vec!["notes.deleted_at IS NULL".to_string()];
    if !options.project_ids.is_empty() || options.include_no_project {
        let mut scope = vec![];
        if !options.project_ids.is_empty() {
            scope.push(format!(
                "notes.project_id IN ({})",
                id_list(&options.project_ids)
            ));
        }
        if options.include_no_project {
            scope.push("notes.project_id IS NULL".into());
        }
        conditions.push(format!("({})", scope.join(" OR ")));
    }
    if !options.tag_ids.is_empty() {
        conditions.push(format!(
            "notes.id IN (SELECT note_id FROM note_tags WHERE tag_id IN ({}))",
            id_list(&options.tag_ids)
        ));
    }
    if let Some(ids) = &options.note_ids {
        conditions.push(if ids.is_empty() {
            "0 = 1".into()
        } else {
            format!("notes.id IN ({})", id_list(ids))
        });
    }
    if !options.include_paused {
        conditions.push("notes.paused_at IS NULL".into());
    }
    conditions.join(" AND ")
}

#[derive(Serialize)]
struct ExportCount {
    notes: i64,
    decks: i64,
}

async fn count_notes_to_export(
    State(state): State<AppState>,
    Body(options): Body<ExportRequest>,
) -> ApiResult<Json<ExportCount>> {
    let conditions = export_conditions(&options);
    let notes: i64 = sqlx::query_scalar(AssertSqlSafe(format!(
        "SELECT count(*) FROM notes WHERE {conditions}"
    )))
    .fetch_one(&state.db)
    .await?;
    let decks: i64 = sqlx::query_scalar(AssertSqlSafe(format!(
        "SELECT count(DISTINCT notes.project_id) FROM notes JOIN projects ON projects.id = notes.project_id \
         WHERE {conditions} AND projects.deleted_at IS NULL"
    )))
    .fetch_one(&state.db)
    .await?;
    Ok(Json(ExportCount { notes, decks }))
}

async fn export_notes(
    State(state): State<AppState>,
    Body(options): Body<ExportRequest>,
) -> ApiResult<Response> {
    let mut conn = state.db.acquire().await?;
    let ids: Vec<i64> = sqlx::query_scalar(AssertSqlSafe(format!(
        "SELECT notes.id FROM notes WHERE {} ORDER BY notes.created_at, notes.id",
        export_conditions(&options)
    )))
    .fetch_all(&mut *conn)
    .await?;
    let notes = load_full(&mut conn, &ids).await?;
    let projects: Vec<ProjectRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE deleted_at IS NULL ORDER BY id"
    )))
    .fetch_all(&mut *conn)
    .await?;
    let mut by_project: HashMap<i64, Vec<Value>> =
        projects.iter().map(|p| (p.id, vec![])).collect();
    let mut loose = vec![];
    for full in &notes {
        let difficulty = full
            .tags
            .iter()
            .filter(|t| t.is_difficulty)
            .find_map(|t| key_for_tag_name_ci(&t.name))
            .unwrap_or("medium");
        let mut tags: Vec<&str> = full
            .tags
            .iter()
            .filter(|t| !t.is_difficulty)
            .map(|t| t.name.as_str())
            .collect();
        tags.sort_by_key(|t| t.to_lowercase());
        let mut exported = json!({
            "name": full.note.name,
            "content": full.note.content,
            "tags": tags,
            "difficulty": difficulty,
            "created_at": full.note.created_at.iso(),
            "updated_at": full.note.updated_at.iso(),
        });
        if options.include_review {
            exported["review"] = export_review(full);
        }
        match full.note.project_id.and_then(|id| by_project.get_mut(&id)) {
            Some(list) => list.push(exported),
            None => loose.push(exported),
        }
    }
    let decks: Vec<Value> = projects
        .iter()
        .filter(|p| !by_project[&p.id].is_empty())
        .map(|p| {
            let mut deck = json!({ "name": p.name });
            if options.include_review {
                deck["paused"] = Value::Bool(p.paused);
            }
            deck["notes"] = Value::Array(by_project[&p.id].clone());
            deck
        })
        .collect();
    let document = json!({
        "format": "notes-again",
        "version": 1,
        "exported_at": Ts::now().iso(),
        "decks": decks,
        "notes": loose,
    });
    let filename = format!("notes-again-{}.json", Ts::now().0.format("%Y-%m-%d"));
    Ok((
        [
            (CONTENT_TYPE, "application/json".to_string()),
            (
                CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        serde_json::to_string_pretty(&document)?,
    )
        .into_response())
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/import/notes", post(import_notes))
        .route("/export/notes", post(export_notes))
        .route("/export/count", post(count_notes_to_export))
}
