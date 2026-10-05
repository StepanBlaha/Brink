use brink_lib::store::pins::*;
use serde_json::json;
use std::path::PathBuf;

fn pin(id: &str, order: i64, group: Option<&str>) -> Pin {
    Pin {
        id: id.into(),
        notion_id: format!("n-{id}"),
        kind: PinKind::Page,
        title: id.to_uppercase(),
        icon: PinIcon::None {},
        order,
        config: None,
        custom_icon: None,
        group_id: group.map(str::to_string),
    }
}

struct Env {
    _d: tempfile::TempDir,
    pins: PathBuf,
    groups: PathBuf,
}

fn env(pins: &[Pin]) -> (Env, PinStore) {
    let d = tempfile::tempdir().unwrap();
    let (p, g) = (d.path().join("pins.json"), d.path().join("groups.json"));
    if !pins.is_empty() {
        std::fs::write(&p, serde_json::to_vec(pins).unwrap()).unwrap();
    }
    let s = PinStore::open(p.clone(), g.clone());
    (
        Env {
            _d: d,
            pins: p,
            groups: g,
        },
        s,
    )
}

#[test]
fn old_pins_json_without_customicon_or_groupid_decodes() {
    let legacy = r#"[{"id":"pin-1","notionId":"notion-pin-1","kind":"page","title":"Tasks","icon":{"emoji":{"_0":"📝"}},"order":0}]"#;
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("pins.json");
    std::fs::write(&p, legacy).unwrap();
    let s = PinStore::open(p, d.path().join("groups.json"));
    let pin = &s.pins()[0];
    assert_eq!(pin.id, "pin-1");
    assert_eq!(pin.title, "Tasks");
    assert!(pin.custom_icon.is_none() && pin.group_id.is_none());
    assert_eq!(
        pin.icon,
        PinIcon::Emoji {
            value: "📝".into()
        }
    );
}

#[test]
fn custom_icon_json_round_trips_for_every_case() {
    let cases = vec![
        (
            CustomIcon::Emoji {
                value: "🔥".into()
            },
            json!({"kind":"emoji","value":"🔥"}),
        ),
        (
            CustomIcon::SfSymbol {
                name: "star.fill".into(),
                color_hex: 0x0A84FF,
            },
            json!({"kind":"sfSymbol","name":"star.fill","colorHex":0x0A84FF}),
        ),
        (
            CustomIcon::Letter {
                value: "AB".into(),
                color_hex: 0xFF453A,
            },
            json!({"kind":"letter","value":"AB","colorHex":0xFF453A}),
        ),
        (
            CustomIcon::Lucide {
                name: "star".into(),
                color_hex: 1,
            },
            json!({"kind":"lucide","name":"star","colorHex":1}),
        ),
    ];
    for (icon, expected) in cases {
        assert_eq!(serde_json::to_value(&icon).unwrap(), expected);
        assert_eq!(
            serde_json::from_value::<CustomIcon>(expected).unwrap(),
            icon
        );
    }
}

#[test]
fn pin_with_custom_icon_round_trips_and_icons_use_swift_shapes() {
    let mut p = pin("p", 2, None);
    p.icon = PinIcon::Url {
        value: "https://x/y.png".into(),
    };
    p.custom_icon = Some(CustomIcon::Letter {
        value: "R".into(),
        color_hex: 0x32D74B,
    });
    let v = serde_json::to_value(&p).unwrap();
    assert_eq!(v["icon"], json!({"url": {"_0": "https://x/y.png"}}));
    assert!(v.get("groupId").is_none() && v.get("config").is_none());
    assert_eq!(serde_json::from_value::<Pin>(v).unwrap(), p);
    assert_eq!(
        serde_json::to_value(PinIcon::None {}).unwrap(),
        json!({"none": {}})
    );
}

#[test]
fn add_assigns_max_plus_one_and_persists_sorted() {
    let (e, mut s) = env(&[pin("x", 5, None)]);
    s.add(pin("y", 0, None));
    assert_eq!(s.pins().last().unwrap().order, 6);
    let reopened = PinStore::open(e.pins.clone(), e.groups.clone());
    assert_eq!(
        reopened
            .pins()
            .iter()
            .map(|p| p.id.as_str())
            .collect::<Vec<_>>(),
        ["x", "y"]
    );
}

