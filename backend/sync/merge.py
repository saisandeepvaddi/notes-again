from typing import Literal, NamedTuple

from .payloads import TEXT_FIELDS, Payload

Side = Literal["server", "client"]

SCHEDULING_FIELDS = ("ease_factor", "interval_days", "algorithm", "fsrs_card")
REVIEW_FIELDS = ("reviewed_at", "rating")
NOTE_STRUCTURE = ("tags", "reminders")


class NoteMerge(NamedTuple):
    note: Payload
    conflict: bool


def merge_fields(base: Payload, server: Payload, client: Payload, fields) -> Payload:
    merged = {}
    for name in fields:
        unchanged_by_client = client.get(name) == base.get(name)
        merged[name] = server.get(name) if unchanged_by_client else client.get(name)
    return merged


def merge_record(base: Payload, server: Payload, client: Payload) -> Payload:
    return merge_fields(base, server, client, server.keys() | client.keys())


def merge_set(base: list, server: list, client: list) -> list:
    base_set, server_set, client_set = set(base), set(server), set(client)
    added = (server_set - base_set) | (client_set - base_set)
    removed = (base_set - server_set) | (base_set - client_set)
    return sorted((base_set | added) - removed)


def _review(reminder: Payload) -> tuple:
    return tuple(reminder.get(name) for name in REVIEW_FIELDS)


def merge_reminders(
    base: dict[str, Payload], server: dict[str, Payload], client: dict[str, Payload]
) -> tuple[dict[str, Payload], Side | None]:
    merged: dict[str, Payload] = {}
    review_winner: Side | None = None
    for uid in server.keys() | client.keys():
        original, ours, theirs = base.get(uid), server.get(uid), client.get(uid)
        if ours is None or theirs is None:
            present = ours if ours is not None else theirs
            if original is None or present != original:
                merged[uid] = present
            continue
        original = original if original is not None else ours
        fields = [
            name for name in ours.keys() | theirs.keys() if name not in REVIEW_FIELDS
        ]
        reminder = merge_fields(original, ours, theirs, fields)
        base_review, server_review, client_review = (
            _review(original),
            _review(ours),
            _review(theirs),
        )
        if client_review == base_review:
            review = server_review
        elif server_review in (base_review, client_review):
            review = client_review
        else:
            client_first = client_review[0] is not None and (
                server_review[0] is None or client_review[0] < server_review[0]
            )
            review_winner = "client" if client_first else "server"
            review = client_review if client_first else server_review
        reminder.update(zip(REVIEW_FIELDS, review, strict=True))
        merged[uid] = reminder
    return merged, review_winner


def _keep_one_pending(
    reminders: dict[str, Payload], preferred: dict[str, Payload]
) -> None:
    pending = [
        uid
        for uid, reminder in reminders.items()
        if reminder.get("reviewed_at") is None and reminder.get("deleted_at") is None
    ]
    if len(pending) < 2:
        return
    candidates = [
        uid
        for uid in pending
        if uid in preferred and preferred[uid].get("reviewed_at") is None
    ] or pending
    keep = max(
        candidates, key=lambda uid: (reminders[uid].get("created_at") or "", uid)
    )
    for uid in pending:
        if uid != keep:
            del reminders[uid]


def merge_note(base: Payload, server: Payload, client: Payload) -> NoteMerge:
    plain = [
        name
        for name in server.keys() | client.keys()
        if name not in TEXT_FIELDS + SCHEDULING_FIELDS + NOTE_STRUCTURE
    ]
    merged = merge_fields(base, server, client, plain)

    conflict = False
    for name in TEXT_FIELDS:
        original, ours, theirs = base.get(name), server.get(name), client.get(name)
        if theirs == original:
            merged[name] = ours
        elif ours in (original, theirs):
            merged[name] = theirs
        else:
            merged[name] = ours
            conflict = True

    if base.get("deleted_at") is None and merged.get("deleted_at") is not None:
        edited = {
            side: any(payload.get(name) != base.get(name) for name in TEXT_FIELDS)
            for side, payload in (("server", server), ("client", client))
        }
        if (client.get("deleted_at") is None and edited["client"]) or (
            server.get("deleted_at") is None and edited["server"]
        ):
            merged["deleted_at"] = None

    merged["tags"] = merge_set(
        base.get("tags", []), server.get("tags", []), client.get("tags", [])
    )

    reminders, review_winner = merge_reminders(
        base.get("reminders", {}),
        server.get("reminders", {}),
        client.get("reminders", {}),
    )
    sides = {"server": server, "client": client}
    if review_winner is not None:
        scheduling_side: Side = review_winner
        loser = sides["client" if review_winner == "server" else "server"]
        winner_reminders = sides[review_winner].get("reminders", {})
        for uid in list(reminders):
            added_by_loser = (
                uid not in base.get("reminders", {})
                and uid in loser.get("reminders", {})
                and uid not in winner_reminders
            )
            if added_by_loser:
                del reminders[uid]
    else:
        client_changed = any(
            client.get(name) != base.get(name) for name in SCHEDULING_FIELDS
        )
        scheduling_side = "client" if client_changed else "server"
    for name in SCHEDULING_FIELDS:
        merged[name] = sides[scheduling_side].get(name)
    _keep_one_pending(reminders, sides[scheduling_side].get("reminders", {}))
    merged["reminders"] = reminders
    return NoteMerge(merged, conflict)
