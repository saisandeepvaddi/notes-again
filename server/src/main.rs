use std::io::Write;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use notes_again_server::config::{AuthMode, Config, default_db_path};
use notes_again_server::{auth, backups, db, init_crypto};

#[derive(Parser)]
#[command(name = "notes-again", about = "Notes Again server and maintenance")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    Serve {
        #[arg(long, env = "BIND_ADDRESS", default_value = "127.0.0.1")]
        host: IpAddr,
        #[arg(long, env = "PORT", default_value_t = 8000)]
        port: u16,
    },
    ResetLogin,
    Snapshot,
    Restore {
        file: PathBuf,
        #[arg(short, long)]
        yes: bool,
    },
    Doctor,
    Reindex,
    Healthcheck {
        #[arg(long, env = "PORT", default_value_t = 8000)]
        port: u16,
    },
}

fn init_logging(level: &str) {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(level));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .init();
}

async fn open_pool() -> Result<db::Pool, String> {
    init_crypto();
    db::open(&default_db_path())
        .await
        .map_err(|e| format!("Couldn't open the database: {e}"))
}

async fn run(command: Command) -> Result<ExitCode, String> {
    match command {
        Command::Serve { host, port } => {
            init_logging("info");
            notes_again_server::serve(Config::from_env()?, SocketAddr::new(host, port)).await?;
        }
        Command::ResetLogin => {
            init_logging("warn");
            let record = auth::local::reset_local_auth(&open_pool().await?)
                .await
                .map_err(|e| e.to_string())?;
            println!("Sign-in reset. Everyone is signed out. Sign in with");
            println!("  username: {}", record.username);
            println!(
                "  password: {}",
                record.initial_password.unwrap_or_default()
            );
            println!("and choose a new username and password.");
        }
        Command::Snapshot => {
            init_logging("warn");
            let pool = open_pool().await?;
            let config = Config::from_env()?;
            let dir = backups::load_backup_dir(&pool)
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| config.backup_dir());
            let taken = backups::create_snapshot(
                &pool,
                &dir,
                config.backup_keep,
                &tokio::sync::Mutex::new(()),
            )
            .await?;
            println!(
                "Snapshot written to {} ({} bytes).",
                taken.path.display(),
                taken.size_bytes
            );
        }
        Command::Restore { file, yes } => {
            init_logging("warn");
            let source = std::fs::canonicalize(&file)
                .map_err(|_| format!("No such file: {}", file.display()))?;
            let target = default_db_path();
            if std::fs::canonicalize(&target).ok().as_ref() == Some(&source) {
                eprintln!("That file is the live database already.");
                return Ok(ExitCode::FAILURE);
            }
            if !yes {
                println!(
                    "This replaces {} with {}.",
                    target.display(),
                    source.display()
                );
                println!("Stop the Notes Again server first, or the restore can be overwritten.");
                print!("Continue? [y/N] ");
                let _ = std::io::stdout().flush();
                let mut answer = String::new();
                let _ = std::io::stdin().read_line(&mut answer);
                if answer.trim().to_lowercase() != "y" {
                    println!("Nothing changed.");
                    return Ok(ExitCode::FAILURE);
                }
            }
            match backups::restore_database(&source, &target).await {
                Ok(moved) => {
                    println!("Restored {} from {}.", target.display(), source.display());
                    if let Some(moved) = moved {
                        println!("The previous database was kept at {}.", moved.display());
                    }
                    println!("Start the server again.");
                }
                Err(error) => {
                    eprintln!("{error}");
                    return Ok(ExitCode::FAILURE);
                }
            }
        }
        Command::Doctor => return doctor().await,
        Command::Healthcheck { port } => {
            init_crypto();
            let ok = reqwest::Client::new()
                .get(format!("http://127.0.0.1:{port}/healthz"))
                .timeout(std::time::Duration::from_secs(4))
                .send()
                .await
                .is_ok_and(|r| r.status().is_success());
            return Ok(if ok {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            });
        }
        Command::Reindex => {
            init_logging("warn");
            let pool = open_pool().await?;
            sqlx::query("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')")
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            println!("Search index rebuilt.");
        }
    }
    Ok(ExitCode::SUCCESS)
}

