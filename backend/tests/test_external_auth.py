import datetime

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

import auth
import external_auth
from main import app
from tests.conftest import bearer
from trusted_proxies import is_trusted


@pytest.mark.parametrize(
    ("setting", "host", "expected"),
    [
        ("", "127.0.0.1", True),
        ("", "::1", True),
        ("", "10.0.0.5", False),
        ("10.0.0.0/8", "10.0.0.5", True),
        ("10.0.0.0/8, 192.168.1.2", "192.168.1.2", True),
        ("10.0.0.0/8", "172.17.0.1", False),
        ("*", "203.0.113.9", True),
        ("", "testclient", False),
        ("", None, False),
    ],
)
def test_trusted_proxies(monkeypatch, setting, host, expected):
    monkeypatch.setenv("TRUSTED_PROXIES", setting)
    assert is_trusted(host) is expected


def client_from(host: str, tmp_path) -> TestClient:
    return TestClient(app, client=(host, 50000))


@pytest.fixture
def proxy_mode(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "AUTH_MODE", "proxy")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "proxy.db"))
    monkeypatch.delenv("TRUSTED_PROXIES", raising=False)
    monkeypatch.delenv("AUTH_PROXY_HEADER", raising=False)
    monkeypatch.delenv("ALLOWED_EMAILS", raising=False)


@pytest.mark.usefixtures("proxy_mode")
def test_proxy_header_is_trusted_only_from_a_trusted_peer(tmp_path):
    with client_from("127.0.0.1", tmp_path) as client:
        assert client.get("/api/projects/list").status_code == 401
        headers = {"Remote-User": "sai"}
        assert client.get("/api/projects/list", headers=headers).status_code == 200
        status = client.get("/api/auth/status", headers=headers).json()
        assert status["mode"] == "proxy"
        assert status["authenticated"] is True
        assert status["username"] == "sai"

    with client_from("203.0.113.9", tmp_path) as client:
        headers = {"Remote-User": "sai"}
        assert client.get("/api/projects/list", headers=headers).status_code == 401
        assert (
            client.get("/api/auth/status", headers=headers).json()["authenticated"]
            is False
        )


@pytest.mark.usefixtures("proxy_mode")
def test_forwarded_for_does_not_make_an_untrusted_peer_trusted(tmp_path):
    with client_from("203.0.113.9", tmp_path) as client:
        headers = {"Remote-User": "sai", "X-Forwarded-For": "127.0.0.1"}
        assert client.get("/api/projects/list", headers=headers).status_code == 401


@pytest.mark.usefixtures("proxy_mode")
def test_proxy_honours_custom_header_networks_and_allowlist(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXIES", "10.0.0.0/8")
    monkeypatch.setenv("AUTH_PROXY_HEADER", "Tailscale-User-Login")
    monkeypatch.setenv("AUTH_PROXY_LOGOUT_URL", "https://auth.example.com/logout")
    monkeypatch.setenv("ALLOWED_EMAILS", "me@x.dev")
    with client_from("10.1.2.3", tmp_path) as client:
        mine = {"Tailscale-User-Login": "me@x.dev"}
        theirs = {"Tailscale-User-Login": "them@x.dev"}
        assert client.get("/api/projects/list", headers=mine).status_code == 200
        assert client.get("/api/projects/list", headers=theirs).status_code == 403
        assert (
            client.get(
                "/api/projects/list", headers={"Remote-User": "me@x.dev"}
            ).status_code
            == 401
        )
        status = client.get("/api/auth/status", headers=mine).json()
        assert status["logout_url"] == "https://auth.example.com/logout"


@pytest.mark.usefixtures("proxy_mode")
def test_api_tokens_work_in_proxy_mode(tmp_path):
    with client_from("127.0.0.1", tmp_path) as client:
        created = client.post(
            "/api/tokens/create", json={"name": "Ext"}, headers={"Remote-User": "sai"}
        ).json()
    with client_from("203.0.113.9", tmp_path) as client:
        assert (
            client.get(
                "/api/projects/list", headers=bearer(created["token"])
            ).status_code
            == 200
        )


class FakeJwks:
    def __init__(self, public_key):
        self.public_key = public_key

    def get_signing_key_from_jwt(self, _token):
        return type("Key", (), {"key": self.public_key})()


@pytest.fixture
def cloudflare(tmp_path, monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(auth, "AUTH_MODE", "cloudflare-access")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "cf.db"))
    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", "myteam")
    monkeypatch.setenv("CF_ACCESS_AUD", "aud-123")
    monkeypatch.delenv("ALLOWED_EMAILS", raising=False)
    monkeypatch.setattr(
        external_auth,
        "_jwks_client",
        lambda _domain: FakeJwks(private_key.public_key()),
    )

    def sign(**overrides) -> str:
        now = datetime.datetime.now(datetime.UTC)
        claims = {
            "aud": ["aud-123"],
            "iss": "https://myteam.cloudflareaccess.com",
            "email": "me@x.dev",
            "iat": now,
            "exp": now + datetime.timedelta(minutes=5),
            **overrides,
        }
        return jwt.encode(claims, private_key, algorithm="RS256")

    with TestClient(app) as client:
        yield client, sign


