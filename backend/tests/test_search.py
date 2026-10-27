import pytest
from sqlalchemy import text

from search.index import check_search_index, ensure_search_index
from search.query import MARK_END, MARK_START
from tests.conftest import ME, bearer


def create(client, name="A note", content="body", **body) -> dict:
    response = client.post(
        "/api/notes/create", json={"name": name, "content": content, **body}
    )
    assert response.status_code == 200, response.text
    return response.json()


def search(client, q: str, **params) -> dict:
    response = client.get("/api/search", params={"q": q, **params})
    assert response.status_code == 200, response.text
    return response.json()


def note_ids(client, q: str) -> list[int]:
    return [hit["id"] for hit in search(client, q)["notes"]]


def marked(term: str) -> str:
    return f"{MARK_START}{term}{MARK_END}"


def test_finds_notes_by_substring_of_title_or_body(client):
    title = create(client, "Longest Substring Without Repeating Characters")
    body = create(client, "Two Sum", content="Use a map from value to index.")
    create(client, "Unrelated", content="nothing to see")

    assert note_ids(client, "substr") == [title["id"]]
    assert note_ids(client, "rom valu") == [body["id"]]
    assert note_ids(client, "value") == [body["id"]]


def test_every_term_must_match(client):
    both = create(client, "Sliding window", content="keep a set of seen values")
    create(client, "Sliding puzzle", content="nothing else")

    assert note_ids(client, "sliding seen") == [both["id"]]


def test_title_matches_rank_above_body_matches(client):
    in_body = create(
        client, "Arrays", content="graph traversal, graph colouring, graph cuts"
    )
    in_title = create(client, "Graph basics", content="nodes and edges")

    assert note_ids(client, "graph") == [in_title["id"], in_body["id"]]


def test_results_are_highlighted_and_snippets_are_plain_text(client):
    create(
        client,
        "**Contains** Duplicate",
        content="# Approach\n\nWalk the array once and keep a [set](https://x.dev) of seen values.",
    )

    hit = search(client, "set")["notes"][0]
    assert hit["title"] == "Contains Duplicate"
    assert hit["title_marked"] == "Contains Duplicate"
    assert marked("set") in hit["snippet"]
    assert "https://" not in hit["snippet"]
    assert "#" not in hit["snippet"]
    assert hit["status"] == "active"


def test_long_bodies_get_a_window_around_the_first_match(client):
    filler = " ".join(f"word{i}" for i in range(200))
    create(client, "Long", content=f"{filler} needle {filler}")

    snippet = search(client, "needle")["notes"][0]["snippet"]
    assert snippet.startswith("…") and snippet.endswith("…")
    assert marked("needle") in snippet
    assert len(snippet) < 200


def test_index_follows_edits_and_deletes(client):
    note = create(client, "Original title", content="first body")
    assert note_ids(client, "original") == [note["id"]]

    client.patch(
        f"/api/notes/{note['id']}", json={"name": "Renamed", "content": "second body"}
    )
    assert note_ids(client, "original") == []
    assert note_ids(client, "renamed") == [note["id"]]
    assert note_ids(client, "second") == [note["id"]]

    client.delete(f"/api/notes/{note['id']}")
    assert note_ids(client, "renamed") == []

    client.patch(f"/api/notes/{note['id']}/restore")
    assert note_ids(client, "renamed") == [note["id"]]


def test_hard_deleted_notes_leave_the_index(client):
    note = create(client, "Ephemeral")
    with client.app.state.engine.begin() as conn:
        conn.execute(text("DELETE FROM notes WHERE id = :id"), {"id": note["id"]})
        rows = conn.execute(
            text("SELECT rowid FROM notes_fts WHERE notes_fts MATCH 'Ephemeral'")
        ).all()
    assert rows == []
    assert check_search_index(client.app.state.engine) is None


@pytest.mark.parametrize(
    "q",
    [
        '"',
        '""',
        "*",
        "NEAR(",
        "-x",
        "a:b",
        "title:foo",
        "AND OR NOT",
        "(",
        "\\",
        "%",
        "_",
        "🙂",
        "x" * 400,
        "x" * 1000,
    ],
)
def test_hostile_queries_never_error(client, q):
    create(client, "Plain note")
    response = client.get("/api/search", params={"q": q})
    assert response.status_code == (422 if len(q) > 400 else 200)


def test_like_wildcards_are_literal(client):
    create(client, "100% sure", content="snake_case")
    create(client, "Other", content="snakeXcase")

    assert len(note_ids(client, "0%")) == 1
    assert len(note_ids(client, "e_c")) == 1


def test_short_only_queries_search_titles(client):
    create(client, "Zeta", content="uses dp")
    title = create(client, "dp on trees")

    assert note_ids(client, "dp") == [title["id"]]


def test_short_terms_filter_indexed_matches_by_title_or_body(client):
    body = create(client, "Trees one", content="uses dp")
    create(client, "Trees two", content="greedy")

    assert note_ids(client, "trees dp") == [body["id"]]


def test_accents_are_ignored(client):
    note = create(client, "Café notes")
    assert note_ids(client, "cafe") == [note["id"]]


def test_projects_and_tags_are_found_by_name(client):
    project = client.post("/api/projects/create", json={"name": "NeetCode 150"}).json()
    tag = client.post("/api/tags/create", json={"name": "neetcode-graphs"}).json()
    create(client, "In project", project_id=project["id"], tag_ids=[tag["id"]])

    results = search(client, "neetcode")
    assert [(p["id"], p["note_count"]) for p in results["projects"]] == [
        (project["id"], 1)
    ]
    assert [(t["id"], t["note_count"]) for t in results["tags"]] == [(tag["id"], 1)]
    assert results["projects"][0]["name_marked"] == f"{marked('NeetCode')} 150"


def test_empty_query_returns_nothing(client):
    create(client)
    assert search(client, "   ") == {"notes": [], "projects": [], "tags": []}


def test_notes_list_search_uses_the_same_matching(client):
    note = create(client, "Longest Substring", content="sliding window")
    create(client, "Other")

    items = client.get("/api/notes/list", params={"search": "substr"}).json()["items"]
    assert [n["id"] for n in items] == [note["id"]]
    items = client.get("/api/notes/list", params={"search": "dow"}).json()["items"]
    assert [n["id"] for n in items] == [note["id"]]


def test_existing_databases_get_the_index_built(client):
    note = create(client, "Built later")
    engine = client.app.state.engine
    with engine.begin() as conn:
        for name in ("after_insert", "after_delete", "after_update"):
            conn.execute(text(f"DROP TRIGGER notes_fts_{name}"))
        conn.execute(text("DROP TABLE notes_fts"))

    assert check_search_index(engine) is not None
    ensure_search_index(engine)
    assert check_search_index(engine) is None
    assert note_ids(client, "built") == [note["id"]]


@pytest.mark.usefixtures("real_auth")
def test_capture_tokens_cannot_search_but_app_tokens_can(client):
    def mint(scope: str) -> dict:
        response = client.post(
            "/api/tokens/create", json={"name": scope, "scope": scope}, headers=ME
        )
        return bearer(response.json()["token"])

    assert client.get("/api/search?q=abc", headers=mint("capture")).status_code == 403
    assert client.get("/api/search?q=abc", headers=mint("app")).status_code == 200
