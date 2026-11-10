mod backend;
mod tray;
mod updates;
mod credentials;

use std::thread;

use tauri::webview::NewWindowResponse;
use tauri::{
    AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::{StateFlags, WindowExt};

const LOCAL_HOSTS: [&str; 3] = ["127.0.0.1", "localhost", "tauri.localhost"];
pub const QUICK_CAPTURE: &str = "CmdOrCtrl+Alt+Shift+N";

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn open_page(app: &AppHandle, path: &str) {
    show_main(app);
    let Some(window) = main_window(app) else {
        return;
    };
    let loaded = window
        .url()
        .is_ok_and(|url| url.host_str() == Some("127.0.0.1"));
    if !loaded {
        return;
    }
    let path = serde_json::to_string(path).unwrap_or_default();
    let _ = window.eval(format!(
        "if (location.pathname !== {path}) location.assign({path})"
    ));
}

fn show_startup_error(window: &WebviewWindow, message: &str) {
    let message = serde_json::to_string(message).unwrap_or_default();
    let _ = window.eval(format!("window.showStartupError({message})"));
}

fn start_backend(app: &AppHandle, window: &WebviewWindow) -> bool {
    let connection = match backend::start(app) {
        Ok(connection) => connection,
        Err(message) => {
            show_startup_error(window, &message);
            return false;
        }
    };
    let url = Url::parse(&connection.sign_in_url()).expect("a valid local URL");
    if let Err(error) = window.navigate(url) {
        show_startup_error(window, &error.to_string());
        return false;
    }
    true
}

fn start(app: AppHandle, window: WebviewWindow) {
    if start_backend(&app, &window) {
        tray::watch_due_notes(app);
    }
}

pub fn restart_backend(app: &AppHandle) {
    backend::stop(app);
    if let Some(window) = main_window(app) {
        start_backend(app, &window);
        show_main(app);
    }
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

fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let navigation_handle = app.clone();
    let new_window_handle = app.clone();
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Notes Again")
        .inner_size(1200.0, 800.0)
        .min_inner_size(480.0, 400.0)
        .visible(false)
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
    let _ = window.restore_state(StateFlags::all() - StateFlags::VISIBLE);
    window.show()?;
    Ok(window)
}

pub fn run() {
    let quick_capture: Shortcut = QUICK_CAPTURE.parse().expect("a valid shortcut");
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![credentials::read_ai_key, credentials::write_ai_key, credentials::forget_ai_key])
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app)
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state == ShortcutState::Pressed && shortcut == &quick_capture {
                        open_page(app, "/notes/new");
                    }
                })
                .build(),
        )
        .manage(backend::Backend::default())
        .manage(updates::Updates::default())
        .setup(move |app| {
            let handle = app.handle().clone();
            if let Err(error) = tray::create(&handle) {
                eprintln!("The tray icon isn't available: {error}");
            }
            if let Err(error) = handle.global_shortcut().register(quick_capture) {
                eprintln!("Couldn't register {QUICK_CAPTURE}: {error}");
            }
            updates::watch(handle.clone());
            let window = create_main_window(&handle)?;
            thread::spawn(move || start(handle, window));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.app_handle().try_state::<tray::Tray>().is_some() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Notes Again")
        .run(|app, event| match event {
            RunEvent::Exit => backend::stop(app),
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_main(app),
            _ => {}
        });
}
