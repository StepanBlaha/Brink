//! `clipboard_read`: text first (non-empty after trim), else image, else empty.

use crate::error::AppError;
use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
pub struct ClipboardContent {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// Pure mapping from what the OS clipboard holds.
pub fn classify(text: Option<String>, has_image: bool) -> ClipboardContent {
    if let Some(t) = text.filter(|t| !t.trim().is_empty()) {
        return ClipboardContent {
            kind: "text",
            text: Some(t),
        };
    }
    ClipboardContent {
        kind: if has_image { "image" } else { "empty" },
        text: None,
    }
}

fn read() -> ClipboardContent {
    let Ok(mut cb) = arboard::Clipboard::new() else {
        return classify(None, false);
    };
    let text = cb.get_text().ok();
    let has_image = text.as_deref().map_or(true, |t| t.trim().is_empty()) && cb.get_image().is_ok();
    classify(text, has_image)
}

#[tauri::command]
pub async fn clipboard_read() -> Result<ClipboardContent, AppError> {
    tokio::task::spawn_blocking(read)
        .await
        .map_err(|e| AppError::new("io", e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_wins_over_image() {
        let c = classify(Some("hello".into()), true);
        assert_eq!((c.kind, c.text.as_deref()), ("text", Some("hello")));
    }

    #[test]
    fn blank_text_falls_through() {
        assert_eq!(classify(Some("  \n\t".into()), true).kind, "image");
        assert_eq!(classify(Some("".into()), false).kind, "empty");
        assert_eq!(classify(None, false).kind, "empty");
        assert_eq!(classify(None, true).kind, "image");
    }

    #[test]
    fn text_is_not_trimmed() {
        assert_eq!(
            classify(Some(" a \n".into()), false).text.as_deref(),
            Some(" a \n")
        );
    }

    #[test]
    fn serializes_without_text_when_empty() {
        let v = serde_json::to_value(classify(None, false)).unwrap();
        assert_eq!(v, serde_json::json!({"kind": "empty"}));
    }
}
