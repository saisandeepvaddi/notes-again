import main


def build_dist(tmp_path, monkeypatch):
    dist = tmp_path / "client"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>app</title>")
    (dist / "favicon.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>")
    (tmp_path / "secret.txt").write_text("outside the build")
    monkeypatch.setattr(main, "frontend_dist", dist)
    monkeypatch.setattr(main, "index_file", dist / "index.html")


def test_serves_root_level_build_files(client, tmp_path, monkeypatch):
    build_dist(tmp_path, monkeypatch)
    response = client.get("/favicon.svg")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")


def test_unknown_paths_fall_back_to_the_app(client, tmp_path, monkeypatch):
    build_dist(tmp_path, monkeypatch)
    response = client.get("/notes/42")
    assert response.status_code == 200
    assert "<title>app</title>" in response.text


def test_does_not_serve_files_outside_the_build(client, tmp_path, monkeypatch):
    build_dist(tmp_path, monkeypatch)
    response = client.get("/..%2Fsecret.txt")
    assert "outside the build" not in response.text
    assert "<title>app</title>" in response.text
