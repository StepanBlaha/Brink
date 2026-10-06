//! The notch window: placement, click-through, focus and the Win32 fix-ups (Windows only).
//! Other platforms use Tauri's cross-platform APIs so the notch also runs on a Mac for development.

use super::hit_test::{self, HitRect, HitState, SharedHit};
use super::placement::{compute, Edge, Placement, Rect};
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub const LABEL: &str = "notch";

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotchConfig {
    pub edge: Edge,
    /// Strip item count (top edge window width depends on it).
    pub pin_count: u32,
    /// Metrics scale of the size preset: 0.85, 1 or 1.2.
    pub size_scale: f64,
    /// Index into the monitor list; the primary monitor when absent or out of range.
    pub monitor: Option<usize>,
}

impl Default for NotchConfig {
    fn default() -> Self {
        Self {
            edge: Edge::Right,
            pin_count: 5,
            size_scale: 1.0,
            monitor: None,
        }
    }
}

pub struct NotchState {
    pub hit: SharedHit,
    config: Mutex<NotchConfig>,
    placed: Mutex<Option<Placement>>,
}

fn rect_of(p: &tauri::PhysicalPosition<i32>, s: &tauri::PhysicalSize<u32>) -> Rect {
    Rect::new(p.x, p.y, s.width as i32, s.height as i32)
}

/// Monitor frame, work area and scale for the configured monitor (primary fallback).
fn pick_monitor(app: &AppHandle, idx: Option<usize>) -> Option<(Rect, Rect, f64)> {
    let list = app.available_monitors().ok()?;
    let primary = app.primary_monitor().ok().flatten();
    let m = idx
        .and_then(|i| list.get(i).cloned())
        .or(primary)
        .or_else(|| list.first().cloned())?;
    let wa = m.work_area();
    Some((
        rect_of(m.position(), m.size()),
        rect_of(&wa.position, &wa.size),
        m.scale_factor(),
    ))
}

/// Everything that should trigger a re-place when it changes.
fn signature(app: &AppHandle) -> Vec<(Rect, Rect, u64)> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let wa = m.work_area();
            (
                rect_of(m.position(), m.size()),
                rect_of(&wa.position, &wa.size),
                m.scale_factor().to_bits(),
            )
        })
        .collect()
}

/// Size and position the HWND once per placement (never during an animation).
pub fn place(app: &AppHandle) -> Option<Placement> {
    let st = app.state::<NotchState>();
    let cfg = *st.config.lock().unwrap_or_else(|e| e.into_inner());
    let (frame, work, scale) = pick_monitor(app, cfg.monitor)?;
    let p = compute(cfg.edge, frame, work, scale, cfg.pin_count, cfg.size_scale);
    let win = app.get_webview_window(LABEL)?;
    let changed = *st.placed.lock().unwrap_or_else(|e| e.into_inner()) != Some(p);
    if changed {
        let pos = tauri::PhysicalPosition::new(p.frame.x, p.frame.y);
        let size = tauri::PhysicalSize::new(p.frame.w as u32, p.frame.h as u32);
        // Position, size, position again: moving across monitors with different DPI can rescale.
        let _ = win.set_position(pos);
        let _ = win.set_size(size);
        let _ = win.set_position(pos);
        *st.placed.lock().unwrap_or_else(|e| e.into_inner()) = Some(p);
        let _ = app.emit_to(LABEL, "placement://changed", p);
    }
    Some(p)
}

impl NotchState {
    pub fn new() -> Self {
        Self {
            hit: Arc::new(Mutex::new(HitState::default())),
            config: Mutex::new(NotchConfig::default()),
            placed: Mutex::new(None),
        }
    }
}

impl Default for NotchState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn setup(app: &AppHandle) {
    // Usually managed early by `setup_app` so commands racing setup never miss it.
    if app.try_state::<NotchState>().is_none() {
        app.manage(NotchState::new());
    }
    let hit: SharedHit = app.state::<NotchState>().hit.clone();
    let Some(win) = app.get_webview_window(LABEL) else {
        return;
    };
    #[cfg(target_os = "windows")]
    if let Some(raw) = super::win32::raw_hwnd(&win) {
        super::win32::apply_styles(raw);
    }
    // Ignore the mouse until the frontend reports its shape rects.
    let _ = win.set_ignore_cursor_events(true);
    place(app);
    #[cfg(target_os = "windows")]
    if let Some(raw) = super::win32::raw_hwnd(&win) {
        super::win32::show_no_activate(raw);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = win.show();
    hit_test::spawn(app.clone(), LABEL, hit.clone());
    #[cfg(target_os = "windows")]
    super::win32::spawn_extras(app.clone(), LABEL, hit);
    spawn_watcher(app.clone());
}

/// Re-place within about 100 ms when monitors, work area (taskbar) or DPI change.
fn spawn_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = signature(&app);
        loop {
            std::thread::sleep(Duration::from_millis(100));
            let now = signature(&app);
            if now != last {
                last = now;
                place(&app);
            }
        }
    });
}

#[tauri::command]
pub fn notch_configure(
    app: AppHandle,
    state: State<'_, NotchState>,
    config: NotchConfig,
) -> Option<Placement> {
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = config;
    place(&app)
}

#[tauri::command]
pub fn notch_set_hit_rects(state: State<'_, NotchState>, rects: Vec<HitRect>, expanded: bool) {
    let mut h = state.hit.lock().unwrap_or_else(|e| e.into_inner());
    h.rects = rects;
    h.expanded = expanded;
}

/// A drag or resize is running: keep the mouse until it ends.
#[tauri::command]
pub fn notch_capture(state: State<'_, NotchState>, on: bool) {
    state.hit.lock().unwrap_or_else(|e| e.into_inner()).capture = on;
}

#[tauri::command]
pub fn notch_request_focus(app: AppHandle) {
    let Some(win) = app.get_webview_window(LABEL) else {
        return;
    };
    #[cfg(target_os = "windows")]
    if let Some(raw) = super::win32::raw_hwnd(&win) {
        super::win32::request_focus(raw);
    }
    let _ = win.set_focus();
}

#[tauri::command]
pub fn notch_release_focus(app: AppHandle) {
    #[cfg(target_os = "windows")]
    if let Some(raw) = app
        .get_webview_window(LABEL)
        .as_ref()
        .and_then(super::win32::raw_hwnd)
    {
        super::win32::release_focus(raw);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

#[tauri::command]
pub fn notch_reduce_motion() -> bool {
    #[cfg(target_os = "windows")]
    return super::win32::reduce_motion();
    #[cfg(not(target_os = "windows"))]
    false
}

/// Extended window style bits (WebdriverIO asserts TOOLWINDOW | NOACTIVATE | TOPMOST). 0 off Windows.
#[tauri::command]
pub fn debug_window_styles(app: AppHandle) -> u32 {
    #[cfg(target_os = "windows")]
    return app
        .get_webview_window(LABEL)
        .as_ref()
        .and_then(super::win32::raw_hwnd)
        .map_or(0, super::win32::exstyle_bits);
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        0
    }
}
