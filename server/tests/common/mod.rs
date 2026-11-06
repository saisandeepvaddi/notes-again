#![allow(dead_code)]

pub mod jwt;

use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Mutex;

use axum::Router;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{HeaderMap, Method, Request, StatusCode};
use notes_again_server::app;
use notes_again_server::config::{AuthMode, Config};
use notes_again_server::state::AppState;
use serde_json::Value;
use tempfile::TempDir;
use tower::ServiceExt;

pub use serde_json::json;

pub const DEFAULT_PEER: &str = "203.0.113.5";

pub struct TestApp {
    pub state: AppState,
    pub dir: TempDir,
    router: Router,
    cookies: Mutex<BTreeMap<String, String>>,
}

pub struct Res {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl Res {
    pub fn code(&self) -> u16 {
        self.status.as_u16()
    }

    pub fn json(&self) -> Value {
        serde_json::from_slice(&self.body)
            .unwrap_or_else(|_| panic!("not JSON ({}): {}", self.status, self.text()))
    }

    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    pub fn header(&self, name: &str) -> Option<String> {
        self.headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string)
    }

    pub fn ok(self) -> Value {
        assert!(
            self.status.is_success(),
            "expected success, got {}: {}",
            self.status,
            self.text()
        );
        if self.body.is_empty() {
            Value::Null
        } else {
            self.json()
        }
    }

    pub fn detail(&self) -> String {
        self.json()["detail"]
            .as_str()
            .unwrap_or_default()
            .to_string()
    }
}

pub fn base_config(dir: &TempDir) -> Config {
    let dist = dir.path().join("dist");
    std::fs::create_dir_all(&dist).unwrap();
    let mut config = Config::desktop(dir.path().join("test.db"), dist, String::new());
    config.auth_mode = AuthMode::None;
    config.desktop_secret = None;
    config.backup_interval_hours = 0;
    config
}

impl TestApp {
    pub async fn new() -> TestApp {
        TestApp::with(|_| {}).await
    }

    pub async fn with(configure: impl FnOnce(&mut Config)) -> TestApp {
        let dir = tempfile::tempdir().unwrap();
        let mut config = base_config(&dir);
        configure(&mut config);
        TestApp::start(dir, config).await
    }

    pub async fn start(dir: TempDir, config: Config) -> TestApp {
        let state = notes_again_server::prepare(config).await.unwrap();
        TestApp {
            router: app::router(state.clone()),
            state,
            dir,
            cookies: Mutex::new(BTreeMap::new()),
        }
    }

    pub async fn restart(self, configure: impl FnOnce(&mut Config)) -> TestApp {
        let mut config = self.state.config.clone();
        configure(&mut config);
        self.state.db.close().await;
        let dir = self.dir;
        TestApp::start(dir, config).await
    }

    pub async fn serve(&self) -> Served {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (stop, signal) = tokio::sync::oneshot::channel::<()>();
        let state = self.state.clone();
        let task = tokio::spawn(async move {
            let _ = app::serve(listener, state, async {
                let _ = signal.await;
            })
            .await;
        });
        Served {
            url,
            stop: Some(stop),
            task: Some(task),
        }
    }

    pub fn path(&self, name: &str) -> PathBuf {
        self.dir.path().join(name)
    }

