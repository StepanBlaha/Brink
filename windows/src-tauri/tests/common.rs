#![allow(dead_code)]
use brink_lib::notion::client::NotionClient;
use std::sync::Arc;

pub fn client(uri: &str, token: Option<&str>) -> NotionClient {
    let t = token.map(str::to_string);
    NotionClient::with_base_url(Arc::new(move || t.clone()), uri)
}

pub const SCHEMA: &str = r#"{"object":"data_source","id":"ds-1","title":[{"plain_text":"Tasks"}],
 "properties":{"Name":{"id":"title","name":"Name","type":"title","title":{}},
 "Done":{"id":"d","name":"Done","type":"checkbox","checkbox":{}}}}"#;
