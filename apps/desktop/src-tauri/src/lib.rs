use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const PORT: u16 = 47321;

struct ApiProc(Mutex<Option<Child>>);

fn find_node() -> PathBuf {
    if let Ok(p) = std::env::var("SEO_BRAIN_NODE") {
        return PathBuf::from(p);
    }
    for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] {
        if Path::new(candidate).exists() {
            return PathBuf::from(candidate);
        }
    }
    PathBuf::from("node")
}

fn wait_health(url: &str) -> bool {
    let deadline = Instant::now() + Duration::from_secs(180);
    while Instant::now() < deadline {
        if ureq::get(url).call().map(|r| r.status() == 200).unwrap_or(false) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    false
}

pub fn run() {
    tauri::Builder::default()
        .manage(ApiProc(Mutex::new(None)))
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let home = app.path().app_data_dir()?;
            fs::create_dir_all(&home)?;
            let api = resources.join("brain-api");
            let chat = resources.join("brain-chat").join("out");
            let log_path = home.join("api.log");
            let log = File::create(&log_path)?;
            let log_err = log.try_clone()?;
            let mut header = log.try_clone()?;
            writeln!(
                header,
                "node {} api {}",
                find_node().display(),
                api.display()
            )?;

            let child = Command::new(find_node())
                .arg(api.join("dist").join("index.js"))
                .current_dir(&api)
                .env("SEO_BRAIN_DESKTOP", "1")
                .env("SEO_BRAIN_HOME", &home)
                .env("TEAM_BRAIN_ROOT", &home)
                .env("SEO_BRAIN_WWW", home.join("www"))
                .env("SEO_BRAIN_CHAT_DIST", &chat)
                .env("SEO_BRAIN_PROMPT_FILE", api.join("CLAUDE-API.md"))
                .env("PORT", PORT.to_string())
                .env("ALLOWED_ORIGIN", format!("http://127.0.0.1:{PORT}"))
                .stdout(Stdio::from(log))
                .stderr(Stdio::from(log_err))
                .spawn()?;
            if let Some(state) = app.try_state::<ApiProc>() {
                *state.0.lock().expect("api proc") = Some(child);
            }

            let health = format!("http://127.0.0.1:{PORT}/health");
            let up = wait_health(&health);
            if !up {
                eprintln!("seo-brain api did not answer {health}. log: {}", log_path.display());
            }
            let url = format!("http://127.0.0.1:{PORT}/").parse().expect("window url");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("SEO Brain")
                .inner_size(1280.0, 800.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building seo-brain")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ApiProc>() {
                    if let Some(mut child) = state.0.lock().expect("api proc").take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}
