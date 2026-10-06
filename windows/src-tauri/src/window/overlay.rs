//! Placement for the small overlay windows (capture, toast): centered horizontally on the work
//! area of the monitor under the cursor, a fixed logical distance below its top edge.

use super::placement::{primary_first, Rect};
use tauri::{AppHandle, WebviewWindow};

pub const CAPTURE_SIZE: (f64, f64) = (560.0, 150.0);
pub const CAPTURE_TOP: f64 = 90.0;
pub const TOAST_SIZE: (f64, f64) = (420.0, 64.0);
pub const TOAST_TOP: f64 = 36.0;

/// Index of the monitor frame containing the cursor (physical px), else the nearest by center.
pub fn monitor_at(cursor: (i32, i32), frames: &[Rect]) -> Option<usize> {
    let inside = frames.iter().position(|r| {
        cursor.0 >= r.x && cursor.0 < r.right() && cursor.1 >= r.y && cursor.1 < r.bottom()
    });
    inside.or_else(|| {
        let dist = |r: &Rect| {
            let dx = i64::from(cursor.0 - (r.x + r.w / 2));
            let dy = i64::from(cursor.1 - (r.y + r.h / 2));
            dx * dx + dy * dy
        };
        (0..frames.len()).min_by_key(|&i| dist(&frames[i]))
    })
}

/// Physical frame for a window of `size` logical px, `top` logical px below the work-area top.
pub fn top_center(work: Rect, scale: f64, size: (f64, f64), top: f64) -> Rect {
    let w = (size.0 * scale).round() as i32;
    let h = (size.1 * scale).round() as i32;
    let x = work.x + (work.w - w) / 2;
    let y = work.y + (top * scale).round() as i32;
    Rect::new(x, y, w, h)
}

/// `(frame, work, scale)` of the monitor containing (or nearest to) a physical point.
pub fn monitor_at_point(app: &AppHandle, pt: Option<(i32, i32)>) -> Option<(Rect, Rect, f64)> {
    let monitors = app.available_monitors().ok()?;
    let to_rect = |p: &tauri::PhysicalPosition<i32>, s: &tauri::PhysicalSize<u32>| {
        Rect::new(p.x, p.y, s.width as i32, s.height as i32)
    };
    let frames: Vec<Rect> = monitors
        .iter()
        .map(|m| to_rect(m.position(), m.size()))
        .collect();
    let idx = pt
        .and_then(|p| monitor_at(p, &frames))
        .or_else(|| primary_first(&frames).first().copied())?;
    let m = &monitors[idx];
    let wa = m.work_area();
    Some((
        frames[idx],
        to_rect(&wa.position, &wa.size),
        m.scale_factor(),
    ))
}

/// Same for the monitor under the mouse cursor.
pub fn cursor_monitor(app: &AppHandle) -> Option<(Rect, Rect, f64)> {
    let cursor = app.cursor_position().ok().map(|c| (c.x as i32, c.y as i32));
    monitor_at_point(app, cursor)
}

/// Moves and sizes `win` onto the cursor's monitor (position, size, position again for mixed DPI).
pub fn place(app: &AppHandle, win: &WebviewWindow, size: (f64, f64), top: f64) {
    let Some((_, work, scale)) = cursor_monitor(app) else {
        return;
    };
    let r = top_center(work, scale, size, top);
    let pos = tauri::PhysicalPosition::new(r.x, r.y);
    let _ = win.set_position(pos);
    let _ = win.set_size(tauri::PhysicalSize::new(r.w as u32, r.h as u32));
    let _ = win.set_position(pos);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mixed() -> Vec<Rect> {
        vec![
            Rect::new(0, 0, 1920, 1080),
            Rect::new(1920, -200, 2560, 1440),
            Rect::new(-1280, 100, 1280, 1024),
        ]
    }

    #[test]
    fn picks_monitor_under_cursor() {
        let m = mixed();
        assert_eq!(monitor_at((10, 10), &m), Some(0));
        assert_eq!(monitor_at((2000, -100), &m), Some(1));
        assert_eq!(monitor_at((-5, 500), &m), Some(2));
    }

    #[test]
    fn falls_back_to_nearest() {
        let m = mixed();
        assert_eq!(monitor_at((1919, 1500), &m), Some(0));
        assert_eq!(monitor_at((9999, 0), &m), Some(1));
        assert_eq!(monitor_at((0, 0), &[]), None);
    }

    #[test]
    fn capture_is_centered_90_below_work_top() {
        let work = Rect::new(0, 0, 1920, 1040);
        assert_eq!(
            top_center(work, 1.0, CAPTURE_SIZE, CAPTURE_TOP),
            Rect::new(680, 90, 560, 150)
        );
    }

    #[test]
    fn work_area_offset_and_dpi_scale() {
        // Second monitor at 150 %, taskbar on top (work starts 60 px lower).
        let work = Rect::new(1920, -140, 2560, 1380);
        let r = top_center(work, 1.5, CAPTURE_SIZE, CAPTURE_TOP);
        assert_eq!(r, Rect::new(1920 + (2560 - 840) / 2, -140 + 135, 840, 225));
    }

    #[test]
    fn toast_is_420_wide_36_below() {
        let work = Rect::new(-1280, 100, 1280, 984);
        assert_eq!(
            top_center(work, 1.0, TOAST_SIZE, TOAST_TOP),
            Rect::new(-1280 + 430, 136, 420, 64)
        );
    }
}
