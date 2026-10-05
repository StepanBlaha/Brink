//! Routes of the fake Notion (port of `DemoNotionServer.handle` and `+Handlers`).

use super::content;
use super::store::{list, rich_text, row_object, Store};
use serde_json::{json, Value};

pub type Reply = (u16, Value);

pub fn not_found() -> Reply {
    (
        404,
        json!({ "object": "error", "code": "object_not_found", "message": "Not found" }),
    )
}

/// Dispatches one request. `raw` is the unparsed body (multipart uploads).
pub fn handle(s: &mut Store, method: &str, path: &str, body: Option<&Value>, raw: &[u8]) -> Reply {
    record(s, method, path, body);
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() < 2 || parts[0] != "v1" {
        return not_found();
    }
    let id = parts.get(2).copied().unwrap_or("");
    let sub = parts.get(3).copied().unwrap_or("");
    let null = Value::Null;
    let body_v = body.unwrap_or(&null);
    match (parts[1], method) {
        ("search", "POST") => {
            let q = body_v["query"].as_str().unwrap_or("");
            (200, list(super::store::search_results(q)))
        }
        ("pages", "GET") => get_page(s, id),
        ("pages", "PATCH") => patch_page(s, id, body_v),
        ("pages", "POST") => create_row(s, body_v),
        ("databases", "GET") => (
            200,
            json!({ "object": "database", "id": id,
            "data_sources": [{ "id": content::SPRINT_DATA_SOURCE, "name": "Sprint" }] }),
        ),
        ("data_sources", "GET") => (200, sprint_schema(id)),
        ("data_sources", "POST") if sub == "query" => (200, query_rows(s, body_v)),
        ("blocks", _) => super::blocks::handle(s, method, id, sub == "children", body_v),
        ("file_uploads", _) => super::uploads::handle(s, id, sub, body_v, raw),
        _ => not_found(),
    }
}

fn record(s: &mut Store, method: &str, path: &str, body: Option<&Value>) {
    let mut line = format!("{method} {path}");
    if let Some(b) = body {
        let t = b.to_string();
        line.push(' ');
        line.extend(t.chars().take(600));
    }
    s.log.push(line);
}

fn get_page(s: &Store, id: &str) -> Reply {
    if let Some(row) = s.rows.get(id) {
        return (200, row.clone());
    }
    match s.page_icons.get(id) {
        Some(e) => (
            200,
            json!({ "object": "page", "id": id, "cover": null,
                                 "icon": { "type": "emoji", "emoji": e } }),
        ),
        None => not_found(),
    }
}

fn merge_properties(props: &mut Value, patch: &Value) {
    for (name, value) in patch.as_object().into_iter().flatten() {
        let normalized = normalize_property(value, props.get(name));
        props[name.as_str()] = normalized;
    }
}

fn patch_page(s: &mut Store, id: &str, body: &Value) -> Reply {
    if let Some(icon) = body["icon"]["emoji"].as_str() {
        if s.page_icons.contains_key(id) {
            s.page_icons.insert(id.to_string(), icon.to_string());
            return get_page(s, id);
        }
    }
    let Some(row) = s.rows.get_mut(id) else {
        return not_found();
    };
    merge_properties(&mut row["properties"], &body["properties"]);
    (200, row.clone())
}

fn create_row(s: &mut Store, body: &Value) -> Reply {
    let id = format!("demo-row-new-{}", s.take_id());
    let mut props = json!({
        "Done": { "id": "dn", "type": "checkbox", "checkbox": false },
        "Status": { "id": "st", "type": "status", "status": { "name": "Not started" } },
        "Due": { "id": "du", "type": "date", "date": null },
    });
    merge_properties(&mut props, &body["properties"]);
    let row = row_object(&id, props);
    s.rows.insert(id.clone(), row.clone());
    s.row_order.push(id);
    (200, row)
}

