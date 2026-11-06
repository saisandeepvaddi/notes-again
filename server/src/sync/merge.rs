use std::collections::BTreeSet;

use serde_json::{Map, Value};

use super::payloads::{Payload, TEXT_FIELDS};

const SCHEDULING_FIELDS: [&str; 4] = ["ease_factor", "interval_days", "algorithm", "fsrs_card"];
const REVIEW_FIELDS: [&str; 2] = ["reviewed_at", "rating"];
const NOTE_STRUCTURE: [&str; 2] = ["tags", "reminders"];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    Server,
    Client,
}

fn get<'a>(payload: &'a Payload, key: &str) -> &'a Value {
    payload.get(key).unwrap_or(&Value::Null)
}

fn keys(a: &Payload, b: &Payload) -> BTreeSet<String> {
    a.keys().chain(b.keys()).cloned().collect()
}

pub fn merge_fields<'a>(
    base: &Payload,
    server: &Payload,
    client: &Payload,
    fields: impl IntoIterator<Item = &'a str>,
) -> Payload {
    let mut merged = Map::new();
    for name in fields {
        let value = if get(client, name) == get(base, name) {
            get(server, name)
        } else {
            get(client, name)
        };
        merged.insert(name.to_string(), value.clone());
    }
    merged
}

pub fn merge_record(base: &Payload, server: &Payload, client: &Payload) -> Payload {
    let fields = keys(server, client);
    merge_fields(base, server, client, fields.iter().map(String::as_str))
}

fn string_set(value: Option<&Value>) -> BTreeSet<String> {
    value
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

pub fn merge_set(
    base: Option<&Value>,
    server: Option<&Value>,
    client: Option<&Value>,
) -> Vec<String> {
    let (base, server, client) = (string_set(base), string_set(server), string_set(client));
    let added: BTreeSet<String> = server
        .difference(&base)
        .chain(client.difference(&base))
        .cloned()
        .collect();
    let removed: BTreeSet<String> = base
        .difference(&server)
        .chain(base.difference(&client))
        .cloned()
        .collect();
    base.union(&added)
        .filter(|uid| !removed.contains(*uid))
        .cloned()
        .collect()
}

fn review(reminder: &Payload) -> (Value, Value) {
    (
        get(reminder, REVIEW_FIELDS[0]).clone(),
        get(reminder, REVIEW_FIELDS[1]).clone(),
    )
}

fn as_map(value: Option<&Value>) -> Map<String, Value> {
    value
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn object(value: Option<&Value>) -> Option<Payload> {
    value.and_then(Value::as_object).cloned()
}

fn earlier(a: &Value, b: &Value) -> bool {
    match (a.as_str(), b.as_str()) {
        (Some(a), Some(b)) => a < b,
        _ => false,
    }
}

pub fn merge_reminders(
    base: &Payload,
    server: &Payload,
    client: &Payload,
) -> (Payload, Option<Side>) {
    let mut merged = Map::new();
    let mut winner = None;
    for uid in keys(server, client) {
        let original = object(base.get(&uid));
        let ours = object(server.get(&uid));
        let theirs = object(client.get(&uid));
        let (ours, theirs) = match (ours, theirs) {
            (Some(ours), Some(theirs)) => (ours, theirs),
            (ours, theirs) => {
                let present = ours.or(theirs).expect("one side has it");
                if original.as_ref().is_none_or(|o| *o != present) {
                    merged.insert(uid, Value::Object(present));
                }
                continue;
            }
        };
        let original = original.unwrap_or_else(|| ours.clone());
        let fields: Vec<String> = keys(&ours, &theirs)
            .into_iter()
            .filter(|f| !REVIEW_FIELDS.contains(&f.as_str()))
            .collect();
        let mut reminder =
            merge_fields(&original, &ours, &theirs, fields.iter().map(String::as_str));
        let (base_review, server_review, client_review) =
            (review(&original), review(&ours), review(&theirs));
        let chosen = if client_review == base_review {
            server_review
        } else if server_review == base_review || server_review == client_review {
            client_review
        } else {
            let client_first = !client_review.0.is_null()
                && (server_review.0.is_null() || earlier(&client_review.0, &server_review.0));
            winner = Some(if client_first {
                Side::Client
            } else {
                Side::Server
            });
            if client_first {
                client_review
            } else {
                server_review
            }
        };
        reminder.insert(REVIEW_FIELDS[0].into(), chosen.0);
        reminder.insert(REVIEW_FIELDS[1].into(), chosen.1);
        merged.insert(uid, Value::Object(reminder));
    }
    (merged, winner)
}

fn keep_one_pending(reminders: &mut Payload, preferred: &Payload) {
    let is_pending =
        |r: &Value| get_obj(r, "reviewed_at").is_null() && get_obj(r, "deleted_at").is_null();
    let pending: Vec<String> = reminders
        .iter()
        .filter(|(_, r)| is_pending(r))
        .map(|(uid, _)| uid.clone())
        .collect();
    if pending.len() < 2 {
        return;
    }
    let mut candidates: Vec<String> = pending
        .iter()
        .filter(|uid| {
            preferred
                .get(*uid)
                .is_some_and(|p| get_obj(p, "reviewed_at").is_null())
        })
        .cloned()
        .collect();
    if candidates.is_empty() {
        candidates = pending.clone();
    }
    let keep = candidates
        .into_iter()
        .max_by(|a, b| {
            let created = |uid: &String| {
                get_obj(&reminders[uid], "created_at")
                    .as_str()
                    .unwrap_or("")
                    .to_string()
            };
            (created(a), a.clone()).cmp(&(created(b), b.clone()))
        })
        .expect("at least one candidate");
    for uid in pending {
        if uid != keep {
            reminders.remove(&uid);
        }
    }
}

fn get_obj<'a>(value: &'a Value, key: &str) -> &'a Value {
    value.get(key).unwrap_or(&Value::Null)
}

