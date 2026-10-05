//! Request encoders (plan D5): RichText, PropertyValue, BlockUpdate, NewBlock, BlockPosition.

use super::types::*;
use serde_json::{json, Map, Value};
use unicode_segmentation::UnicodeSegmentation;

pub const CHUNK_LIMIT: usize = 2000;

/// Splits into chunks of at most `limit` characters (grapheme clusters, as Swift `Character`s).
pub fn chunked(text: &str, limit: usize) -> Vec<String> {
    if limit == 0 {
        return vec![text.to_string()];
    }
    if text.is_empty() {
        return vec![String::new()];
    }
    let g: Vec<&str> = text.graphemes(true).collect();
    g.chunks(limit).map(|c| c.concat()).collect()
}

/// Plain text rich text array (no annotations).
pub fn encode_text(text: &str) -> Vec<Value> {
    chunked(text, CHUNK_LIMIT)
        .into_iter()
        .map(|c| json!({"type": "text", "text": {"content": c}}))
        .collect()
}

/// Annotated rich text array; empty spans give an empty array.
pub fn encode_spans(spans: &[RichTextSpan]) -> Vec<Value> {
    spans
        .iter()
        .flat_map(|s| {
            chunked(&s.text, CHUNK_LIMIT).into_iter().map(move |c| {
                let mut text = Map::new();
                text.insert("content".into(), json!(c));
                if let Some(link) = &s.link {
                    text.insert("link".into(), json!({ "url": link }));
                }
                let mut annotations = json!({
                    "bold": s.bold, "italic": s.italic, "strikethrough": s.strikethrough,
                    "underline": s.underline, "code": s.code,
                });
                if let Some(color) = &s.color {
                    annotations["color"] = json!(color);
                }
                json!({"type": "text", "text": text, "annotations": annotations})
            })
        })
        .collect()
}

/// Request-side property JSON for `PATCH /pages/{id}`; `None` for unsupported types.
pub fn property_request_json(v: &PropertyValue) -> Option<Value> {
    let opt = |name: &Option<String>| name.as_ref().map_or(Value::Null, |n| json!({ "name": n }));
    Some(match v {
        PropertyValue::Title(t) => json!({"type": "title", "title": encode_text(t)}),
        PropertyValue::RichText(t) => json!({"type": "rich_text", "rich_text": encode_text(t)}),
        PropertyValue::Checkbox(b) => json!({"type": "checkbox", "checkbox": b}),
        PropertyValue::Status(n) => json!({"type": "status", "status": opt(n)}),
        PropertyValue::Select(n) => json!({"type": "select", "select": opt(n)}),
        PropertyValue::Date { start: None, .. } => json!({"type": "date", "date": null}),
        PropertyValue::Date {
            start: Some(s),
            end,
        } => {
            let mut b = Map::new();
            b.insert("start".into(), json!(s));
            if let Some(e) = end {
                b.insert("end".into(), json!(e));
            }
            json!({"type": "date", "date": b})
        }
        PropertyValue::Number(n) => {
            json!({"type": "number", "number": n.map_or(Value::Null, num_value)})
        }
        PropertyValue::Unsupported(_) => return None,
    })
}

pub fn position_request_json(p: &BlockPosition) -> Option<Value> {
    match p {
        BlockPosition::End {} => None,
        BlockPosition::Start {} => Some(json!({"type": "start"})),
        BlockPosition::After { id } => {
            Some(json!({"type": "after_block", "after_block": {"id": id}}))
        }
    }
}

fn icon_emoji(emoji: &str) -> Value {
    json!({"type": "emoji", "emoji": emoji})
}

pub fn new_block_request_json(b: &NewBlock) -> Value {
    match b {
        NewBlock::Paragraph { text } => {
            json!({"type": "paragraph", "paragraph": {"rich_text": encode_text(text)}})
        }
        NewBlock::ToDo { text, checked } => {
            json!({"type": "to_do", "to_do": {"rich_text": encode_text(text), "checked": checked}})
        }
        NewBlock::Formatted {
            block_kind,
            rich_text,
            language,
            checked,
        } => {
            let t = block_kind.api_type();
            if *block_kind == NewBlockKind::Divider {
                return json!({ "type": t, t: {} });
            }
            let mut bx = Map::new();
            bx.insert("rich_text".into(), Value::Array(encode_spans(rich_text)));
            if *block_kind == NewBlockKind::ToDo {
                bx.insert("checked".into(), json!(checked));
            }
            if *block_kind == NewBlockKind::Code {
                bx.insert("language".into(), json!(language));
            }
            json!({ "type": t, t: bx })
        }
        NewBlock::Callout { rich_text, emoji } => {
            let mut bx = Map::new();
            bx.insert("rich_text".into(), Value::Array(encode_spans(rich_text)));
            if let Some(e) = emoji.as_ref().filter(|e| !e.is_empty()) {
                bx.insert("icon".into(), icon_emoji(e));
            }
            json!({"type": "callout", "callout": bx})
        }
        NewBlock::ImageUpload { id } => json!({"type": "image", "image": {
            "type": "file_upload", "file_upload": {"id": id}}}),
        NewBlock::ImageExternal { url } => json!({"type": "image", "image": {
            "type": "external", "external": {"url": url}}}),
    }
}

/// Body for `PATCH /blocks/{id}`: `{ type, <type>: {...} }`.
pub fn block_update_request_json(ty: &str, u: &BlockUpdate) -> Value {
    let mut bx = Map::new();
    match u {
        BlockUpdate::Text { text } => {
            bx.insert("rich_text".into(), Value::Array(encode_text(text)));
        }
        BlockUpdate::Checked { checked } => {
            bx.insert("checked".into(), json!(checked));
        }
        BlockUpdate::RichText { rich_text } => {
            bx.insert("rich_text".into(), Value::Array(encode_spans(rich_text)));
        }
        BlockUpdate::Content {
            rich_text,
            checked,
            language,
        } => {
            bx.insert("rich_text".into(), Value::Array(encode_spans(rich_text)));
            if let Some(c) = checked {
                bx.insert("checked".into(), json!(c));
            }
            if let Some(l) = language {
                bx.insert("language".into(), json!(l));
            }
        }
        BlockUpdate::CalloutContent { rich_text, emoji } => {
            bx.insert("rich_text".into(), Value::Array(encode_spans(rich_text)));
            if let Some(e) = emoji.as_ref().filter(|e| !e.is_empty()) {
                bx.insert("icon".into(), icon_emoji(e));
            }
        }
    }
    json!({ "type": ty, ty: bx })
}
