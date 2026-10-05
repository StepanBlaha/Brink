//! Notion HTTP client (plan 3.d).

pub mod client;
pub mod encode;
pub mod endpoints;
pub mod error;
pub mod rate_limiter;
pub mod types;
pub mod upload;

pub use client::{NotionClient, API_VERSION};
pub use error::NotionError;