/// A property from a request body, in the shape a page object returns.
pub fn normalize_property(value: &Value, existing: Option<&Value>) -> Value {
    let Some(obj) = value.as_object() else {
        return value.clone();
    };
    let mut prop = obj.clone();
    let known = [
        "title",
        "rich_text",
        "checkbox",
        "status",
        "date",
        "select",
        "number",
    ];
    let ty = prop
        .get("type")
        .and_then(Value::as_str)
        .or_else(|| existing.and_then(|e| e["type"].as_str()))
        .map(str::to_string)
        .or_else(|| {
            known
                .iter()
                .find(|k| prop.contains_key(**k))
                .map(|k| k.to_string())
        })
        .unwrap_or_else(|| "rich_text".into());
    prop.insert("type".into(), json!(ty));
    let pid = existing
        .and_then(|e| e.get("id"))
        .cloned()
        .unwrap_or(json!(ty));
    prop.insert("id".into(), pid);
    if ty == "title" || ty == "rich_text" {
        prop.insert(ty.clone(), json!(response_rich_text(prop.get(&ty))));
    }
    Value::Object(prop)
}

/// Request rich text (`text.content`) to response rich text (adds `plain_text`, `href`).
pub fn response_rich_text(value: Option<&Value>) -> Vec<Value> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|item| {
            let mut out = item.clone();
            let text = &item["text"];
            let plain = text["content"]
                .as_str()
                .or_else(|| item["plain_text"].as_str())
                .unwrap_or("");
            out["plain_text"] = json!(plain);
            if let Some(link) = text["link"]["url"].as_str() {
                out["href"] = json!(link);
            }
            out
        })
        .collect()
}

fn sprint_schema(id: &str) -> Value {
    json!({
        "object": "data_source", "id": id, "name": "Sprint", "title": rich_text("Sprint"),
        "properties": {
            "Name": { "id": "title", "name": "Name", "type": "title", "title": {} },
            "Status": { "id": "st", "name": "Status", "type": "status", "status": {
                "options": content::status_options(),
                "groups": [
                    { "name": "To-do", "option_ids": ["st-1"] },
                    { "name": "In progress", "option_ids": ["st-2"] },
                    { "name": "Complete", "option_ids": ["st-3"] },
                ] } },
            "Due": { "id": "du", "name": "Due", "type": "date", "date": {} },
            "Done": { "id": "dn", "name": "Done", "type": "checkbox", "checkbox": {} },
        }
    })
}

fn due_key(row: &Value) -> String {
    row["properties"]["Due"]["date"]["start"]
        .as_str()
        .unwrap_or("9999")
        .to_string()
}

fn query_rows(s: &Store, body: &Value) -> Value {
    let filter = body.get("filter").filter(|f| f.is_object());
    let mut rows: Vec<Value> = s
        .row_order
        .iter()
        .filter_map(|id| s.rows.get(id))
        .filter(|r| filter.map_or(true, |f| matches(r, f)))
        .cloned()
        .collect();
    rows.sort_by_key(due_key);
    list(rows)
}

/// Enough of Notion's filter language for the demo: and/or, checkbox and status/select equals.
pub fn matches(row: &Value, filter: &Value) -> bool {
    if let Some(all) = filter["and"].as_array() {
        return all.iter().all(|f| matches(row, f));
    }
    if let Some(any) = filter["or"].as_array() {
        return any.iter().any(|f| matches(row, f));
    }
    let Some(name) = filter["property"].as_str() else {
        return true;
    };
    let prop = &row["properties"][name];
    if prop.is_null() {
        return true;
    }
    if let Some(eq) = filter["checkbox"]["equals"].as_bool() {
        return prop["checkbox"].as_bool().unwrap_or(false) == eq;
    }
    for kind in ["status", "select"] {
        let cond = &filter[kind];
        let current = prop[kind]["name"].as_str();
        if let Some(eq) = cond["equals"].as_str() {
            return current == Some(eq);
        }
        if let Some(ne) = cond["does_not_equal"].as_str() {
            return current != Some(ne);
        }
    }
    true
}
