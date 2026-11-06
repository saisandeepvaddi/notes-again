use std::collections::HashSet;
use std::env;
use std::path::{Path, PathBuf};

use serde::Serialize;

pub const PROJECT_NAME: &str = "notes-again";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum AuthMode {
    #[serde(rename = "local")]
    Local,
    #[serde(rename = "firebase")]
    Firebase,
    #[serde(rename = "none")]
    None,
    #[serde(rename = "proxy")]
    Proxy,
    #[serde(rename = "cloudflare-access")]
    CloudflareAccess,
    #[serde(rename = "desktop")]
    Desktop,
}

impl AuthMode {
    pub const ALL: [&'static str; 6] = [
        "local",
        "firebase",
        "none",
        "proxy",
        "cloudflare-access",
        "desktop",
    ];

    pub fn parse(raw: &str) -> Option<AuthMode> {
        Some(match raw {
            "local" => AuthMode::Local,
            "firebase" => AuthMode::Firebase,
            "none" => AuthMode::None,
            "proxy" => AuthMode::Proxy,
            "cloudflare-access" => AuthMode::CloudflareAccess,
            "desktop" => AuthMode::Desktop,
            _ => return None,
        })
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            AuthMode::Local => "local",
            AuthMode::Firebase => "firebase",
            AuthMode::None => "none",
            AuthMode::Proxy => "proxy",
            AuthMode::CloudflareAccess => "cloudflare-access",
            AuthMode::Desktop => "desktop",
        }
    }

    pub fn is_external(&self) -> bool {
        matches!(self, AuthMode::Proxy | AuthMode::CloudflareAccess)
    }

    pub fn uses_email(&self) -> bool {
        matches!(
            self,
            AuthMode::Firebase | AuthMode::Proxy | AuthMode::CloudflareAccess
        )
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct FirebaseWebConfig {
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "authDomain")]
    pub auth_domain: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub auth_mode: AuthMode,
    pub desktop_secret: Option<String>,
    pub firebase_project_id: Option<String>,
    pub firebase_web: Option<FirebaseWebConfig>,
    pub allowed_emails: HashSet<String>,
    pub cors_origins: Vec<String>,
    pub cors_origin_regex: Option<String>,
    pub trusted_proxies: Vec<String>,
    pub proxy_header: String,
    pub proxy_logout_url: Option<String>,
    pub cloudflare_team_domain: String,
    pub cloudflare_audience: String,
    pub db_path: PathBuf,
    pub frontend_dist: PathBuf,
    pub backup_dir: Option<PathBuf>,
    pub backup_interval_hours: u64,
    pub backup_keep: usize,
    pub backup_replica_url: Option<String>,
    pub admin_username: String,
    pub admin_password: String,
}

fn var(name: &str) -> String {
    env::var(name).unwrap_or_default().trim().to_string()
}

fn opt_var(name: &str) -> Option<String> {
    Some(var(name)).filter(|v| !v.is_empty())
}

pub fn env_or_file(name: &str) -> Result<String, String> {
    let path = var(&format!("{name}_FILE"));
    if !path.is_empty() {
        return std::fs::read_to_string(&path)
            .map(|text| text.trim_end_matches(['\r', '\n']).to_string())
            .map_err(|e| format!("Couldn't read {name}_FILE ({path}): {e}"));
    }
    Ok(env::var(name).unwrap_or_default())
}

fn int_var(name: &str, default: u64) -> u64 {
    let raw = var(name);
    if raw.is_empty() {
        return default;
    }
    match raw.parse::<i64>() {
        Ok(value) => value.max(0) as u64,
        Err(_) => {
            tracing::warn!("{name} must be a whole number; using {default}");
            default
        }
    }
}

pub fn app_dir(app_name: &str) -> PathBuf {
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    let home = home.unwrap_or_else(|| PathBuf::from("."));
    if cfg!(windows) {
        let base = env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Local"));
        base.join(app_name)
    } else if cfg!(target_os = "macos") {
        home.join("Library")
            .join("Application Support")
            .join(app_name)
    } else {
        let base = env::var_os("XDG_DATA_HOME")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local").join("share"));
        base.join(app_name)
    }
}

pub fn default_db_path() -> PathBuf {
    match opt_var("DB_PATH") {
        Some(path) => PathBuf::from(path),
        None => app_dir(PROJECT_NAME).join(format!("{PROJECT_NAME}.db")),
    }
}