async fn doctor() -> Result<ExitCode, String> {
    init_logging("warn");
    let mut problems: Vec<String> = vec![];
    let line = |label: &str, value: &dyn std::fmt::Display| println!("  {label:<18} {value}");
    println!("Auth");
    let config = match Config::from_env() {
        Ok(config) => {
            line("mode", &config.auth_mode.as_str());
            if config.auth_mode == AuthMode::Firebase && config.firebase_web.is_none() {
                problems.push(
                    "AUTH_MODE is firebase but the VITE_FIREBASE_* web config is missing.".into(),
                );
            }
            if config.auth_mode == AuthMode::Proxy {
                line("user header", &config.proxy_header);
                line("trusted proxies", &config.trusted_proxies.join(", "));
                if config.trusted_proxies.iter().any(|p| p == "*") {
                    problems.push(
                        "TRUSTED_PROXIES is *, so anyone who can reach the server can claim any user.".into(),
                    );
                }
            }
            if config.auth_mode == AuthMode::CloudflareAccess {
                line("team domain", &config.cloudflare_team_domain);
                line("audience", &config.cloudflare_audience);
            }
            Some(config)
        }
        Err(error) => {
            problems.push(error);
            line("mode", &"error");
            None
        }
    };

    println!("Database");
    let path = default_db_path();
    line("path", &path.display());
    line("exists", &if path.is_file() { "True" } else { "False" });
    if let Ok(meta) = std::fs::metadata(&path) {
        line("size", &format!("{} bytes", meta.len()));
    }
    let parent = path.parent().map(PathBuf::from).unwrap_or_default();
    if std::fs::metadata(&parent)
        .map(|m| m.permissions().readonly())
        .unwrap_or(true)
    {
        problems.push(format!(
            "The database folder {} isn't writable.",
            parent.display()
        ));
    }
    if std::path::Path::new("/.dockerenv").exists() && !path.starts_with("/data/") {
        problems.push(format!(
            "Running in a container but DB_PATH ({}) isn't under /data.",
            path.display()
        ));
    }

    if let Some(config) = &config {
        println!("Frontend");
        if !config.web_ui {
            line("web app", &"off (WEB_UI=off)");
        } else {
            line("folder", &config.frontend_dist.display());
        }
        if config.web_ui && !config.frontend_dist.join("index.html").is_file() {
            problems.push(format!(
                "No built frontend at {}. Run `make build-frontend`.",
                config.frontend_dist.display()
            ));
        }
        println!("Backups");
        let hours = config.backup_interval_hours;
        let schedule = if hours > 0 {
            format!("every {hours}h, keep {}", config.backup_keep)
        } else {
            "off".into()
        };
        line("local snapshots", &schedule);
        line("folder", &config.backup_dir().display());
        let latest = backups::list_snapshots(&config.backup_dir())
            .first()
            .map(|s| s.created_at.0.format("%Y-%m-%dT%H:%M:%S+00:00").to_string());
        line("latest", &latest.unwrap_or_else(|| "none".into()));
        let pool = open_pool().await?;
        let check =
            sqlx::query("INSERT INTO notes_fts(notes_fts, rank) VALUES ('integrity-check', 1)")
                .execute(&pool)
                .await;
        line(
            "search index",
            &if check.is_ok() {
                "ok"
            } else {
                "needs attention"
            },
        );
        if let Err(error) = check {
            problems.push(format!(
                "The search index is out of date ({error}). Run `notes-again reindex`."
            ));
        }
        let offsite = config.display_replica_url();
        line(
            "off-site",
            &offsite.clone().unwrap_or_else(|| "not configured".into()),
        );
        let has_litestream = std::env::var_os("PATH")
            .map(|paths| std::env::split_paths(&paths).any(|dir| dir.join("litestream").is_file()))
            .unwrap_or(false);
        if offsite.is_some() && !has_litestream {
            problems.push(
                "Off-site backup is configured but litestream isn't installed here. It runs inside the Docker image.".into(),
            );
        }
        if offsite.is_none() && std::env::var_os("LITESTREAM_ACCESS_KEY_ID").is_some() {
            problems.push("LITESTREAM_ACCESS_KEY_ID is set but BACKUP_REPLICA_URL isn't.".into());
        }
    }

    println!();
    if problems.is_empty() {
        println!("No problems found.");
        return Ok(ExitCode::SUCCESS);
    }
    println!("Problems:");
    for problem in problems {
        println!("  - {problem}");
    }
    Ok(ExitCode::FAILURE)
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let command = cli.command.unwrap_or(Command::Serve {
        host: "127.0.0.1".parse().unwrap(),
        port: 8000,
    });
    let command = match command {
        Command::Serve { .. } if std::env::args().len() <= 1 => {
            let host = std::env::var("BIND_ADDRESS")
                .ok()
                .and_then(|h| h.parse().ok())
                .unwrap_or("127.0.0.1".parse().unwrap());
            let port = std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8000);
            Command::Serve { host, port }
        }
        other => other,
    };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("a tokio runtime");
    match runtime.block_on(run(command)) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
