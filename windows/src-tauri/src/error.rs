use serde::Serialize;

/// Serializes as `{ kind, message, transient, code? }` (plan 2.3).
#[derive(Debug, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{kind}: {message}")]
pub struct AppError {
    pub kind: String,
    pub message: String,
    pub transient: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

impl AppError {
    pub fn new(kind: &str, message: impl Into<String>) -> Self {
        Self {
            kind: kind.to_string(),
            message: message.into(),
            transient: false,
            code: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_without_code() {
        let v = serde_json::to_value(AppError::new("io", "boom")).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "io", "message": "boom", "transient": false})
        );
    }
}
