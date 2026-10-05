//! Notch window setup. Win32 styles (tool window, no-activate, DWM flags) are
//! applied on Windows only; other platforms keep Tauri's defaults for dev.

use tauri::AppHandle;

#[cfg(target_os = "windows")]
pub fn setup(_app: &AppHandle) {
    // M2: WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, DwmSetWindowAttribute, placement.
}

#[cfg(not(target_os = "windows"))]
pub fn setup(_app: &AppHandle) {}
