//! Pure accelerator parsing and validation (plan 3.g). No Win or Super key, at least one of
//! Ctrl or Alt, and none of the combos the shell owns.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Accel {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub key: String,
}

/// Error codes returned to the frontend in `hotkeys_apply` results.
pub const E_INVALID: &str = "invalid";
pub const E_WIN: &str = "winKey";
pub const E_NO_MODIFIER: &str = "noModifier";
pub const E_RESERVED: &str = "reserved";

const NAMED_KEYS: &[&str] = &[
    "Space",
    "Enter",
    "Tab",
    "Esc",
    "Backspace",
    "Delete",
    "Insert",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Up",
    "Down",
    "Left",
    "Right",
    "PrintScreen",
];

fn canonical_key(raw: &str) -> Option<String> {
    let lower = raw.to_ascii_lowercase();
    let named = match lower.as_str() {
        "escape" => Some("Esc"),
        "return" => Some("Enter"),
        "del" => Some("Delete"),
        "ins" => Some("Insert"),
        "pgup" => Some("PageUp"),
        "pgdn" => Some("PageDown"),
        "arrowup" => Some("Up"),
        "arrowdown" => Some("Down"),
        "arrowleft" => Some("Left"),
        "arrowright" => Some("Right"),
        "prtsc" | "prtscn" | "printscr" | "printscreen" => Some("PrintScreen"),
        _ => None,
    };
    if let Some(n) = named {
        return Some(n.to_string());
    }
    if let Some(n) = NAMED_KEYS.iter().find(|n| n.eq_ignore_ascii_case(raw)) {
        return Some((*n).to_string());
    }
    let mut chars = raw.chars();
    if let (Some(c), None) = (chars.next(), chars.next()) {
        if c.is_ascii_alphanumeric() {
            return Some(c.to_ascii_uppercase().to_string());
        }
    }
    if let Some(n) = lower.strip_prefix('f').and_then(|n| n.parse::<u8>().ok()) {
        if (1..=24).contains(&n) && lower[1..].chars().all(|c| c.is_ascii_digit()) {
            return Some(format!("F{n}"));
        }
    }
    None
}

impl Accel {
    /// Display and storage order: Ctrl, Alt, Shift, key.
    pub fn canonical(&self) -> String {
        let mut parts: Vec<&str> = Vec::new();
        if self.ctrl {
            parts.push("Ctrl");
        }
        if self.alt {
            parts.push("Alt");
        }
        if self.shift {
            parts.push("Shift");
        }
        parts.push(&self.key);
        parts.join("+")
    }

    fn is_reserved(&self) -> bool {
        let k = self.key.as_str();
        k == "PrintScreen"
            || matches!(
                (self.ctrl, self.alt, k),
                (true, true, "Delete") | (false, true, "Tab" | "F4" | "Esc") | (true, false, "Esc")
            )
    }
}

pub fn parse(input: &str) -> Result<Accel, &'static str> {
    let mut a = Accel {
        ctrl: false,
        alt: false,
        shift: false,
        key: String::new(),
    };
    let mut key: Option<String> = None;
    for part in input.split('+').map(str::trim) {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => a.ctrl = true,
            "alt" | "option" => a.alt = true,
            "shift" => a.shift = true,
            "win" | "windows" | "super" | "meta" | "cmd" | "command" | "commandorcontrol"
            | "cmdorctrl" => return Err(E_WIN),
            "" => return Err(E_INVALID),
            _ => {
                if key.is_some() {
                    return Err(E_INVALID);
                }
                key = Some(canonical_key(part).ok_or(E_INVALID)?);
            }
        }
    }
    a.key = key.ok_or(E_INVALID)?;
    if !a.ctrl && !a.alt {
        return Err(E_NO_MODIFIER);
    }
    if a.is_reserved() {
        return Err(E_RESERVED);
    }
    Ok(a)
}

/// `openPinN` stores only a modifier prefix ("Alt", "Ctrl+Alt"); expands to `<prefix>+1..9`.
pub fn expand_open_pin(prefix: &str) -> Result<Vec<(usize, String)>, &'static str> {
    let mut out = Vec::new();
    for i in 0..9usize {
        let a = parse(&format!(
            "{}+{}",
            prefix.trim().trim_end_matches('+'),
            i + 1
        ))?;
        out.push((i, a.canonical()));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_defaults() {
        for (s, c) in [
            ("Alt+Space", "Alt+Space"),
            ("Alt+Shift+Space", "Alt+Shift+Space"),
            ("Ctrl+Alt+V", "Ctrl+Alt+V"),
            ("shift+alt+v", "Alt+Shift+V"),
            ("Control+F12", "Ctrl+F12"),
        ] {
            assert_eq!(parse(s).unwrap().canonical(), c, "{s}");
        }
    }

    #[test]
    fn rejects_win_keys() {
        for s in ["Win+V", "Ctrl+Super+A", "Alt+Meta+X", "Cmd+Alt+V"] {
            assert_eq!(parse(s), Err(E_WIN), "{s}");
        }
    }

    #[test]
    fn needs_ctrl_or_alt() {
        assert_eq!(parse("Shift+A"), Err(E_NO_MODIFIER));
        assert_eq!(parse("Shift+F5"), Err(E_NO_MODIFIER));
        assert_eq!(parse("F5"), Err(E_NO_MODIFIER));
    }

    #[test]
    fn rejects_reserved() {
        for s in [
            "Ctrl+Alt+Delete",
            "Alt+Tab",
            "Alt+Shift+Tab",
            "Alt+F4",
            "Ctrl+Esc",
            "Ctrl+Shift+Esc",
            "Alt+Esc",
            "Ctrl+PrintScreen",
            "Alt+PrtSc",
        ] {
            assert_eq!(parse(s), Err(E_RESERVED), "{s}");
        }
        assert!(parse("Ctrl+Alt+Tab").is_ok());
    }

    #[test]
    fn rejects_malformed() {
        for s in ["", "Alt", "Alt+", "Alt+A+B", "Alt+Foo", "Alt+F25", "Alt+Ab"] {
            assert_eq!(parse(s), Err(E_INVALID), "{s:?}");
        }
    }

    #[test]
    fn open_pin_expands_to_nine() {
        let v = expand_open_pin("Alt").unwrap();
        assert_eq!(v.len(), 9);
        assert_eq!(v[0], (0, "Alt+1".to_string()));
        assert_eq!(v[8], (8, "Alt+9".to_string()));
        let v = expand_open_pin("Shift+Ctrl+").unwrap();
        assert_eq!(v[2].1, "Ctrl+Shift+3");
    }

    #[test]
    fn open_pin_prefix_is_validated() {
        assert_eq!(expand_open_pin("Shift"), Err(E_NO_MODIFIER));
        assert_eq!(expand_open_pin("Win+Alt"), Err(E_WIN));
        assert_eq!(expand_open_pin(""), Err(E_INVALID));
    }
}
