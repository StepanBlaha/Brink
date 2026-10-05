use brink_lib::store::cache::Cache;
use brink_lib::store::panel_sizes;
use brink_lib::store::settings::Settings;
use serde_json::json;

fn open() -> (tempfile::TempDir, Settings) {
    let d = tempfile::tempdir().unwrap();
    let s = Settings::open(d.path().join("settings.json"));
    (d, s)
}

#[test]
fn defaults_match_the_plan() {
    let (_d, s) = open();
    let v = s.get();
    assert_eq!(v["dockEdge"], "right");
    assert_eq!(v["pillStyle"], "line");
    assert_eq!(v["pillShowsFraction"], true);
    assert_eq!(v["displayPreference"], "main");
    assert_eq!(v["accentPreset"], "blue");
    assert_eq!(v["dockSize"], "medium");
    assert_eq!(v["badgeMode"], "open");
    assert_eq!(v["pillProgressMode"], "off");
    assert_eq!(v["menuBarShowOpenCount"], false);
    assert_eq!(v["remindersEnabled"], false);
    assert_eq!(v["reminderHour"], 9);
    assert_eq!(v["morningSummaryMinutes"], 480);
    assert_eq!(v["onboardingCompleted"], false);
    assert_eq!(v["hideInFullScreen"], true);
    assert_eq!(v["panelSizes"], json!({}));
    assert_eq!(v["hotkeys"]["toggleLastPin"], "Alt+Space");
    assert_eq!(v["hotkeys"]["clipboardAppend"], "Ctrl+Alt+V");
    assert!(v.get("activeGroupID").is_none() && v.get("lastOpenedPinID").is_none());
}

#[test]
fn set_merges_persists_and_validates() {
    let (d, mut s) = open();
    let v = s
        .set(&json!({"dockEdge": "left", "reminderHour": 7, "lastOpenedPinID": "p1"}))
        .unwrap();
    assert_eq!(v["dockEdge"], "left");
    assert_eq!(v["lastOpenedPinID"], "p1");
    let re = Settings::open(d.path().join("settings.json"));
    assert_eq!(re.get()["reminderHour"], 7);
    assert!(s.set(&json!({"dockEdge": "bottom"})).is_err());
    assert!(s.set(&json!({"reminderHour": 24})).is_err());
    assert!(s.set(&json!({"morningSummaryMinutes": 1440})).is_err());
    assert!(s.set(&json!({"nope": 1})).is_err());
    assert_eq!(
        s.get()["dockEdge"],
        "left",
        "a rejected patch changes nothing"
    );
    assert!(s
        .set(&json!({"dockEdge": "top", "reminderHour": 99}))
        .is_err());
    assert_eq!(s.get()["dockEdge"], "left", "all or nothing");
}

#[test]
fn empty_or_null_optional_strings_read_as_absent() {
    let (_d, mut s) = open();
    s.set(&json!({"activeGroupID": "g"})).unwrap();
    assert_eq!(s.get()["activeGroupID"], "g");
    s.set(&json!({"activeGroupID": ""})).unwrap();
    assert!(s.get().get("activeGroupID").is_none());
    s.set(&json!({"lastOpenedPinID": "x"})).unwrap();
    s.set(&json!({"lastOpenedPinID": null})).unwrap();
    assert!(s.get().get("lastOpenedPinID").is_none());
}

#[test]
fn invalid_stored_values_fall_back_per_key() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("settings.json");
    std::fs::write(
        &p,
        r#"{"dockEdge":"bottom","pillStyle":"dot","reminderHour":"x"}"#,
    )
    .unwrap();
    let v = Settings::open(p).get();
    assert_eq!(v["dockEdge"], "right");
    assert_eq!(v["pillStyle"], "dot");
    assert_eq!(v["reminderHour"], 9);
}

#[test]
fn display_preference_and_hotkeys_validation() {
    let (_d, mut s) = open();
    assert!(s
        .set(&json!({"displayPreference": "screen:Dell|\\\\.\\DISPLAY1\t0,0,1920,1080"}))
        .is_ok());
    assert!(s.set(&json!({"displayPreference": "left"})).is_err());
    let v = s
        .set(&json!({"hotkeys": {"quickCapture": "Ctrl+Alt+Q"}}))
        .unwrap();
    assert_eq!(v["hotkeys"]["quickCapture"], "Ctrl+Alt+Q");
    assert_eq!(
        v["hotkeys"]["toggleLastPin"], "Alt+Space",
        "defaults fill missing actions"
    );
}

#[test]
fn panel_size_clamp_cases() {
    assert_eq!(panel_sizes::clamp(10.0, 10.0, 900.0, 800.0), (300.0, 240.0));
    assert_eq!(
        panel_sizes::clamp(5000.0, 5000.0, 900.0, 800.0),
        (900.0, 800.0)
    );
    assert_eq!(
        panel_sizes::clamp(500.0, 500.0, 200.0, 100.0),
        (300.0, 240.0),
        "minimums win"
    );
    assert_eq!(
        panel_sizes::clamp(800.0, 300.0, 600.0, 800.0),
        (600.0, 300.0)
    );
}

#[test]
fn panel_sizes_persist_per_pin_and_reclamp_on_read() {
    let (d, mut s) = open();
    assert_eq!(panel_sizes::get(&s, "a", 900.0, 800.0), None);
    assert_eq!(
        panel_sizes::set(&mut s, "a", 600.0, 400.0, 900.0, 800.0),
        (600.0, 400.0)
    );
    panel_sizes::set(&mut s, "b", 5000.0, 5000.0, 900.0, 800.0);
    assert_eq!(
        panel_sizes::get(&s, "b", 900.0, 800.0),
        Some((900.0, 800.0))
    );
    assert_eq!(
        panel_sizes::get(&s, "a", 500.0, 350.0),
        Some((500.0, 350.0)),
        "re-clamped to smaller limits"
    );
    let re = Settings::open(d.path().join("settings.json"));
    assert!(panel_sizes::has(&re, "a"));
    panel_sizes::reset(&mut s, "a");
    assert!(!panel_sizes::has(&s, "a") && panel_sizes::has(&s, "b"));
}

#[test]
fn cache_round_trip_clear_and_key_safety() {
    let d = tempfile::tempdir().unwrap();
    let c = Cache::new(d.path());
    assert_eq!(c.load("p1", "rows").unwrap(), None);
    c.save("p1", "rows", r#"[{"id":"r"}]"#).unwrap();
    assert!(d.path().join("p1-rows.json").exists());
    assert_eq!(c.load("p1", "rows").unwrap().unwrap(), r#"[{"id":"r"}]"#);
    c.clear("p1", "rows").unwrap();
    assert_eq!(c.load("p1", "rows").unwrap(), None);
    assert!(c.save("../x", "rows", "[]").is_err());
    assert!(c.load("p", "a/b").is_err());
    assert!(c.save("p", "rows", "not json").is_err());
}