pub fn merge_note(base: &Payload, server: &Payload, client: &Payload) -> (Payload, bool) {
    let excluded: Vec<&str> = TEXT_FIELDS
        .iter()
        .chain(&SCHEDULING_FIELDS)
        .chain(&NOTE_STRUCTURE)
        .copied()
        .collect();
    let plain: Vec<String> = keys(server, client)
        .into_iter()
        .filter(|k| !excluded.contains(&k.as_str()))
        .collect();
    let mut merged = merge_fields(base, server, client, plain.iter().map(String::as_str));

    let mut conflict = false;
    for name in TEXT_FIELDS {
        let (original, ours, theirs) = (get(base, name), get(server, name), get(client, name));
        let value = if theirs == original {
            ours
        } else if ours == original || ours == theirs {
            theirs
        } else {
            conflict = true;
            ours
        };
        merged.insert(name.into(), value.clone());
    }

    if get(base, "deleted_at").is_null() && !get(&merged, "deleted_at").is_null() {
        let edited = |side: &Payload| {
            TEXT_FIELDS
                .iter()
                .any(|name| get(side, name) != get(base, name))
        };
        if (get(client, "deleted_at").is_null() && edited(client))
            || (get(server, "deleted_at").is_null() && edited(server))
        {
            merged.insert("deleted_at".into(), Value::Null);
        }
    }

    let tags = merge_set(base.get("tags"), server.get("tags"), client.get("tags"));
    merged.insert(
        "tags".into(),
        Value::Array(tags.into_iter().map(Value::String).collect()),
    );

    let base_reminders = as_map(base.get("reminders"));
    let server_reminders = as_map(server.get("reminders"));
    let client_reminders = as_map(client.get("reminders"));
    let (mut reminders, winner) =
        merge_reminders(&base_reminders, &server_reminders, &client_reminders);
    let scheduling_side = match winner {
        Some(side) => {
            let (winner_reminders, loser_reminders) = match side {
                Side::Server => (&server_reminders, &client_reminders),
                Side::Client => (&client_reminders, &server_reminders),
            };
            let added_by_loser: Vec<String> = reminders
                .keys()
                .filter(|uid| {
                    !base_reminders.contains_key(*uid)
                        && loser_reminders.contains_key(*uid)
                        && !winner_reminders.contains_key(*uid)
                })
                .cloned()
                .collect();
            for uid in added_by_loser {
                reminders.remove(&uid);
            }
            side
        }
        None => {
            let client_changed = SCHEDULING_FIELDS
                .iter()
                .any(|name| get(client, name) != get(base, name));
            if client_changed {
                Side::Client
            } else {
                Side::Server
            }
        }
    };
    let (side_payload, side_reminders) = match scheduling_side {
        Side::Server => (server, &server_reminders),
        Side::Client => (client, &client_reminders),
    };
    for name in SCHEDULING_FIELDS {
        merged.insert(name.into(), get(side_payload, name).clone());
    }
    keep_one_pending(&mut reminders, side_reminders);
    merged.insert("reminders".into(), Value::Object(reminders));
    (merged, conflict)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn p(value: Value) -> Payload {
        value.as_object().unwrap().clone()
    }

    fn reminder(created_at: &str, reviewed_at: Option<&str>, rating: Option<&str>) -> Value {
        json!({
            "remind_at": created_at,
            "created_at": created_at,
            "updated_at": created_at,
            "deleted_at": null,
            "reviewed_at": reviewed_at,
            "rating": rating,
            "ease_factor": null,
            "interval_days": null,
            "fsrs_card": "card-0",
        })
    }

    const T0: &str = "2026-01-01T00:00:00+00:00";

    fn note(overrides: Value) -> Payload {
        let mut base = p(json!({
            "name": "Title",
            "content": "Body",
            "created_at": T0,
            "updated_at": T0,
            "deleted_at": null,
            "paused_at": null,
            "in_review": true,
            "ease_factor": 2.5,
            "interval_days": 0,
            "algorithm": "fsrs",
            "fsrs_card": "card-0",
            "project": null,
            "tags": ["difficulty-medium"],
            "reminders": { "r0": reminder(T0, None, None) },
        }));
        for (key, value) in overrides.as_object().unwrap() {
            base.insert(key.clone(), value.clone());
        }
        base
    }

    #[test]
    fn record_takes_each_sides_changes_and_the_client_wins_ties() {
        let base = p(json!({ "name": "A", "paused": false, "deleted_at": null }));
        let server = p(json!({ "name": "A", "paused": true, "deleted_at": null }));
        let client = p(json!({ "name": "B", "paused": false, "deleted_at": null }));
        assert_eq!(
            merge_record(&base, &server, &client),
            p(json!({ "name": "B", "paused": true, "deleted_at": null }))
        );
        let mut renamed = server.clone();
        renamed.insert("name".into(), json!("C"));
        assert_eq!(merge_record(&base, &renamed, &client)["name"], "B");
    }

    #[test]
    fn tag_sets_keep_additions_and_removals_from_both_sides() {
        let merged = merge_set(
            Some(&json!(["a", "b"])),
            Some(&json!(["a", "b", "c"])),
            Some(&json!(["b", "d"])),
        );
        assert_eq!(merged, ["b", "c", "d"]);
    }

    #[test]
    fn edits_to_different_fields_merge_without_a_conflict() {
        let (merged, conflict) = merge_note(
            &note(json!({})),
            &note(json!({ "name": "New title" })),
            &note(json!({ "content": "New body" })),
        );
        assert!(!conflict);
        assert_eq!(
            (&merged["name"], &merged["content"]),
            (&json!("New title"), &json!("New body"))
        );
    }

    #[test]
    fn both_sides_editing_the_body_conflicts_and_keeps_the_server_text() {
        let (merged, conflict) = merge_note(
            &note(json!({})),
            &note(json!({ "content": "Server" })),
            &note(json!({ "content": "Client" })),
        );
        assert!(conflict);
        assert_eq!(merged["content"], "Server");
    }

    #[test]
    fn identical_edits_are_not_a_conflict() {
        let same = note(json!({ "content": "Same" }));
        let (merged, conflict) = merge_note(&note(json!({})), &same, &same);
        assert!(!conflict);
        assert_eq!(merged["content"], "Same");
    }

    #[test]
    fn an_edit_brings_back_a_note_the_other_side_deleted() {
        let deleted = note(json!({ "deleted_at": "2026-02-01T00:00:00+00:00" }));
        let edited = note(json!({ "content": "Edited" }));
        let (merged, _) = merge_note(&note(json!({})), &deleted, &edited);
        assert!(merged["deleted_at"].is_null());
        assert_eq!(merged["content"], "Edited");
        let (merged, _) = merge_note(&note(json!({})), &edited, &deleted);
        assert!(merged["deleted_at"].is_null());
    }

    #[test]
    fn a_delete_wins_when_the_other_side_only_changed_organization() {
        let deleted = "2026-02-01T00:00:00+00:00";
        let (merged, _) = merge_note(
            &note(json!({})),
            &note(json!({ "project": "p1" })),
            &note(json!({ "deleted_at": deleted })),
        );
        assert_eq!(merged["deleted_at"], deleted);
        assert_eq!(merged["project"], "p1");
    }

    #[test]
    fn a_review_on_one_side_merges_with_an_edit_on_the_other() {
        let reviewed = json!({
            "r0": reminder(T0, Some("2026-01-02T00:00:00+00:00"), Some("good")),
            "r1": reminder("2026-01-02T00:00:00+00:00", None, None),
        });
        let client = note(json!({ "fsrs_card": "card-1", "reminders": reviewed }));
        let (merged, conflict) = merge_note(
            &note(json!({})),
            &note(json!({ "content": "Edited" })),
            &client,
        );
        assert!(!conflict);
        assert_eq!(merged["content"], "Edited");
        assert_eq!(merged["fsrs_card"], "card-1");
        assert_eq!(merged["reminders"], reviewed);
    }

    #[test]
    fn reviewing_the_same_card_on_both_sides_keeps_the_earlier_review() {
        let first = "2026-01-02T08:00:00+00:00";
        let later = "2026-01-02T09:00:00+00:00";
        let server = note(json!({
            "fsrs_card": "server-card",
            "reminders": { "r0": reminder(T0, Some(later), Some("again")), "s1": reminder(later, None, None) },
        }));
        let client = note(json!({
            "fsrs_card": "client-card",
            "reminders": { "r0": reminder(T0, Some(first), Some("good")), "c1": reminder(first, None, None) },
        }));
        let (merged, conflict) = merge_note(&note(json!({})), &server, &client);
        assert!(!conflict);
        assert_eq!(merged["fsrs_card"], "client-card");
        let uids: Vec<&String> = merged["reminders"].as_object().unwrap().keys().collect();
        assert_eq!(uids, ["c1", "r0"]);
        assert_eq!(merged["reminders"]["r0"]["rating"], "good");
    }

    #[test]
    fn a_merge_never_leaves_two_pending_reminders() {
        let server = note(json!({ "reminders": {
            "r0": reminder(T0, None, None),
            "s1": reminder("2026-03-01T00:00:00+00:00", None, None),
        }}));
        let client = note(json!({ "reminders": {
            "r0": reminder(T0, None, None),
            "c1": reminder("2026-02-01T00:00:00+00:00", None, None),
        }}));
        let (merged, _) = merge_note(&note(json!({})), &server, &client);
        let pending = merged["reminders"]
            .as_object()
            .unwrap()
            .values()
            .filter(|r| r["reviewed_at"].is_null())
            .count();
        assert_eq!(pending, 1);
    }
}
