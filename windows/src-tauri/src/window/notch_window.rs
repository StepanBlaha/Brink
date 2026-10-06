//! The notch window: placement, click-through, focus and the Win32 fix-ups (Windows only).
//! Other platforms use Tauri's cross-platform APIs so the notch also runs on a Mac for development.

use super::hit_test::{self, HitRect, HitState, SharedHit};
use super::placement::{
    choose_index, compute, intersects_any, primary_first, Edge, Placement, Rect,
};
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

/// Monitor list with the primary one first; the same order the frontend uses for indices.
fn ordered_monitors(app: &AppHandle) -> Vec<tauri::Monitor> {
    let list = app.available_monitors().unwrap_or_default();
    let frames: Vec<Rect> = list
        .iter()
        .map(|m| rect_of(m.position(), m.size()))
        .collect();
    primary_first(&frames)
        .into_iter()
        .map(|i| list[i].clone())
        .collect()
}

type Screen = (String, Rect, Rect, f64);

fn screen_of(m: &tauri::Monitor) -> Screen {
    let wa = m.work_area();
    (
        m.name().cloned().unwrap_or_default(),
        rect_of(m.position(), m.size()),
        rect_of(&wa.position, &wa.size),
        m.scale_factor(),
    )
}

/// Everything that should trigger a re-place when it changes.
fn signature(app: &AppHandle) -> Vec<(Rect, Rect, u64)> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let (_, f, w, s) = screen_of(m);
            (f, w, s.to_bits())
        })
        .collect()
}

fn log_placement(screens: &[Screen], idx: usize, cfg: &NotchConfig, p: &Placement, vis: bool) {
    for (i, (name, f, w, s)) in screens.iter().enumerate() {
        crate::logging::info(&format!(
            "notch monitor {i}: name={name} rect={},{} {}x{} work={},{} {}x{} scale={s}",
            f.x, f.y, f.w, f.h, w.x, w.y, w.w, w.h
        ));
    }
    let r = p.frame;
    crate::logging::info(&format!(
        "notch placed: monitor={idx} (cfg {:?}) edge={:?} frame={},{} {}x{} scale={} visible={vis}",
        cfg.monitor, p.edge, r.x, r.y, r.w, r.h, p.scale
    ));
}

/// Size and position the HWND once per placement (never during an animation).
pub fn place(app: &AppHandle) -> Option<Placement> {
    let st = app.state::<NotchState>();
    let cfg = *st.config.lock().unwrap_or_else(|e| e.into_inner());
    let monitors = ordered_monitors(app);
    let screens: Vec<Screen> = monitors.iter().map(screen_of).collect();
    let idx = choose_index(cfg.monitor, screens.len())?;
    let (_, frame, work, scale) = screens[idx].clone();
    let mut p = compute(cfg.edge, frame, work, scale, cfg.pin_count, cfg.size_scale);
    let frames: Vec<Rect> = screens.iter().map(|s| s.1).collect();
    let mut shown = idx;
    if !intersects_any(p.frame, &frames) {
        let (_, f, w, s) = screens[0].clone();
        crate::logging::warn(&format!(
            "notch frame {:?} is outside every monitor; falling back to the primary monitor's right edge",
            p.frame
        ));
        p = compute(Edge::Right, f, w, s, cfg.pin_count, cfg.size_scale);
        shown = 0;
    }
    let win = app.get_webview_window(LABEL)?;
    let changed = *st.placed.lock().unwrap_or_else(|e| e.into_inner()) != Some(p);
    if changed {
        apply_frame(&win, p.frame);
        *st.placed.lock().unwrap_or_else(|e| e.into_inner()) = Some(p);
        log_placement(&screens, shown, &cfg, &p, win.is_visible().unwrap_or(false));
        let _ = app.emit_to(LABEL, "placement://changed", p);
    }
    Some(p)
}

/// Position, size, position again: moving across monitors with different DPI can rescale.
fn apply_frame(win: &tauri::WebviewWindow, r: Rect) {
    let pos = tauri::PhysicalPosition::new(r.x, r.y);
    let size = tauri::PhysicalSize::new(r.w.max(1) as u32, r.h.max(1) as u32);
    let _ = win.set_position(pos);
    let _ = win.set_size(size);
    let _ = win.set_position(pos);
}

/// WM_DPICHANGED (window crossed onto another DPI) can leave tao with a rescaled rect. When the
/// real outer rect differs from the placement, re-apply it (a few times, then give up and log).
fn verify(app: &AppHandle, tries: &mut u32) {
    let st = app.state::<NotchState>();
    let Some(want) = st
        .placed
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .map(|p| p.frame)
    else {
        return;
    };
    let Some(win) = app.get_webview_window(LABEL) else {
        return;
    };
    let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else {
        return;
    };
    let got = rect_of(&pos, &size);
    if got == want {
        *tries = 0;
        return;
    }
    if *tries < 5 {
        *tries += 1;
        crate::logging::info(&format!(
            "notch frame drifted: want {},{} {}x{} got {},{} {}x{}; re-applying ({tries}/5)",
            want.x, want.y, want.w, want.h, got.x, got.y, got.w, got.h
        ));
        apply_frame(&win, want);
    }
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
    crate::logging::info(&format!(
        "notch window shown (visible={})",
        win.is_visible().unwrap_or(false)
    ));
    hit_test::spawn(app.clone(), LABEL, hit.clone());
    #[cfg(target_os = "windows")]
    super::win32::spawn_extras(app.clone(), LABEL, hit);
    spawn_watcher(app.clone());
}

/// Re-place within about 100 ms when monitors, work area (taskbar) or DPI change.
fn spawn_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = signature(&app);
        let (mut tries, mut ticks) = (0u32, 0u32);
        loop {
            std::thread::sleep(Duration::from_millis(100));
            let now = signature(&app);
            if now != last {
                last = now;
                tries = 0;
                place(&app);
            }
            ticks = ticks.wrapping_add(1);
            if ticks % 5 == 0 {
                verify(&app, &mut tries);
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

/// `scale` is the webview's devicePixelRatio (CSS px -> physical px); 0 when unknown.
#[tauri::command]
pub fn notch_set_hit_rects(
    state: State<'_, NotchState>,
    rects: Vec<HitRect>,
    expanded: bool,
    scale: Option<f64>,
) {
    let mut h = state.hit.lock().unwrap_or_else(|e| e.into_inner());
    h.set_rects(
        rects,
        expanded,
        scale.unwrap_or(0.0),
        std::time::Instant::now(),
    );
}

/// Frontend phase change (resting / strip / expanded) with its reason, for the log.
#[tauri::command]
pub fn notch_log_phase(
    app: AppHandle,
    state: State<'_, NotchState>,
    phase: String,
    reason: String,
) {
    hit_test::log_phase(&app, LABEL, &state.hit, &phase, &reason);
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
