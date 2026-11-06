use std::collections::HashMap;
use std::ops::Deref;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::auth::external::JwksCache;
use crate::config::Config;
use crate::db::Pool;

pub struct Inner {
    pub db: Pool,
    pub config: Config,
    pub login_failures: Mutex<HashMap<String, Vec<Instant>>>,
    pub jwks: JwksCache,
    pub http: reqwest::Client,
    pub sync_lock: tokio::sync::Mutex<()>,
    pub sync_running: AtomicBool,
    pub snapshot_lock: tokio::sync::Mutex<()>,
}

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

impl Deref for AppState {
    type Target = Inner;
    fn deref(&self) -> &Inner {
        &self.0
    }
}

impl AppState {
    pub fn new(db: Pool, config: Config) -> AppState {
        AppState(Arc::new(Inner {
            db,
            config,
            login_failures: Mutex::new(HashMap::new()),
            jwks: JwksCache::default(),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("an HTTP client"),
            sync_lock: tokio::sync::Mutex::new(()),
            sync_running: AtomicBool::new(false),
            snapshot_lock: tokio::sync::Mutex::new(()),
        }))
    }

    pub fn syncing(&self) -> bool {
        self.sync_running.load(Ordering::SeqCst)
    }
}
