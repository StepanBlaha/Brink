//! Toast XML and id helpers (plan 3.f). Pure, so they are tested on every platform.

use super::NotifyRequest;

pub const AUMID: &str = "cz.stepanblaha.brink";
/// A summary toast opens the Today pin (`ReminderService`: summary pinId falls back to `brink.today`).
pub const TODAY_PIN: &str = "brink.today";
/// Windows limits `Tag` and `Group` to 64 characters.
pub const MAX_TAG: usize = 64;

pub fn fnv1a64(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// The identifier itself when it fits, else `h.` plus its FNV-1a hash.
pub fn short_tag(identifier: &str) -> String {
    if identifier.chars().count() <= MAX_TAG {
        identifier.to_string()
    } else {
        format!("h.{:016x}", fnv1a64(identifier))
    }
}

/// `ScheduledToastNotification.Id` allows 16 characters: a hash of the identifier.
pub fn toast_id(identifier: &str) -> String {
    format!("{:016x}", fnv1a64(identifier))
}

pub fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn percent(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// `brink://notify?action=…&pinId=…&itemId=…`, already escaped for an XML attribute.
pub fn action_url(action: &str, pin_id: &str, item_id: &str) -> String {
    escape(&format!(
        "brink://notify?action={action}&pinId={}&itemId={}",
        percent(pin_id),
        percent(item_id)
    ))
}

/// Item toasts: Mark done, Snooze 1 hour, Open. Summary toasts: Open only. Every action uses
/// protocol activation so a click works even when Brink is not running (plan 3.f, adapted).
pub fn toast_xml(req: &NotifyRequest) -> String {
    let pin = req.pin_id.as_deref().unwrap_or(TODAY_PIN);
    let item = req.item_id.as_deref().unwrap_or("");
    let open = action_url("open", pin, item);
    let action = |label: &str, url: &str| {
        format!("<action content=\"{label}\" arguments=\"{url}\" activationType=\"protocol\"/>")
    };
    let mut actions = String::new();
    if req.kind != "summary" {
        actions += &action("Mark done", &action_url("done", pin, item));
        actions += &action("Snooze 1 hour", &action_url("snooze", pin, item));
    }
    actions += &action("Open", &open);
    format!(
        "<toast launch=\"{open}\" activationType=\"protocol\"><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual><actions>{actions}</actions><audio src=\"ms-winsoundevent:Notification.Default\"/></toast>",
        escape(&req.title),
        escape(&req.body)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(kind: &str) -> NotifyRequest {
        NotifyRequest {
            identifier: "brink.reminder.item.p1.i1".into(),
            kind: kind.into(),
            title: "Pay <rent> & tax".into(),
            body: "Home \u{00B7} Due today".into(),
            fire_at_ms: 1,
            pin_id: (kind != "summary").then(|| "p 1".to_string()),
            item_id: (kind != "summary").then(|| "i&1".to_string()),
        }
    }

    #[test]
    fn item_toast_has_three_protocol_actions() {
        let x = toast_xml(&req("item"));
        assert!(x.contains("content=\"Mark done\""));
        assert!(x.contains("content=\"Snooze 1 hour\""));
        assert!(x.contains("content=\"Open\""));
        assert!(x.contains("action=done&amp;pinId=p%201&amp;itemId=i%261"));
        assert_eq!(x.matches("activationType=\"protocol\"").count(), 4);
        assert!(x.contains("<text>Pay &lt;rent&gt; &amp; tax</text>"));
        assert!(x.contains("Home \u{00B7} Due today"));
        assert!(x.contains("ms-winsoundevent:Notification.Default"));
    }

    #[test]
    fn summary_toast_only_opens_today() {
        let x = toast_xml(&req("summary"));
        assert!(!x.contains("Mark done") && !x.contains("Snooze"));
        assert!(x.contains("action=open&amp;pinId=brink.today"));
        assert_eq!(x.matches("<action ").count(), 1);
    }

    #[test]
    fn long_identifiers_are_hashed_to_64_or_less() {
        let long = format!("brink.reminder.item.{}.{}", "p".repeat(40), "i".repeat(40));
        let t = short_tag(&long);
        assert!(t.len() <= MAX_TAG && t.starts_with("h."));
        assert_eq!(t, short_tag(&long));
        assert_eq!(short_tag("short"), "short");
        assert_eq!(toast_id("a").len(), 16);
        assert_ne!(toast_id("a"), toast_id("b"));
    }

    #[test]
    fn fnv_matches_reference_values() {
        assert_eq!(fnv1a64(""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a64("a"), 0xaf63_dc4c_8601_ec8c);
    }
}
