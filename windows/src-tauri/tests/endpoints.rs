mod common;
use brink_lib::logging::Logger;
use brink_lib::notion::types::*;
use brink_lib::notion::NotionError;
use common::*;
use serde_json::{json, Value};
use std::sync::Arc;
use wiremock::matchers::{body_json, header_regex, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn span(t: &str) -> RichTextSpan {
    RichTextSpan {
        text: t.into(),
        bold: true,
        italic: false,
        strikethrough: false,
        code: false,
        link: None,
        underline: false,
        color: None,
    }
}

async fn mount_schema(s: &MockServer) {
    Mock::given(path("/data_sources/ds-1"))
        .respond_with(ResponseTemplate::new(200).set_body_raw(SCHEMA, "application/json"))
        .mount(s)
        .await;
}

#[tokio::test]
async fn create_row_fetches_schema_and_posts_title_property_and_extras() {
    let s = MockServer::start().await;
    mount_schema(&s).await;
    Mock::given(method("POST"))
        .and(path("/pages"))
        .and(body_json(json!({
            "parent": {"type": "data_source_id", "data_source_id": "ds-1"},
            "properties": {
                "Name": {"title": [{"type": "text", "text": {"content": "Milk"}}]},
                "Due": {"type": "date", "date": {"start": "2026-09-30T17:00:00+02:00"}},
                "Skip": {"type": "date", "date": null},
            }
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "new-1"})))
        .expect(1)
        .mount(&s)
        .await;
    let extra = vec![
        PropertyUpdate {
            name: "Due".into(),
            value: PropertyValue::Date {
                start: Some("2026-09-30T17:00:00+02:00".into()),
                end: None,
            },
        },
        PropertyUpdate {
            name: "Skip".into(),
            value: PropertyValue::Date {
                start: None,
                end: None,
            },
        },
        PropertyUpdate {
            name: "Nope".into(),
            value: PropertyValue::Unsupported("people".into()),
        },
    ];
    let r = client(&s.uri(), Some("t"))
        .create_row("ds-1", "Milk", &extra)
        .await
        .unwrap();
    assert_eq!(r["id"], "new-1");
}

#[tokio::test]
async fn create_row_without_title_property_is_a_decoding_error() {
    let s = MockServer::start().await;
    Mock::given(path("/data_sources/ds-1"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"id":"ds-1","properties":{"Done":{"type":"checkbox"}}})),
        )
        .mount(&s)
        .await;
    let e = client(&s.uri(), Some("t"))
        .create_row("ds-1", "x", &[])
        .await
        .unwrap_err();
    assert_eq!(
        e,
        NotionError::Decoding("Data source ds-1 has no title property".into())
    );
}

#[tokio::test]
async fn update_page_properties_and_icon_bodies() {
    let s = MockServer::start().await;
    Mock::given(method("PATCH"))
        .and(path("/pages/p1"))
        .and(body_json(
            json!({"properties": {"Done": {"type": "checkbox", "checkbox": true}}}),
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "p1"})))
        .expect(1)
        .mount(&s)
        .await;
    Mock::given(method("PATCH"))
        .and(path("/pages/p2"))
        .and(body_json(json!({"icon": {"type": "emoji", "emoji": "x"}})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "p2"})))
        .expect(1)
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("t"));
    c.update_page_properties(
        "p1",
        &[PropertyUpdate {
            name: "Done".into(),
            value: PropertyValue::Checkbox(true),
        }],
    )
    .await
    .unwrap();
    c.set_page_emoji_icon("p2", "x").await.unwrap();
}

#[tokio::test]
async fn update_block_bodies_per_case_and_callout_icon_rule() {
    let s = MockServer::start().await;
    Mock::given(method("PATCH"))
        .and(path("/blocks/b1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "b1"})))
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("t"));
    c.update_block(
        "b1",
        "to_do",
        &BlockUpdate::Content {
            rich_text: vec![span("a")],
            checked: Some(true),
            language: None,
        },
    )
    .await
    .unwrap();
    c.update_block(
        "b1",
        "callout",
        &BlockUpdate::CalloutContent {
            rich_text: vec![],
            emoji: Some(String::new()),
        },
    )
    .await
    .unwrap();
    c.update_block(
        "b1",
        "callout",
        &BlockUpdate::CalloutContent {
            rich_text: vec![],
            emoji: Some("x".into()),
        },
    )
    .await
    .unwrap();
    let reqs = s.received_requests().await.unwrap();
    let b = |i: usize| -> Value { serde_json::from_slice(&reqs[i].body).unwrap() };
    assert_eq!(
        b(0),
        json!({"type": "to_do", "to_do": {"checked": true, "rich_text": [{
        "type": "text", "text": {"content": "a"},
        "annotations": {"bold": true, "italic": false, "strikethrough": false, "underline": false, "code": false}}]}})
    );
    assert!(
        b(1)["callout"].get("icon").is_none(),
        "no icon key for an empty emoji"
    );
    assert_eq!(
        b(2)["callout"]["icon"],
        json!({"type": "emoji", "emoji": "x"})
    );
}

#[tokio::test]
async fn append_blocks_sends_position_only_when_not_end() {
    let s = MockServer::start().await;
    Mock::given(method("PATCH"))
        .and(path("/blocks/pg/children"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"results": [{"id": "n1"}], "has_more": false})),
        )
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("t"));
    let blocks = vec![NewBlock::Paragraph { text: "hi".into() }];
    let r = c
        .append_blocks("pg", &blocks, &BlockPosition::End {})
        .await
        .unwrap();
    assert_eq!(r[0]["id"], "n1");
    c.append_blocks("pg", &blocks, &BlockPosition::Start {})
        .await
        .unwrap();
    c.append_blocks("pg", &blocks, &BlockPosition::After { id: "x".into() })
        .await
        .unwrap();
    let reqs = s.received_requests().await.unwrap();
    let b = |i: usize| -> Value { serde_json::from_slice(&reqs[i].body).unwrap() };
    assert!(b(0).get("position").is_none());
    assert_eq!(b(1)["position"], json!({"type": "start"}));
    assert_eq!(
        b(2)["position"],
        json!({"type": "after_block", "after_block": {"id": "x"}})
    );
    assert_eq!(
        b(0)["children"][0],
        json!({"type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": "hi"}}]}})
    );
}

