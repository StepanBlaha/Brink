//! Click-through for the transparent notch window. The window ignores the mouse unless the
//! cursor is over one of the hit rects the frontend sends. A poll thread decides (the OS cannot
//! hit-test a transparent WebView per pixel) and forwards pointer and outside-click events.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use super::coords::{css_to_physical, cursor_to_css, pick_scale};
use tauri::{AppHandle, Emitter, Manager};

/// Window-local logical rect (top-left origin).
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// How long the previous rects still count after a shape change (the shape morphs and the new
/// rects reach Rust through an async invoke).
pub const GRACE: Duration = Duration::from_millis(400);

#[derive(Debug, Default)]
pub struct HitState {
    pub rects: Vec<HitRect>,
    /// Rects from before the last change; honoured for `GRACE` so a growing shape never drops the cursor.
    pub prev_rects: Vec<HitRect>,
    pub changed_at: Option<Instant>,
    /// Bumped on every rect change so the poll thread re-sends the pointer.
    pub rev: u64,
    /// The webview's devicePixelRatio (CSS px -> physical px); 0 until the frontend reports it.
    pub scale: f64,
    /// A drag or resize is in progress: keep the mouse until it ends.
    pub capture: bool,
    /// The panel is expanded: report outside clicks.
    pub expanded: bool,
}

impl HitState {
    pub fn set_rects(&mut self, rects: Vec<HitRect>, expanded: bool, scale: f64, now: Instant) {
        if rects != self.rects {
            let old = std::mem::replace(&mut self.rects, rects);
            if self.recent(now) {
                self.prev_rects.extend(old);
            } else {
                self.prev_rects = old;
            }
            self.changed_at = Some(now);
            self.rev += 1;
        }
        self.expanded = expanded;
        self.scale = scale;
    }

    fn recent(&self, now: Instant) -> bool {
        match self.changed_at {
            Some(t) => now.duration_since(t) < GRACE,
            None => false,
        }
    }

    /// Cursor (CSS px) is over the current rects, or over the previous ones during the grace window.
    pub fn is_inside(&self, x: f64, y: f64, now: Instant) -> bool {
        self.capture
            || contains(&self.rects, x, y)
            || (self.recent(now) && contains(&self.prev_rects, x, y))
    }
}

pub type SharedHit = Arc<Mutex<HitState>>;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct PointerEvent {
    pub inside: bool,
    pub x: f64,
    pub y: f64,
}

pub fn contains(rects: &[HitRect], x: f64, y: f64) -> bool {
    rects
        .iter()
        .any(|r| x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)
}

/// Distance from a point to the nearest rect (0 inside).
pub fn distance(rects: &[HitRect], x: f64, y: f64) -> f64 {
    rects
        .iter()
        .map(|r| {
            let dx = (r.x - x).max(0.0).max(x - (r.x + r.w));
            let dy = (r.y - y).max(0.0).max(y - (r.y + r.h));
            dx.hypot(dy)
        })
        .fold(f64::INFINITY, f64::min)
}

/// 60 Hz normally; 10 Hz once the cursor has stayed over 200 px from every rect for 1 s.
pub fn poll_interval(far_for: Duration) -> Duration {
    if far_for >= Duration::from_secs(1) {
        Duration::from_millis(100)
    } else {
        Duration::from_millis(16)
    }
}

/// Left/right button went down while expanded and the cursor was outside every rect.
pub fn is_outside_click(expanded: bool, was_down: bool, down: bool, inside: bool) -> bool {
    expanded && down && !was_down && !inside
}

#[cfg(target_os = "windows")]
fn window_dpi(win: &tauri::WebviewWindow) -> Option<f64> {
    super::win32::raw_hwnd(win).and_then(super::win32::dpi_scale)
}

#[cfg(not(target_os = "windows"))]
fn window_dpi(_: &tauri::WebviewWindow) -> Option<f64> {
    None
}

/// Where the window and cursor are right now, in physical px.
struct Snapshot {
    scale: f64,
    origin: (i32, i32),
    cursor: (f64, f64),
}

fn snapshot(win: &tauri::WebviewWindow, reported: f64) -> Option<Snapshot> {
    let cur = win.cursor_position().ok()?;
    let pos = match win.inner_position() {
        Ok(p) => p,
        Err(_) => win.outer_position().ok()?,
    };
    let scale = pick_scale(reported, window_dpi(win), win.scale_factor().unwrap_or(1.0));
    Some(Snapshot {
        scale,
        origin: (pos.x, pos.y),
        cursor: (cur.x, cur.y),
    })
}

/// INFO line on every phase change: reason, scales, hit rect count/size (physical), cursor.
pub fn log_phase(app: &AppHandle, label: &str, state: &SharedHit, phase: &str, reason: &str) {
    let Some(win) = app.get_webview_window(label) else {
        return;
    };
    let (reported, rects) = {
        let st = state.lock().unwrap_or_else(|e| e.into_inner());
        (st.scale, st.rects.clone())
    };
    let Some(s) = snapshot(&win, reported) else {
        return;
    };
    let sizes: Vec<String> = rects
        .iter()
        .map(|r| css_to_physical(r, s.origin, s.scale))
        .map(|p| format!("{}x{}", p.w, p.h))
        .collect();
    crate::logging::info(&format!(
        "notch phase={phase} reason={reason} scale={} (dpr {reported}, tao {}) origin={},{} rects={} [{}] cursor={},{}",
        s.scale,
        win.scale_factor().unwrap_or(0.0),
        s.origin.0,
        s.origin.1,
        rects.len(),
        sizes.join(" "),
        s.cursor.0.round(),
        s.cursor.1.round()
    ));
}