def test_cloudflare_access_accepts_a_valid_assertion(cloudflare):
    client, sign = cloudflare
    assert client.get("/api/projects/list").status_code == 401
    headers = {"Cf-Access-Jwt-Assertion": sign()}
    assert client.get("/api/projects/list", headers=headers).status_code == 200
    status = client.get("/api/auth/status", headers=headers).json()
    assert status == {
        **status,
        "mode": "cloudflare-access",
        "authenticated": True,
        "username": "me@x.dev",
        "logout_url": "/cdn-cgi/access/logout",
    }


def test_cloudflare_access_accepts_the_cookie(cloudflare):
    client, sign = cloudflare
    client.cookies.set("CF_Authorization", sign())
    assert client.get("/api/projects/list").status_code == 200


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": ["someone-else"]},
        {"iss": "https://other.cloudflareaccess.com"},
        {"exp": datetime.datetime(2020, 1, 1, tzinfo=datetime.UTC)},
    ],
)
def test_cloudflare_access_rejects_bad_assertions(cloudflare, overrides):
    client, sign = cloudflare
    headers = {"Cf-Access-Jwt-Assertion": sign(**overrides)}
    assert client.get("/api/projects/list", headers=headers).status_code == 401


def test_cloudflare_access_rejects_a_token_signed_by_another_key(cloudflare):
    client, _sign = cloudflare
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode(
        {
            "aud": ["aud-123"],
            "iss": "https://myteam.cloudflareaccess.com",
            "email": "me@x.dev",
            "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=5),
        },
        other,
        algorithm="RS256",
    )
    assert (
        client.get(
            "/api/projects/list", headers={"Cf-Access-Jwt-Assertion": forged}
        ).status_code
        == 401
    )


def test_cloudflare_access_honours_the_allowlist(cloudflare, monkeypatch):
    client, sign = cloudflare
    monkeypatch.setenv("ALLOWED_EMAILS", "someone@else.dev")
    assert (
        client.get(
            "/api/projects/list", headers={"Cf-Access-Jwt-Assertion": sign()}
        ).status_code
        == 403
    )


def test_cloudflare_access_needs_its_settings(monkeypatch):
    monkeypatch.delenv("CF_ACCESS_TEAM_DOMAIN", raising=False)
    monkeypatch.setenv("CF_ACCESS_AUD", "x")
    with pytest.raises(RuntimeError, match="CF_ACCESS_TEAM_DOMAIN"):
        external_auth.check_cloudflare_config()
    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", "https://MyTeam.cloudflareaccess.com/")
    external_auth.check_cloudflare_config()
    assert external_auth.cloudflare_team_domain() == "myteam.cloudflareaccess.com"
