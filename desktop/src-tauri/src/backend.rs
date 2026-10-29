use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

const READY_PREFIX: &str = "NOTES_AGAIN_READY ";
const COOKIE: &str = "notes_again_desktop";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct Backend {
    child: Mutex<Option<Child>>,
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

struct BackendPaths {
    python: PathBuf,
    app_dir: PathBuf,
    frontend_dir: PathBuf,
    site_packages: Option<PathBuf>,
}

fn backend_paths(app: &AppHandle) -> tauri::Result<BackendPaths> {
    if cfg!(debug_assertions) {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
        let venv = root.join("backend").join(".venv");
        let python = if cfg!(windows) {
            venv.join("Scripts").join("python.exe")
        } else {
            venv.join("bin").join("python")
        };
        return Ok(BackendPaths {
            python,
            app_dir: root.join("backend"),
            frontend_dir: root.join("frontend").join("dist").join("client"),
            site_packages: None,
        });
    }
    let resources = app.path().resource_dir()?;
    let python = if cfg!(windows) {
        resources.join("python").join("python.exe")
    } else {
        resources.join("python").join("bin").join("python3")
    };
    Ok(BackendPaths {
        python,
        app_dir: resources.join("backend"),
        frontend_dir: resources.join("frontend"),
        site_packages: Some(resources.join("site-packages")),
    })
}

fn launch_secret() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS random source is unavailable");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn spawn(app: &AppHandle, secret: &str) -> Result<(Child, File, PathBuf), String> {
    let paths = backend_paths(app).map_err(|e| e.to_string())?;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log_path = log_dir.join("backend.log");
    let log = File::create(&log_path).map_err(|e| e.to_string())?;

    let mut command = Command::new(&paths.python);
    command
        .arg(paths.app_dir.join("desktop_server.py"))
        .current_dir(&paths.app_dir)
        .env("DESKTOP_SECRET", secret)
        .env("DB_PATH", data_dir.join("notes-again.db"))
        .env("FRONTEND_DIST", &paths.frontend_dir)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env_remove("PYTHONHOME")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(log.try_clone().map_err(|e| e.to_string())?);
    if let Some(site_packages) = &paths.site_packages {
        let python_path =
            std::env::join_paths([&paths.app_dir, site_packages]).map_err(|e| e.to_string())?;
        command
            .env("PYTHONPATH", python_path)
            .env("PYTHONDONTWRITEBYTECODE", "1");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command
        .spawn()
        .map_err(|e| format!("Couldn't run {}: {e}", paths.python.display()))?;
    Ok((child, log, log_path))
}

fn wait_for_port(stdout: impl Read + Send + 'static, mut log: File) -> Option<u16> {
    let mut lines = BufReader::new(stdout).lines().map_while(Result::ok);
    let port = lines
        .by_ref()
        .find_map(|line| line.strip_prefix(READY_PREFIX)?.trim().parse().ok());
    thread::spawn(move || {
        for line in lines {
            let _ = writeln!(log, "{line}");
        }
    });
    port
}

pub fn start(app: &AppHandle) -> Result<Connection, String> {
    let secret = launch_secret();
    let (mut child, log, log_path) = spawn(app, &secret)?;
    let stdout = child.stdout.take().expect("stdout is piped");
    let backend = app.state::<Backend>();
    backend.child.lock().unwrap().replace(child);

    let port = wait_for_port(stdout, log).ok_or_else(|| {
        format!(
            "The notes server stopped while starting. Its log is at {}",
            log_path.display()
        )
    })?;
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
    let Some(mut child) = backend.child.lock().unwrap().take() else {
        return;
    };
    drop(child.stdin.take());
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
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