pub fn spawn(app: AppHandle, label: &'static str, state: SharedHit) {
    std::thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        let mut last = (f64::NAN, f64::NAN, false);
        let mut last_rev = 0;
        let mut was_down = false;
        let mut far_since: Option<Instant> = None;
        loop {
            let far_for = far_since.map_or(Duration::ZERO, |t| t.elapsed());
            std::thread::sleep(poll_interval(far_for));
            let Some(win) = app.get_webview_window(label) else {
                continue;
            };
            if !win.is_visible().unwrap_or(false) {
                continue;
            }
            let reported = state.lock().unwrap_or_else(|e| e.into_inner()).scale;
            let Some(snap) = snapshot(&win, reported) else {
                continue;
            };
            let (x, y) = cursor_to_css(snap.cursor, snap.origin, snap.scale);
            let (inside, expanded, near, rev) = {
                let st = state.lock().unwrap_or_else(|e| e.into_inner());
                let inside = st.is_inside(x, y, Instant::now());
                (inside, st.expanded, distance(&st.rects, x, y) < 200.0, st.rev)
            };
            if rev != last_rev {
                last_rev = rev;
                last = (f64::NAN, f64::NAN, false);
            }
            far_since = if near {
                None
            } else {
                far_since.or_else(|| Some(Instant::now()))
            };
            if ignoring != Some(!inside) {
                ignoring = Some(!inside);
                let _ = win.set_ignore_cursor_events(!inside);
            }
            if near && (x, y, inside) != last {
                last = (x, y, inside);
                let _ = app.emit_to(label, "notch://pointer", PointerEvent { inside, x, y });
            }
            let down = super::native::any_mouse_button_down();
            if is_outside_click(expanded, was_down, down, inside) {
                let _ = app.emit_to(label, "notch://outside-click", ());
            }
            was_down = down;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const R: HitRect = HitRect {
        x: 10.0,
        y: 10.0,
        w: 100.0,
        h: 50.0,
    };

    #[test]
    fn contains_is_half_open() {
        assert!(contains(&[R], 10.0, 10.0));
        assert!(!contains(&[R], 110.0, 30.0));
        assert!(!contains(&[], 0.0, 0.0));
    }

    #[test]
    fn contains_any_of_several_rects() {
        let peek = HitRect {
            x: 300.0,
            y: 300.0,
            w: 50.0,
            h: 50.0,
        };
        assert!(contains(&[R, peek], 310.0, 310.0));
    }

    #[test]
    fn distance_to_nearest() {
        assert_eq!(distance(&[R], 50.0, 30.0), 0.0);
        assert_eq!(distance(&[R], 0.0, 30.0), 10.0);
        assert_eq!(distance(&[R], 113.0, 64.0), 5.0);
        assert!(distance(&[], 0.0, 0.0).is_infinite());
    }

    #[test]
    fn polling_slows_when_far() {
        assert_eq!(poll_interval(Duration::ZERO), Duration::from_millis(16));
        assert_eq!(
            poll_interval(Duration::from_secs(2)),
            Duration::from_millis(100)
        );
    }

    #[test]
    fn outside_click_needs_fresh_press_outside_while_expanded() {
        assert!(is_outside_click(true, false, true, false));
        assert!(!is_outside_click(true, true, true, false));
        assert!(!is_outside_click(true, false, true, true));
        assert!(!is_outside_click(false, false, true, false));
    }

    #[test]
    fn morphing_keeps_old_and_new_rects_for_the_grace_window() {
        let t0 = Instant::now();
        let mut st = HitState::default();
        let small = HitRect {
            x: 300.0,
            y: 100.0,
            w: 56.0,
            h: 100.0,
        };
        let big = HitRect {
            x: 0.0,
            y: 0.0,
            w: 400.0,
            h: 560.0,
        };
        st.set_rects(vec![small], false, 1.5, t0);
        // Strip grows into the big panel: the cursor on the old strip stays inside, and so does
        // anywhere in the new panel.
        let t1 = t0 + Duration::from_secs(5);
        st.set_rects(vec![big], true, 1.5, t1);
        assert!(st.is_inside(310.0, 110.0, t1 + Duration::from_millis(10)));
        assert!(st.is_inside(30.0, 30.0, t1 + Duration::from_millis(10)));
        // Panel folds back: the cursor over the old panel survives the grace window only.
        let t2 = t1 + Duration::from_secs(5);
        st.set_rects(vec![small], false, 1.5, t2);
        assert!(st.is_inside(30.0, 30.0, t2 + GRACE / 2));
        assert!(!st.is_inside(30.0, 30.0, t2 + GRACE + Duration::from_millis(1)));
        assert!(st.is_inside(310.0, 110.0, t2 + GRACE * 2));
    }

    #[test]
    fn hover_out_when_the_cursor_leaves_both_old_and_new_rects() {
        let t0 = Instant::now();
        let mut st = HitState::default();
        st.set_rects(vec![R], false, 1.0, t0);
        let other = HitRect {
            x: 200.0,
            y: 10.0,
            w: 50.0,
            h: 50.0,
        };
        st.set_rects(vec![R, other], false, 1.0, t0);
        assert!(!st.is_inside(500.0, 500.0, t0));
        st.capture = true;
        assert!(st.is_inside(500.0, 500.0, t0));
    }

    #[test]
    fn rect_change_bumps_rev_and_same_rects_do_not() {
        let t = Instant::now();
        let mut st = HitState::default();
        st.set_rects(vec![R], false, 1.0, t);
        let rev = st.rev;
        st.set_rects(vec![R], true, 1.0, t);
        assert_eq!(st.rev, rev);
        st.set_rects(vec![], true, 1.0, t);
        assert_eq!(st.rev, rev + 1);
        assert!(st.expanded);
    }
}
