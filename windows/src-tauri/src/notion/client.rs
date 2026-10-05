//! Transport (port of NotionClient.swift `performRequest`): auth, version header, one shared
//! rate limiter, 429/5xx/401 retry rules, status to error mapping.

use super::error::NotionError;
use super::rate_limiter::RateLimiter;
use crate::logging::Logger;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::Instant;

pub const API_VERSION: &str = "2025-09-03";
pub const BASE_URL: &str = "https://api.notion.com/v1";
pub const MIN_SPACING: Duration = Duration::from_millis(340);
/// Per-request timeout (connect plus response).
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// 429 retries (each waits out `Retry-After`); a separate budget from 5xx/network failures.
pub const MAX_RATE_LIMIT_RETRIES: u32 = 5;
/// 5xx and network-failure retries, with exponential backoff.
pub const MAX_SERVER_RETRIES: u32 = 3;
const BACKOFF_BASE: Duration = Duration::from_millis(500);

pub type TokenProvider = Arc<dyn Fn() -> Option<String> + Send + Sync>;
/// Called once on a 401 with the rejected token; true means a fresh token is available.
pub type UnauthorizedHook =
    Arc<dyn Fn(String) -> Pin<Box<dyn Future<Output = bool> + Send>> + Send + Sync>;

pub enum Body {
    None,
    Json(Value),
    /// Sent as is with its own Content-Type (multipart file upload).
    Raw {
        data: Vec<u8>,
        content_type: String,
    },
}

pub struct NotionClient {
    base_url: String,
    token: TokenProvider,
    on_unauthorized: Option<UnauthorizedHook>,
    http: reqwest::Client,
    limiter: RateLimiter,
    logger: Option<Arc<Logger>>,
}

impl NotionClient {
    pub fn new(token: TokenProvider) -> Self {
        let base = std::env::var("NOTION_BASE_URL")
            .ok()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| BASE_URL.to_string());
        Self::with_base_url(token, base)
    }

    pub fn with_base_url(token: TokenProvider, base_url: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("reqwest client");
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            token,
            on_unauthorized: None,
            http,
            limiter: RateLimiter::new(MIN_SPACING),
            logger: None,
        }
    }

    pub fn with_unauthorized_hook(mut self, hook: UnauthorizedHook) -> Self {
        self.on_unauthorized = Some(hook);
        self
    }

    pub fn with_logger(mut self, logger: Arc<Logger>) -> Self {
        self.logger = Some(logger);
        self
    }

    fn log(&self, msg: &str) {
        if let Some(l) = &self.logger {
            l.info(msg);
        }
    }

    /// JSON request decoded into a `Value`. Empty bodies decode to `Null`.
    pub async fn request(
        &self,
        method: &str,
        path: &str,
        query: &[(&str, String)],
        body: Option<Value>,
    ) -> Result<Value, NotionError> {
        let b = body.map_or(Body::None, Body::Json);
        let bytes = self.perform_request(method, path, query, b).await?;
        if bytes.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&bytes).map_err(|e| NotionError::Decoding(e.to_string()))
    }

    pub async fn perform_request(
        &self,
        method: &str,
        path: &str,
        query: &[(&str, String)],
        body: Body,
    ) -> Result<Vec<u8>, NotionError> {
        let mut rate_retries = 0u32;
        let mut server_retries = 0u32;
        let mut did_refresh = false;
        loop {
            let token = (self.token)()
                .filter(|t| !t.is_empty())
                .ok_or(NotionError::MissingToken)?;
            let url = format!("{}/{}", self.base_url, path);
            let m = reqwest::Method::from_bytes(method.as_bytes())
                .map_err(|e| NotionError::Network(e.to_string()))?;
            let mut req = self
                .http
                .request(m, &url)
                .header("Authorization", format!("Bearer {token}"))
                .header("Notion-Version", API_VERSION);
            if !query.is_empty() {
                req = req.query(query);
            }
            req = match &body {
                Body::None => req.header("Content-Type", "application/json"),
                Body::Json(v) => req
                    .header("Content-Type", "application/json")
                    .body(serde_json::to_vec(v).unwrap_or_default()),
                Body::Raw { data, content_type } => {
                    req.header("Content-Type", content_type).body(data.clone())
                }
            };

            self.limiter.acquire().await;
            let resp = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    let err = NotionError::Network(e.without_url().to_string());
                    if server_retries >= MAX_SERVER_RETRIES {
                        return Err(err);
                    }
                    self.log(&format!("{method} {path} -> network error, retrying"));
                    tokio::time::sleep(BACKOFF_BASE * 2u32.pow(server_retries)).await;
                    server_retries += 1;
                    continue;
                }
            };
            let status = resp.status().as_u16();
            let retry_after = resp
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.trim().parse::<f64>().ok());
            let data = resp
                .bytes()
                .await
                .map_err(|e| NotionError::Network(e.without_url().to_string()))?
                .to_vec();
            self.log(&format!("{method} {path} -> {status}"));

            match status {
                200..=299 => return Ok(data),
                429 => {
                    if rate_retries >= MAX_RATE_LIMIT_RETRIES {
                        return Err(NotionError::RateLimited);
                    }
                    let wait = Duration::from_secs_f64(retry_after.unwrap_or(1.0).max(0.0));
                    self.limiter.delay_until(Instant::now() + wait).await;
                    tokio::time::sleep(wait).await;
                    rate_retries += 1;
                }
                500..=599 => {
                    if server_retries >= MAX_SERVER_RETRIES {
                        return Err(decode_api_error(&data, status));
                    }
                    tokio::time::sleep(BACKOFF_BASE * 2u32.pow(server_retries)).await;
                    server_retries += 1;
                }
                401 => {
                    if !did_refresh {
                        if let Some(hook) = &self.on_unauthorized {
                            if hook(token).await {
                                did_refresh = true;
                                continue;
                            }
                        }
                    }
                    return Err(NotionError::Unauthorized);
                }
                404 => return Err(NotionError::NotFound),
                _ => return Err(decode_api_error(&data, status)),
            }
        }
    }
}

fn decode_api_error(data: &[u8], status: u16) -> NotionError {
    if let Ok(v) = serde_json::from_slice::<Value>(data) {
        if v.is_object() {
            let code = v
                .get("code")
                .and_then(Value::as_str)
                .map_or_else(|| status.to_string(), str::to_string);
            let message = v
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Unknown error")
                .to_string();
            return NotionError::Api { code, message };
        }
    }
    NotionError::Api {
        code: status.to_string(),
        message: format!("HTTP {status}"),
    }
}
