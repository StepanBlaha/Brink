//! Shared app state: paths, token store, Notion client, stores, write queue.

use crate::notion::NotionClient;
use crate::paths::{self, Paths};
use crate::queue::WriteQueue;
use crate::secrets::{self, SecretBackend, TokenStore};
use crate::store::cache::Cache;
use crate::store::covers::{self, CoverCache, Download};
use crate::store::pins::PinStore;
use crate::store::settings::Settings;
use serde_json::Value;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub paths: Paths,
    pub tokens: Arc<TokenStore>,
    pub client: Arc<NotionClient>,
    pub pins: Mutex<PinStore>,
    pub settings: Mutex<Settings>,
    pub queue: Arc<WriteQueue>,
    pub cache: Cache,
    pub covers: CoverCache,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn production() -> Self {
        Self::new(paths::resolve(), secrets::default_backend(), None)
    }

    /// `base_url` overrides the Notion API (tests, demo server).
    pub fn new(paths: Paths, backend: Box<dyn SecretBackend>, base_url: Option<String>) -> Self {
        let tokens = Arc::new(TokenStore::new(backend));
        let t = tokens.clone();
        let provider: crate::notion::client::TokenProvider = Arc::new(move || t.load());
        let mut client = match base_url {
            Some(u) => NotionClient::with_base_url(provider, u),
            None => NotionClient::new(provider),
        };
        client = client.with_logger(Arc::new(crate::logging::Logger::new(&paths.logs)));
        Self {
            tokens,
            client: Arc::new(client),
            pins: Mutex::new(PinStore::open(
                paths.data.join("pins.json"),
                paths.data.join("groups.json"),
            )),
            settings: Mutex::new(Settings::open(paths.data.join("settings.json"))),
            queue: Arc::new(WriteQueue::open(paths.data.join("pending.json"))),
            cache: Cache::new(&paths.cache),
            covers: CoverCache::new(&paths.cache),
            http: reqwest::Client::new(),
            paths,
        }
    }

    /// `{ kind: "internal" | "oauth" | null, workspace? }`; never the token.
    pub fn auth_status(&self) -> Value {
        let mut v = serde_json::json!({ "kind": self.tokens.kind() });
        if let Some(w) = self.tokens.load_workspace() {
            v["workspace"] = serde_json::to_value(w).unwrap_or(Value::Null);
        }
        v
    }

    pub fn save_token(&self, token: &str) -> Result<(), String> {
        let t = token.trim();
        if t.is_empty() {
            return Err("The token is empty.".into());
        }
        self.tokens.save(t).map_err(|e| e.0)
    }

    /// Local path of the cached cover; refetches a fresh signed URL once on 403.
    pub async fn cover_get(&self, url: &str, page_id: &str) -> Result<String, String> {
        if let Some(f) = self.covers.cached(url) {
            return Ok(f.to_string_lossy().into_owned());
        }
        let stored = match covers::download(&self.http, url).await {
            Download::Ok(d) => self.covers.store(url, &d),
            Download::Expired => {
                let page = self
                    .client
                    .retrieve_page(page_id)
                    .await
                    .map_err(|e| e.message())?;
                let fresh = cover_url(&page).ok_or("Cover not available")?;
                match covers::download(&self.http, &fresh).await {
                    Download::Ok(d) => self.covers.store(&fresh, &d),
                    _ => None,
                }
            }
            Download::Failed => None,
        };
        stored
            .map(|f| f.to_string_lossy().into_owned())
            .ok_or_else(|| "Cover download failed".into())
    }
}

pub fn cover_url(page: &Value) -> Option<String> {
    let c = page.get("cover")?;
    let ty = c.get("type")?.as_str()?;
    c.get(ty)?.get("url")?.as_str().map(str::to_string)
}
