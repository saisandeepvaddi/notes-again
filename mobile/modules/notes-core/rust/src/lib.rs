use std::ffi::{CStr, CString, c_char};
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;

struct Running {
    port: u16,
    shutdown: tokio::sync::oneshot::Sender<()>,
    worker: thread::JoinHandle<()>,
}

static RUNNING: Mutex<Option<Running>> = Mutex::new(None);
static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

fn set_error(message: impl Into<String>) {
    *LAST_ERROR.lock().unwrap() = Some(message.into());
}

pub fn start(db_path: PathBuf, secret: String) -> Result<u16, String> {
    let mut running = RUNNING.lock().unwrap();
    if let Some(server) = running.as_ref() {
        return Ok(server.port);
    }
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        if let Ok(log) = std::fs::File::create(parent.join("server.log")) {
            notes_again_server::log_to(log);
        }
    }
    let frontend = db_path.with_file_name("no-web-app");
    let (ready_tx, ready_rx) =
        std::sync::mpsc::channel::<Result<(u16, tokio::sync::oneshot::Sender<()>), String>>();
    let worker = thread::Builder::new()
        .name("notes-server".into())
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
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
                match notes_again_server::start_desktop(db_path, frontend, secret).await {
                    Ok(server) => {
                        let _ = ready_tx.send(Ok((server.port, server.shutdown)));
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
    *running = Some(Running {
        port,
        shutdown,
        worker,
    });
    Ok(port)
}

pub fn stop() {
    let server = RUNNING.lock().unwrap().take();
    if let Some(server) = server {
        let _ = server.shutdown.send(());
        let _ = server.worker.join();
    }
}

fn read(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .ok()
        .map(str::to_string)
}

/// # Safety
/// `db_path` and `secret` must be valid NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn notes_again_start(db_path: *const c_char, secret: *const c_char) -> u16 {
    let (Some(db_path), Some(secret)) = (read(db_path), read(secret)) else {
        set_error("The database path and secret are required.");
        return 0;
    };
    match start(PathBuf::from(db_path), secret) {
        Ok(port) => port,
        Err(error) => {
            set_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn notes_again_stop() {
    stop();
}

#[unsafe(no_mangle)]
pub extern "C" fn notes_again_last_error() -> *mut c_char {
    let message = LAST_ERROR.lock().unwrap().clone().unwrap_or_default();
    CString::new(message).unwrap_or_default().into_raw()
}

/// # Safety
/// `ptr` must come from `notes_again_last_error` and not be freed twice.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn notes_again_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(unsafe { CString::from_raw(ptr) });
    }
}

#[cfg(target_os = "android")]
mod android {
    use jni::JNIEnv;
    use jni::objects::{JClass, JString};
    use jni::sys::jint;

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_expo_modules_notescore_NotesCoreNative_start(
        mut env: JNIEnv,
        _class: JClass,
        db_path: JString,
        secret: JString,
    ) -> jint {
        let db_path: Option<String> = env.get_string(&db_path).ok().map(Into::into);
        let secret: Option<String> = env.get_string(&secret).ok().map(Into::into);
        let (Some(db_path), Some(secret)) = (db_path, secret) else {
            super::set_error("The database path and secret are required.");
            return 0;
        };
        match super::start(db_path.into(), secret) {
            Ok(port) => jint::from(port),
            Err(error) => {
                super::set_error(error);
                0
            }
        }
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_expo_modules_notescore_NotesCoreNative_stop(
        _env: JNIEnv,
        _class: JClass,
    ) {
        super::stop();
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_expo_modules_notescore_NotesCoreNative_lastError<'a>(
        env: JNIEnv<'a>,
        _class: JClass<'a>,
    ) -> JString<'a> {
        let message = super::LAST_ERROR
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_default();
        env.new_string(message)
            .unwrap_or_else(|_| JString::from(jni::objects::JObject::null()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_once_serves_and_stops() {
        let dir = std::env::temp_dir().join(format!("notes-mobile-{}", std::process::id()));
        let db = dir.join("notes.db");
        let port = start(db.clone(), "test-secret".into()).unwrap();
        assert!(port > 0);
        assert_eq!(start(db, "test-secret".into()).unwrap(), port);
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        use std::io::{Read, Write};
        stream
            .write_all(
                b"GET /api/projects/list HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer test-secret\r\nConnection: close\r\n\r\n",
            )
            .unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
        stop();
        assert!(std::net::TcpStream::connect(("127.0.0.1", port)).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }
}
