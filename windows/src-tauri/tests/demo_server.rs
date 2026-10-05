//! The demo fake Notion over real HTTP, through the real `NotionClient` (reqwest).
use brink_lib::demo::{content, server};
use brink_lib::notion::client::NotionClient;
use serde_json::{json, Value};
use std::sync::Arc;

fn setup() -> (NotionClient, server::Server) {
    let srv = server::start().unwrap();
    let c = NotionClient::with_base_url(
        Arc::new(|| Some("demo_fake_token_not_real".to_string())),
        srv.base_url(),
    );
    (c, srv)
}

fn title(v: &Value) -> String {
    let t = v["properties"]["Name"]["title"]
        .as_array()
        .or_else(|| v["title"].as_array());
    t.into_iter()
        .flatten()
        .filter_map(|x| x["plain_text"].as_str())
        .collect()
}

#[tokio::test]
async fn binds_loopback_and_search_lists_the_workspace() {
    let (c, srv) = setup();
    assert!(srv.addr.ip().is_loopback() && srv.addr.port() != 0);
    let all = c.search(None).await.unwrap();
    assert_eq!(all.len(), 8);
    let hits = c.search(Some("sprint")).await.unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0]["object"], "data_source");
    assert_eq!(c.search(Some("zzz")).await.unwrap().len(), 0);
}

#[tokio::test]
async fn seeded_pages_have_the_mac_blocks() {
    let (c, _srv) = setup();
    let groceries = c.block_children(content::GROCERIES_PAGE).await.unwrap();
    assert_eq!(groceries.len(), 5);
    assert_eq!(groceries[4]["to_do"]["checked"], true);
    let launch = c.block_children(content::LAUNCH_PAGE).await.unwrap();
    assert_eq!(launch.len(), 10);
    assert_eq!(launch[0]["type"], "callout");
    assert_eq!(launch[0]["callout"]["icon"]["emoji"], "\u{1F4A1}");
    let toggle = launch.iter().find(|b| b["type"] == "toggle").unwrap();
    assert_eq!(toggle["has_children"], true);
    let inner = c
        .block_children(toggle["id"].as_str().unwrap())
        .await
        .unwrap();
    assert_eq!(inner.len(), 2);
    let page = c.retrieve_page(content::READING_PAGE).await.unwrap();
    assert_eq!(page["icon"]["emoji"], "\u{1F4DA}");
    assert_eq!(
        c.block_children(content::READING_PAGE).await.unwrap().len(),
        4
    );
}

#[tokio::test]
async fn sprint_schema_rows_filter_and_sort() {
    let (c, _srv) = setup();
    let schema = c
        .retrieve_data_source(content::SPRINT_DATA_SOURCE)
        .await
        .unwrap();
    let statuses = schema["properties"]["Status"]["status"]["options"]
        .as_array()
        .unwrap();
    assert_eq!(statuses.len(), 3);
    let all = c
        .query_data_source(content::SPRINT_DATA_SOURCE, None, None)
        .await
        .unwrap();
    assert_eq!(all.len(), 6);
    assert_eq!(
        title(&all[0]),
        "Update the app icon",
        "sorted by due date, yesterday first"
    );
    let open = json!({ "property": "Done", "checkbox": { "equals": false } });
    let rows = c
        .query_data_source(content::SPRINT_DATA_SOURCE, Some(open), None)
        .await
        .unwrap();
    assert_eq!(rows.len(), 5);
    let st = json!({ "and": [{ "property": "Status", "status": { "equals": "In progress" } }] });
    let rows = c
        .query_data_source(content::SPRINT_DATA_SOURCE, Some(st), None)
        .await
        .unwrap();
    assert_eq!(rows.len(), 2);
}

#[tokio::test]
async fn rows_update_and_create() {
    let (c, _srv) = setup();
    let page = c
        .update_page_raw(
            "demo-row-1",
            json!({ "properties": { "Done": { "checkbox": true } } }),
        )
        .await
        .unwrap();
    assert_eq!(page["properties"]["Done"]["checkbox"], true);
    let open = json!({ "property": "Done", "checkbox": { "equals": false } });
    let rows = c
        .query_data_source(content::SPRINT_DATA_SOURCE, Some(open), None)
        .await
        .unwrap();
    assert_eq!(rows.len(), 4);
    let created = c
        .create_row(content::SPRINT_DATA_SOURCE, "Book travel", &[])
        .await
        .unwrap();
    assert_eq!(title(&created), "Book travel");
    let all = c
        .query_data_source(content::SPRINT_DATA_SOURCE, None, None)
        .await
        .unwrap();
    assert_eq!(all.len(), 7);
}

#[tokio::test]
async fn blocks_append_patch_delete() {
    let (c, srv) = setup();
    let kid = |t: &str| {
        json!({ "type": "paragraph", "paragraph": { "rich_text": [
        { "type": "text", "text": { "content": t } }] } })
    };
    let made = c
        .append_blocks_raw(
            content::GROCERIES_PAGE,
            vec![kid("Eggs")],
            Some(json!({ "type": "start" })),
        )
        .await
        .unwrap();
    let id = made[0]["id"].as_str().unwrap().to_string();
    assert_eq!(made[0]["paragraph"]["rich_text"][0]["plain_text"], "Eggs");
    let first = c.block_children(content::GROCERIES_PAGE).await.unwrap();
    assert_eq!(first[0]["id"], id.as_str());
    c.update_block_raw(&id, json!({ "paragraph": { "rich_text": [
        { "type": "text", "text": { "content": "Free-range eggs", "link": { "url": "https://x.test" } } }] } }))
        .await.unwrap();
    let got = c.retrieve_block(&id).await.unwrap();
    assert_eq!(
        got["paragraph"]["rich_text"][0]["plain_text"],
        "Free-range eggs"
    );
    assert_eq!(got["paragraph"]["rich_text"][0]["href"], "https://x.test");
    c.delete_block(&id).await.unwrap();
    assert_eq!(
        c.block_children(content::GROCERIES_PAGE)
            .await
            .unwrap()
            .len(),
        5
    );
    assert!(
        c.retrieve_block(&id).await.is_err(),
        "deleted blocks are gone"
    );
    let log = srv.store.lock().unwrap().drain_log();
    assert!(log.contains("PATCH /v1/blocks/demo-page-groceries/children"));
    assert!(log.contains("DELETE /v1/blocks/"));
}

#[tokio::test]
async fn uploads_attach_as_an_image() {
    let (c, _srv) = setup();
    let png = [137u8, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3];
    let id = c.upload_file(&png, "shot.png", "image/png").await.unwrap();
    let image =
        json!({ "type": "image", "image": { "type": "file_upload", "file_upload": { "id": id } } });
    let made = c
        .append_blocks_raw(content::READING_PAGE, vec![image], None)
        .await
        .unwrap();
    assert_eq!(made[0]["image"]["type"], "file");
    let url = made[0]["image"]["file"]["url"].as_str().unwrap();
    assert!(
        url.starts_with("data:image/png;base64,iVBORw0KGgo"),
        "{url}"
    );
}

#[tokio::test]
async fn unknown_routes_are_404() {
    let (c, _srv) = setup();
    assert!(c.retrieve_page("nope").await.is_err());
    assert!(c.retrieve_block("nope").await.is_err());
}
