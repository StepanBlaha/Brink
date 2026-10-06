//! Pure notch window placement. Port of NotchGeometry.windowFrame + DockController.positionPanel.
//! All inputs are physical pixels; the window size is derived from logical sizes times `scale`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Edge {
    Left,
    Right,
    Top,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    pub fn new(x: i32, y: i32, w: i32, h: i32) -> Self {
        Self { x, y, w, h }
    }
    pub fn right(&self) -> i32 {
        self.x + self.w
    }
    pub fn bottom(&self) -> i32 {
        self.y + self.h
    }
}

/// Where the window goes, plus what the frontend needs to lay out inside it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub frame: Rect,
    pub edge: Edge,
    pub scale: f64,
    pub window_w: f64,
    pub window_h: f64,
    pub anchor_x: f64,
    pub anchor_y: f64,
}

pub const MAX_PANEL_WIDTH: f64 = 900.0;

/// Strip body length for `pin_count` icons at metrics scale `s` (Theme.Notch.stripMetrics).
pub fn strip_length(pin_count: u32, s: f64) -> f64 {
    let icon = 28.0 * s;
    let spacing = 8.0 * s;
    let n = f64::from(pin_count);
    let icons = n * icon + (n - 1.0).max(0.0) * spacing;
    let add_button = spacing + icon;
    let group_switcher = icon + spacing + 6.0 * s;
    14.0 * s * 2.0 + group_switcher + icons + add_button
}

/// `frame` is the monitor rect, `work` its work area (taskbar excluded). `s` is the metrics
/// scale of the size preset (0.85 / 1 / 1.2); `scale` is the monitor DPI scale.
pub fn compute(
    edge: Edge,
    frame: Rect,
    work: Rect,
    scale: f64,
    pin_count: u32,
    s: f64,
) -> Placement {
    let px = |logical: f64| (logical * scale).round() as i32;
    let work_w = f64::from(work.w) / scale;
    let frame_w = f64::from(frame.w) / scale;
    let (w, h, x, y) = match edge {
        Edge::Left | Edge::Right => {
            let w = px(MAX_PANEL_WIDTH.min(work_w)).min(work.w);
            let h = work.h;
            let x = if edge == Edge::Left {
                work.x
            } else {
                work.right() - w
            };
            (w, h, x, work.y + (work.h - h) / 2)
        }
        Edge::Top => {
            let stripe = strip_length(pin_count, s) + 2.0 * 14.0 * s;
            let lw = frame_w.min((MAX_PANEL_WIDTH + 120.0).max(stripe + 80.0));
            let w = px(lw).min(frame.w);
            // A taskbar on the top edge (not auto-hide) pushes the work area down: stay below it.
            let top = if work.y > frame.y { work.y } else { frame.y };
            let h = work.bottom() - top;
            let want = frame.x + frame.w / 2 - w / 2;
            let x = want.clamp(frame.x, (frame.right() - w).max(frame.x));
            (w, h, x, top)
        }
    };
    let window_w = f64::from(w) / scale;
    let window_h = f64::from(h) / scale;
    Placement {
        frame: Rect::new(x, y, w, h),
        edge,
        scale,
        window_w,
        window_h,
        anchor_x: window_w / 2.0,
        anchor_y: window_h / 2.0,
    }
}

/// An auto-hidden taskbar that slid in (at least 8 px of it on the monitor) over a shape rect.
/// All rects are physical screen pixels.
pub fn taskbar_overlaps(taskbar: Rect, monitor: Rect, shapes: &[Rect]) -> bool {
    let x0 = taskbar.x.max(monitor.x);
    let y0 = taskbar.y.max(monitor.y);
    let x1 = taskbar.right().min(monitor.right());
    let y1 = taskbar.bottom().min(monitor.bottom());
    if x1 - x0 < 1 || y1 - y0 < 1 || (x1 - x0).min(y1 - y0) < 8 {
        return false;
    }
    shapes
        .iter()
        .any(|r| r.x < x1 && r.right() > x0 && r.y < y1 && r.bottom() > y0)
}

/// True when `r` overlaps at least one monitor frame (physical px).
pub fn intersects_any(r: Rect, monitors: &[Rect]) -> bool {
    r.w > 0
        && r.h > 0
        && monitors
            .iter()
            .any(|m| r.x < m.right() && r.right() > m.x && r.y < m.bottom() && r.bottom() > m.y)
}

