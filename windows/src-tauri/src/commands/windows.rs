//! On-demand utility windows: settings, onboarding, About and the legal texts (plan 2.2, M8).
//! They are declared in `tauri.conf.json` with `create: false` and built here, so the URL, size
//! and flags come from one place. Closing a window destroys it (memory, plan 8).

use crate::error::AppError;
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewWindowBuilder};

/// What `window_open(name)` resolves to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Spec {
    pub label: &'static str,
    /// Hash route after `index.html#`.
    pub route: String,
}

const SECTIONS: [&str; 5] = ["connection", "appearance", "general", "groups", "shortcuts"];

/// Maps a window name (`settings`, `onboarding`, `about`, `legal:privacy`, ...) to its label and route.
pub fn spec(name: &str, section: Option<&str>) -> Option<Spec> {
    let (label, route) = match name {
        "settings" => {
            let s = section.filter(|s| SECTIONS.contains(s));
            (
                "settings",
                format!("/settings{}", s.map_or(String::new(), |s| format!("/{s}"))),
            )
        }
        "onboarding" => ("onboarding", "/onboarding".to_string()),
        "about" => ("about", "/about".to_string()),
        "legal:privacy" => ("legal-privacy", "/legal/privacy".to_string()),
        "legal:terms" => ("legal-terms", "/legal/terms".to_string()),
        "legal:notice" => ("legal-notice", "/legal/notice".to_string()),
        _ => return None,
    };
    Some(Spec { label, route })
}

fn err(e: impl std::fmt::Display) -> AppError {
    AppError::new("window", e.to_string())
}

fn focus(w: &tauri::WebviewWindow) {
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
}

/// Shows the window when it exists, else builds it from its config entry.
pub fn open(app: &AppHandle, name: &str, section: Option<&str>) -> Result<(), AppError> {
    let spec = spec(name, section).ok_or_else(|| AppError::new("invalid", "Unknown window."))?;
    if let Some(w) = app.get_webview_window(spec.label) {
        if name == "settings" {
            if let Some(s) = section {
                let _ = app.emit_to(spec.label, "settings://section", s);
            }
        }
        focus(&w);
        return Ok(());
    }
    let mut cfg = app
        .config()
        .app
        .windows
        .iter()
        .find(|c| c.label == spec.label)
        .cloned()
        .ok_or_else(|| err("No such window in the config."))?;
    cfg.url = tauri::WebviewUrl::App(format!("index.html#{}", spec.route).into());
    let w = WebviewWindowBuilder::from_config(app, &cfg)
        .map_err(err)?
        .build()
        .map_err(err)?;
    focus(&w);
    Ok(())
}

#[tauri::command]
pub async fn window_open(
    app: AppHandle,
    name: String,
    section: Option<String>,
) -> Result<(), AppError> {
    open(&app, &name, section.as_deref())
}

/// `0xRRGGBB` of Windows' accent color (DWM `ColorizationColor` is `0xAARRGGBB`), if known.
pub fn rgb_from_argb(argb: u32) -> u32 {
    argb & 0x00ff_ffff
}

#[cfg(target_os = "windows")]
fn read_accent() -> Option<u32> {
    let b = crate::winreg::read(r"Software\Microsoft\Windows\DWM", "ColorizationColor")?;
    let raw: [u8; 4] = b.get(..4)?.try_into().ok()?;
    Some(rgb_from_argb(u32::from_le_bytes(raw)))
}

#[cfg(not(target_os = "windows"))]
fn read_accent() -> Option<u32> {
    None
}

/// The system accent for the "System accent" preset; `null` where it is unknown.
#[tauri::command]
pub async fn system_accent() -> Result<Option<u32>, AppError> {
    Ok(read_accent())
}

/// Win+. opens the Windows emoji panel for whichever text field has focus.
#[cfg(target_os = "windows")]
fn send_emoji_panel() -> Result<(), AppError> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        VIRTUAL_KEY, VK_LWIN, VK_OEM_PERIOD,
    };
    let key = |vk: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let inputs = [
        key(VK_LWIN, false),
        key(VK_OEM_PERIOD, false),
        key(VK_OEM_PERIOD, true),
        key(VK_LWIN, true),
    ];
    // SAFETY: SendInput reads the four INPUT structs we just built.
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent == inputs.len() as u32 {
        Ok(())
    } else {
        Err(AppError::new("io", "Could not open the emoji panel."))
    }
}

#[cfg(not(target_os = "windows"))]
fn send_emoji_panel() -> Result<(), AppError> {
    Err(AppError::new(
        "unsupported",
        "The emoji panel is a Windows feature.",
    ))
}

#[tauri::command]
pub async fn emoji_panel_open() -> Result<(), AppError> {
    send_emoji_panel()
}

/// Handles `window://open {name}` emitted by the tray menu (and by any webview).
pub fn setup(app: &AppHandle) {
    let handle = app.clone();
    app.listen("window://open", move |ev| {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(ev.payload()) else {
            return;
        };
        let Some(name) = v["name"].as_str() else {
            return;
        };
        if let Err(e) = open(&handle, name, v["section"].as_str()) {
            crate::logging::error(&format!("window://open {name}: {}", e.message));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accent_drops_alpha() {
        assert_eq!(rgb_from_argb(0xC40078D4), 0x0078D4);
    }

    #[test]
    fn names_map_to_labels_and_routes() {
        let s = spec("settings", None).unwrap();
        assert_eq!((s.label, s.route.as_str()), ("settings", "/settings"));
        assert_eq!(
            spec("settings", Some("groups")).unwrap().route,
            "/settings/groups"
        );
        assert_eq!(
            spec("settings", Some("evil/../x")).unwrap().route,
            "/settings"
        );
        assert_eq!(spec("legal:privacy", None).unwrap().label, "legal-privacy");
        assert_eq!(spec("legal:terms", None).unwrap().route, "/legal/terms");
        assert_eq!(spec("legal:notice", None).unwrap().route, "/legal/notice");
        assert_eq!(spec("about", None).unwrap().route, "/about");
        assert_eq!(spec("onboarding", None).unwrap().label, "onboarding");
        assert!(spec("notch", None).is_none());
    }
}
