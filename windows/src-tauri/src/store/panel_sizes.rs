//! Per-pin expanded panel sizes (port of PanelSizeStore.swift) kept in `settings.panelSizes`.

use super::settings::Settings;
use serde_json::{json, Map, Value};

pub const MIN_WIDTH: f64 = 300.0;
pub const MAX_WIDTH: f64 = 900.0;
pub const MIN_HEIGHT: f64 = 240.0;

/// Clamps to 300..=900 wide and 240..=`max_height` tall; minimums always win.
pub fn clamp(w: f64, h: f64, max_width: f64, max_height: f64) -> (f64, f64) {
    let cw = w
        .max(MIN_WIDTH)
        .min(MIN_WIDTH.max(MAX_WIDTH.min(max_width)));
    let ch = h.max(MIN_HEIGHT).min(MIN_HEIGHT.max(max_height));
    (cw, ch)
}

fn table(s: &Settings) -> Map<String, Value> {
    s.stored()
        .get("panelSizes")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn put(s: &mut Settings, t: Map<String, Value>) {
    s.stored_mut().insert("panelSizes".into(), Value::Object(t));
    s.save();
}

/// The stored size re-clamped to the current limits; `None` means "use default".
pub fn get(s: &Settings, pin_id: &str, max_w: f64, max_h: f64) -> Option<(f64, f64)> {
    let a = table(s).get(pin_id)?.as_array()?.clone();
    let (w, h) = (a.first()?.as_f64()?, a.get(1)?.as_f64()?);
    Some(clamp(w, h, max_w, max_h))
}

pub fn set(s: &mut Settings, pin_id: &str, w: f64, h: f64, max_w: f64, max_h: f64) -> (f64, f64) {
    let (cw, ch) = clamp(w, h, max_w, max_h);
    let mut t = table(s);
    t.insert(pin_id.to_string(), json!([cw, ch]));
    put(s, t);
    (cw, ch)
}

pub fn reset(s: &mut Settings, pin_id: &str) {
    let mut t = table(s);
    t.remove(pin_id);
    put(s, t);
}

pub fn has(s: &Settings, pin_id: &str) -> bool {
    table(s).contains_key(pin_id)
}
