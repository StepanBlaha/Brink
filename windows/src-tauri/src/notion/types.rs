//! Queue-shape types: serde mirrors of the NotionKit `Codable` shapes (plan 2.6.3).
//! `PropertyValue` is decoded by hand because Swift accepts both Notion's array and the
//! cache-style plain string for title / rich_text.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RichTextSpan {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub strikethrough: bool,
    pub code: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    /// Kept through edits (the Mac dropped it).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub underline: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NewBlockKind {
    Paragraph,
    Heading1,
    Heading2,
    Heading3,
    ToDo,
    BulletedListItem,
    NumberedListItem,
    Quote,
    Code,
    Divider,
    Toggle,
    Callout,
}

impl NewBlockKind {
    pub fn api_type(self) -> &'static str {
        match self {
            Self::Paragraph => "paragraph",
            Self::Heading1 => "heading_1",
            Self::Heading2 => "heading_2",
            Self::Heading3 => "heading_3",
            Self::ToDo => "to_do",
            Self::BulletedListItem => "bulleted_list_item",
            Self::NumberedListItem => "numbered_list_item",
            Self::Quote => "quote",
            Self::Code => "code",
            Self::Divider => "divider",
            Self::Toggle => "toggle",
            Self::Callout => "callout",
        }
    }
}

fn plain_language() -> String {
    "plain text".to_string()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NewBlock {
    Paragraph {
        text: String,
    },
    ToDo {
        text: String,
        #[serde(default)]
        checked: bool,
    },
    Formatted {
        block_kind: NewBlockKind,
        #[serde(default)]
        rich_text: Vec<RichTextSpan>,
        #[serde(default = "plain_language")]
        language: String,
        #[serde(default)]
        checked: bool,
    },
    Callout {
        #[serde(default)]
        rich_text: Vec<RichTextSpan>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        emoji: Option<String>,
    },
    ImageUpload {
        id: String,
    },
    ImageExternal {
        url: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum BlockUpdate {
    Text {
        text: String,
    },
    Checked {
        checked: bool,
    },
    RichText {
        rich_text: Vec<RichTextSpan>,
    },
    Content {
        rich_text: Vec<RichTextSpan>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        checked: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        language: Option<String>,
    },
    CalloutContent {
        rich_text: Vec<RichTextSpan>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        emoji: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum BlockPosition {
    #[serde(rename = "end")]
    End {},
    #[serde(rename = "start")]
    Start {},
    #[serde(rename = "after")]
    After {
        #[serde(rename = "_0")]
        id: String,
    },
}

impl Default for BlockPosition {
    fn default() -> Self {
        Self::End {}
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum PropertyValue {
    Title(String),
    RichText(String),
    Checkbox(bool),
    Status(Option<String>),
    Select(Option<String>),
    Date {
        start: Option<String>,
        end: Option<String>,
    },
    Number(Option<f64>),
    Unsupported(String),
}

/// Whole numbers encode without a fraction, like Swift's `JSONEncoder`.
pub fn num_value(n: f64) -> Value {
    if n.fract() == 0.0 && n.abs() < 1e15 {
        json!(n as i64)
    } else {
        json!(n)
    }
}

fn plain_from(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|i| i.get("plain_text").and_then(Value::as_str))
            .collect(),
        _ => String::new(),
    }
}

fn option_name(v: Option<&Value>) -> Option<String> {
    v.and_then(|o| o.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

impl<'de> Deserialize<'de> for PropertyValue {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        let ty = v
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(|| serde::de::Error::missing_field("type"))?;
        Ok(match ty {
            "title" => Self::Title(plain_from(v.get("title"))),
            "rich_text" => Self::RichText(plain_from(v.get("rich_text"))),
            "checkbox" => {
                Self::Checkbox(v.get("checkbox").and_then(Value::as_bool).unwrap_or(false))
            }
            "status" => Self::Status(option_name(v.get("status"))),
            "select" => Self::Select(option_name(v.get("select"))),
            "date" => {
                let d = v.get("date").filter(|d| d.is_object());
                let s = |k: &str| {
                    d.and_then(|d| d.get(k))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                };
                Self::Date {
                    start: s("start"),
                    end: s("end"),
                }
            }
            "number" => Self::Number(v.get("number").and_then(Value::as_f64)),
            other => Self::Unsupported(other.to_string()),
        })
    }
}

impl Serialize for PropertyValue {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut m = Map::new();
        let mut put = |t: &str, k: Option<(&str, Value)>| {
            m.insert("type".into(), json!(t));
            if let Some((k, v)) = k {
                m.insert(k.into(), v);
            }
        };
        match self {
            Self::Title(t) => put("title", Some(("title", json!(t)))),
            Self::RichText(t) => put("rich_text", Some(("rich_text", json!(t)))),
            Self::Checkbox(b) => put("checkbox", Some(("checkbox", json!(b)))),
            Self::Status(n) => put(
                "status",
                n.as_ref().map(|n| ("status", json!({ "name": n }))),
            ),
            Self::Select(n) => put(
                "select",
                n.as_ref().map(|n| ("select", json!({ "name": n }))),
            ),
            Self::Date { start, end } => put(
                "date",
                start.as_ref().map(|st| {
                    let mut b = Map::new();
                    b.insert("start".into(), json!(st));
                    if let Some(e) = end {
                        b.insert("end".into(), json!(e));
                    }
                    ("date", Value::Object(b))
                }),
            ),
            Self::Number(n) => put("number", n.map(|n| ("number", num_value(n)))),
            Self::Unsupported(t) => put(t, None),
        }
        Value::Object(m).serialize(s)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PropertyUpdate {
    pub name: String,
    pub value: PropertyValue,
}
