//! `brink://` deep links, launch flags and the single-instance forward (plan 3.l).
//! Event: `deeplink://open {url}` to the `notch` window, buffered until `deeplink_ready`.

pub mod args;

use crate::error::AppError;
use args::ArgAction;
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

#[derive(Default)]
pub struct DeepLinks {
    inner: Mutex<(bool, Vec<String>)>,
}

#[derive(Serialize, Clone)]
struct Open {
    url: String,
}

fn send(app: &AppHandle, url: String) {
    let _ = app.emit_to("notch", "deeplink://open", Open { url });
}

/// Emits now when the hub is ready, else buffers.
pub fn deliver(app: &AppHandle, url: String) {
    let state = app.state::<DeepLinks>();
    let mut g = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    if g.0 {
        drop(g);
        send(app, url);
    } else {
        g.1.push(url);
    }
}

#[tauri::command]
pub async fn deeplink_ready(app: AppHandle, state: State<'_, DeepLinks>) -> Result<(), AppError> {
    let pending = {
        let mut g = state.inner.lock().unwrap_or_else(|e| e.into_inner());
        g.0 = true;
        std::mem::take(&mut g.1)
    };
    for url in pending {
        send(&app, url);
    }
    Ok(())
}

pub fn show_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Runs the actions of one launch (`args` excludes the executable).
pub fn handle_args(app: &AppHandle, args: &[String]) {
    for action in args::parse_args(args) {
        match action {
            ArgAction::Url(u) => deliver(app, u),
            ArgAction::Capture => crate::capture::show(app),
            ArgAction::Settings => show_settings(app),
            ArgAction::Share(path) => {
                if let Some(p) = args::read_share(&path) {
                    crate::capture::show_prefilled(app, p.text, p.url);
                }
            }
        }
    }
}

pub fn setup(app: &AppHandle) {
    app.manage(DeepLinks::default());
    #[cfg(any(windows, target_os = "linux"))]
    if cfg!(debug_assertions) {
        let _ = app.deep_link().register("brink");
    }
    let h = app.clone();
    app.deep_link().on_open_url(move |ev| {
        for u in ev.urls() {
            deliver(&h, u.to_string());
        }
    });
    // First launch: flags and URLs in our own argv. Wait a moment so the capture webview has
    // loaded before a prefill is emitted.
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let h = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(900)).await;
        handle_args(&h, &argv);
    });
}

/// Plugin that forwards a second launch to the running instance.
pub fn single_instance() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_single_instance::init(|app, argv, _cwd| {
        let rest: Vec<String> = argv.into_iter().skip(1).collect();
        handle_args(app, &rest);
    })
}
