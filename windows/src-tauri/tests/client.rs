mod common;
use brink_lib::notion::{NotionError, API_VERSION};
use common::*;
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use wiremock::matchers::{body_json, header, method, path, query_param};
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

fn schema_ok() -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_raw(SCHEMA, "application/json")
}

#[tokio::test]
async fn retries_after_429_honoring_retry_after_then_succeeds() {
    let s = MockServer::start().await;
    Mock::given(path("/data_sources/ds-1"))
        .respond_with(ResponseTemplate::new(429).insert_header("Retry-After", "1"))
        .up_to_n_times(1)
        .mount(&s)
        .await;
    Mock::given(path("/data_sources/ds-1"))
        .respond_with(schema_ok())
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("test-token"));
    let t = Instant::now();
    let v = c.retrieve_data_source("ds-1").await.unwrap();
    assert_eq!(v["id"], "ds-1");
    assert!(
        t.elapsed() >= Duration::from_millis(900),
        "waited out Retry-After"
    );
}

#[tokio::test]
async fn gives_up_after_exhausting_retries_on_repeated_429s() {
    let s = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(429).insert_header("Retry-After", "0"))
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("test-token"));
    assert_eq!(
        c.retrieve_data_source("ds-1").await.unwrap_err(),
        NotionError::RateLimited
    );
    assert_eq!(s.received_requests().await.unwrap().len(), 4);
}

struct Stamp(Arc<Mutex<Vec<Instant>>>);
impl Respond for Stamp {
    fn respond(&self, _: &Request) -> ResponseTemplate {
        self.0.lock().unwrap().push(Instant::now());
        schema_ok()
    }
}

#[tokio::test]
async fn spaces_consecutive_requests_by_the_minimum_interval() {
    let s = MockServer::start().await;
    let stamps = Arc::new(Mutex::new(vec![]));
    Mock::given(method("GET"))
        .respond_with(Stamp(stamps.clone()))
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("test-token"));
    for _ in 0..3 {
        c.retrieve_data_source("ds-1").await.unwrap();
    }
    let t = stamps.lock().unwrap().clone();
    assert_eq!(t.len(), 3);
    for w in t.windows(2) {
        let gap = w[1] - w[0];
        assert!(gap >= Duration::from_millis(300), "gap {gap:?}");
        assert!(gap <= Duration::from_millis(450), "gap {gap:?}");
    }
}

#[tokio::test]
async fn maps_401_and_404_to_typed_errors() {
    let s = MockServer::start().await;
    Mock::given(path("/data_sources/a"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&s)
        .await;
    Mock::given(path("/data_sources/b"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("test-token"));
    assert_eq!(
        c.retrieve_data_source("a").await.unwrap_err(),
        NotionError::Unauthorized
    );
    assert_eq!(
        c.retrieve_data_source("b").await.unwrap_err(),
        NotionError::NotFound
    );
}

#[tokio::test]
async fn missing_token_fails_before_any_request() {
    let s = MockServer::start().await;
    let c = client(&s.uri(), None);
    assert_eq!(
        c.retrieve_data_source("ds-1").await.unwrap_err(),
        NotionError::MissingToken
    );
    assert!(s.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn sends_version_and_bearer_headers() {
    let s = MockServer::start().await;
    Mock::given(path("/data_sources/ds-1"))
        .and(header("Notion-Version", "2025-09-03"))
        .and(header("Authorization", "Bearer test-token"))
        .and(header("Content-Type", "application/json"))
        .respond_with(schema_ok())
        .expect(1)
        .mount(&s)
        .await;
    assert_eq!(API_VERSION, "2025-09-03");
    client(&s.uri(), Some("test-token"))
        .retrieve_data_source("ds-1")
        .await
        .unwrap();
}

#[tokio::test]
async fn retries_a_5xx_once_then_maps_the_body() {
    let s = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(503)
                .set_body_json(json!({"code":"service_unavailable","message":"down"})),
        )
        .mount(&s)
        .await;
    let t = Instant::now();
    let e = client(&s.uri(), Some("t"))
        .retrieve_data_source("x")
        .await
        .unwrap_err();
    assert_eq!(
        e,
        NotionError::Api {
            code: "service_unavailable".into(),
            message: "down".into()
        }
    );
    assert!(t.elapsed() >= Duration::from_millis(450));
    assert_eq!(s.received_requests().await.unwrap().len(), 2);
}

#[tokio::test]
async fn retry_counter_is_shared_between_429_and_5xx() {
    let s = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(429).insert_header("Retry-After", "0"))
        .up_to_n_times(1)
        .mount(&s)
        .await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&s)
        .await;
    let e = client(&s.uri(), Some("t"))
        .retrieve_data_source("x")
        .await
        .unwrap_err();
    assert_eq!(
        e,
        NotionError::Api {
            code: "500".into(),
            message: "HTTP 500".into()
        }
    );
    assert_eq!(
        s.received_requests().await.unwrap().len(),
        2,
        "no 5xx retry after a 429"
    );
}

#[tokio::test]
async fn other_statuses_decode_code_and_message() {
    let s = MockServer::start().await;
    Mock::given(path("/data_sources/v"))
        .respond_with(
            ResponseTemplate::new(400)
                .set_body_json(json!({"code":"validation_error","message":"bad"})),
        )
        .mount(&s)
        .await;
    Mock::given(path("/data_sources/u"))
        .respond_with(ResponseTemplate::new(418).set_body_string("nope"))
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("t"));
    assert_eq!(
        c.retrieve_data_source("v").await.unwrap_err(),
        NotionError::Api {
            code: "validation_error".into(),
            message: "bad".into()
        }
    );
    assert_eq!(
        c.retrieve_data_source("u").await.unwrap_err(),
        NotionError::Api {
            code: "418".into(),
            message: "HTTP 418".into()
        }
    );
}