fn default_frontend_dist() -> PathBuf {
    if let Some(path) = opt_var("FRONTEND_DIST") {
        return PathBuf::from(path);
    }
    let repo = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("frontend")
        .join("dist")
        .join("client");
    if repo.is_dir() {
        return repo;
    }
    env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("frontend")))
        .unwrap_or(repo)
}

fn cloudflare_team_domain() -> String {
    let raw = var("CF_ACCESS_TEAM_DOMAIN").to_lowercase();
    let raw = raw
        .strip_prefix("https://")
        .or_else(|| raw.strip_prefix("http://"))
        .unwrap_or(&raw);
    let raw = raw.trim_end_matches('/').to_string();
    if !raw.is_empty() && !raw.contains('.') {
        return format!("{raw}.cloudflareaccess.com");
    }
    raw
}

fn replica_url() -> Option<String> {
    if let Some(url) = opt_var("BACKUP_REPLICA_URL") {
        return Some(url);
    }
    let bucket = var("R2_BUCKET");
    let endpoint = var("R2_ENDPOINT");
    if !bucket.is_empty() && !endpoint.is_empty() && !var("LITESTREAM_ACCESS_KEY_ID").is_empty() {
        let path = var("R2_PATH");
        let path = path.trim_matches('/');
        let host = endpoint
            .trim_start_matches("https://")
            .trim_start_matches("http://");
        return Some(format!("s3://{bucket}/{path}?endpoint={host}"));
    }
    None
}

fn firebase_project_id(credentials_file: &str) -> Result<String, String> {
    let text = std::fs::read_to_string(credentials_file).map_err(|e| {
        format!("Couldn't read FIREBASE_CREDENTIALS_FILE ({credentials_file}): {e}")
    })?;
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
        format!("FIREBASE_CREDENTIALS_FILE ({credentials_file}) isn't valid JSON: {e}")
    })?;
    value
        .get("project_id")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| format!("FIREBASE_CREDENTIALS_FILE ({credentials_file}) has no project_id"))
}

impl Config {
    pub fn resolve_auth_mode() -> Result<AuthMode, String> {
        let raw = var("AUTH_MODE").to_lowercase();
        if !raw.is_empty() {
            return AuthMode::parse(&raw).ok_or_else(|| {
                format!(
                    "AUTH_MODE must be one of {}; got '{raw}'.",
                    AuthMode::ALL.join(", ")
                )
            });
        }
        if matches!(var("AUTH_DISABLED").as_str(), "1" | "true" | "yes") {
            return Ok(AuthMode::None);
        }
        Ok(AuthMode::Local)
    }

