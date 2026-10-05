//! The demo backdrop window: full screen, click-through, never focused, painting the dusk
//! wallpaper (route `#/backdrop`, drawn in CSS). Created only in demo mode. It sits just under
//! Brink's own windows (see DECISIONS: M9 demo mode), so a recording hides the real desktop.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "backdrop";

pub fn setup(app: &AppHandle) {
    if !super::is_active() {
        return;
    }
    let Some(monitor) = app.primary_monitor().ok().flatten() else {
        return;
    };
    let built =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#/backdrop".into()))
            .title("Brink demo backdrop")
            .decorations(false)
            .resizable(false)
            .shadow(false)
            .skip_taskbar(true)
            .focused(false)
            .always_on_top(true)
            .visible(false)
            .build();
    let Ok(win) = built else {
        crate::logging::error("demo backdrop window failed");
        return;
    };
    let _ = win.set_position(*monitor.position());
    let _ = win.set_size(*monitor.size());
    let _ = win.set_ignore_cursor_events(true);
    #[cfg(target_os = "windows")]
    {
        use crate::window::win32;
        if let Some(raw) = win32::raw_hwnd(&win) {
            win32::apply_styles(raw);
            win32::show_no_activate(raw);
        }
        // The notch must stay above the backdrop: re-assert it after the backdrop is shown.
        if let Some(raw) = app
            .get_webview_window("notch")
            .and_then(|n| win32::raw_hwnd(&n))
        {
            win32::assert_topmost(raw);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = win.show();
        if let Some(n) = app.get_webview_window("notch") {
            let _ = n.show();
        }
    }
}
