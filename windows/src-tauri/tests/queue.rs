mod common;
use brink_lib::notion::types::*;
use brink_lib::queue::op::{Operation, PendingWrite};
use brink_lib::queue::{Outcome, WriteQueue};
use common::*;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/queue-ops")
}

fn json_files(dir: &PathBuf) -> Vec<PathBuf> {
    let mut v: Vec<_> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .collect();
    v.sort();
    v
}

#[test]
fn every_queue_op_fixture_round_trips_through_serde() {
    let mut n = 0;
    for f in json_files(&fixtures()) {
        let raw: Value = serde_json::from_slice(&std::fs::read(&f).unwrap()).unwrap();
        let items = if raw.is_array() {
            raw.as_array().unwrap().clone()
        } else {
            vec![raw]
        };
        for item in items {
            let w: PendingWrite = serde_json::from_value(item.clone())
                .unwrap_or_else(|e| panic!("{}: {e}", f.display()));
            assert_eq!(serde_json::to_value(&w).unwrap(), item, "{}", f.display());
            n += 1;
        }
    }
    assert!(n >= 49, "expected the full fixture set, got {n}");
}

#[test]
fn legacy_fixtures_decode_with_defaults() {
    let d = fixtures().join("legacy");
    let a: PendingWrite = serde_json::from_slice(
        &std::fs::read(d.join("legacy-createRow-missing-extra.json")).unwrap(),
    )
    .unwrap();
    assert!(matches!(a.operation, Operation::CreateRow { ref extra, .. } if extra.is_empty()));
    let b: PendingWrite = serde_json::from_slice(
        &std::fs::read(d.join("legacy-appendBlocks-missing-position.json")).unwrap(),
    )
    .unwrap();
    assert!(matches!(
        b.operation,
        Operation::AppendBlocks {
            position: BlockPosition::End {},
            ..
        }
    ));
    let all: Vec<PendingWrite> =
        serde_json::from_slice(&std::fs::read(d.join("pending-legacy.json")).unwrap()).unwrap();
    assert!(all.len() >= 2);
}

fn toggle(page: &str) -> Operation {
    Operation::ToggleDone {
        page_id: page.into(),
        update: PropertyUpdate {
            name: "Done".into(),
            value: PropertyValue::Checkbox(true),
        },
    }
}

fn q(dir: &tempfile::TempDir) -> WriteQueue {
    WriteQueue::open(dir.path().join("pending.json"))
}

async fn ok_pages(s: &MockServer) {
    Mock::given(method("PATCH"))
        .and(wiremock::matchers::path_regex(r"^/pages/.*"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "x"})))
        .mount(s)
        .await;
}

fn paths(reqs: Vec<wiremock::Request>) -> Vec<String> {
    reqs.iter()
        .map(|r| format!("{} {}", r.method, r.url.path()))
        .collect()
}

#[tokio::test]
async fn submit_saves_and_executes_in_fifo_order() {
    let s = MockServer::start().await;
    ok_pages(&s).await;
    let d = tempfile::tempdir().unwrap();
    let queue = q(&d);
    let c = client(&s.uri(), Some("t"));
    queue.enqueue(toggle("a"));
    queue.enqueue(toggle("b"));
    assert_eq!(queue.submit(toggle("c"), &c).await, Outcome::Saved);
    assert_eq!(
        paths(s.received_requests().await.unwrap()),
        ["PATCH /pages/a", "PATCH /pages/b", "PATCH /pages/c"]
    );
    assert_eq!(queue.state().pending, 0);
    assert_eq!(
        std::fs::read_to_string(d.path().join("pending.json")).unwrap(),
        "[]"
    );
}