    pub fn from_env() -> Result<Config, String> {
        let auth_mode = Self::resolve_auth_mode()?;
        let credentials_file = var("FIREBASE_CREDENTIALS_FILE");
        let mut firebase_project = None;
        match auth_mode {
            AuthMode::None => tracing::warn!("AUTH_MODE is none: API auth checks are bypassed."),
            AuthMode::Firebase => {
                if credentials_file.is_empty() {
                    return Err("AUTH_MODE is firebase but FIREBASE_CREDENTIALS_FILE is not set. Point it at a \
                        Firebase service account JSON. See docs/firebase-auth.md."
                        .into());
                }
                if !Path::new(&credentials_file).is_file() {
                    return Err(format!(
                        "AUTH_MODE is firebase but FIREBASE_CREDENTIALS_FILE ({credentials_file}) doesn't exist. \
                         See docs/firebase-auth.md, or unset AUTH_MODE to use username and password sign-in."
                    ));
                }
                firebase_project = Some(firebase_project_id(&credentials_file)?);
            }
            AuthMode::CloudflareAccess => {
                let mut missing = vec![];
                if cloudflare_team_domain().is_empty() {
                    missing.push("CF_ACCESS_TEAM_DOMAIN");
                }
                if var("CF_ACCESS_AUD").is_empty() {
                    missing.push("CF_ACCESS_AUD");
                }
                if !missing.is_empty() {
                    return Err(format!(
                        "AUTH_MODE is cloudflare-access but {} {} not set. See docs/self-hosting.md.",
                        missing.join(" and "),
                        if missing.len() == 1 { "is" } else { "are" }
                    ));
                }
            }
            AuthMode::Desktop if var("DESKTOP_SECRET").is_empty() => {
                return Err("AUTH_MODE is desktop but DESKTOP_SECRET is not set.".into());
            }
            _ => {}
        }
        if auth_mode != AuthMode::Firebase && !credentials_file.is_empty() {
            tracing::info!(
                "FIREBASE_CREDENTIALS_FILE is set but AUTH_MODE isn't firebase; ignoring it."
            );
        }

        let web = FirebaseWebConfig {
            api_key: var("VITE_FIREBASE_API_KEY"),
            auth_domain: var("VITE_FIREBASE_AUTH_DOMAIN"),
            project_id: var("VITE_FIREBASE_PROJECT_ID"),
        };
        let firebase_web =
            (!web.api_key.is_empty() && !web.auth_domain.is_empty() && !web.project_id.is_empty())
                .then_some(web);

        let trusted = opt_var("TRUSTED_PROXIES").unwrap_or_else(|| "127.0.0.1,::1".to_string());
        Ok(Config {
            auth_mode,
            desktop_secret: opt_var("DESKTOP_SECRET"),
            firebase_project_id: firebase_project,
            firebase_web,
            allowed_emails: var("ALLOWED_EMAILS")
                .split(',')
                .map(|e| e.trim().to_lowercase())
                .filter(|e| !e.is_empty())
                .collect(),
            cors_origins: var("CORS_ORIGINS")
                .split(',')
                .map(|o| o.trim().to_string())
                .filter(|o| !o.is_empty())
                .collect(),
            cors_origin_regex: opt_var("CORS_ORIGIN_REGEX"),
            trusted_proxies: trusted
                .split(',')
                .map(|e| e.trim().to_string())
                .filter(|e| !e.is_empty())
                .collect(),
            proxy_header: opt_var("AUTH_PROXY_HEADER").unwrap_or_else(|| "Remote-User".to_string()),
            proxy_logout_url: opt_var("AUTH_PROXY_LOGOUT_URL"),
            cloudflare_team_domain: cloudflare_team_domain(),
            cloudflare_audience: var("CF_ACCESS_AUD"),
            db_path: default_db_path(),
            frontend_dist: default_frontend_dist(),
            backup_dir: opt_var("BACKUP_DIR").map(PathBuf::from),
            backup_interval_hours: int_var("BACKUP_INTERVAL_HOURS", 24),
            backup_keep: int_var("BACKUP_KEEP", 7).max(1) as usize,
            backup_replica_url: replica_url(),
            admin_username: env_or_file("ADMIN_USERNAME")?.trim().to_string(),
            admin_password: env_or_file("ADMIN_PASSWORD")?,
        })
    }

    pub fn desktop(db_path: PathBuf, frontend_dist: PathBuf, secret: String) -> Config {
        Config {
            auth_mode: AuthMode::Desktop,
            desktop_secret: Some(secret),
            firebase_project_id: None,
            firebase_web: None,
            allowed_emails: HashSet::new(),
            cors_origins: vec![],
            cors_origin_regex: None,
            trusted_proxies: vec!["127.0.0.1".into(), "::1".into()],
            proxy_header: "Remote-User".into(),
            proxy_logout_url: None,
            cloudflare_team_domain: String::new(),
            cloudflare_audience: String::new(),
            db_path,
            frontend_dist,
            backup_dir: None,
            backup_interval_hours: 24,
            backup_keep: 7,
            backup_replica_url: None,
            admin_username: String::new(),
            admin_password: String::new(),
        }
    }

    pub fn backup_dir(&self) -> PathBuf {
        self.backup_dir.clone().unwrap_or_else(|| {
            self.db_path
                .parent()
                .map(|p| p.join("backups"))
                .unwrap_or_else(|| PathBuf::from("backups"))
        })
    }

    pub fn display_replica_url(&self) -> Option<String> {
        let url = self.backup_replica_url.as_ref()?;
        let parsed = url::Url::parse(url).ok()?;
        Some(format!(
            "{}://{}{}",
            parsed.scheme(),
            parsed.host_str().unwrap_or(""),
            parsed.path()
        ))
    }

