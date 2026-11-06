use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_notification::NotificationExt;

use crate::{backend, open_page, show_main};

const POLL_EVERY: Duration = Duration::from_secs(60);
const NOTIFY_AT_MOST_EVERY: Duration = Duration::from_secs(3 * 60 * 60);

pub struct Tray {
    icon: TrayIcon,
    review: MenuItem<Wry>,
    updates: MenuItem<Wry>,
    due: Mutex<Option<u64>>,
    notified_at: Mutex<Option<Instant>>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Notes Again", true, None::<&str>)?;
    let new_note = MenuItem::with_id(
        app,
        "new-note",
        "New note",
        true,
        Some(crate::QUICK_CAPTURE),
    )?;
    let review = MenuItem::with_id(app, "review", "Review", true, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Sync now", true, None::<&str>)?;
    let updates = MenuItem::with_id(
        app,
        "updates",
        crate::updates::CHECK_LABEL,
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit Notes Again", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &new_note,
            &review,
            &PredefinedMenuItem::separator(app)?,
            &sync,
            &updates,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let icon = TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("Notes Again")
        .menu(&menu)
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "new-note" => open_page(app, "/notes/new"),
            "review" => open_page(app, "/review"),
            "sync" => {
                let app = app.clone();
                thread::spawn(move || {
                    backend::request(&app, "POST", "/api/sync/run");
                });
            }
            "updates" => crate::updates::menu_clicked(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if !cfg!(target_os = "macos") {
                    show_main(tray.app_handle());
                }
            }
        })
        .build(app)?;

    app.manage(Tray {
        icon,
        review,
        updates,
        due: Mutex::new(None),
        notified_at: Mutex::new(None),
    });
    Ok(())
}

pub fn set_update_label(app: &AppHandle, text: &str) {
    if let Some(tray) = app.try_state::<Tray>() {
        let _ = tray.updates.set_text(text);
    }
}

fn due_count(app: &AppHandle) -> Option<u64> {
    backend::request(app, "GET", "/api/notes/due?limit=1")?
        .get("total")?
        .as_u64()
}

fn window_focused(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false)
}

fn update(app: &AppHandle, tray: &Tray, due: u64) {
    let previous = tray.due.lock().unwrap().replace(due);
    let label = if due == 0 {
        "Review".to_string()
    } else {
        format!("Review ({due} due)")
    };
    let _ = tray.review.set_text(label);
    let tooltip = match due {
        0 => "Notes Again: nothing due".to_string(),
        1 => "Notes Again: 1 note due".to_string(),
        n => format!("Notes Again: {n} notes due"),
    };
    let _ = tray.icon.set_tooltip(Some(&tooltip));
    #[cfg(target_os = "macos")]
    let _ = tray
        .icon
        .set_title((due > 0).then(|| due.to_string()).as_deref());

    let became_due = due > 0 && previous.unwrap_or(0) == 0;
    if !became_due || window_focused(app) {
        return;
    }
    let mut notified_at = tray.notified_at.lock().unwrap();
    if notified_at.is_some_and(|at| at.elapsed() < NOTIFY_AT_MOST_EVERY) {
        return;
    }
    let body = if due == 1 {
        "1 note is due for review.".to_string()
    } else {
        format!("{due} notes are due for review.")
    };
    if app
        .notification()
        .builder()
        .title("Notes Again")
        .body(body)
        .show()
        .is_ok()
    {
        notified_at.replace(Instant::now());
    }
}

pub fn watch_due_notes(app: AppHandle) {
    thread::spawn(move || loop {
        if let (Some(tray), Some(due)) = (app.try_state::<Tray>(), due_count(&app)) {
            update(&app, &tray, due);
        }
        thread::sleep(POLL_EVERY);
    });
}
