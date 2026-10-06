//! Pure coordinate math for the notch hit test. Frontend rects are CSS px relative to the webview;
//! the cursor and the window are physical px in virtual-desktop space (negative left of / above
//! the primary monitor).

use super::hit_test::HitRect;

/// A physical-pixel rect.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PhysRect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// Decodes a mouse `lParam` (screen coords) like GET_X_LPARAM / GET_Y_LPARAM: each half is a
/// SIGNED 16-bit value, so monitors left of or above the primary give negative coordinates.
#[allow(dead_code)]
pub fn lparam_point(lparam: isize) -> (i32, i32) {
    let x = (lparam & 0xFFFF) as u16 as i16;
    let y = ((lparam >> 16) & 0xFFFF) as u16 as i16;
    (i32::from(x), i32::from(y))
}

/// The scale to trust: the webview's devicePixelRatio (what CSS px really mean), else the window's
/// DPI, else the cached one. Non-finite or non-positive values are skipped.
pub fn pick_scale(webview: f64, window: Option<f64>, cached: f64) -> f64 {
    let ok = |s: f64| s.is_finite() && s > 0.0;
    if ok(webview) {
        return webview;
    }
    match window {
        Some(s) if ok(s) => s,
        _ if ok(cached) => cached,
        _ => 1.0,
    }
}

/// CSS-px rect inside the webview -> physical rect on the virtual desktop. Edges are rounded, not
/// the size, so neighbouring rects stay flush.
pub fn css_to_physical(r: &HitRect, origin: (i32, i32), scale: f64) -> PhysRect {
    let left = origin.0 + (r.x * scale).round() as i32;
    let top = origin.1 + (r.y * scale).round() as i32;
    let right = origin.0 + ((r.x + r.w) * scale).round() as i32;
    let bottom = origin.1 + ((r.y + r.h) * scale).round() as i32;
    PhysRect {
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
    }
}

/// Physical cursor -> webview-local CSS px.
pub fn cursor_to_css(cursor: (f64, f64), origin: (i32, i32), scale: f64) -> (f64, f64) {
    (
        (cursor.0 - f64::from(origin.0)) / scale,
        (cursor.1 - f64::from(origin.1)) / scale,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lp(x: i16, y: i16) -> isize {
        (((y as u16 as u32) << 16) | (x as u16 as u32)) as isize
    }

    #[test]
    fn lparam_decodes_signed_coordinates() {
        assert_eq!(lparam_point(lp(100, 200)), (100, 200));
        assert_eq!(lparam_point(lp(-1440, -603)), (-1440, -603));
        assert_eq!(lparam_point(lp(-1, 0)), (-1, 0));
        assert_eq!(lparam_point(lp(2559, 1439)), (2559, 1439));
        // 64-bit lParam with garbage in the high half must not leak in.
        assert_eq!(lparam_point(lp(-5, -7) | (0x1234 << 32)), (-5, -7));
    }

    #[test]
    fn css_to_physical_at_all_scales() {
        let r = HitRect {
            x: 10.0,
            y: 20.0,
            w: 100.0,
            h: 50.0,
        };
        for (s, want) in [
            (1.0, (10, 20, 100, 50)),
            (1.25, (13, 25, 125, 63)),
            (1.5, (15, 30, 150, 75)),
            (2.0, (20, 40, 200, 100)),
        ] {
            let p = css_to_physical(&r, (0, 0), s);
            assert_eq!((p.x, p.y, p.w, p.h), want, "scale {s}");
        }
    }

    #[test]
    fn css_to_physical_adds_positive_and_negative_origins() {
        let r = HitRect {
            x: 10.0,
            y: 20.0,
            w: 100.0,
            h: 50.0,
        };
        let a = css_to_physical(&r, (2000, 100), 1.5);
        assert_eq!((a.x, a.y, a.w, a.h), (2015, 130, 150, 75));
        let b = css_to_physical(&r, (-1440, -603), 1.25);
        assert_eq!((b.x, b.y, b.w, b.h), (-1427, -578, 125, 63));
        let c = css_to_physical(&r, (-1440, -603), 2.0);
        assert_eq!((c.x, c.y), (-1420, -563));
    }

    #[test]
    fn cursor_round_trips_through_the_rect_conversion() {
        let r = HitRect {
            x: 40.0,
            y: 60.0,
            w: 56.0,
            h: 200.0,
        };
        for scale in [1.0, 1.25, 1.5, 2.0] {
            for origin in [(2304, 400), (-1440, -603)] {
                let p = css_to_physical(&r, origin, scale);
                let cur = (f64::from(p.x + p.w / 2), f64::from(p.y + p.h / 2));
                let (x, y) = cursor_to_css(cur, origin, scale);
                assert!(x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
            }
        }
    }

    #[test]
    fn pick_scale_prefers_webview_then_window() {
        assert_eq!(pick_scale(1.25, Some(1.5), 1.0), 1.25);
        assert_eq!(pick_scale(0.0, Some(1.5), 1.0), 1.5);
        assert_eq!(pick_scale(f64::NAN, None, 2.0), 2.0);
        assert_eq!(pick_scale(0.0, None, 0.0), 1.0);
    }
}
