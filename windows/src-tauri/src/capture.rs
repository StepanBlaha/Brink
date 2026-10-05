//! Quick-capture window and toast window (plan 2.2, M7).
//! Events: `capture://shown`, `capture://prefill {text,url}`, `toast://show {message,isError}`.

use crate::commands::emit;
use crate::error::AppError;
use crate::window::overlay::{self, CAPTURE_SIZE, CAPTURE_TOP, TOAST_SIZE, TOAST_TOP};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const CAPTURE: &str = "capture";
pub const TOAST: &str = "toast";

const FADE_IN: f64 = 0.18;
const FADE_OUT: f64 = 0.35;
const HOLD: f64 = 1.7;
const HOLD_ERROR: f64 = 2.6;

#[derive(Default)]
pub struct ToastGen(AtomicU64);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ToastPayload {
    message: String,
    is_error: bool,
}

#[derive(Serialize, Clone)]
pub struct Prefill {
    pub text: String,
    pub url: String,
}

/// Total visible time of a toast before Rust hides the window.
pub fn toast_lifetime(is_error: bool) -> Duration {
    Duration::from_secs_f64(FADE_IN + if is_error { HOLD_ERROR } else { HOLD } + FADE_OUT)
}

/// A hide timer only acts when no newer toast started since.
pub fn hide_is_current(started: u64, latest: u64) -> bool {
    started == latest
}

/// Shows the capture window on the cursor's monitor and focuses it.
pub fn show(app: &AppHandle) {
    let Some(win) = app.get_webview_window(CAPTURE) else {
        return;
    };
    overlay::place(app, &win, CAPTURE_SIZE, CAPTURE_TOP);
    let _ = win.set_always_on_top(true);
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
    emit(app, "capture://shown", ());
}

pub fn show_prefilled(app: &AppHandle, text: String, url: String) {
    show(app);
    emit(app, "capture://prefill", Prefill { text, url });
}

#[tauri::command]
pub async fn capture_show(app: AppHandle) -> Result<(), AppError> {
    show(&app);
    Ok(())
}

#[tauri::command]
pub async fn capture_hide(app: AppHandle) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(CAPTURE) {
        let _ = win.hide();
    }
    Ok(())
}

#[tauri::command]
pub async fn toast_show(app: AppHandle, message: String, is_error: bool) -> Result<(), AppError> {
    let Some(win) = app.get_webview_window(TOAST) else {
        return Err(AppError::new("window", "No toast window."));
    };
    let gen = app.state::<ToastGen>().0.fetch_add(1, Ordering::SeqCst) + 1;
    overlay::place(&app, &win, TOAST_SIZE, TOAST_TOP);
    #[cfg(target_os = "windows")]
    if let Some(raw) = crate::window::win32::raw_hwnd(&win) {
        crate::window::win32::show_no_activate(raw);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = win.show();
    emit(&app, "toast://show", ToastPayload { message, is_error });
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(toast_lifetime(is_error)).await;
        let latest = handle.state::<ToastGen>().0.load(Ordering::SeqCst);
        if hide_is_current(gen, latest) {
            if let Some(w) = handle.get_webview_window(TOAST) {
                let _ = w.hide();
            }
        }
    });
    Ok(())
}

pub fn setup(app: &AppHandle) {
    app.manage(ToastGen::default());
    if let Some(win) = app.get_webview_window(TOAST) {
        let _ = win.set_ignore_cursor_events(true);
        #[cfg(target_os = "windows")]
        if let Some(raw) = crate::window::win32::raw_hwnd(&win) {
            crate::window::win32::apply_styles(raw);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifetimes_match_the_plan() {
        assert_eq!(toast_lifetime(false), Duration::from_secs_f64(2.23));
        assert_eq!(toast_lifetime(true), Duration::from_secs_f64(3.13));
    }

    #[test]
    fn newer_toast_wins() {
        assert!(hide_is_current(3, 3));
        assert!(!hide_is_current(2, 3));
    }
}