#[tokio::test]
async fn undecodable_success_body_is_a_decoding_error() {
    let s = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_string("<html>"))
        .mount(&s)
        .await;
    let e = client(&s.uri(), Some("t"))
        .retrieve_data_source("x")
        .await
        .unwrap_err();
    assert!(matches!(e, NotionError::Decoding(_)));
}

#[tokio::test]
async fn refreshes_once_on_401_when_a_hook_supplies_a_new_token() {
    let s = MockServer::start().await;
    Mock::given(path("/data_sources/ds-1"))
        .and(header("Authorization", "Bearer old"))
        .respond_with(ResponseTemplate::new(401))
        .expect(1)
        .mount(&s)
        .await;
    Mock::given(path("/data_sources/ds-1"))
        .and(header("Authorization", "Bearer new"))
        .respond_with(schema_ok())
        .expect(1)
        .mount(&s)
        .await;
    let tok = Arc::new(Mutex::new("old".to_string()));
    let (t1, t2) = (tok.clone(), tok.clone());
    let c = brink_lib::notion::NotionClient::with_base_url(
        Arc::new(move || Some(t1.lock().unwrap().clone())),
        s.uri(),
    )
    .with_unauthorized_hook(Arc::new(move |rejected| {
        let t2 = t2.clone();
        Box::pin(async move {
            assert_eq!(rejected, "old");
            *t2.lock().unwrap() = "new".into();
            true
        })
    }));
    assert_eq!(c.retrieve_data_source("ds-1").await.unwrap()["id"], "ds-1");
}

#[tokio::test]
async fn failed_refresh_means_unauthorized_without_looping() {
    let s = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&s)
        .await;
    let c =
        client(&s.uri(), Some("t")).with_unauthorized_hook(Arc::new(|_| Box::pin(async { false })));
    assert_eq!(
        c.retrieve_data_source("x").await.unwrap_err(),
        NotionError::Unauthorized
    );
    assert_eq!(s.received_requests().await.unwrap().len(), 1);
}

#[tokio::test]
async fn query_paginates_with_cursors_and_never_sends_page_size() {
    let s = MockServer::start().await;
    Mock::given(path("/data_sources/ds/query"))
        .and(body_json(json!({"filter": {"a": 1}, "sorts": []})))
        .respond_with(ResponseTemplate::new(200).set_body_json(
            json!({"results":[{"id":"1"},{"id":"2"}],"has_more":true,"next_cursor":"c2"}),
        ))
        .mount(&s)
        .await;
    Mock::given(path("/data_sources/ds/query"))
        .and(body_json(
            json!({"filter": {"a": 1}, "sorts": [], "start_cursor": "c2"}),
        ))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"results":[{"id":"3"}],"has_more":false,"next_cursor":null})),
        )
        .mount(&s)
        .await;
    let rows = client(&s.uri(), Some("t"))
        .query_data_source("ds", Some(json!({"a": 1})), Some(json!([])))
        .await
        .unwrap();
    assert_eq!(rows.len(), 3);
}

#[tokio::test]
async fn search_omits_empty_query_and_block_children_use_start_cursor_query() {
    let s = MockServer::start().await;
    Mock::given(path("/search"))
        .and(body_json(json!({})))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"results":[{"id":"p"}],"has_more":false})),
        )
        .mount(&s)
        .await;
    Mock::given(path("/blocks/b/children"))
        .and(query_param("start_cursor", "k"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"results":[{"id":"2"}],"has_more":false})),
        )
        .mount(&s)
        .await;
    Mock::given(path("/blocks/b/children"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"results":[{"id":"1"}],"has_more":true,"next_cursor":"k"})),
        )
        .mount(&s)
        .await;
    let c = client(&s.uri(), Some("t"));
    assert_eq!(c.search(Some("")).await.unwrap().len(), 1);
    let ids: Vec<_> = c
        .block_children("b")
        .await
        .unwrap()
        .iter()
        .map(|b| b["id"].clone())
        .collect();
    assert_eq!(ids, vec![json!("1"), json!("2")]);
}
