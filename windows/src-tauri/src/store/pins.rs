//! `pins.json` model and operations (port of PinStore.swift L4-187). Pure `PinStore` over a
//! file path; callers hold it behind a mutex and emit change events.

use super::atomic::{read_json, write_json};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PinKind {
    Page,
    DataSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DoneKind {
    Checkbox,
    Status,
}

/// Swift synthesized enum shape: `{"emoji":{"_0":"x"}}`, `{"url":{"_0":"u"}}`, `{"none":{}}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PinIcon {
    #[serde(rename = "emoji")]
    Emoji {
        #[serde(rename = "_0")]
        value: String,
    },
    #[serde(rename = "url")]
    Url {
        #[serde(rename = "_0")]
        value: String,
    },
    #[serde(rename = "none")]
    None {},
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CustomIcon {
    Emoji { value: String },
    SfSymbol { name: String, color_hex: u32 },
    Letter { value: String, color_hex: u32 },
    Lucide { name: String, color_hex: u32 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewFilter {
    pub id: String,
    pub property: String,
    pub op: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub number_value: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub option_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewSort {
    pub id: String,
    pub property: String,
    pub ascending: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConfig {
    pub done_property: String,
    pub done_kind: DoneKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done_value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_property: Option<String>,
    pub show_done: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filters: Option<Vec<ViewFilter>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sorts: Option<Vec<ViewSort>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pin {
    pub id: String,
    pub notion_id: String,
    pub kind: PinKind,
    pub title: String,
    pub icon: PinIcon,
    pub order: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<DatabaseConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_icon: Option<CustomIcon>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinGroup {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
    pub order: i64,
}

pub struct PinStore {
    pub(super) pins: Vec<Pin>,
    pub(super) groups: Vec<PinGroup>,
    file: PathBuf,
    groups_file: PathBuf,
}

impl PinStore {
    pub fn open(file: PathBuf, groups_file: PathBuf) -> Self {
        let mut pins: Vec<Pin> = read_json(&file).unwrap_or_default();
        pins.sort_by_key(|p| p.order);
        let mut groups: Vec<PinGroup> = read_json(&groups_file).unwrap_or_default();
        groups.sort_by_key(|g| g.order);
        Self {
            pins,
            groups,
            file,
            groups_file,
        }
    }

    pub fn pins(&self) -> &[Pin] {
        &self.pins
    }

    pub fn groups(&self) -> &[PinGroup] {
        &self.groups
    }

    pub(super) fn save(&self) {
        let mut sorted = self.pins.clone();
        sorted.sort_by_key(|p| p.order);
        if let Err(e) = write_json(&self.file, &sorted) {
            crate::logging::error(&format!("pins save failed: {e}"));
        }
    }

    pub(super) fn save_groups(&self) {
        let mut sorted = self.groups.clone();
        sorted.sort_by_key(|g| g.order);
        if let Err(e) = write_json(&self.groups_file, &sorted) {
            crate::logging::error(&format!("groups save failed: {e}"));
        }
    }

    /// order = max + 1.
    pub fn add(&mut self, mut pin: Pin) {
        pin.order = self.pins.iter().map(|p| p.order).max().map_or(0, |m| m + 1);
        self.pins.push(pin);
        self.save();
    }

    pub fn remove(&mut self, id: &str) {
        self.pins.retain(|p| p.id != id);
        self.save();
    }

    pub fn update(&mut self, pin: Pin) {
        if let Some(i) = self.pins.iter().position(|p| p.id == pin.id) {
            self.pins[i] = pin;
            self.save();
        }
    }

    /// Reorders within the pins that share `group_id` (None = ungrouped).
    pub fn move_within_group(&mut self, pin_id: &str, to_index: i64, group_id: Option<&str>) {
        let scope: Vec<String> = self
            .pins
            .iter()
            .filter(|p| p.group_id.as_deref() == group_id)
            .map(|p| p.id.clone())
            .collect();
        self.reorder(pin_id, to_index, scope);
    }

    pub fn move_among_all(&mut self, pin_id: &str, to_index: i64) {
        let scope = self.pins.iter().map(|p| p.id.clone()).collect();
        self.reorder(pin_id, to_index, scope);
    }

    fn reorder(&mut self, pin_id: &str, to_index: i64, scope: Vec<String>) {
        let mut scoped: Vec<(i64, String)> = scope
            .into_iter()
            .map(|id| {
                (
                    self.pins.iter().find(|p| p.id == id).map_or(0, |p| p.order),
                    id,
                )
            })
            .collect();
        scoped.sort_by_key(|(o, _)| *o); // stable, like Swift's sorted
        let Some(from) = scoped.iter().position(|(_, id)| id == pin_id) else {
            return;
        };
        let moving = scoped.remove(from);
        let idx = to_index.clamp(0, scoped.len() as i64) as usize;
        scoped.insert(idx, moving);
        for (offset, (_, id)) in scoped.iter().enumerate() {
            if let Some(p) = self.pins.iter_mut().find(|p| &p.id == id) {
                p.order = offset as i64;
            }
        }
        self.pins.sort_by_key(|p| p.order);
        self.save();
    }

    /// Moves a pin into a group, appended after that group's current pins.
    pub fn set_group(&mut self, pin_id: &str, group_id: Option<&str>) {
        let Some(i) = self.pins.iter().position(|p| p.id == pin_id) else {
            return;
        };
        self.pins[i].group_id = group_id.map(str::to_string);
        let max = self
            .pins
            .iter()
            .filter(|p| p.group_id.as_deref() == group_id && p.id != pin_id)
            .map(|p| p.order)
            .max()
            .unwrap_or(-1);
        self.pins[i].order = max + 1;
        self.save();
    }
}
