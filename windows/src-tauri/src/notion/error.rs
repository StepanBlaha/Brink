//! `NotionError` (port of NotionError.swift) with the exact user-facing messages.

use crate::error::AppError;
use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotionError {
    Unauthorized,
    NotFound,
    NotShared,
    RateLimited,
    Api {
        code: String,
        message: String,
    },
    Decoding(String),
    Network(String),
    MissingToken,
    /// Upload guard errors (FileUploadError in Swift).
    TooLarge {
        bytes: usize,
    },
    NotUploaded {
        status: String,
    },
}

impl NotionError {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Unauthorized => "unauthorized",
            Self::NotFound => "notFound",
            Self::NotShared => "notShared",
            Self::RateLimited => "rateLimited",
            Self::Api { .. } => "api",
            Self::Decoding(_) => "decoding",
            Self::Network(_) => "network",
            Self::MissingToken => "missingToken",
            Self::TooLarge { .. } => "tooLarge",
            Self::NotUploaded { .. } => "notUploaded",
        }
    }

    /// Errors worth retrying later rather than discarding the write.
    pub fn is_transient(&self) -> bool {
        matches!(
            self,
            Self::Network(_) | Self::RateLimited | Self::Unauthorized | Self::MissingToken
        )
    }

    pub fn message(&self) -> String {
        self.to_string()
    }

    fn code(&self) -> Option<&str> {
        match self {
            Self::Api { code, .. } => Some(code),
            _ => None,
        }
    }
}

fn format_size(bytes: usize) -> String {
    // Mirrors ByteCountFormatter(.file): decimal units.
    let b = bytes as f64;
    if b >= 1_000_000.0 {
        format!("{:.1} MB", b / 1_000_000.0)
    } else if b >= 1_000.0 {
        format!("{} KB", (b / 1_000.0).round() as u64)
    } else {
        format!("{bytes} bytes")
    }
}

impl std::fmt::Display for NotionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized => write!(f, "The Notion token is invalid or expired."),
            Self::NotFound => write!(f, "That Notion item was not found."),
            Self::NotShared => write!(
                f,
                "This page or database isn't shared with the integration."
            ),
            Self::RateLimited => write!(f, "Notion is rate limiting requests. Try again shortly."),
            Self::Api { code, message } => write!(f, "Notion API error ({code}): {message}"),
            Self::Decoding(d) => write!(f, "Failed to decode Notion response: {d}"),
            Self::Network(d) => write!(f, "Network error: {d}"),
            Self::MissingToken => write!(f, "No Notion token is configured."),
            Self::TooLarge { bytes } => write!(
                f,
                "Image is too large ({}); the limit is 20 MB.",
                format_size(*bytes)
            ),
            Self::NotUploaded { status } => {
                write!(f, "Image upload didn't complete (status: {status}).")
            }
        }
    }
}

impl std::error::Error for NotionError {}

/// `{ kind, code?, message, transient }` for the frontend.
impl Serialize for NotionError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("NotionError", 4)?;
        st.serialize_field("kind", self.kind())?;
        if let Some(c) = self.code() {
            st.serialize_field("code", c)?;
        }
        st.serialize_field("message", &self.message())?;
        st.serialize_field("transient", &self.is_transient())?;
        st.end()
    }
}

impl From<NotionError> for AppError {
    fn from(e: NotionError) -> Self {
        AppError {
            kind: e.kind().to_string(),
            message: e.message(),
            transient: e.is_transient(),
            code: e.code().map(str::to_string),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_match_swift() {
        assert_eq!(
            NotionError::Unauthorized.to_string(),
            "The Notion token is invalid or expired."
        );
        assert_eq!(
            NotionError::Api {
                code: "x".into(),
                message: "y".into()
            }
            .to_string(),
            "Notion API error (x): y"
        );
        assert_eq!(
            NotionError::NotUploaded {
                status: "failed".into()
            }
            .to_string(),
            "Image upload didn't complete (status: failed)."
        );
    }

    #[test]
    fn transient_flags() {
        assert!(NotionError::Network("x".into()).is_transient());
        assert!(NotionError::RateLimited.is_transient());
        assert!(NotionError::Unauthorized.is_transient());
        assert!(NotionError::MissingToken.is_transient());
        assert!(!NotionError::NotFound.is_transient());
        assert!(!NotionError::NotShared.is_transient());
        assert!(!NotionError::Decoding("x".into()).is_transient());
        assert!(!NotionError::Api {
            code: "c".into(),
            message: "m".into()
        }
        .is_transient());
    }

    #[test]
    fn serializes_with_kind_and_code() {
        let v = serde_json::to_value(NotionError::Api {
            code: "validation_error".into(),
            message: "bad".into(),
        })
        .unwrap();
        assert_eq!(v["kind"], "api");
        assert_eq!(v["code"], "validation_error");
        assert_eq!(v["transient"], false);
        let v = serde_json::to_value(NotionError::RateLimited).unwrap();
        assert_eq!(v["kind"], "rateLimited");
        assert!(v.get("code").is_none());
        assert_eq!(v["transient"], true);
    }
}