#[tokio::test]
async fn transient_failure_stops_the_drain_and_keeps_the_head() {
    let s = MockServer::start().await;
    Mock::given(method("PATCH"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&s)
        .await;
    let d = tempfile::tempdir().unwrap();
    let queue = q(&d);
    let c = client(&s.uri(), Some("t"));
    queue.enqueue(toggle("a"));
    let out = queue.submit(toggle("b"), &c).await;
    assert_eq!(
        out,
        Outcome::Queued {
            message: "The Notion token is invalid or expired.".into()
        }
    );
    assert_eq!(queue.state().pending, 2, "both stay");
    assert_eq!(
        s.received_requests().await.unwrap().len(),
        1,
        "stopped at the head"
    );
    assert_eq!(
        queue.state().last_error.as_deref(),
        Some("The Notion token is invalid or expired.")
    );
}

#[tokio::test]
async fn permanent_failure_drops_with_failed_and_continues() {
    let s = MockServer::start().await;
    Mock::given(path("/pages/bad"))
        .respond_with(
            ResponseTemplate::new(400)
                .set_body_json(json!({"code":"validation_error","message":"nope"})),
        )
        .mount(&s)
        .await;
    ok_pages(&s).await;
    let d = tempfile::tempdir().unwrap();
    let queue = q(&d);
    let c = client(&s.uri(), Some("t"));
    let out = queue.submit(toggle("bad"), &c).await;
    assert_eq!(
        out,
        Outcome::Failed {
            message: "Notion API error (validation_error): nope".into()
        }
    );
    assert_eq!(queue.state().pending, 0);
    assert_eq!(queue.submit(toggle("good"), &c).await, Outcome::Saved);
    assert_eq!(queue.state().last_error, None);
}

#[tokio::test]
async fn retain_false_withdraws_a_queued_write_but_keeps_the_rest() {
    let d = tempfile::tempdir().unwrap();
    let queue = q(&d);
    let c = client("http://127.0.0.1:1", Some("t")); // connection refused: network error
    let kept = queue.submit(toggle("a"), &c).await;
    assert!(matches!(kept, Outcome::Queued { .. }));
    assert_eq!(queue.state().pending, 1);
    let out = queue.submit_with(toggle("b"), &c, false).await;
    assert!(matches!(out, Outcome::Queued { .. }));
    assert_eq!(queue.state().pending, 1, "b withdrawn, a retained");
    let on_disk: Vec<PendingWrite> =
        serde_json::from_slice(&std::fs::read(d.path().join("pending.json")).unwrap()).unwrap();
    assert!(
        matches!(&on_disk[0].operation, Operation::ToggleDone { page_id, .. } if page_id == "a")
    );
}

#[tokio::test]
async fn missing_token_is_transient_and_queued() {
    let s = MockServer::start().await;
    let d = tempfile::tempdir().unwrap();
    let queue = q(&d);
    let out = queue.submit(toggle("a"), &client(&s.uri(), None)).await;
    assert_eq!(
        out,
        Outcome::Queued {
            message: "No Notion token is configured.".into()
        }
    );
}

#[tokio::test]
async fn pending_survives_a_kill_mid_drain_and_replays_after_restart() {
    let slow = MockServer::start().await;
    Mock::given(method("PATCH"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(5)))
        .mount(&slow)
        .await;
    let d = tempfile::tempdir().unwrap();
    let file = d.path().join("pending.json");
    {
        let queue = Arc::new(WriteQueue::open(file.clone()));
        let c = Arc::new(client(&slow.uri(), Some("t")));
        let (q2, c2) = (queue.clone(), c.clone());
        let h = tokio::spawn(async move { q2.submit(toggle("a"), &c2).await });
        tokio::time::sleep(Duration::from_millis(400)).await;
        h.abort(); // the "process" dies mid-drain
        let _ = h.await;
    }
    let fast = MockServer::start().await;
    ok_pages(&fast).await;
    let reopened = WriteQueue::open(file);
    assert_eq!(reopened.state().pending, 1);
    reopened.process(&client(&fast.uri(), Some("t"))).await;
    assert_eq!(reopened.state().pending, 0);
    assert_eq!(
        paths(fast.received_requests().await.unwrap()),
        ["PATCH /pages/a"]
    );
}

#[tokio::test]
async fn concurrent_submits_share_one_drain_and_all_succeed() {
    let s = MockServer::start().await;
    ok_pages(&s).await;
    let d = tempfile::tempdir().unwrap();
    let queue = Arc::new(q(&d));
    let c = Arc::new(client(&s.uri(), Some("t")));
    let mut hs = vec![];
    for i in 0..3 {
        let (q2, c2) = (queue.clone(), c.clone());
        hs.push(tokio::spawn(async move {
            q2.submit(toggle(&format!("p{i}")), &c2).await
        }));
    }
    for h in hs {
        assert_eq!(h.await.unwrap(), Outcome::Saved);
    }
    assert_eq!(s.received_requests().await.unwrap().len(), 3);
}

#[tokio::test]
async fn every_operation_kind_executes_against_the_right_endpoint() {
    let s = MockServer::start().await;
    Mock::given(path("/data_sources/ds"))
        .respond_with(ResponseTemplate::new(200).set_body_raw(SCHEMA, "application/json"))
        .mount(&s)
        .await;
    Mock::given(wiremock::matchers::any())
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"results": [], "has_more": false})),
        )
        .mount(&s)
        .await;
    let d = tempfile::tempdir().unwrap();
    let queue = q(&d);
    let c = client(&s.uri(), Some("t"));
    let span = RichTextSpan {
        text: "x".into(),
        bold: false,
        italic: false,
        strikethrough: false,
        code: false,
        link: None,
    };
    let ops = vec![
        Operation::CreateRow {
            data_source_id: "ds".into(),
            title: "T".into(),
            extra: vec![],
        },
        Operation::UpdateProperty {
            page_id: "p".into(),
            updates: vec![],
        },
        Operation::UpdateBlock {
            block_id: "b".into(),
            block_type: "paragraph".into(),
            update: BlockUpdate::RichText {
                rich_text: vec![span],
            },
        },
        Operation::AppendBlock {
            parent_id: "pg".into(),
            block: NewBlock::Paragraph { text: "x".into() },
        },
        Operation::AppendBlocks {
            parent_id: "pg".into(),
            blocks: vec![],
            position: BlockPosition::Start {},
        },
        Operation::DeleteBlock {
            block_id: "b".into(),
        },
    ];
    for op in ops {
        assert_eq!(queue.submit(op, &c).await, Outcome::Saved);
    }
    assert_eq!(
        paths(s.received_requests().await.unwrap()),
        [
            "GET /data_sources/ds",
            "POST /pages",
            "PATCH /pages/p",
            "PATCH /blocks/b",
            "PATCH /blocks/pg/children",
            "PATCH /blocks/pg/children",
            "DELETE /blocks/b"
        ]
    );
}
