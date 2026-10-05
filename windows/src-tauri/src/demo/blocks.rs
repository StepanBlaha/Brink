//! Blocks API of the fake Notion: GET/PATCH/DELETE a block, GET/PATCH (append with `position`)
//! its children (port of `DemoNotionServer+Handlers.handleBlocks`).

use super::handlers::{not_found, response_rich_text, Reply};
use super::store::{list, Store};
use serde_json::{json, Value};

pub fn handle(s: &mut Store, method: &str, id: &str, is_children: bool, body: &Value) -> Reply {
    match (method, is_children) {
        ("GET", true) => {
            let kids = s.children.get(id).cloned().unwrap_or_default();
            (200, list(kids.iter().filter_map(|c| s.render(c)).collect()))
        }
        ("GET", false) => s.render(id).map_or_else(not_found, |b| (200, b)),
        ("PATCH", true) => append(s, id, body),
        ("PATCH", false) => patch(s, id, body),
        ("DELETE", false) => delete(s, id),
        _ => not_found(),
    }
}

fn insert_index(list: &[String], position: &Value) -> usize {
    match position["type"].as_str() {
        Some("start") => 0,
        Some("after_block") => position["after_block"]["id"]
            .as_str()
            .and_then(|after| list.iter().position(|x| x == after))
            .map_or(list.len(), |i| i + 1),
        _ => list.len(),
    }
}

fn append(s: &mut Store, id: &str, body: &Value) -> Reply {
    let mut kids = s.children.get(id).cloned().unwrap_or_default();
    let start = insert_index(&kids, &body["position"]);
    let mut created = vec![];
    for (offset, child) in body["children"]
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
    {
        let new_id = format!("demo-new-{}", s.take_id());
        let ty = child["type"].as_str().unwrap_or("paragraph").to_string();
        let mut boxed = child[ty.as_str()].clone();
        if !boxed.is_object() {
            boxed = json!({});
        }
        if boxed.get("rich_text").is_some() {
            boxed["rich_text"] = json!(response_rich_text(boxed.get("rich_text")));
        }
        if ty == "image" {
            boxed = super::uploads::attach(s, &boxed);
        }
        s.blocks.insert(
            new_id.clone(),
            json!({ "object": "block", "id": new_id, "type": ty, ty.as_str(): boxed }),
        );
        kids.insert((start + offset).min(kids.len()), new_id.clone());
        if let Some(nested) = boxed["children"].as_array().filter(|n| !n.is_empty()) {
            s.children.insert(new_id.clone(), vec![]);
            append(s, &new_id, &json!({ "children": nested }));
        }
        created.extend(s.render(&new_id));
    }
    s.children.insert(id.to_string(), kids);
    (200, list(created))
}

fn patch(s: &mut Store, id: &str, body: &Value) -> Reply {
    let Some(block) = s.blocks.get(id).cloned() else {
        return not_found();
    };
    let ty = block["type"].as_str().unwrap_or("paragraph").to_string();
    let mut boxed = block[ty.as_str()].clone();
    for (k, v) in body[ty.as_str()].as_object().into_iter().flatten() {
        boxed[k.as_str()] = if k == "rich_text" {
            json!(response_rich_text(Some(v)))
        } else {
            v.clone()
        };
    }
    let mut next = block;
    next[ty.as_str()] = boxed;
    s.blocks.insert(id.to_string(), next);
    (200, s.render(id).unwrap_or_else(|| json!({})))
}

fn delete(s: &mut Store, id: &str) -> Reply {
    let Some(rendered) = s.render(id) else {
        return not_found();
    };
    s.blocks.remove(id);
    for kids in s.children.values_mut() {
        kids.retain(|c| c != id);
    }
    (200, rendered)
}
