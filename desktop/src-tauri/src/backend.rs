use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager};

const COOKIE: &str = "notes_again_desktop";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

static LOGGING: Once = Once::new();

#[derive(Default)]
pub struct Backend {
    shutdown: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    connection: Mutex<Option<Connection>>,
}

#[derive(Clone)]
pub struct Connection {
    pub port: u16,
    pub secret: String,
}

impl Connection {
    pub fn sign_in_url(&self) -> String {
        format!(
            "http://127.0.0.1:{}/api/auth/desktop?secret={}",
            self.port, self.secret
        )
    }
}

fn frontend_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    if cfg!(debug_assertions) {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
        return Ok(root.join("frontend").join("dist").join("client"));
    }
    Ok(app.path().resource_dir()?.join("frontend"))
}

fn launch_secret() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS random source is unavailable");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn open_log(app: &AppHandle) -> Result<File, String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    File::create(log_dir.join("backend.log")).map_err(|e| e.to_string())
}

pub fn start(app: &AppHandle) -> Result<Connection, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let frontend = frontend_dir(app).map_err(|e| e.to_string())?;
    let mut log_error = None;
    LOGGING.call_once(|| match open_log(app) {
        Ok(file) => notes_again_server::log_to(file),
        Err(error) => log_error = Some(error),
    });
    if let Some(error) = log_error {
        return Err(error);
    }

    let secret = launch_secret();
    let db_path = data_dir.join("notes-again.db");
    let (ready_tx, ready_rx) =
        std::sync::mpsc::channel::<Result<(u16, tokio::sync::oneshot::Sender<()>), String>>();
    let server_secret = secret.clone();
    let restart_app = app.clone();
    let worker = thread::Builder::new()
        .name("notes-server".into())
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .max_blocking_threads(8)
                .enable_all()
                .build()
            {
                Ok(runtime) => runtime,
                Err(error) => {
                    let _ = ready_tx.send(Err(error.to_string()));
                    return;
                }
            };
            runtime.block_on(async move {
                match notes_again_server::start_desktop(db_path, frontend, server_secret).await {
                    Ok(server) => {
                        let _ = ready_tx.send(Ok((server.port, server.shutdown)));
                        let restart = server.restart.clone();
                        tokio::spawn(async move {
                            restart.notified().await;
                            thread::spawn(move || crate::restart_backend(&restart_app));
                        });
                        let _ = server.task.await;
                    }
                    Err(error) => {
                        let _ = ready_tx.send(Err(error));
                    }
                }
            });
        })
        .map_err(|e| e.to_string())?;

    let (port, shutdown) = ready_rx
        .recv()
        .map_err(|_| "The notes server stopped while starting.".to_string())??;
    let backend = app.state::<Backend>();
    backend.shutdown.lock().unwrap().replace(shutdown);
    backend.worker.lock().unwrap().replace(worker);
    let connection = Connection { port, secret };
    backend
        .connection
        .lock()
        .unwrap()
        .replace(connection.clone());
    Ok(connection)
}

pub fn connection(app: &AppHandle) -> Option<Connection> {
    app.state::<Backend>().connection.lock().unwrap().clone()
}

pub fn stop(app: &AppHandle) {
    let backend = app.state::<Backend>();
    backend.connection.lock().unwrap().take();
    if let Some(shutdown) = backend.shutdown.lock().unwrap().take() {
        let _ = shutdown.send(());
    }
    let worker = backend.worker.lock().unwrap().take();
    if let Some(worker) = worker {
        let _ = worker.join();
    }
}

pub fn request(app: &AppHandle, method: &str, path: &str) -> Option<serde_json::Value> {
    let Connection { port, secret } = connection(app)?;
    let mut stream = TcpStream::connect(("127.0.0.1", port)).ok()?;
    stream.set_read_timeout(Some(REQUEST_TIMEOUT)).ok()?;
    write!(
        stream,
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nCookie: {COOKIE}={secret}\r\n\
         Content-Length: 0\r\nConnection: close\r\n\r\n"
    )
    .ok()?;
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    let (head, body) = response.split_once("\r\n\r\n")?;
    if !head.starts_with("HTTP/1.1 2") {
        return None;
    }
    serde_json::from_str(body).ok()
}
