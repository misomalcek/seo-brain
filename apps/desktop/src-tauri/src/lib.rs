use std::fs::{self, File};
use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent};

/// The API's preferred port. The chat UI is served from the same origin, so a
/// stable port keeps the browser storage (login) across launches; another port
/// is used only when this one is taken.
const PREFERRED_PORT: u16 = 47321;
const PORT_SPAN: u16 = 10;
const HEALTH_TIMEOUT: Duration = Duration::from_secs(300);

struct ApiProc(Mutex<Option<Child>>);

/// The bundled runtime first. 0.1.0 relied on a system node and exited
/// without a window when there was none — the normal case on Windows.
fn find_node(resources: &Path) -> PathBuf {
    if let Ok(p) = std::env::var("SEO_BRAIN_NODE") {
        return PathBuf::from(p);
    }
    let bundled = resources
        .join("node")
        .join(if cfg!(windows) { "node.exe" } else { "node" });
    if bundled.exists() {
        return bundled;
    }
    for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] {
        if Path::new(candidate).exists() {
            return PathBuf::from(candidate);
        }
    }
    PathBuf::from("node")
}

fn port_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn pick_port() -> Option<u16> {
    (PREFERRED_PORT..PREFERRED_PORT + PORT_SPAN).find(|p| port_free(*p))
}

fn healthy(port: u16) -> bool {
    ureq::get(&format!("http://127.0.0.1:{port}/health"))
        .timeout(Duration::from_secs(2))
        .call()
        .map(|r| r.status() == 200)
        .unwrap_or(false)
}

/// Run JS in the loading page. Errors are ignored: the page may be navigating.
fn page(app: &AppHandle, js: String) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval(&js);
    }
}

fn js_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

fn fail(app: &AppHandle, text: &str, detail: &str) {
    eprintln!("seo-brain: {text} {detail}");
    page(app, format!("window.__fail({}, {})", js_str(text), js_str(detail)));
}

/// Start the API and point the already-open window at it. Runs off the main
/// thread so the window appears at once instead of after the API is up.
fn start_api(app: AppHandle) {
    let started = (|| -> Result<(u16, PathBuf), String> {
        let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
        let home = app.path().app_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&home).map_err(|e| e.to_string())?;
        let api = resources.join("brain-api");
        let chat = resources.join("brain-chat").join("out");
        let log_path = home.join("api.log");
        let log = File::create(&log_path).map_err(|e| e.to_string())?;
        let log_err = log.try_clone().map_err(|e| e.to_string())?;
        let mut header = log.try_clone().map_err(|e| e.to_string())?;
        let node = find_node(&resources);
        let port = pick_port().ok_or_else(|| {
            format!("ports {PREFERRED_PORT}–{} are all in use", PREFERRED_PORT + PORT_SPAN - 1)
        })?;
        let _ = writeln!(header, "node {} api {} port {port}", node.display(), api.display());

        let mut cmd = Command::new(&node);
        // Node's Windows main-module resolver mishandles the extended-length
        // `\\?\` resource path returned by Tauri. Resolve the entry point
        // relative to the API working directory instead.
        cmd.arg("dist/index.js")
            .current_dir(&api)
            .env("SEO_BRAIN_DESKTOP", "1")
            .env("SEO_BRAIN_HOME", &home)
            .env("TEAM_BRAIN_ROOT", &home)
            .env("SEO_BRAIN_WWW", home.join("www"))
            .env("SEO_BRAIN_CHAT_DIST", &chat)
            .env("SEO_BRAIN_PROMPT_FILE", api.join("CLAUDE-API.md"))
            .env("PORT", port.to_string())
            .env("ALLOWED_ORIGIN", format!("http://127.0.0.1:{port}"))
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(log_err));
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let child = cmd
            .spawn()
            .map_err(|e| format!("could not start {}: {e}", node.display()))?;
        if let Some(state) = app.try_state::<ApiProc>() {
            *state.0.lock().expect("api proc") = Some(child);
        }
        Ok((port, log_path))
    })();

    let (port, log_path) = match started {
        Ok(v) => v,
        Err(e) => return fail(&app, "SEO Brain could not start its API.", &e),
    };

    let deadline = Instant::now() + HEALTH_TIMEOUT;
    while Instant::now() < deadline {
        if healthy(port) {
            if let Some(w) = app.get_webview_window("main") {
                match format!("http://127.0.0.1:{port}/").parse() {
                    Ok(url) => {
                        if let Err(e) = w.navigate(url) {
                            fail(&app, "SEO Brain could not open its interface.", &e.to_string());
                        }
                    }
                    Err(e) => fail(&app, "SEO Brain could not open its interface.", &format!("{e}")),
                }
            }
            return;
        }
        // The API exited: say so now, not after the timeout.
        let exited = app
            .try_state::<ApiProc>()
            .and_then(|s| s.0.lock().ok().and_then(|mut c| c.as_mut().and_then(|c| c.try_wait().ok().flatten())));
        if let Some(status) = exited {
            return fail(
                &app,
                &format!("The SEO Brain API stopped ({status})."),
                &format!("Log: {}", log_path.display()),
            );
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    fail(
        &app,
        "The SEO Brain API did not answer in time.",
        &format!("Log: {}", log_path.display()),
    );
}

fn stop_api(app: &AppHandle) {
    if let Some(state) = app.try_state::<ApiProc>() {
        if let Some(mut child) = state.0.lock().expect("api proc").take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(ApiProc(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || start_api(handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building seo-brain")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop_api(app);
            }
        });
}
