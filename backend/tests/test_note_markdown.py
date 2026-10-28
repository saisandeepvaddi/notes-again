import pytest
import yaml

from tests.conftest import ME, bearer


def create(client, name="A note", content="Body text.", **body) -> dict:
    response = client.post(
        "/api/notes/create", json={"name": name, "content": content, **body}
    )
    assert response.status_code == 200, response.text
    return response.json()


def markdown(client, note_id: int, **params) -> str:
    response = client.get(f"/api/notes/{note_id}/markdown", params=params)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "text/markdown; charset=utf-8"
    return response.text


def split(document: str) -> tuple[dict, str]:
    assert document.startswith("---\n")
    head, body = document[4:].split("\n---\n", 1)
    return yaml.safe_load(head), body


def test_frontmatter_carries_the_notes_metadata(client):
    project = client.post("/api/projects/create", json={"name": "NeetCode 150"}).json()
    tags = [
        client.post("/api/tags/create", json={"name": name}).json()["id"]
        for name in ("sliding-window", "Arrays")
    ]
    note = create(
        client,
        name="[3. Longest Substring](https://leetcode.com/problems/x/)",
        project_id=project["id"],
        tag_ids=tags,
        difficulty="hard",
    )

    meta, body = split(markdown(client, note["id"]))

    assert meta["title"] == "3. Longest Substring"
    assert meta["source"] == "https://leetcode.com/problems/x/"
    assert meta["project"] == "NeetCode 150"
    assert meta["tags"] == ["Arrays", "sliding-window"]
    assert meta["difficulty"] == "hard"
    assert meta["status"] == "in-review"
    assert meta["reviews"] == 0
    assert {"next_review", "created", "updated"} <= meta.keys()
    assert (
        body
        == "\n# [3. Longest Substring](https://leetcode.com/problems/x/)\n\nBody text.\n"
    )


@pytest.mark.parametrize(
    "title",
    [
        'He said "hi": a #1 note',
        "key: value",
        "- starts like a list",
        "Tab\there",
        "‘Unicode’ 日本語",
    ],
)
def test_titles_that_look_like_yaml_stay_valid_yaml(client, title):
    note = create(client, name=title)
    meta, _ = split(markdown(client, note["id"]))
    assert meta["title"] == title


def test_status_and_review_fields_follow_the_review_state(client):
    note = create(client)
    client.patch(f"/api/notes/{note['id']}/status", json={"status": "paused"})
    meta, _ = split(markdown(client, note["id"]))
    assert meta["status"] == "paused"
    assert "next_review" not in meta

    client.patch(f"/api/notes/{note['id']}/status", json={"status": "note-only"})
    meta, _ = split(markdown(client, note["id"]))
    assert meta["status"] == "note-only"
    assert "next_review" not in meta


def test_reviews_are_counted(client):
    note = create(client)
    pending = note["reminders"][0]
    client.patch(
        f"/api/notes/reminders/{pending['id']}/now",
        json={"action": "review", "rating": "good"},
    )
    meta, _ = split(markdown(client, note["id"]))
    assert meta["reviews"] == 1
    assert "next_review" in meta


def test_a_notes_own_frontmatter_is_merged_and_wins_on_conflicts(client):
    content = "---\nauthor: me\nstatus: draft\n---\n\nThe body."
    note = create(client, content=content)

    meta, body = split(markdown(client, note["id"]))

    assert meta["author"] == "me"
    assert meta["status"] == "draft"
    assert meta["title"] == "A note"
    assert body.count("---") == 0
    assert body.endswith("\nThe body.\n")


def test_a_leading_h1_matching_the_title_is_not_repeated(client):
    note = create(client, name="Graphs", content="# Graphs\n\nBFS first.")
    _, body = split(markdown(client, note["id"]))
    assert body == "\n# Graphs\n\nBFS first.\n"

    other = create(client, name="Graphs", content="# Trees\n\nDFS first.")
    _, body = split(markdown(client, other["id"]))
    assert body == "\n# Graphs\n\n# Trees\n\nDFS first.\n"


def test_body_markdown_and_code_are_kept_verbatim(client):
    content = "Intro  \nhard break\n\n```python\n\n\n\nx = 1  \n```\n\n> quote\n\n| a | b |\n|---|---|\n| 1 | 2 |"
    note = create(client, content=f"\r\n\n{content}\n\n\n")
    _, body = split(markdown(client, note["id"]))
    assert body == f"\n# A note\n\n{content}\n"


def test_empty_notes_still_produce_a_document(client):
    note = create(client, name="   ", content="")
    meta, body = split(markdown(client, note["id"]))
    assert meta["title"] == "Untitled"
    assert body == "\n# Untitled\n"


def test_download_names_the_file_after_the_title(client):
    note = create(client, name="Café: Sorting / Searching?")
    response = client.get(f"/api/notes/{note['id']}/markdown", params={"download": 1})
    disposition = response.headers["content-disposition"]
    assert disposition.startswith('attachment; filename="Caf-Sorting-Searching.md"')
    assert "filename*=UTF-8''Caf%C3%A9-Sorting-Searching.md" in disposition


def test_trashed_and_missing_notes_404(client):
    note = create(client)
    client.delete(f"/api/notes/{note['id']}")
    assert client.get(f"/api/notes/{note['id']}/markdown").status_code == 404
    assert client.get("/api/notes/999999/markdown").status_code == 404


@pytest.mark.usefixtures("real_auth")
def test_app_tokens_can_read_markdown_but_capture_tokens_cannot(client):
    note = client.post(
        "/api/notes/create", json={"name": "n", "content": "c"}, headers=ME
    ).json()

    def mint(scope: str) -> dict:
        response = client.post(
            "/api/tokens/create", json={"name": scope, "scope": scope}, headers=ME
        )
        return bearer(response.json()["token"])

    url = f"/api/notes/{note['id']}/markdown"
    assert client.get(url, headers=mint("capture")).status_code == 403
    assert client.get(url, headers=mint("app")).status_code == 200