#[test]
fn move_reorders_only_within_that_group() {
    let a = Some("group-a");
    let (_e, mut s) = env(&[
        pin("a1", 0, a),
        pin("a2", 1, a),
        pin("a3", 2, a),
        pin("b1", 3, None),
    ]);
    s.move_within_group("a3", 0, a);
    let mut in_a: Vec<_> = s
        .pins()
        .iter()
        .filter(|p| p.group_id.as_deref() == a)
        .collect();
    in_a.sort_by_key(|p| p.order);
    assert_eq!(
        in_a.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        ["a3", "a1", "a2"]
    );
    assert_eq!(
        s.pins().iter().find(|p| p.id == "b1").unwrap().order,
        3,
        "other groups untouched"
    );
}

#[test]
fn move_among_all_renumbers_everything() {
    let (_e, mut s) = env(&[pin("a", 0, None), pin("b", 1, Some("g")), pin("c", 2, None)]);
    s.move_among_all("c", 0);
    assert_eq!(
        s.pins()
            .iter()
            .map(|p| (p.id.as_str(), p.order))
            .collect::<Vec<_>>(),
        [("c", 0), ("a", 1), ("b", 2)]
    );
    s.move_among_all("c", 99);
    assert_eq!(s.pins().last().unwrap().id, "c");
    s.move_among_all("missing", 0);
}

#[test]
fn delete_group_ungroups_pins_instead_of_deleting_them() {
    let (e, mut s) = env(&[]);
    let g = s.add_group("Work", Some("💼"));
    s.add(pin("t", 0, Some(&g.id)));
    s.delete_group(&g.id);
    assert!(s.groups().is_empty());
    assert_eq!(s.pins().len(), 1);
    assert!(s.pins()[0].group_id.is_none());
    let re = PinStore::open(e.pins.clone(), e.groups.clone());
    assert!(re.groups().is_empty() && re.pins()[0].group_id.is_none());
}

#[test]
fn set_group_appends_after_the_groups_current_pins() {
    let a = Some("group-a");
    let (_e, mut s) = env(&[pin("a1", 0, a), pin("loose", 1, None)]);
    s.set_group("loose", a);
    let moved = s.pins().iter().find(|p| p.id == "loose").unwrap();
    assert_eq!(moved.group_id.as_deref(), a);
    assert_eq!(moved.order, 1);
    s.set_group("loose", None);
    assert!(s
        .pins()
        .iter()
        .find(|p| p.id == "loose")
        .unwrap()
        .group_id
        .is_none());
}

#[test]
fn groups_persist_and_reorder() {
    let (e, mut s) = env(&[]);
    s.add_group("Work", Some("💼"));
    s.add_group("Home", Some("🏠"));
    let on_disk: Vec<PinGroup> =
        serde_json::from_slice(&std::fs::read(&e.groups).unwrap()).unwrap();
    assert_eq!(
        on_disk.iter().map(|g| g.name.as_str()).collect::<Vec<_>>(),
        ["Work", "Home"]
    );
    s.move_groups(&[1], 0);
    assert_eq!(
        s.groups()
            .iter()
            .map(|g| g.name.as_str())
            .collect::<Vec<_>>(),
        ["Home", "Work"]
    );
    assert_eq!(
        s.groups().iter().map(|g| g.order).collect::<Vec<_>>(),
        [0, 1]
    );
    s.rename_group(&s.groups()[0].id.clone(), "Casa", None);
    assert_eq!(s.groups()[0].name, "Casa");
    assert!(s.groups()[0].emoji.is_none());
}

#[test]
fn corrupt_pins_file_reads_as_empty_and_is_quarantined() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("pins.json");
    std::fs::write(&p, "garbage").unwrap();
    let s = PinStore::open(p.clone(), d.path().join("groups.json"));
    assert!(s.pins().is_empty());
    assert!(!p.exists());
}
