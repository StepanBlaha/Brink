//! In-memory Notion state behind the fake server (port of `DemoNotionServer` statics + seeding).

use super::content::{self, B};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

pub type Obj = Map<String, Value>;

pub struct Upload {
    pub filename: String,
    pub status: String,
    pub bytes: Option<Vec<u8>>,
}

#[derive(Default)]
pub struct Store {
    pub blocks: HashMap<String, Value>,
    pub children: HashMap<String, Vec<String>>,
    pub rows: HashMap<String, Value>,
    pub row_order: Vec<String>,
    /// Page id to its emoji.
    pub page_icons: HashMap<String, String>,
    pub next_id: u64,
    pub uploads: HashMap<String, Upload>,
    /// "METHOD /path body" lines, drained by `drain_log` (probe runs, tests).
    pub log: Vec<String>,
}

pub fn rich_text(text: &str) -> Value {
    json!([{ "type": "text", "text": { "content": text }, "plain_text": text,
        "annotations": { "bold": false, "italic": false, "strikethrough": false,
                         "underline": false, "code": false, "color": "default" } }])
}

impl Store {
    pub fn seeded() -> Self {
        let mut s = Store {
            next_id: 1,
            ..Default::default()
        };
        for (page, emoji, blocks) in content::pages() {
            s.page_icons.insert(page.to_string(), emoji.to_string());
            s.seed(page, &blocks);
        }
        for (i, (title, status, due, done)) in content::SPRINT_ROWS.iter().enumerate() {
            let id = format!("demo-row-{}", i + 1);
            let due = due.map_or(Value::Null, |d| json!({ "start": content::day_string(d) }));
            let props = json!({
                "Name": { "id": "title", "type": "title", "title": rich_text(title) },
                "Status": { "id": "st", "type": "status", "status": { "name": status } },
                "Done": { "id": "dn", "type": "checkbox", "checkbox": done },
                "Due": { "id": "du", "type": "date", "date": due },
            });
            s.rows.insert(id.clone(), row_object(&id, props));
            s.row_order.push(id);
        }
        s
    }

    fn seed(&mut self, parent: &str, items: &[B]) {
        for item in items {
            let id = format!("demo-block-{}", self.next_id);
            self.next_id += 1;
            let mut boxed = item.extra.as_object().cloned().unwrap_or_default();
            let text = if item.text.is_empty() {
                json!([])
            } else {
                rich_text(item.text)
            };
            boxed.insert("rich_text".into(), text);
            self.blocks.insert(
                id.clone(),
                json!({ "object": "block", "id": id, "type": item.kind, item.kind: boxed }),
            );
            self.children
                .entry(parent.to_string())
                .or_default()
                .push(id.clone());
            if !item.children.is_empty() {
                self.seed(&id, &item.children);
            }
        }
    }

    pub fn take_id(&mut self) -> u64 {
        let n = self.next_id;
        self.next_id += 1;
        n
    }

    /// A block with `has_children` filled in.
    pub fn render(&self, id: &str) -> Option<Value> {
        let mut block = self.blocks.get(id)?.clone();
        let has = self.children.get(id).is_some_and(|c| !c.is_empty());
        block["has_children"] = json!(has);
        Some(block)
    }

    /// The page's block tree as indented `type: text` lines (probe runs, tests).
    pub fn dump_tree(&self, parent: &str) -> String {
        fn walk(s: &Store, id: &str, depth: usize, out: &mut Vec<String>) {
            for child in s.children.get(id).into_iter().flatten() {
                let Some(block) = s.blocks.get(child) else {
                    continue;
                };
                let kind = block["type"].as_str().unwrap_or("?");
                let texts = block[kind]["rich_text"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                let text: String = texts
                    .iter()
                    .filter_map(|t| t["plain_text"].as_str())
                    .collect();
                out.push(format!("{}{kind}: {text} ({child})", "  ".repeat(depth)));
                walk(s, child, depth + 1, out);
            }
        }
        let mut out = vec![];
        walk(self, parent, 0, &mut out);
        out.join("\n")
    }

    pub fn drain_log(&mut self) -> String {
        let out = self.log.join("\n");
        self.log.clear();
        if out.is_empty() {
            "(no requests)".into()
        } else {
            out
        }
    }
}

pub fn row_object(id: &str, props: Value) -> Value {
    json!({ "object": "page", "id": id, "url": format!("https://example.com/{id}"),
            "icon": Value::Null, "properties": props })
}

pub fn list(results: Vec<Value>) -> Value {
    json!({ "object": "list", "results": results, "next_cursor": Value::Null, "has_more": false })
}

fn search_page(id: &str, emoji: Option<&str>, title: &str) -> Value {
    let icon = emoji.map_or(Value::Null, |e| json!({ "type": "emoji", "emoji": e }));
    json!({ "object": "page", "id": id, "url": format!("https://example.com/{id}"), "icon": icon,
            "properties": { "Name": { "id": "title", "type": "title", "title": rich_text(title) } } })
}

fn search_source(id: &str, url: &str, emoji: Option<&str>, title: &str) -> Value {
    let icon = emoji.map_or(Value::Null, |e| json!({ "type": "emoji", "emoji": e }));
    json!({ "object": "data_source", "id": id, "url": format!("https://example.com/{url}"),
            "icon": icon, "title": rich_text(title) })
}

fn title_of(item: &Value) -> String {
    let t = item["properties"]["Name"]["title"]
        .as_array()
        .or_else(|| item["title"].as_array());
    t.into_iter()
        .flatten()
        .filter_map(|x| x["plain_text"].as_str())
        .collect()
}

/// A realistic mix for the add-a-pin search: emoji pages, a database, long titles, no icon.
pub fn search_results(query: &str) -> Vec<Value> {
    let all =
        vec![
        search_page(content::GROCERIES_PAGE, Some("\u{1F6D2}"), "Groceries"),
        search_page(content::LAUNCH_PAGE, Some("\u{1F680}"), "Launch plan"),
        search_source(content::SPRINT_DATA_SOURCE, "sprint", Some("\u{1F3C3}"), "Sprint"),
        search_page(content::READING_PAGE, Some("\u{1F4DA}"), "Reading"),
        search_page(
            "demo-page-long",
            Some("\u{1F4DD}"),
            "Q4 planning notes and a very long title that keeps going past the edge of the panel",
        ),
        search_page("demo-page-noicon", None, "Meeting notes"),
        search_page("demo-page-trip", Some("\u{2708}\u{FE0F}"), "Trip to Lisbon"),
        search_source("demo-ds-tasks", "tasks", None, "Personal tasks"),
    ];
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return all;
    }
    all.into_iter()
        .filter(|i| title_of(i).to_lowercase().contains(&q))
        .collect()
}
