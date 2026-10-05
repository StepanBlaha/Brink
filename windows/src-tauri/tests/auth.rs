use brink_lib::commands::AppState;
use brink_lib::paths::Paths;
use brink_lib::secrets::MemoryBackend;
use serde_json::json;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn state(uri: &str) -> (tempfile::TempDir, AppState) {
    let d = tempfile::tempdir().unwrap();
    let p = Paths {
        data: d.path().join("data"),
        cache: d.path().join("cache"),
        logs: d.path().join("logs"),
    };
    (
        d,
        AppState::new(p, Box::new(MemoryBackend::new()), Some(uri.to_string())),
    )
}

#[tokio::test]
async fn auth_flow_status_test_connection_and_disconnect() {
    let s = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/search"))
        .and(header("Authorization", "Bearer secret_x"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"results":[{"id":"a"},{"id":"b"}],"has_more":false})),
        )
        .mount(&s)
        .await;
    let (_d, st) = state(&s.uri());
    assert_eq!(st.auth_status(), json!({"kind": null}));
    assert!(st.save_token("   ").is_err());
    st.save_token("  secret_x ").unwrap();
    assert_eq!(st.auth_status(), json!({"kind": "internal"}));
    assert!(
        !st.auth_status().to_string().contains("secret_x"),
        "status never carries the token"
    );
    assert_eq!(st.client.search(None).await.unwrap().len(), 2);
    st.tokens.delete();
    assert_eq!(st.auth_status(), json!({"kind": null}));
    assert!(st.client.search(None).await.is_err());
}

#[tokio::test]
async fn cover_get_downloads_once_then_serves_from_cache() {
    let s = MockServer::start().await;
    Mock::given(path("/img.png"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![7u8; 10]))
        .expect(1)
        .mount(&s)
        .await;
    let (_d, st) = state(&s.uri());
    let url = format!("{}/img.png?sig=1", s.uri());
    let a = st.cover_get(&url, "p").await.unwrap();
    assert_eq!(std::fs::read(&a).unwrap(), vec![7u8; 10]);
    let b = st
        .cover_get(&format!("{}/img.png?sig=2", s.uri()), "p")
        .await
        .unwrap();
    assert_eq!(a, b);
}

#[tokio::test]
async fn cover_get_refreshes_an_expired_url_via_the_page() {
    let s = MockServer::start().await;
    Mock::given(path("/old.png"))
        .respond_with(ResponseTemplate::new(403))
        .mount(&s)
        .await;
    Mock::given(path("/new.png"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![1u8, 2]))
        .mount(&s)
        .await;
    let page =
        json!({"id":"p","cover":{"type":"file","file":{"url": format!("{}/new.png", s.uri())}}});
    Mock::given(path("/pages/p"))
        .respond_with(ResponseTemplate::new(200).set_body_json(page))
        .mount(&s)
        .await;
    let (_d, st) = state(&s.uri());
    st.save_token("t").unwrap();
    let f = st
        .cover_get(&format!("{}/old.png", s.uri()), "p")
        .await
        .unwrap();
    assert_eq!(std::fs::read(f).unwrap(), vec![1u8, 2]);
}
