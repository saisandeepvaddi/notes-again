use std::sync::LazyLock;

use regex::Regex;

use super::FullNote;
use crate::db::models::NoteRow;
use crate::difficulty::key_for_tag_name;
use crate::text::{markdown_title_text, splitlines};
use crate::time::Ts;

static FRONTMATTER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)\A---[ \t]*\n(.*?)\n---[ \t]*(?:\n|\z)").unwrap());
static FRONTMATTER_KEY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^([A-Za-z0-9_-]+)\s*:").unwrap());
static TITLE_LINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)"#).unwrap());
static HEADING_PREFIX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*#{1,6}\s+").unwrap());
static FIRST_H1: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\A#\s+(.+?)\s*#*\s*(?:\n|\z)").unwrap());
static FILENAME_UNSAFE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[^\w\s-]").unwrap());
static FILENAME_SPACES: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[-\s]+").unwrap());

fn quote(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

fn timestamp(value: Ts) -> String {
    value.iso_seconds_z()
}

fn status(note: &NoteRow) -> &'static str {
    if !note.in_review {
        "note-only"
    } else if note.paused_at.is_some() {
        "paused"
    } else {
        "in-review"
    }
}

fn split_frontmatter(content: &str) -> (Vec<String>, String) {
    match FRONTMATTER.captures(content) {
        None => (vec![], content.to_string()),
        Some(caps) => {
            let lines = splitlines(caps.get(1).map(|m| m.as_str()).unwrap_or(""))
                .into_iter()
                .map(str::to_string)
                .collect();
            (lines, content[caps.get(0).unwrap().end()..].to_string())
        }
    }
}

fn key_of(line: &str) -> Option<String> {
    FRONTMATTER_KEY
        .captures(line)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

fn merge_user_frontmatter(ours: Vec<String>, theirs: Vec<String>) -> Vec<String> {
    if theirs.is_empty() {
        return ours;
    }
    let their_keys: Vec<String> = theirs.iter().filter_map(|l| key_of(l)).collect();
    let mut kept: Vec<String> = ours
        .into_iter()
        .filter(|line| key_of(line).is_none_or(|k| !their_keys.contains(&k)))
        .collect();
    kept.extend(theirs);
    kept
}

fn frontmatter(full: &FullNote, title: &str) -> Vec<String> {
    let note = &full.note;
    let mut lines = vec![format!("title: {}", quote(title))];
    if let Some(source) = TITLE_LINK.captures(&note.name).and_then(|c| c.get(1)) {
        lines.push(format!("source: {}", quote(source.as_str())));
    }
    if let Some(project) = &full.project {
        lines.push(format!("project: {}", quote(&project.name)));
    }
    let mut tags: Vec<&str> = full
        .tags
        .iter()
        .filter(|t| !t.is_difficulty)
        .map(|t| t.name.as_str())
        .collect();
    tags.sort_by_key(|t| t.to_lowercase());
    if !tags.is_empty() {
        lines.push(format!(
            "tags: [{}]",
            tags.iter().map(|t| quote(t)).collect::<Vec<_>>().join(", ")
        ));
    }
    if let Some(difficulty) = full.tags.iter().find_map(|t| key_for_tag_name(&t.name)) {
        lines.push(format!("difficulty: {difficulty}"));
    }
    let status = status(note);
    lines.push(format!("status: {status}"));
    let live: Vec<_> = full
        .reminders
        .iter()
        .filter(|r| r.deleted_at.is_none())
        .collect();
    let next = live
        .iter()
        .filter(|r| r.reviewed_at.is_none())
        .map(|r| r.remind_at)
        .min();
    if status == "in-review"
        && let Some(next) = next
    {
        lines.push(format!("next_review: {}", timestamp(next)));
    }
    lines.push(format!(
        "reviews: {}",
        live.iter().filter(|r| r.reviewed_at.is_some()).count()
    ));
    lines.push(format!("created: {}", timestamp(note.created_at)));
    lines.push(format!("updated: {}", timestamp(note.updated_at)));
    lines
}

pub fn note_markdown(full: &FullNote) -> String {
    let note = &full.note;
    let title = markdown_title_text(&note.name);
    let title = if title.trim().is_empty() {
        "Untitled".to_string()
    } else {
        title.trim().to_string()
    };
    let heading = HEADING_PREFIX.replace(note.name.trim(), "").into_owned();
    let heading = if heading.is_empty() {
        "Untitled".to_string()
    } else {
        heading
    };
    let (user_frontmatter, body) = split_frontmatter(&note.content.replace("\r\n", "\n"));
    let mut body = body.trim_matches('\n').to_string();
    if let Some(caps) = FIRST_H1.captures(&body)
        && markdown_title_text(caps.get(1).unwrap().as_str()) == title
    {
        body = body[caps.get(0).unwrap().end()..]
            .trim_start_matches('\n')
            .to_string();
    }
    let frontmatter = merge_user_frontmatter(frontmatter(full, &title), user_frontmatter);
    let mut parts = vec!["---".to_string()];
    parts.extend(frontmatter);
    parts.extend(["---".to_string(), String::new(), format!("# {heading}")]);
    if !body.is_empty() {
        parts.extend([String::new(), body]);
    }
    parts.join("\n") + "\n"
}

pub fn note_filename(note: &NoteRow) -> String {
    let title = markdown_title_text(&note.name);
    let cleaned = FILENAME_UNSAFE.replace_all(&title, "");
    let slug = FILENAME_SPACES.replace_all(&cleaned, "-");
    let slug = slug.trim_matches(|c| c == '-' || c == '_');
    let short: String = slug.chars().take(80).collect();
    let short = short.trim_end_matches(['-', '_']);
    if short.is_empty() {
        format!("note-{}.md", note.id)
    } else {
        format!("{short}.md")
    }
}