    pub fn is_allowed(&self, email: Option<&str>) -> bool {
        if !self.auth_mode.uses_email() || self.allowed_emails.is_empty() {
            return true;
        }
        self.allowed_emails
            .contains(&email.unwrap_or("").to_lowercase())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NAMES: [&str; 14] = [
        "AUTH_MODE",
        "AUTH_DISABLED",
        "FIREBASE_CREDENTIALS_FILE",
        "CF_ACCESS_TEAM_DOMAIN",
        "CF_ACCESS_AUD",
        "DESKTOP_SECRET",
        "ADMIN_PASSWORD",
        "ADMIN_PASSWORD_FILE",
        "ALLOWED_EMAILS",
        "BACKUP_REPLICA_URL",
        "R2_BUCKET",
        "R2_PATH",
        "R2_ENDPOINT",
        "LITESTREAM_ACCESS_KEY_ID",
    ];

    static ENV: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn with_env<T>(pairs: &[(&str, &str)], run: impl FnOnce() -> T) -> T {
        let _guard = ENV.lock().unwrap_or_else(|e| e.into_inner());
        unsafe {
            for name in NAMES {
                env::remove_var(name);
            }
            for (name, value) in pairs {
                env::set_var(name, value);
            }
        }
        let result = run();
        unsafe {
            for name in NAMES {
                env::remove_var(name);
            }
        }
        result
    }

    #[test]
    fn reads_settings_from_the_environment() {
        for (pairs, expected) in [
            (vec![], AuthMode::Local),
            (
                vec![("FIREBASE_CREDENTIALS_FILE", "/run/secrets/firebase.json")],
                AuthMode::Local,
            ),
            (vec![("AUTH_DISABLED", "1")], AuthMode::None),
            (vec![("AUTH_MODE", "firebase")], AuthMode::Firebase),
            (vec![("AUTH_MODE", "NONE")], AuthMode::None),
        ] {
            let mode = with_env(&pairs, Config::resolve_auth_mode);
            assert_eq!(mode, Ok(expected), "{pairs:?}");
        }

        let unknown = with_env(&[("AUTH_MODE", "ldap")], Config::resolve_auth_mode);
        assert!(unknown.unwrap_err().contains("AUTH_MODE must be one of"));

        let missing = with_env(
            &[("AUTH_MODE", "cloudflare-access"), ("CF_ACCESS_AUD", "x")],
            Config::from_env,
        );
        assert!(missing.unwrap_err().contains("CF_ACCESS_TEAM_DOMAIN"));
        for domain in ["https://MyTeam.cloudflareaccess.com/", "myteam"] {
            let config = with_env(
                &[
                    ("AUTH_MODE", "cloudflare-access"),
                    ("CF_ACCESS_AUD", "x"),
                    ("CF_ACCESS_TEAM_DOMAIN", domain),
                ],
                Config::from_env,
            )
            .unwrap();
            assert_eq!(config.cloudflare_team_domain, "myteam.cloudflareaccess.com");
        }

        let firebase = with_env(
            &[
                ("AUTH_MODE", "firebase"),
                ("FIREBASE_CREDENTIALS_FILE", "/does/not/exist.json"),
            ],
            Config::from_env,
        );
        assert!(firebase.unwrap_err().contains("doesn't exist"));

        let desktop = with_env(&[("AUTH_MODE", "desktop")], Config::from_env);
        assert!(desktop.unwrap_err().contains("DESKTOP_SECRET"));

        let secret = std::env::temp_dir().join(format!("nal-admin-{}", std::process::id()));
        std::fs::write(&secret, "from a secret file\n").unwrap();
        let config = with_env(
            &[
                ("ADMIN_PASSWORD_FILE", secret.to_str().unwrap()),
                ("ALLOWED_EMAILS", " Me@X.dev, someone@else.dev ,"),
            ],
            Config::from_env,
        )
        .unwrap();
        let _ = std::fs::remove_file(&secret);
        assert_eq!(config.admin_password, "from a secret file");
        assert!(config.backup_replica_url.is_none());
        assert_eq!(
            config.allowed_emails,
            ["me@x.dev", "someone@else.dev"]
                .into_iter()
                .map(String::from)
                .collect()
        );
    }

    #[test]
    fn replica_url_prefers_the_url_and_falls_back_to_r2_settings() {
        let r2 = [
            ("R2_BUCKET", "bkt"),
            ("R2_PATH", "db"),
            ("R2_ENDPOINT", "https://acct.r2.cloudflarestorage.com"),
        ];
        assert_eq!(with_env(&r2, replica_url), None);
        let mut with_key = r2.to_vec();
        with_key.push(("LITESTREAM_ACCESS_KEY_ID", "key"));
        assert_eq!(
            with_env(&with_key, replica_url).as_deref(),
            Some("s3://bkt/db?endpoint=acct.r2.cloudflarestorage.com")
        );
        let config = with_env(&with_key, Config::from_env).unwrap();
        assert_eq!(config.display_replica_url().as_deref(), Some("s3://bkt/db"));
        with_key.push(("BACKUP_REPLICA_URL", "sftp://host/backups/notes"));
        assert_eq!(
            with_env(&with_key, replica_url).as_deref(),
            Some("sftp://host/backups/notes")
        );
    }
}
