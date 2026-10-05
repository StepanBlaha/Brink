//! The believable, entirely fictional sample workspace of demo mode (port of `DemoContent.swift`).

use serde_json::{json, Value};

pub const GROCERIES_PIN: &str = "demo-groceries";
pub const LAUNCH_PIN: &str = "demo-launch";
pub const SPRINT_PIN: &str = "demo-sprint";
pub const READING_PIN: &str = "demo-reading";

pub const GROCERIES_PAGE: &str = "demo-page-groceries";
pub const LAUNCH_PAGE: &str = "demo-page-launch";
pub const READING_PAGE: &str = "demo-page-reading";
pub const SPRINT_DATA_SOURCE: &str = "demo-ds-sprint";

/// A block seed: Notion type, text, extra fields for the type's box, children.
pub struct B {
    pub kind: &'static str,
    pub text: &'static str,
    pub extra: Value,
    pub children: Vec<B>,
}

fn b(kind: &'static str, text: &'static str, extra: Value, children: Vec<B>) -> B {
    B {
        kind,
        text,
        extra,
        children,
    }
}
fn p(t: &'static str) -> B {
    b("paragraph", t, json!({}), vec![])
}
fn h2(t: &'static str) -> B {
    b("heading_2", t, json!({}), vec![])
}
fn todo(t: &'static str, done: bool) -> B {
    b("to_do", t, json!({ "checked": done }), vec![])
}
fn bullet(t: &'static str) -> B {
    b("bulleted_list_item", t, json!({}), vec![])
}
fn toggle(t: &'static str, kids: Vec<B>) -> B {
    b("toggle", t, json!({}), kids)
}
fn callout(t: &'static str, emoji: &str) -> B {
    let icon = json!({ "type": "emoji", "emoji": emoji });
    b(
        "callout",
        t,
        json!({ "icon": icon, "color": "gray_background" }),
        vec![],
    )
}

/// `(page id, emoji, blocks)`.
pub fn pages() -> Vec<(&'static str, &'static str, Vec<B>)> {
    vec![
        (
            GROCERIES_PAGE,
            "\u{1F6D2}",
            vec![
                todo("Oat milk", false),
                todo("Sourdough bread", false),
                todo("Basil and cherry tomatoes", false),
                todo("Coffee beans", false),
                todo("Lemons", true),
            ],
        ),
        (
            LAUNCH_PAGE,
            "\u{1F680}",
            vec![
                callout("Beta goes out to 200 testers on Friday.", "\u{1F4A1}"),
                h2("This week"),
                todo("Finish onboarding copy", true),
                todo("Record the demo video", false),
                todo("Send invites to testers", false),
                h2("Notes"),
                bullet("Keep the changelog short and friendly"),
                bullet("One price, no subscription"),
                toggle(
                    "Open questions",
                    vec![
                        bullet("Do we need a Windows version?"),
                        bullet("Which launch day works best?"),
                    ],
                ),
                p(""),
            ],
        ),
        (
            READING_PAGE,
            "\u{1F4DA}",
            vec![
                todo("The Design of Everyday Things", false),
                todo("Four Thousand Weeks", false),
                todo("Piranesi", false),
                todo("A Psalm for the Wild-Built", true),
            ],
        ),
    ]
}

/// Sprint rows: (title, status, due offset in days from today, done).
pub const SPRINT_ROWS: [(&str, &str, Option<i64>, bool); 6] = [
    ("Polish onboarding screens", "In progress", Some(0), false),
    ("Fix sync after sleep", "In progress", Some(0), false),
    ("Write release notes", "Not started", Some(0), false),
    ("Review pricing page", "Not started", Some(1), false),
    ("Plan the retro", "Not started", Some(3), false),
    ("Update the app icon", "Done", Some(-1), true),
];

pub fn status_options() -> Value {
    json!([
        { "id": "st-1", "name": "Not started", "color": "default" },
        { "id": "st-2", "name": "In progress", "color": "blue" },
        { "id": "st-3", "name": "Done", "color": "green" },
    ])
}

/// The four demo pins in `pins.json` shape (camelCase, Swift enum encoding for icons).
pub fn pins() -> Vec<Value> {
    let page = |id: &str, nid: &str, title: &str, emoji: &str, order: i64| {
        json!({ "id": id, "notionId": nid, "kind": "page", "title": title,
                "icon": { "emoji": { "_0": emoji } }, "order": order })
    };
    vec![
        page(GROCERIES_PIN, GROCERIES_PAGE, "Groceries", "\u{1F6D2}", 0),
        page(LAUNCH_PIN, LAUNCH_PAGE, "Launch plan", "\u{1F680}", 1),
        json!({ "id": SPRINT_PIN, "notionId": SPRINT_DATA_SOURCE, "kind": "dataSource",
                "title": "Sprint", "icon": { "emoji": { "_0": "\u{1F3C3}" } }, "order": 2,
                "config": { "doneProperty": "Done", "doneKind": "checkbox",
                            "dateProperty": "Due", "showDone": false } }),
        page(READING_PIN, READING_PAGE, "Reading", "\u{1F4DA}", 3),
    ]
}

/// Settings the demo pins down (Mac `demoDefaults`, plus reminders off).
pub fn settings() -> Value {
    json!({
        "dockEdge": "right", "pillStyle": "line", "displayPreference": "main",
        "dockSize": "large", "accentPreset": "blue", "notchOutline": true,
        "soundsEnabled": false, "remindersEnabled": false, "morningSummaryEnabled": false,
        "menuBarListEnabled": true, "badgeMode": "open", "pillProgressMode": "off",
        "onboardingCompleted": true,
        "quickCaptureLastPinID": SPRINT_PIN, "lastOpenedPinID": LAUNCH_PIN,
    })
}

/// `YYYY-MM-DD` for today plus `offset` days (UTC; the demo needs no time zone database).
pub fn day_string(offset: i64) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64);
    civil(secs.div_euclid(86_400) + offset)
}

/// Days since 1970-01-01 to `YYYY-MM-DD` (Howard Hinnant's civil-from-days).
pub fn civil(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_dates_are_right() {
        assert_eq!(civil(0), "1970-01-01");
        assert_eq!(civil(19_723), "2024-01-01");
        assert_eq!(civil(19_782), "2024-02-29");
        assert_eq!(civil(-1), "1969-12-31");
    }

    #[test]
    fn four_pins_and_the_sprint_config() {
        let pins = pins();
        assert_eq!(pins.len(), 4);
        assert_eq!(pins[2]["config"]["doneProperty"], "Done");
        assert_eq!(pins[0]["icon"]["emoji"]["_0"], "\u{1F6D2}");
    }

    #[test]
    fn settings_use_valid_demo_defaults() {
        let d = tempfile::tempdir().unwrap();
        let mut s = crate::store::settings::Settings::open(d.path().join("s.json"));
        let out = s.set(&settings()).unwrap();
        assert_eq!(out["dockSize"], "large");
        assert_eq!(out["soundsEnabled"], false);
        assert_eq!(out["remindersEnabled"], false);
    }
}