/// Index of the monitor to use: `want` when in range, else `primary`, else the first.
/// `want` indexes the list with the primary monitor moved to the front (see `primary_first`).
pub fn choose_index(want: Option<usize>, len: usize) -> Option<usize> {
    if len == 0 {
        return None;
    }
    Some(want.filter(|&i| i < len).unwrap_or(0))
}

/// Order that puts the primary monitor (the one whose frame contains (0,0)) first and keeps the
/// rest in enumeration order. The frontend applies the same order to its monitor list.
pub fn primary_first(frames: &[Rect]) -> Vec<usize> {
    let p = frames
        .iter()
        .position(|r| 0 >= r.x && 0 < r.right() && 0 >= r.y && 0 < r.bottom());
    let mut order: Vec<usize> = (0..frames.len()).collect();
    if let Some(p) = p {
        order.remove(p);
        order.insert(0, p);
    }
    order
}

#[cfg(test)]
mod tests {
    use super::*;

    const MON: Rect = Rect {
        x: 0,
        y: 0,
        w: 1920,
        h: 1080,
    };
    const WORK: Rect = Rect {
        x: 0,
        y: 0,
        w: 1920,
        h: 1040,
    };

    #[test]
    fn strip_length_matches_ts() {
        assert_eq!(strip_length(5, 1.0), 278.0);
        assert!((strip_length(0, 1.0) - 28.0 - 42.0 - 36.0).abs() < 1e-9);
    }

    #[test]
    fn right_edge_flush_and_work_height() {
        let p = compute(Edge::Right, MON, WORK, 1.0, 5, 1.0);
        assert_eq!(p.frame, Rect::new(1020, 0, 900, 1040));
        assert_eq!((p.anchor_x, p.anchor_y), (450.0, 520.0));
    }

    #[test]
    fn left_edge_starts_at_work_left() {
        let work = Rect::new(60, 0, 1860, 1080); // taskbar on the left
        let p = compute(Edge::Left, MON, work, 1.0, 5, 1.0);
        assert_eq!(p.frame.x, 60);
        assert_eq!(p.frame.w, 900);
    }

    #[test]
    fn narrow_work_area_limits_width() {
        let m = Rect::new(0, 0, 800, 600);
        let p = compute(Edge::Right, m, m, 1.0, 3, 1.0);
        assert_eq!(p.frame, Rect::new(0, 0, 800, 600));
    }

    #[test]
    fn dpi_150_scales_physical_and_keeps_logical() {
        let mon = Rect::new(0, 0, 2880, 1620);
        let work = Rect::new(0, 0, 2880, 1560);
        let p = compute(Edge::Right, mon, work, 1.5, 5, 1.0);
        assert_eq!(p.frame, Rect::new(2880 - 1350, 0, 1350, 1560));
        assert_eq!((p.window_w, p.window_h), (900.0, 1040.0));
    }

    #[test]
    fn top_edge_centered_above_taskbar_height() {
        let p = compute(Edge::Top, MON, WORK, 1.0, 5, 1.0);
        assert_eq!(p.frame, Rect::new(450, 0, 1020, 1040));
        assert_eq!(p.anchor_x, 510.0);
    }

    #[test]
    fn top_edge_grows_for_many_pins_and_clamps_to_monitor() {
        let p = compute(Edge::Top, MON, WORK, 1.0, 30, 1.0);
        let want = strip_length(30, 1.0) + 28.0 + 80.0;
        assert!((f64::from(p.frame.w) - want.round()).abs() <= 1.0);
        let small = Rect::new(0, 0, 900, 700);
        assert_eq!(compute(Edge::Top, small, small, 1.0, 30, 1.0).frame.w, 900);
    }

    #[test]
    fn top_taskbar_pushes_window_down() {
        let work = Rect::new(0, 48, 1920, 1032);
        let p = compute(Edge::Top, MON, work, 1.0, 5, 1.0);
        assert_eq!((p.frame.y, p.frame.h), (48, 1032));
    }

    #[test]
    fn second_monitor_offset() {
        let mon = Rect::new(1920, -200, 2560, 1440);
        let p = compute(Edge::Right, mon, mon, 1.0, 5, 1.0);
        assert_eq!(p.frame.x, 1920 + 2560 - 900);
        assert_eq!(p.frame.y, -200);
    }

    #[test]
    fn taskbar_overlap_needs_thickness_and_intersection() {
        let shape = Rect::new(1700, 900, 100, 150);
        let bar = Rect::new(0, 1032, 1920, 48);
        assert!(taskbar_overlaps(bar, MON, &[shape]));
        // Hidden: only a 2 px sliver on the monitor.
        assert!(!taskbar_overlaps(
            Rect::new(0, 1078, 1920, 48),
            MON,
            &[shape]
        ));
        // Visible but the shape is elsewhere.
        assert!(!taskbar_overlaps(
            bar,
            MON,
            &[Rect::new(1700, 100, 100, 150)]
        ));
    }

