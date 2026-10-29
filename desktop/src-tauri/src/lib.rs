use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const READY_PREFIX: &str = "NOTES_AGAIN_READY ";
const LOCAL_HOSTS: [&str; 3] = ["127.0.0.1", "localhost", "tauri.localhost"];

struct Backend(Mutex<Option<Child>>);

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

struct Spawned {
    child: Child,
    log: File,
    log_path: PathBuf,
}

fn spawn_backend(app: &AppHandle, secret: &str) -> Result<Spawned, String> {
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
    Ok(Spawned {
        child,
        log,
        log_path,
    })
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

fn start(app: AppHandle, window: WebviewWindow) {
    let secret = launch_secret();
    let Spawned {
        mut child,
        log,
        log_path,
    } = match spawn_backend(&app, &secret) {
        Ok(spawned) => spawned,
        Err(message) => return show_startup_error(&window, &message),
    };
    let stdout = child.stdout.take().expect("stdout is piped");
    app.state::<Backend>().0.lock().unwrap().replace(child);

    let Some(port) = wait_for_port(stdout, log) else {
        let message = format!(
            "The notes server stopped while starting. Its log is at {}",
            log_path.display()
        );
        return show_startup_error(&window, &message);
    };
    let url = format!("http://127.0.0.1:{port}/api/auth/desktop?secret={secret}");
    if let Err(error) = window.navigate(Url::parse(&url).expect("a valid local URL")) {
        show_startup_error(&window, &error.to_string());
    }
}

fn show_startup_error(window: &WebviewWindow, message: &str) {
    let message = serde_json::to_string(message).unwrap_or_default();
    let _ = window.eval(format!("window.showStartupError({message})"));
}

fn stop_backend(app: &AppHandle) {
    let Some(mut child) = app.state::<Backend>().0.lock().unwrap().take() else {
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

fn is_local(url: &Url) -> bool {
    url.scheme() == "tauri"
        || url
            .host_str()
            .is_some_and(|host| LOCAL_HOSTS.contains(&host))
}

fn open_externally(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let navigation_handle = app.handle().clone();
            let new_window_handle = app.handle().clone();
            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Notes Again")
                    .inner_size(1200.0, 800.0)
                    .min_inner_size(480.0, 400.0)
                    .on_navigation(move |url| {
                        if is_local(url) {
                            return true;
                        }
                        open_externally(&navigation_handle, url);
                        false
                    })
                    .on_new_window(move |url, _features| {
                        open_externally(&new_window_handle, &url);
                        NewWindowResponse::Deny
                    })
                    .build()?;
            let handle = app.handle().clone();
            thread::spawn(move || start(handle, window));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Notes Again")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop_backend(app);
            }
        });
}