    pub fn req(&self, method: Method, path: &str) -> Req<'_> {
        Req {
            app: self,
            method,
            path: path.to_string(),
            headers: vec![],
            body: None,
            peer: DEFAULT_PEER.to_string(),
            cookies: true,
        }
    }

    pub fn get(&self, path: &str) -> Req<'_> {
        self.req(Method::GET, path)
    }

    pub fn post(&self, path: &str) -> Req<'_> {
        self.req(Method::POST, path)
    }

    pub fn put(&self, path: &str) -> Req<'_> {
        self.req(Method::PUT, path)
    }

    pub fn patch(&self, path: &str) -> Req<'_> {
        self.req(Method::PATCH, path)
    }

    pub fn delete(&self, path: &str) -> Req<'_> {
        self.req(Method::DELETE, path)
    }

    pub fn clear_cookies(&self) {
        self.cookies.lock().unwrap().clear();
    }

    pub fn set_cookie(&self, name: &str, value: &str) {
        self.cookies
            .lock()
            .unwrap()
            .insert(name.to_string(), value.to_string());
    }

    pub fn cookie(&self, name: &str) -> Option<String> {
        self.cookies.lock().unwrap().get(name).cloned()
    }

    fn store_cookies(&self, headers: &HeaderMap) {
        let mut jar = self.cookies.lock().unwrap();
        for value in headers.get_all("set-cookie") {
            let Ok(text) = value.to_str() else { continue };
            let mut parts = text.split(';');
            let Some((name, value)) = parts.next().and_then(|p| p.split_once('=')) else {
                continue;
            };
            let expired = parts.any(|p| {
                let p = p.trim().to_ascii_lowercase();
                p == "max-age=0" || p.starts_with("expires=thu, 01 jan 1970")
            });
            let value = value.trim_matches('"');
            if expired || value.is_empty() {
                jar.remove(name.trim());
            } else {
                jar.insert(name.trim().to_string(), value.to_string());
            }
        }
    }

    pub async fn note(&self, body: Value) -> Value {
        let mut body = body;
        let map = body.as_object_mut().expect("an object body");
        map.entry("name").or_insert(json!("n"));
        map.entry("content").or_insert(json!("c"));
        self.post("/api/notes/create").json(body).send().await.ok()
    }

    pub async fn named(&self, name: &str) -> Value {
        self.note(json!({ "name": name })).await
    }

    pub async fn project(&self, name: &str) -> Value {
        self.post("/api/projects/create")
            .json(json!({ "name": name }))
            .send()
            .await
            .ok()
    }

    pub async fn tag(&self, name: &str) -> Value {
        self.post("/api/tags/create")
            .json(json!({ "name": name }))
            .send()
            .await
            .ok()
    }

    pub async fn tag_id(&self, name: &str) -> i64 {
        let tags = self.get("/api/tags/list").send().await.ok();
        tags.as_array()
            .unwrap()
            .iter()
            .find(|t| t["name"] == name)
            .unwrap_or_else(|| panic!("no tag {name}"))["id"]
            .as_i64()
            .unwrap()
    }

    pub async fn use_sm2(&self) {
        self.patch("/api/settings")
            .json(json!({ "default_algorithm": "sm2" }))
            .send()
            .await
            .ok();
    }

    pub async fn review(&self, note: &Value, rating: &str) -> Value {
        let id = pending(note)["id"].as_i64().unwrap();
        self.patch(&format!("/api/notes/reminders/{id}/now"))
            .json(json!({ "action": "review", "rating": rating }))
            .send()
            .await
            .ok()
    }

    pub async fn due_ids(&self) -> Vec<i64> {
        let mut ids = ids(&self.get("/api/notes/due?limit=200").send().await.ok()["items"]);
        ids.sort();
        ids
    }

    pub async fn listed(&self, query: &str) -> Vec<i64> {
        let mut ids = ids(&self
            .get(&format!("/api/notes/list?{query}"))
            .send()
            .await
            .ok()["items"]);
        ids.sort();
        ids
    }

    pub async fn exec(&self, sql: &str) {
        sqlx::raw_sql(sqlx::AssertSqlSafe(sql.to_string()))
            .execute(&self.state.db)
            .await
            .unwrap();
    }

    pub async fn scalar_i64(&self, sql: &str) -> i64 {
        sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_string()))
            .fetch_one(&self.state.db)
            .await
            .unwrap()
    }

    pub async fn scalar_opt_str(&self, sql: &str) -> Option<String> {
        sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_string()))
            .fetch_one(&self.state.db)
            .await
            .unwrap()
    }
}

pub struct Served {
    pub url: String,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
    task: Option<tokio::task::JoinHandle<()>>,
}

impl Served {
    pub async fn stop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(task) = self.task.take() {
            let _ = task.await;
        }
    }
}