    // Real report: primary 2560x1440 at (0,0) with a 48 px taskbar, plus a portrait monitor to
    // its left with a negative origin.
    const PRI: Rect = Rect {
        x: 0,
        y: 0,
        w: 2560,
        h: 1440,
    };
    const PRI_WORK: Rect = Rect {
        x: 0,
        y: 0,
        w: 2560,
        h: 1392,
    };
    const SEC: Rect = Rect {
        x: -1440,
        y: -603,
        w: 1440,
        h: 2560,
    };
    const SEC_WORK: Rect = Rect {
        x: -1440,
        y: -603,
        w: 1440,
        h: 2512,
    };

    #[test]
    fn two_monitor_layout_every_edge_and_display() {
        let cases = [
            (Edge::Right, PRI, PRI_WORK, Rect::new(1660, 0, 900, 1392)),
            (Edge::Left, PRI, PRI_WORK, Rect::new(0, 0, 900, 1392)),
            (Edge::Top, PRI, PRI_WORK, Rect::new(770, 0, 1020, 1392)),
            (Edge::Right, SEC, SEC_WORK, Rect::new(-900, -603, 900, 2512)),
            (Edge::Left, SEC, SEC_WORK, Rect::new(-1440, -603, 900, 2512)),
            (Edge::Top, SEC, SEC_WORK, Rect::new(-1230, -603, 1020, 2512)),
        ];
        for (edge, mon, work, want) in cases {
            let p = compute(edge, mon, work, 1.0, 5, 1.0);
            assert_eq!(p.frame, want, "{edge:?} on {mon:?}");
            assert!(intersects_any(p.frame, &[PRI, SEC]));
            // Fully inside its own monitor.
            assert!(p.frame.x >= mon.x && p.frame.right() <= mon.right());
            assert!(p.frame.y >= mon.y && p.frame.bottom() <= mon.bottom());
        }
    }

    #[test]
    fn mixed_scale_keeps_frames_inside_each_monitor() {
        // Portrait monitor at 150 %: 2160x3840 physical.
        let sec = Rect::new(-2160, -900, 2160, 3840);
        let p = compute(Edge::Right, sec, sec, 1.5, 5, 1.0);
        assert_eq!(p.frame, Rect::new(-1350, -900, 1350, 3840));
        let p = compute(Edge::Top, PRI, PRI_WORK, 1.25, 5, 1.0);
        assert!(p.frame.x >= 0 && p.frame.right() <= 2560);
    }

    #[test]
    fn primary_is_the_monitor_at_origin_whatever_the_order() {
        assert_eq!(primary_first(&[PRI, SEC]), vec![0, 1]);
        assert_eq!(primary_first(&[SEC, PRI]), vec![1, 0]);
        assert_eq!(primary_first(&[SEC]), vec![0]);
        assert!(primary_first(&[]).is_empty());
    }

    #[test]
    fn choose_index_falls_back_to_primary_slot() {
        assert_eq!(choose_index(None, 2), Some(0));
        assert_eq!(choose_index(Some(1), 2), Some(1));
        assert_eq!(choose_index(Some(5), 2), Some(0));
        assert_eq!(choose_index(Some(0), 0), None);
    }

    #[test]
    fn cursor_choice_with_negative_coordinates() {
        use super::super::overlay::monitor_at;
        let m = [PRI, SEC];
        assert_eq!(monitor_at((100, 100), &m), Some(0));
        assert_eq!(monitor_at((-700, -600), &m), Some(1));
        assert_eq!(monitor_at((-1, 1900), &m), Some(1));
        assert_eq!(monitor_at((-1441, 0), &m), Some(1));
        assert_eq!(monitor_at((2559, 1439), &m), Some(0));
    }

    #[test]
    fn offscreen_frames_are_detected() {
        let m = [PRI, SEC];
        assert!(!intersects_any(Rect::new(5000, 0, 900, 1000), &m));
        assert!(!intersects_any(Rect::new(-3000, -3000, 900, 900), &m));
        assert!(!intersects_any(Rect::new(0, 0, 0, 0), &m));
        assert!(intersects_any(Rect::new(-100, -100, 200, 200), &m));
        assert!(!intersects_any(Rect::new(0, 0, 10, 10), &[]));
    }
}
