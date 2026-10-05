//! Pure tray helpers: flyout placement, tooltip text, menu ids, open/blur race.

use crate::window::placement::Rect;

pub const FLYOUT_SIZE: (f64, f64) = (320.0, 440.0);
const GAP: i32 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Side {
    Bottom,
    Top,
    Left,
    Right,
}

/// Which screen edge the taskbar is on: the work-area edge nearest to the icon's center
/// (negative distance when the icon sits outside the work area, which a visible taskbar causes).
fn taskbar_side(icon: Rect, work: Rect) -> Side {
    let cx = icon.x + icon.w / 2;
    let cy = icon.y + icon.h / 2;
    [
        (work.bottom() - cy, Side::Bottom),
        (cy - work.y, Side::Top),
        (cx - work.x, Side::Left),
        (work.right() - cx, Side::Right),
    ]
    .into_iter()
    .min_by_key(|(d, _)| *d)
    .map(|(_, s)| s)
    .unwrap_or(Side::Bottom)
}

/// Top-left of the flyout (physical px): next to the icon, away from the taskbar, then
/// clamped into the work area. `size` is the physical window size.
pub fn flyout_position(icon: Rect, work: Rect, size: (i32, i32)) -> (i32, i32) {
    let (w, h) = size;
    let cx = icon.x + icon.w / 2;
    let cy = icon.y + icon.h / 2;
    let (x, y) = match taskbar_side(icon, work) {
        Side::Bottom => (cx - w / 2, icon.y - h - GAP),
        Side::Top => (cx - w / 2, icon.bottom() + GAP),
        Side::Left => (icon.right() + GAP, cy - h / 2),
        Side::Right => (icon.x - w - GAP, cy - h / 2),
    };
    let max_x = (work.right() - w).max(work.x);
    let max_y = (work.bottom() - h).max(work.y);
    (x.clamp(work.x, max_x), y.clamp(work.y, max_y))
}

/// Icon rect to use when the flyout is toggled without a click (no rect known yet):
/// a point at the bottom-right corner of the work area.
pub fn fallback_icon(work: Rect) -> Rect {
    Rect::new(work.right() - 24, work.bottom(), 1, 1)
}

/// Tooltip for a count text such as " 7", " 99+" or "".
pub fn tooltip_for(count_text: &str) -> String {
    match count_text.trim() {
        "" => "Brink".to_string(),
        n => format!("Brink \u{b7} {n} open"),
    }
}

/// A tray click right after a blur-hide is the "second click" that should only close.
pub fn should_open(visible: bool, ms_since_blur_hide: Option<u128>) -> bool {
    !visible && ms_since_blur_hide.map_or(true, |ms| ms > 250)
}

/// New `pillStyle` when the "Resting pill" item is chosen (Mac: hide, or show as `line`).
pub fn pill_toggle(current: &str) -> &'static str {
    if current == "hidden" {
        "line"
    } else {
        "hidden"
    }
}

pub fn pill_label(current: &str) -> &'static str {
    if current == "hidden" {
        "Resting pill: Show"
    } else {
        "Resting pill: Hide"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIZE: (i32, i32) = (320, 440);
    // 1920x1080 monitor, 48 px taskbar variants.
    const BOTTOM: Rect = Rect {
        x: 0,
        y: 0,
        w: 1920,
        h: 1032,
    };
    const TOP: Rect = Rect {
        x: 0,
        y: 48,
        w: 1920,
        h: 1032,
    };
    const LEFT: Rect = Rect {
        x: 48,
        y: 0,
        w: 1872,
        h: 1080,
    };
    const RIGHT: Rect = Rect {
        x: 0,
        y: 0,
        w: 1872,
        h: 1080,
    };

    #[test]
    fn taskbar_bottom_opens_above_the_icon() {
        let icon = Rect::new(1700, 1040, 24, 32);
        assert_eq!(flyout_position(icon, BOTTOM, SIZE), (1552, 592));
    }

    #[test]
    fn taskbar_top_opens_below_the_icon() {
        let icon = Rect::new(1700, 8, 24, 32);
        assert_eq!(flyout_position(icon, TOP, SIZE), (1552, 48));
    }

    #[test]
    fn taskbar_left_opens_to_the_right() {
        let icon = Rect::new(8, 900, 32, 24);
        assert_eq!(flyout_position(icon, LEFT, SIZE), (48, 640));
    }

    #[test]
    fn taskbar_right_opens_to_the_left() {
        let icon = Rect::new(1880, 500, 32, 24);
        assert_eq!(flyout_position(icon, RIGHT, SIZE), (1552, 292));
    }

    #[test]
    fn clamps_at_the_screen_edges() {
        let near_right = Rect::new(1890, 1040, 24, 32);
        assert_eq!(flyout_position(near_right, BOTTOM, SIZE).0, 1600);
        let near_left = Rect::new(2, 1040, 24, 32);
        assert_eq!(flyout_position(near_left, BOTTOM, SIZE).0, 0);
        let tall = (320, 2000);
        assert_eq!(
            flyout_position(Rect::new(900, 1040, 24, 32), BOTTOM, tall).1,
            0
        );
    }

    #[test]
    fn auto_hidden_taskbar_uses_nearest_edge() {
        let work = Rect::new(0, 0, 1920, 1080);
        let icon = Rect::new(1700, 1050, 24, 24);
        assert_eq!(flyout_position(icon, work, SIZE), (1552, 602));
    }

    #[test]
    fn second_monitor_with_offset_origin() {
        let work = Rect::new(-1920, 0, 1920, 1032);
        let icon = Rect::new(-200, 1040, 24, 32);
        assert_eq!(flyout_position(icon, work, SIZE), (-348, 592));
    }

    #[test]
    fn tooltip_text() {
        assert_eq!(tooltip_for(""), "Brink");
        assert_eq!(tooltip_for("  "), "Brink");
        assert_eq!(tooltip_for(" 7"), "Brink \u{b7} 7 open");
        assert_eq!(tooltip_for(" 99+"), "Brink \u{b7} 99+ open");
    }

    #[test]
    fn click_right_after_blur_only_closes() {
        assert!(should_open(false, None));
        assert!(should_open(false, Some(900)));
        assert!(!should_open(false, Some(60)));
        assert!(!should_open(true, None));
    }

    #[test]
    fn pill_toggle_matches_the_mac() {
        assert_eq!(pill_toggle("hidden"), "line");
        assert_eq!(pill_toggle("dot"), "hidden");
        assert_eq!(pill_label("hidden"), "Resting pill: Show");
        assert_eq!(pill_label("percent"), "Resting pill: Hide");
        assert_eq!(fallback_icon(BOTTOM), Rect::new(1896, 1032, 1, 1));
    }
}