#[tokio::test]
async fn delete_block_and_retrieve_database() {
    let s = MockServer::start().await;
    Mock::given(method("DELETE"))
        .and(path("/blocks/b9"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id":"b9"})))
        .expect(1)
        .mount(&s)
        .await;
    Mock::given(path("/databases/db"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"data_sources":[{"id":"ds","name":"Tasks"}]})),
        )
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("t"));
    c.delete_block("b9").await.unwrap();
    assert_eq!(c.retrieve_database("db").await.unwrap()[0]["name"], "Tasks");
}

#[tokio::test]
async fn upload_flow_is_create_then_send_multipart() {
    let s = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/file_uploads"))
        .and(body_json(
            json!({"mode": "single_part", "filename": "a.png", "content_type": "image/png"}),
        ))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"id": "fu-1", "status": "pending"})),
        )
        .expect(1)
        .mount(&s)
        .await;
    Mock::given(method("POST"))
        .and(path("/file_uploads/fu-1/send"))
        .and(header_regex(
            "content-type",
            r"^multipart/form-data; boundary=NotionDock-",
        ))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"id": "fu-1", "status": "uploaded"})),
        )
        .expect(1)
        .mount(&s)
        .await;
    let id = client(&s.uri(), Some("t"))
        .upload_file(&[1, 2, 3], "a.png", "image/png")
        .await
        .unwrap();
    assert_eq!(id, "fu-1");
    let reqs = s.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 2);
    let body = &reqs[1].body;
    assert!(body.windows(3).any(|w| w == [1, 2, 3]));
    let text = String::from_utf8_lossy(body);
    assert!(text.contains("name=\"file\"; filename=\"a.png\""));
    assert!(text.contains("Content-Type: image/png"));
}

#[tokio::test]
async fn upload_not_completed_and_too_large() {
    let s = MockServer::start().await;
    Mock::given(path("/file_uploads"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"id": "fu-2", "status": "pending"})),
        )
        .mount(&s)
        .await;
    Mock::given(path("/file_uploads/fu-2/send"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"id": "fu-2", "status": "failed"})),
        )
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("t"));
    let e = c.upload_file(&[0], "a.png", "image/png").await.unwrap_err();
    assert_eq!(
        e.to_string(),
        "Image upload didn't complete (status: failed)."
    );
    let big = vec![0u8; 20 * 1024 * 1024 + 1];
    let before = s.received_requests().await.unwrap().len();
    let e = c.upload_file(&big, "a.png", "image/png").await.unwrap_err();
    assert!(matches!(e, NotionError::TooLarge { .. }));
    assert_eq!(
        s.received_requests().await.unwrap().len(),
        before,
        "no request for an oversized file"
    );
}

#[tokio::test]
async fn the_token_never_reaches_the_log_file() {
    let s = MockServer::start().await;
    Mock::given(path("/data_sources/ok"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id":"ok"})))
        .mount(&s)
        .await;
    Mock::given(path("/data_sources/bad"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&s)
        .await;
    let dir = tempfile::tempdir().unwrap();
    let logger = Arc::new(Logger::new(dir.path()));
    let token = "secret_SUPERSECRETTOKENVALUE123";
    let c = client(&s.uri(), Some(token)).with_logger(logger.clone());
    c.retrieve_data_source("ok").await.unwrap();
    let _ = c.retrieve_data_source("bad").await;
    logger.error(&format!("manual line with Authorization: Bearer {token}"));
    let log = std::fs::read_to_string(logger.path()).unwrap();
    assert!(log.contains("GET data_sources/ok -> 200"));
    assert!(!log.contains("SUPERSECRETTOKENVALUE123"));
}
