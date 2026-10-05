//! Endpoint methods (port of NotionClient.swift); payloads stay `serde_json::Value`
//! because the TypeScript side owns the typed models.

use super::client::NotionClient;
use super::encode::*;
use super::error::NotionError;
use super::types::*;
use serde_json::{json, Map, Value};

fn results(page: &Value) -> Vec<Value> {
    page.get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

impl NotionClient {
    /// Loops while `has_more`, passing `next_cursor` as `start_cursor`. No `page_size` is sent.
    async fn paginate<F, Fut>(&self, fetch: F) -> Result<Vec<Value>, NotionError>
    where
        F: Fn(Option<String>) -> Fut,
        Fut: std::future::Future<Output = Result<Value, NotionError>>,
    {
        let mut items = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let page = fetch(cursor.take()).await?;
            items.extend(results(&page));
            let has_more = page
                .get("has_more")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            cursor = if has_more {
                page.get("next_cursor")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            } else {
                None
            };
            if cursor.is_none() {
                return Ok(items);
            }
        }
    }

    pub async fn search(&self, query: Option<&str>) -> Result<Vec<Value>, NotionError> {
        self.paginate(|cursor| async move {
            let mut body = Map::new();
            if let Some(q) = query.filter(|q| !q.is_empty()) {
                body.insert("query".into(), json!(q));
            }
            if let Some(c) = cursor {
                body.insert("start_cursor".into(), json!(c));
            }
            self.request("POST", "search", &[], Some(Value::Object(body)))
                .await
        })
        .await
    }

    /// The `data_sources[]` of a database (`{id, name}` objects).
    pub async fn retrieve_database(&self, id: &str) -> Result<Vec<Value>, NotionError> {
        let r = self
            .request("GET", &format!("databases/{id}"), &[], None)
            .await?;
        Ok(r.get("data_sources")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default())
    }

    pub async fn retrieve_data_source(&self, id: &str) -> Result<Value, NotionError> {
        self.request("GET", &format!("data_sources/{id}"), &[], None)
            .await
    }

    pub async fn query_data_source(
        &self,
        id: &str,
        filter: Option<Value>,
        sorts: Option<Value>,
    ) -> Result<Vec<Value>, NotionError> {
        self.paginate(|cursor| {
            let (filter, sorts) = (filter.clone(), sorts.clone());
            async move {
                let mut body = Map::new();
                if let Some(f) = filter {
                    body.insert("filter".into(), f);
                }
                if let Some(s) = sorts {
                    body.insert("sorts".into(), s);
                }
                if let Some(c) = cursor {
                    body.insert("start_cursor".into(), json!(c));
                }
                self.request(
                    "POST",
                    &format!("data_sources/{id}/query"),
                    &[],
                    Some(Value::Object(body)),
                )
                .await
            }
        })
        .await
    }

    pub async fn create_row(
        &self,
        data_source_id: &str,
        title: &str,
        extra: &[PropertyUpdate],
    ) -> Result<Value, NotionError> {
        let schema = self.retrieve_data_source(data_source_id).await?;
        let title_name = title_property_name(&schema).ok_or_else(|| {
            NotionError::Decoding(format!(
                "Data source {data_source_id} has no title property"
            ))
        })?;
        let mut props = Map::new();
        props.insert(title_name, json!({ "title": encode_text(title) }));
        for u in extra {
            if let Some(j) = property_request_json(&u.value) {
                props.insert(u.name.clone(), j);
            }
        }
        let body = json!({
            "parent": {"type": "data_source_id", "data_source_id": data_source_id},
            "properties": props,
        });
        self.request("POST", "pages", &[], Some(body)).await
    }

    pub async fn update_page_properties(
        &self,
        page_id: &str,
        updates: &[PropertyUpdate],
    ) -> Result<Value, NotionError> {
        let mut props = Map::new();
        for u in updates {
            if let Some(j) = property_request_json(&u.value) {
                props.insert(u.name.clone(), j);
            }
        }
        self.request(
            "PATCH",
            &format!("pages/{page_id}"),
            &[],
            Some(json!({ "properties": props })),
        )
        .await
    }

    /// `body` is the finished PATCH body.
    pub async fn update_page_raw(&self, page_id: &str, body: Value) -> Result<Value, NotionError> {
        self.request("PATCH", &format!("pages/{page_id}"), &[], Some(body))
            .await
    }

    pub async fn set_page_emoji_icon(
        &self,
        page_id: &str,
        emoji: &str,
    ) -> Result<Value, NotionError> {
        let body = json!({"icon": {"type": "emoji", "emoji": emoji}});
        self.request("PATCH", &format!("pages/{page_id}"), &[], Some(body))
            .await
    }

    pub async fn retrieve_page(&self, id: &str) -> Result<Value, NotionError> {
        self.request("GET", &format!("pages/{id}"), &[], None).await
    }

    pub async fn block_children(&self, id: &str) -> Result<Vec<Value>, NotionError> {
        self.paginate(|cursor| async move {
            let q: Vec<(&str, String)> = cursor.into_iter().map(|c| ("start_cursor", c)).collect();
            self.request("GET", &format!("blocks/{id}/children"), &q, None)
                .await
        })
        .await
    }

    pub async fn retrieve_block(&self, id: &str) -> Result<Value, NotionError> {
        self.request("GET", &format!("blocks/{id}"), &[], None)
            .await
    }

    /// `payload` is the finished PATCH body (TS commands send it ready-made).
    pub async fn update_block_raw(&self, id: &str, payload: Value) -> Result<Value, NotionError> {
        self.request("PATCH", &format!("blocks/{id}"), &[], Some(payload))
            .await
    }

    pub async fn update_block(
        &self,
        id: &str,
        ty: &str,
        update: &BlockUpdate,
    ) -> Result<Value, NotionError> {
        self.update_block_raw(id, block_update_request_json(ty, update))
            .await
    }

    /// `children` are finished API block objects; `position` is the API `position` value.
    pub async fn append_blocks_raw(
        &self,
        parent_id: &str,
        children: Vec<Value>,
        position: Option<Value>,
    ) -> Result<Vec<Value>, NotionError> {
        let mut body = Map::new();
        body.insert("children".into(), Value::Array(children));
        if let Some(p) = position {
            body.insert("position".into(), p);
        }
        let r = self
            .request(
                "PATCH",
                &format!("blocks/{parent_id}/children"),
                &[],
                Some(Value::Object(body)),
            )
            .await?;
        Ok(results(&r))
    }

    pub async fn append_blocks(
        &self,
        parent_id: &str,
        blocks: &[NewBlock],
        position: &BlockPosition,
    ) -> Result<Vec<Value>, NotionError> {
        let children = blocks.iter().map(new_block_request_json).collect();
        self.append_blocks_raw(parent_id, children, position_request_json(position))
            .await
    }

    pub async fn delete_block(&self, id: &str) -> Result<(), NotionError> {
        self.perform_request(
            "DELETE",
            &format!("blocks/{id}"),
            &[],
            super::client::Body::None,
        )
        .await
        .map(|_| ())
    }
}

/// First `title`-typed property by name order (Swift sorts properties by name).
pub fn title_property_name(schema: &Value) -> Option<String> {
    let props = schema.get("properties")?.as_object()?;
    let mut names: Vec<&String> = props.keys().collect();
    names.sort();
    names
        .into_iter()
        .find(|n| props[*n].get("type").and_then(Value::as_str) == Some("title"))
        .cloned()
}
