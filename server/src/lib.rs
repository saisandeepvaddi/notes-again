pub mod app;
pub mod auth;
pub mod backups;
pub mod config;
pub mod db;
pub mod difficulty;
pub mod error;
pub mod files;
pub mod groups;
pub mod imports;
pub mod notes;
pub mod params;
pub mod scheduling;
pub mod search;
pub mod sql;
pub mod state;
pub mod sync;
pub mod system;
pub mod text;
pub mod time;

use std::net::SocketAddr;
use std::path::PathBuf;

use config::{AuthMode, Config};
use state::AppState;

pub fn log_to(file: std::fs::File) {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_ansi(false)
        .with_writer(std::sync::Mutex::new(file))
        .try_init();
}

pub fn init_crypto() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

pub async fn prepare(config: Config) -> Result<AppState, String> {
    init_crypto();
    tracing::info!("Database sqlite_path='{}'", config.db_path.display());
    let pool = db::open(&config.db_path)
        .await
        .map_err(|e| format!("Couldn't open the database: {e}"))?;
    let state = AppState::new(pool, config);
    if state.config.auth_mode == AuthMode::Local {
        auth::local::ensure_local_auth(&state)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::spawn(backups::run_schedule(state.clone()));
    if state.config.auth_mode == AuthMode::Desktop {
        tokio::spawn(sync::local::run_schedule(state.clone()));
    }
    Ok(state)
}

pub async fn serve(config: Config, address: SocketAddr) -> Result<(), String> {
    let state = prepare(config).await?;
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .map_err(|e| format!("Couldn't listen on {address}: {e}"))?;
    tracing::info!("Notes Again is running on http://{address}");
    let shutdown = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    app::serve(listener, state, shutdown)
        .await
        .map_err(|e| e.to_string())
}

pub struct DesktopServer {
    pub port: u16,
    pub shutdown: tokio::sync::oneshot::Sender<()>,
    pub task: tokio::task::JoinHandle<()>,
}

pub async fn start_desktop(
    db_path: PathBuf,
    frontend_dist: PathBuf,
    secret: String,
) -> Result<DesktopServer, String> {
    let state = prepare(Config::desktop(db_path, frontend_dist, secret)).await?;
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (shutdown, signal) = tokio::sync::oneshot::channel::<()>();
    let pool = state.db.clone();
    let task = tokio::spawn(async move {
        let stop = async {
            let _ = signal.await;
        };
        if let Err(error) = app::serve(listener, state, stop).await {
            tracing::error!("The notes server stopped: {error}");
        }
        pool.close().await;
    });
    Ok(DesktopServer {
        port,
        shutdown,
        task,
    })
}
