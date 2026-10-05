use brink_lib::notion::encode::*;
use brink_lib::notion::types::*;
use serde_json::{json, Value};

#[test]
fn chunks_4500_chars_into_2000_2000_500() {
    let c = chunked(&"a".repeat(4500), 2000);
    assert_eq!(
        c.iter().map(|s| s.chars().count()).collect::<Vec<_>>(),
        [2000, 2000, 500]
    );
    assert_eq!(chunked("", 2000), vec![String::new()]);
    assert_eq!(chunked("abc", 0), vec!["abc".to_string()]);
}

#[test]
fn encode_2500_chars_gives_two_items_and_empty_gives_one_empty() {
    assert_eq!(encode_text(&"b".repeat(2500)).len(), 2);
    assert_eq!(
        encode_text("")[0],
        json!({"type":"text","text":{"content":""}})
    );
}

#[test]
fn chunking_counts_grapheme_clusters() {
    let s = "👨‍👩‍👧".repeat(3); // 3 graphemes, many scalars
    assert_eq!(chunked(&s, 2).len(), 2);
}

#[test]
fn spans_keep_annotations_links_and_underline_false() {
    let span = RichTextSpan {
        text: "hi".into(),
        bold: true,
        italic: false,
        strikethrough: true,
        code: false,
        link: Some("https://x.y".into()),
    };
    assert_eq!(
        encode_spans(&[span])[0],
        json!({"type":"text","text":{"content":"hi","link":{"url":"https://x.y"}},
          "annotations":{"bold":true,"italic":false,"strikethrough":true,"underline":false,"code":false}})
    );
    assert!(encode_spans(&[]).is_empty());
}

#[test]
fn property_request_json_per_case() {
    let j = |v: PropertyValue| property_request_json(&v);
    assert_eq!(
        j(PropertyValue::Checkbox(true)),
        Some(json!({"type":"checkbox","checkbox":true}))
    );
    assert_eq!(
        j(PropertyValue::Date {
            start: None,
            end: None
        }),
        Some(json!({"type":"date","date":null}))
    );
    assert_eq!(
        j(PropertyValue::Date {
            start: Some("a".into()),
            end: Some("b".into())
        }),
        Some(json!({"type":"date","date":{"start":"a","end":"b"}}))
    );
    assert_eq!(
        j(PropertyValue::Status(None)),
        Some(json!({"type":"status","status":null}))
    );
    assert_eq!(
        j(PropertyValue::Select(Some("X".into()))),
        Some(json!({"type":"select","select":{"name":"X"}}))
    );
    assert_eq!(
        j(PropertyValue::Number(Some(3.0))),
        Some(json!({"type":"number","number":3}))
    );
    assert_eq!(
        j(PropertyValue::Number(None)),
        Some(json!({"type":"number","number":null}))
    );
    assert_eq!(j(PropertyValue::Unsupported("people".into())), None);
}

#[test]
fn property_value_decodes_notion_arrays_and_cache_strings() {
    let a: PropertyValue = serde_json::from_value(
        json!({"type":"title","title":[{"plain_text":"A"},{"plain_text":"B"}]}),
    )
    .unwrap();
    assert_eq!(a, PropertyValue::Title("AB".into()));
    let b: PropertyValue =
        serde_json::from_value(json!({"type":"rich_text","rich_text":"plain"})).unwrap();
    assert_eq!(b, PropertyValue::RichText("plain".into()));
    let c: PropertyValue = serde_json::from_value(json!({"type":"date"})).unwrap();
    assert_eq!(
        c,
        PropertyValue::Date {
            start: None,
            end: None
        }
    );
    let d: PropertyValue = serde_json::from_value(json!({"type":"people"})).unwrap();
    assert_eq!(serde_json::to_value(&d).unwrap(), json!({"type":"people"}));
}

#[test]
fn new_block_request_json_cases() {
    let n = |b: NewBlock| new_block_request_json(&b);
    assert_eq!(
        n(NewBlock::ToDo {
            text: "t".into(),
            checked: true
        }),
        json!({"type":"to_do","to_do":{"rich_text":[{"type":"text","text":{"content":"t"}}],"checked":true}})
    );
    assert_eq!(
        n(NewBlock::Formatted {
            block_kind: NewBlockKind::Divider,
            rich_text: vec![],
            language: "plain text".into(),
            checked: false
        }),
        json!({"type":"divider","divider":{}})
    );
    let code = n(NewBlock::Formatted {
        block_kind: NewBlockKind::Code,
        rich_text: vec![],
        language: "rust".into(),
        checked: true,
    });
    assert_eq!(code["code"], json!({"rich_text": [], "language": "rust"}));
    let todo = n(NewBlock::Formatted {
        block_kind: NewBlockKind::ToDo,
        rich_text: vec![],
        language: "x".into(),
        checked: true,
    });
    assert_eq!(todo["to_do"], json!({"rich_text": [], "checked": true}));
    let c = n(NewBlock::Callout {
        rich_text: vec![],
        emoji: Some(String::new()),
    });
    assert!(c["callout"].get("icon").is_none());
    assert_eq!(
        n(NewBlock::ImageUpload { id: "fu-1".into() }),
        json!({"type":"image","image":{"type":"file_upload","file_upload":{"id":"fu-1"}}})
    );
    assert_eq!(
        n(NewBlock::ImageExternal {
            url: "https://a/b.png".into()
        })["image"]["external"]["url"],
        Value::String("https://a/b.png".into())
    );
}

#[test]
fn position_request_json_cases() {
    assert_eq!(position_request_json(&BlockPosition::End {}), None);
    assert_eq!(
        position_request_json(&BlockPosition::Start {}),
        Some(json!({"type":"start"}))
    );
    assert_eq!(
        position_request_json(&BlockPosition::After { id: "x".into() }),
        Some(json!({"type":"after_block","after_block":{"id":"x"}}))
    );
}
