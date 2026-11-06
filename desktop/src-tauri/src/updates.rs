use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::{backend, tray};

const FIRST_CHECK_AFTER: Duration = Duration::from_secs(20);
const CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);
pub const CHECK_LABEL: &str = "Check for updates…";

#[derive(Default)]
pub struct Updates {
    pending: Mutex<Option<Update>>,
    busy: AtomicBool,
}

fn notify(app: &AppHandle, body: &str) {
    let _ = app
        .notification()
        .builder()
        .title("Notes Again")
        .body(body)
        .show();
}

fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

async fn check(app: &AppHandle, manual: bool) {
    let state = app.state::<Updates>();
    if state.busy.swap(true, Ordering::SeqCst) {
        return;
    }
    if manual {
        tray::set_update_label(app, "Checking for updates…");
    }
    let result = match app.updater() {
        Ok(updater) => updater.check().await.map_err(|e| e.to_string()),
        Err(error) => Err(error.to_string()),
    };
    match result {
        Ok(Some(update)) => {
            let version = update.version.clone();
            tray::set_update_label(app, &format!("Restart to update to {version}"));
            state.pending.lock().unwrap().replace(update);
            notify(
                app,
                &format!("Version {version} is ready. Choose “Restart to update” in the Notes Again menu."),
            );
        }
        Ok(None) => {
            tray::set_update_label(app, CHECK_LABEL);
            if manual {
                notify(
                    app,
                    &format!("You're on the latest version ({}).", current_version(app)),
                );
            }
        }
        Err(error) => {
            eprintln!("Couldn't check for updates: {error}");
            tray::set_update_label(app, CHECK_LABEL);
            if manual {
                notify(app, "Couldn't check for updates. Try again later.");
            }
        }
    }
    state.busy.store(false, Ordering::SeqCst);
}

async fn install(app: &AppHandle, update: Update) {
    let state = app.state::<Updates>();
    if state.busy.swap(true, Ordering::SeqCst) {
        state.pending.lock().unwrap().replace(update);
        return;
    }
    let version = update.version.clone();
    tray::set_update_label(app, &format!("Downloading {version}…"));
    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => {
            backend::stop(app);
            app.restart();
        }
        Err(error) => {
            eprintln!("Couldn't install {version}: {error}");
            tray::set_update_label(app, &format!("Restart to update to {version}"));
            state.pending.lock().unwrap().replace(update);
            state.busy.store(false, Ordering::SeqCst);
            notify(
                app,
                &format!("Couldn't install version {version}. Try again later."),
            );
        }
    }
}

pub fn menu_clicked(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let pending = app.state::<Updates>().pending.lock().unwrap().take();
        match pending {
            Some(update) => install(&app, update).await,
            None => check(&app, true).await,
        }
    });
}

pub fn watch(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK_AFTER).await;
        loop {
            let has_pending = app.state::<Updates>().pending.lock().unwrap().is_some();
            if !has_pending {
                check(&app, false).await;
            }
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}
