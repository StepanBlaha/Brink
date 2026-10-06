//! Tray icon, flyout window and native menu (plan 3.h).
//! Commands: `tray_set_count`, `tray_flyout_toggle`, `tray_flyout_hide`.
//! Events: `tray://shown`, `window://open {name}` (about, legal:privacy, legal:terms).

pub mod menu;
pub mod place;

use crate::commands::AppState;
use crate::error::AppError;
use crate::window::overlay;
use crate::window::placement::Rect;
use serde_json::Value;
use std::sync::Mutex;
use std::time::Instant;
use tauri::menu::ContextMenu;
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

pub const FLYOUT: &str = "tray";

#[derive(Default)]
pub struct TrayState {
    icon: Mutex<Option<TrayIcon>>,
    menu: Mutex<Option<tauri::menu::Menu<tauri::Wry>>>,
    last_rect: Mutex<Option<Rect>>,
    blur_hid_at: Mutex<Option<Instant>>,
}

fn rect_px(r: &tauri::Rect, scale: f64) -> Rect {
    let p = r.position.to_physical::<i32>(scale);
    let s = r.size.to_physical::<u32>(scale);
    Rect::new(p.x, p.y, s.width as i32, s.height as i32)
}

fn flyout_enabled(app: &AppHandle) -> bool {
    let s = app.state::<AppState>().settings.lock().unwrap().get();
    s["menuBarListEnabled"].as_bool().unwrap_or(true)
}

fn toggle(app: &AppHandle, icon: Option<Rect>) {
    let Some(win) = app.get_webview_window(FLYOUT) else {
        return;
    };
    let st = app.state::<TrayState>();
    let visible = win.is_visible().unwrap_or(false);
    let since = st
        .blur_hid_at
        .lock()
        .unwrap()
        .map(|t| t.elapsed().as_millis());
    if !place::should_open(visible, since) {
        if visible {
            let _ = win.hide();
        }
        return;
    }
    if let Some(r) = icon {
        *st.last_rect.lock().unwrap() = Some(r);
    }
    let known = icon.or(*st.last_rect.lock().unwrap());
    let probe = known.map(|r| (r.x + r.w / 2, r.y + r.h / 2));
    let Some((_, work, scale)) = overlay::monitor_at_point(app, probe) else {
        return;
    };
    let icon = known.unwrap_or_else(|| place::fallback_icon(work));
    let size = (
        (place::FLYOUT_SIZE.0 * scale).round() as i32,
        (place::FLYOUT_SIZE.1 * scale).round() as i32,
    );
    let (x, y) = place::flyout_position(icon, work, size);
    let pos = tauri::PhysicalPosition::new(x, y);
    let _ = win.set_position(pos);
    let _ = win.set_size(tauri::PhysicalSize::new(size.0 as u32, size.1 as u32));
    let _ = win.set_position(pos);
    let _ = win.set_always_on_top(true);
    let _ = win.show();
    let _ = win.set_focus();
    let _ = app.emit("tray://shown", ());
}

#[tauri::command]
pub async fn tray_flyout_toggle(app: AppHandle) -> Result<(), AppError> {
    toggle(&app, None);
    Ok(())
}

#[tauri::command]
pub async fn tray_flyout_hide(app: AppHandle) -> Result<(), AppError> {
    if let Some(w) = app.get_webview_window(FLYOUT) {
        let _ = w.hide();
    }
    Ok(())
}

/// `text` is " 7", " 99+" or "" (the Mac status title); the tooltip carries the count.
#[tauri::command]
pub async fn tray_set_count(app: AppHandle, text: String) -> Result<(), AppError> {
    if let Some(tray) = app.state::<TrayState>().icon.lock().unwrap().as_ref() {
        let _ = tray.set_tooltip(Some(place::tooltip_for(&text)));
    }
    Ok(())
}

/// Called after `settings_set`: keeps the menu check marks current.
pub fn on_settings_changed(app: &AppHandle, settings: &Value) {
    menu::refresh(app, settings);
}

fn on_click(app: &AppHandle, event: TrayIconEvent) {
    let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        rect,
        ..
    } = event
    else {
        return;
    };
    if flyout_enabled(app) {
        let scale = overlay::cursor_monitor(app).map_or(1.0, |m| m.2);
        toggle(app, Some(rect_px(&rect, scale)));
    } else if let Some(win) = app.get_webview_window(FLYOUT) {
        let menu = app.state::<TrayState>().menu.lock().unwrap().clone();
        if let Some(menu) = menu {
            let _ = menu.popup(win.as_ref().window().clone());
        }
    }
}

pub fn setup(app: &AppHandle) {
    app.manage(TrayState::default());
    app.manage(menu::MenuHandles::default());
    let settings = app.state::<AppState>().settings.lock().unwrap().get();
    let native = match menu::build(app, &settings) {
        Ok(n) => n,
        Err(e) => {
            crate::logging::error(&format!("tray menu failed: {e}"));
            return;
        }
    };
    *app.state::<TrayState>().menu.lock().unwrap() = Some(native.clone());
    let mut builder = TrayIconBuilder::with_id("brink")
        .tooltip("Brink")
        .menu(&native)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| menu::on_event(app, ev.id().as_ref()))
        .on_tray_icon_event(|tray, ev| on_click(tray.app_handle(), ev));
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    match builder.build(app) {
        Ok(t) => *app.state::<TrayState>().icon.lock().unwrap() = Some(t),
        Err(e) => crate::logging::error(&format!("tray icon failed: {e}")),
    }
    if let Some(win) = app.get_webview_window(FLYOUT) {
        let h = app.clone();
        win.on_window_event(move |ev| {
            if let WindowEvent::Focused(false) = ev {
                if let Some(w) = h.get_webview_window(FLYOUT) {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                        *h.state::<TrayState>().blur_hid_at.lock().unwrap() = Some(Instant::now());
                    }
                }
            }
        });
    }
}
