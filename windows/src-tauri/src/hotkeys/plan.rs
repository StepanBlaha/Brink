//! Pure planning: settings.hotkeys map -> concrete accelerators to register.

use super::accel::{expand_open_pin, parse};
use std::collections::BTreeMap;

pub const ACTIONS: &[&str] = &[
    "toggleLastPin",
    "openPinN",
    "quickCapture",
    "clipboardAppend",
];
pub const E_UNKNOWN: &str = "unknown";

pub struct Planned {
    pub action: String,
    /// `(index for openPinN, canonical accelerator)` or an error code.
    pub entries: Result<Vec<(Option<usize>, String)>, &'static str>,
}

pub fn plan(bindings: &BTreeMap<String, String>) -> Vec<Planned> {
    bindings
        .iter()
        .filter(|(_, v)| !v.trim().is_empty())
        .map(|(action, value)| {
            let entries = if !ACTIONS.contains(&action.as_str()) {
                Err(E_UNKNOWN)
            } else if action == "openPinN" {
                expand_open_pin(value).map(|v| v.into_iter().map(|(i, a)| (Some(i), a)).collect())
            } else {
                parse(value).map(|a| vec![(None, a.canonical())])
            };
            Planned {
                action: action.clone(),
                entries,
            }
        })
        .collect()
}

/// Collapses per-accelerator outcomes of one action into `(ok, error, first failing accelerator)`.
pub fn aggregate(outcomes: &[(String, bool)]) -> (bool, Option<&'static str>, Option<String>) {
    match outcomes.iter().find(|(_, ok)| !ok) {
        Some((a, _)) => (false, Some("inUse"), Some(a.clone())),
        None => (true, None, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn defaults_plan_to_twelve_accelerators() {
        let p = plan(&map(&[
            ("toggleLastPin", "Alt+Space"),
            ("openPinN", "Alt"),
            ("quickCapture", "Alt+Shift+Space"),
            ("clipboardAppend", "Ctrl+Alt+V"),
        ]));
        let n: usize = p.iter().map(|p| p.entries.as_ref().unwrap().len()).sum();
        assert_eq!(n, 12);
    }

    #[test]
    fn bad_and_unknown_entries_carry_codes() {
        let p = plan(&map(&[
            ("quickCapture", "Win+Q"),
            ("nope", "Alt+X"),
            ("toggleLastPin", ""),
        ]));
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].entries.as_ref().err(), Some(&"unknown"));
        assert_eq!(p[1].entries.as_ref().err(), Some(&"winKey"));
    }

    #[test]
    fn aggregate_reports_first_failure() {
        let o = vec![("Alt+1".into(), true), ("Alt+2".into(), false)];
        assert_eq!(
            aggregate(&o),
            (false, Some("inUse"), Some("Alt+2".to_string()))
        );
        assert_eq!(aggregate(&[]), (true, None, None));
    }
}
