//! Opening Notion pages and showing the settings window.

use crate::error::AppError;
use tauri::{AppHandle, Manager};

/// `(notion:// URL, https URL)` for a page or database id; `None` when the id is not a UUID-ish string.
pub fn notion_urls(notion_id: &str) -> Option<(String, String)> {
    let compact: String = notion_id.chars().filter(|c| *c != '-').collect();
    if compact.is_empty() || !compact.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some((
        format!("notion://www.notion.so/{compact}"),
        format!("https://www.notion.so/{compact}"),
    ))
}

#[cfg(target_os = "windows")]
fn protocol_registered(scheme: &str) -> bool {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, HKEY, HKEY_CLASSES_ROOT, KEY_READ,
    };
    let mut key = HKEY::default();
    // SAFETY: plain registry read of HKCR\<scheme>; the handle is closed right away.
    unsafe {
        let ok = RegOpenKeyExW(
            HKEY_CLASSES_ROOT,
            &HSTRING::from(scheme),
            None,
            KEY_READ,
            &mut key,
        )
        .is_ok();
        if ok {
            let _ = RegCloseKey(key);
        }
        ok
    }
}

#[cfg(not(target_os = "windows"))]
fn protocol_registered(_scheme: &str) -> bool {
    false
}

#[cfg(target_os = "windows")]
pub fn launch_url(url: &str) -> Result<(), AppError> {
    use windows::core::{w, HSTRING};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    // SAFETY: ShellExecuteW with a verb and a URL we built from validated hex digits.
    let r = unsafe {
        ShellExecuteW(
            None,
            w!("open"),
            &HSTRING::from(url),
            None,
            None,
            SW_SHOWNORMAL,
        )
    };
    if r.0 as isize > 32 {
        Ok(())
    } else {
        Err(AppError::new("io", "Could not open the link."))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn launch_url(url: &str) -> Result<(), AppError> {
    let program = if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| AppError::new("io", e.to_string()))
}

/// `notion://` when the protocol is registered, else the browser (DockController.openPinInNotion).
#[tauri::command]
pub async fn open_in_notion(notion_id: String) -> Result<(), AppError> {
    let (scheme_url, https_url) =
        notion_urls(&notion_id).ok_or_else(|| AppError::new("invalid", "Not a Notion id."))?;
    launch_url(if protocol_registered("notion") {
        &scheme_url
    } else {
        &https_url
    })
}

/// Only web links and mail links may be opened from the frontend.
pub fn is_allowed_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    ["http://", "https://", "mailto:"]
        .iter()
        .any(|p| lower.starts_with(p))
        && !url.chars().any(char::is_control)
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), AppError> {
    if !is_allowed_url(&url) {
        return Err(AppError::new(
            "invalid",
            "Only http, https and mailto links.",
        ));
    }
    launch_url(url.trim())
}

/// Shows and focuses the settings window (created hidden-or-visible by `tauri.conf.json`).
#[tauri::command]
pub async fn show_settings(app: AppHandle) -> Result<(), AppError> {
    let w = app
        .get_webview_window("settings")
        .ok_or_else(|| AppError::new("window", "No settings window."))?;
    w.show()
        .map_err(|e| AppError::new("window", e.to_string()))?;
    let _ = w.unminimize();
    w.set_focus()
        .map_err(|e| AppError::new("window", e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_use_the_compact_id() {
        let (n, h) = notion_urls("a1b2c3d4-0000-4000-8000-0123456789ab").unwrap();
        assert_eq!(
            n,
            "notion://www.notion.so/a1b2c3d4000040008000".to_string() + "0123456789ab"
        );
        assert_eq!(
            h,
            "https://www.notion.so/a1b2c3d4000040008000".to_string() + "0123456789ab"
        );
    }

    #[test]
    fn open_url_allow_list() {
        assert!(is_allowed_url("https://brinknotch.site/#faq"));
        assert!(is_allowed_url("HTTP://x.y"));
        assert!(is_allowed_url("mailto:a@b.c?subject=Hi"));
        assert!(!is_allowed_url("file:///C:/Windows/notepad.exe"));
        assert!(!is_allowed_url("javascript:alert(1)"));
        assert!(!is_allowed_url("brink://pin/1"));
        assert!(!is_allowed_url("https://x.y/\n--evil"));
    }

    #[test]
    fn rejects_ids_that_are_not_hex() {
        assert!(notion_urls("abc/../x").is_none());
        assert!(notion_urls("").is_none());
        assert!(notion_urls("page id").is_none());
    }
}