impl Drop for Served {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}

pub struct Req<'a> {
    app: &'a TestApp,
    method: Method,
    path: String,
    headers: Vec<(String, String)>,
    body: Option<(String, Vec<u8>)>,
    peer: String,
    cookies: bool,
}

impl Req<'_> {
    pub fn json(mut self, value: Value) -> Self {
        self.body = Some((
            "application/json".into(),
            serde_json::to_vec(&value).unwrap(),
        ));
        self
    }

    pub fn raw(mut self, content_type: &str, body: impl Into<Vec<u8>>) -> Self {
        self.body = Some((content_type.into(), body.into()));
        self
    }

    pub fn header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.into(), value.into()));
        self
    }

    pub fn bearer(self, token: &str) -> Self {
        self.header("authorization", &format!("Bearer {token}"))
    }

    pub fn peer(mut self, ip: &str) -> Self {
        self.peer = ip.into();
        self
    }

    pub fn without_cookies(mut self) -> Self {
        self.cookies = false;
        self
    }

    pub async fn send(self) -> Res {
        let mut builder = Request::builder().method(self.method).uri(&self.path);
        for (name, value) in &self.headers {
            builder = builder.header(name, value);
        }
        if self.cookies {
            let jar = self.app.cookies.lock().unwrap().clone();
            let has_cookie_header = self
                .headers
                .iter()
                .any(|(n, _)| n.eq_ignore_ascii_case("cookie"));
            if !jar.is_empty() && !has_cookie_header {
                let header = jar
                    .iter()
                    .map(|(k, v)| format!("{k}={v}"))
                    .collect::<Vec<_>>()
                    .join("; ");
                builder = builder.header("cookie", header);
            }
        }
        let body = match self.body {
            Some((content_type, bytes)) => {
                builder = builder.header("content-type", content_type);
                Body::from(bytes)
            }
            None => Body::empty(),
        };
        let mut request = builder.body(body).unwrap();
        let address: SocketAddr = format!("{}:50000", self.peer)
            .parse()
            .or_else(|_| format!("[{}]:50000", self.peer).parse())
            .unwrap();
        request.extensions_mut().insert(ConnectInfo(address));
        let response = self.app.router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        if self.cookies {
            self.app.store_cookies(&headers);
        }
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec();
        Res {
            status,
            headers,
            body,
        }
    }
}

pub fn ids(items: &Value) -> Vec<i64> {
    items
        .as_array()
        .expect("an array")
        .iter()
        .map(|n| n["id"].as_i64().unwrap())
        .collect()
}

pub fn id(value: &Value) -> i64 {
    value["id"].as_i64().expect("an id")
}

pub fn pending(note: &Value) -> Value {
    let pending: Vec<&Value> = note["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["reviewed_at"].is_null() && r["deleted_at"].is_null())
        .collect();
    assert_eq!(pending.len(), 1, "expected one pending reminder: {note}");
    pending[0].clone()
}

pub fn pending_at(note: &Value) -> chrono::DateTime<chrono::Utc> {
    at(&pending(note)["remind_at"])
}

pub fn at(value: &Value) -> chrono::DateTime<chrono::Utc> {
    chrono::DateTime::parse_from_rfc3339(value.as_str().expect("a datetime string"))
        .unwrap()
        .with_timezone(&chrono::Utc)
}

pub fn names(items: &Value) -> Vec<String> {
    items
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap().to_string())
        .collect()
}

pub fn sorted<T: Ord>(mut items: Vec<T>) -> Vec<T> {
    items.sort();
    items
}

pub fn iso(dt: chrono::DateTime<chrono::Utc>) -> String {
    dt.to_rfc3339()
}

pub fn now() -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now()
}

pub fn days(n: i64) -> chrono::Duration {
    chrono::Duration::days(n)
}

pub fn enc(text: &str) -> String {
    percent_encoding::utf8_percent_encode(text, percent_encoding::NON_ALPHANUMERIC).to_string()
}
