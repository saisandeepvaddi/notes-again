"""App-wide settings: currently just which scheduler new notes get."""


def test_settings_default_to_fsrs(client):
    response = client.get("/api/settings")
    assert response.status_code == 200
    assert response.json() == {"default_algorithm": "fsrs"}


def test_updating_the_algorithm_persists(client):
    response = client.patch("/api/settings", json={"default_algorithm": "sm2"})
    assert response.status_code == 200
    assert response.json() == {"default_algorithm": "sm2"}
    assert client.get("/api/settings").json() == {"default_algorithm": "sm2"}


def test_updating_to_an_unknown_algorithm_422s(client):
    response = client.patch("/api/settings", json={"default_algorithm": "not-a-real-one"})
    assert response.status_code == 422


def test_new_notes_use_whatever_the_current_default_is(client):
    client.patch("/api/settings", json={"default_algorithm": "sm2"})
    note = client.post("/api/notes/create", json={"name": "n", "content": "c"}).json()
    assert note["algorithm"] == "sm2"

    client.patch("/api/settings", json={"default_algorithm": "fsrs"})
    note2 = client.post("/api/notes/create", json={"name": "n2", "content": "c"}).json()
    assert note2["algorithm"] == "fsrs"
    # Changing the default doesn't reach back and reinterpret existing notes.
    assert client.get(f"/api/notes/{note['id']}").json()["algorithm"] == "sm2"
