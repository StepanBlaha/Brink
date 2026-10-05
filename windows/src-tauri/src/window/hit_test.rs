//! Click-through for the transparent notch window. The window ignores the mouse unless the
//! cursor is over one of the hit rects the frontend sends. A poll thread decides (the OS cannot
//! hit-test a transparent WebView per pixel) and forwards pointer and outside-click events.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// Window-local logical rect (top-left origin).
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Default)]
pub struct HitState {
    pub rects: Vec<HitRect>,
    /// A drag or resize is in progress: keep the mouse until it ends.
    pub capture: bool,
    /// The panel is expanded: report outside clicks.
    pub expanded: bool,
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

pub fn spawn(app: AppHandle, label: &'static str, state: SharedHit) {
    std::thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        let mut last = (f64::NAN, f64::NAN, false);
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
            let (Ok(cur), Ok(pos)) = (win.cursor_position(), win.outer_position()) else {
                continue;
            };
            let scale = win.scale_factor().unwrap_or(1.0);
            let x = (cur.x - f64::from(pos.x)) / scale;
            let y = (cur.y - f64::from(pos.y)) / scale;
            let (inside, expanded, near) = {
                let st = state.lock().unwrap_or_else(|e| e.into_inner());
                let inside = st.capture || contains(&st.rects, x, y);
                (inside, st.expanded, distance(&st.rects, x, y) < 200.0)
            };
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
}
