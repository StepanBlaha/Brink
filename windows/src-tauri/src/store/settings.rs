//! `settings.json` (plan 2.6.5): one flat object with the Mac UserDefaults key names.
//! Missing keys take the default; invalid stored values fall back per key; `set` rejects
//! unknown keys and invalid values.

use super::atomic::{read_json, write_json};
use serde_json::{json, Map, Value};
use std::path::PathBuf;

const EDGES: &[&str] = &["left", "right", "top"];
const PILLS: &[&str] = &["hidden", "dot", "line", "percent"];
const ACCENTS: &[&str] = &[
    "pink", "red", "orange", "yellow", "green", "teal", "blue", "indigo", "purple", "offWhite",
    "system",
];
const SIZES: &[&str] = &["small", "medium", "large"];
const BADGES: &[&str] = &["off", "open", "dueToday"];
const PROGRESS: &[&str] = &["off", "activeGroup", "lastPin"];

enum Kind {
    Enum(&'static [&'static str]),
    Bool,
    Int(i64, i64),
    OptString,
    Display,
    PanelSizes,
    Hotkeys,
}

fn schema() -> Vec<(&'static str, Kind, Value)> {
    use Kind::*;
    vec![
        ("dockEdge", Enum(EDGES), json!("right")),
        ("pillStyle", Enum(PILLS), json!("line")),
        ("pillShowsFraction", Bool, json!(true)),
        ("displayPreference", Display, json!("main")),
        ("accentPreset", Enum(ACCENTS), json!("blue")),
        ("dockSize", Enum(SIZES), json!("medium")),
        ("activeGroupID", OptString, Value::Null),
        ("badgeMode", Enum(BADGES), json!("open")),
        ("pillProgressMode", Enum(PROGRESS), json!("off")),
        ("notchOutline", Bool, json!(true)),
        ("soundsEnabled", Bool, json!(true)),
        ("menuBarListEnabled", Bool, json!(true)),
        ("menuBarShowOpenCount", Bool, json!(false)),
        ("showTodayPin", Bool, json!(true)),
        ("remindersEnabled", Bool, json!(false)),
        ("reminderHour", Int(0, 23), json!(9)),
        ("morningSummaryEnabled", Bool, json!(false)),
        ("morningSummaryMinutes", Int(0, 1439), json!(480)),
        ("peekForReminders", Bool, json!(true)),
        ("lastOpenedPinID", OptString, Value::Null),
        ("quickCaptureLastPinID", OptString, Value::Null),
        ("onboardingCompleted", Bool, json!(false)),
        ("panelSizes", PanelSizes, json!({})),
        ("hotkeys", Hotkeys, default_hotkeys()),
        ("hideInFullScreen", Bool, json!(true)),
    ]
}

pub fn default_hotkeys() -> Value {
    json!({
        "toggleLastPin": "Alt+Space",
        "openPinN": "Alt",
        "quickCapture": "Alt+Shift+Space",
        "clipboardAppend": "Ctrl+Alt+V",
    })
}

fn validate(kind: &Kind, v: &Value) -> Option<Value> {
    match kind {
        Kind::Enum(opts) => v.as_str().filter(|s| opts.contains(s)).map(|_| v.clone()),
        Kind::Bool => v.as_bool().map(|_| v.clone()),
        Kind::Int(lo, hi) => v
            .as_i64()
            .filter(|n| (lo..=hi).contains(&n))
            .map(|_| v.clone()),
        Kind::OptString => match v {
            Value::String(s) if !s.is_empty() => Some(v.clone()),
            Value::String(_) | Value::Null => Some(Value::Null),
            _ => None,
        },
        Kind::Display => v
            .as_str()
            .filter(|s| *s == "main" || *s == "mouse" || s.starts_with("screen:"))
            .map(|_| v.clone()),
        Kind::PanelSizes => {
            let m = v.as_object()?;
            let ok = m.values().all(|a| {
                a.as_array()
                    .is_some_and(|a| a.len() == 2 && a.iter().all(|n| n.is_number()))
            });
            ok.then(|| v.clone())
        }
        Kind::Hotkeys => {
            let m = v.as_object()?;
            m.values().all(Value::is_string).then(|| v.clone())
        }
    }
}

pub struct Settings {
    file: PathBuf,
    /// Explicitly stored (valid) values only.
    stored: Map<String, Value>,
}

impl Settings {
    pub fn open(file: PathBuf) -> Self {
        let raw: Map<String, Value> = read_json(&file).unwrap_or_default();
        let mut stored = Map::new();
        for (key, kind, _) in schema() {
            if let Some(v) = raw.get(key).and_then(|v| validate(&kind, v)) {
                if !v.is_null() {
                    stored.insert(key.to_string(), v);
                }
            }
        }
        Self { file, stored }
    }

    /// The whole object with defaults filled in (absent optionals omitted).
    pub fn get(&self) -> Value {
        let mut out = Map::new();
        for (key, _, default) in schema() {
            match self.stored.get(key) {
                Some(Value::Object(m)) if key == "hotkeys" => {
                    let mut merged = default.as_object().cloned().unwrap_or_default();
                    merged.extend(m.clone());
                    out.insert(key.into(), Value::Object(merged));
                }
                Some(v) => {
                    out.insert(key.into(), v.clone());
                }
                None if !default.is_null() => {
                    out.insert(key.into(), default);
                }
                None => {}
            }
        }
        Value::Object(out)
    }

    pub fn get_key(&self, key: &str) -> Option<Value> {
        self.get().get(key).cloned()
    }

    /// Merges a partial object. All-or-nothing: any bad key or value rejects the whole patch.
    pub fn set(&mut self, partial: &Value) -> Result<Value, String> {
        let patch = partial
            .as_object()
            .ok_or("settings patch must be an object")?;
        let table = schema();
        let mut next = self.stored.clone();
        for (key, v) in patch {
            let (_, kind, _) = table
                .iter()
                .find(|(k, _, _)| k == key)
                .ok_or_else(|| format!("Unknown setting: {key}"))?;
            let ok = validate(kind, v).ok_or_else(|| format!("Invalid value for {key}"))?;
            if ok.is_null() {
                next.remove(key);
            } else {
                next.insert(key.clone(), ok);
            }
        }
        self.stored = next;
        self.save();
        Ok(self.get())
    }

    /// Writes one key without validation of the rest (used by panel sizes).
    pub(super) fn save(&self) {
        if let Err(e) = write_json(&self.file, &self.stored) {
            crate::logging::error(&format!("settings save failed: {e}"));
        }
    }

    pub(super) fn stored_mut(&mut self) -> &mut Map<String, Value> {
        &mut self.stored
    }

    pub(super) fn stored(&self) -> &Map<String, Value> {
        &self.stored
    }
}
