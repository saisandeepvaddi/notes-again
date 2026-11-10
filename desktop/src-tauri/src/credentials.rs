use tauri::{AppHandle, WebviewWindow};

fn require_app(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let connection = crate::backend::connection(app).ok_or("The local app is not ready.")?;
    let url = window.url().map_err(|_| "The app origin could not be verified.")?;
    if window.label() != "main" || url.scheme() != "http" || url.host_str() != Some("127.0.0.1") || url.port() != Some(connection.port) {
        return Err("Only this app's main window can access its saved AI key.".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.notesagain.desktop.ai", "discussion").map_err(|_| "Could not access macOS Keychain.".into())
}

#[tauri::command]
pub fn read_ai_key(app: AppHandle, window: WebviewWindow) -> Result<Option<String>, String> {
    require_app(&app, &window)?;
    #[cfg(target_os = "macos")]
    { match entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not read the saved AI key from macOS Keychain.".into()),
    } }
    #[cfg(not(target_os = "macos"))]
    { Ok(None) }
}

#[tauri::command]
pub fn write_ai_key(app: AppHandle, window: WebviewWindow, value: String) -> Result<(), String> {
    require_app(&app, &window)?;
    if value.len() > 4096 { return Err("Credential data is too large.".into()); }
    #[cfg(target_os = "macos")]
    { entry()?.set_password(&value).map_err(|_| "Could not save the AI key in macOS Keychain.".into()) }
    #[cfg(not(target_os = "macos"))]
    { Err("Secure AI key storage is available on macOS only. Use a session-only key.".into()) }
}

#[tauri::command]
pub fn forget_ai_key(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    require_app(&app, &window)?;
    #[cfg(target_os = "macos")]
    { match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the saved AI key from macOS Keychain.".into()),
    } }
    #[cfg(not(target_os = "macos"))]
    { Ok(()) }
}
