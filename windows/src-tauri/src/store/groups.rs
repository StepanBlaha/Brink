//! Group operations on the `PinStore` (port of PinStore.swift L189-257).

use super::pins::{PinGroup, PinStore};

impl PinStore {
    pub fn add_group(&mut self, name: &str, emoji: Option<&str>) -> PinGroup {
        let g = PinGroup {
            id: uuid::Uuid::new_v4().to_string().to_uppercase(),
            name: name.to_string(),
            emoji: emoji.map(str::to_string),
            order: self
                .groups
                .iter()
                .map(|g| g.order)
                .max()
                .map_or(0, |m| m + 1),
        };
        self.groups.push(g.clone());
        self.save_groups();
        g
    }

    pub fn rename_group(&mut self, id: &str, name: &str, emoji: Option<&str>) {
        if let Some(g) = self.groups.iter_mut().find(|g| g.id == id) {
            g.name = name.to_string();
            g.emoji = emoji.map(str::to_string);
            self.save_groups();
        }
    }

    /// Ungroups the group's pins; never deletes pins.
    pub fn delete_group(&mut self, id: &str) {
        self.groups.retain(|g| g.id != id);
        for p in self
            .pins
            .iter_mut()
            .filter(|p| p.group_id.as_deref() == Some(id))
        {
            p.group_id = None;
        }
        self.save_groups();
        self.save();
    }

    /// SwiftUI `move(fromOffsets:toOffset:)` semantics, then renumber 0..n.
    pub fn move_groups(&mut self, from: &[usize], to: usize) {
        let mut from: Vec<usize> = from
            .iter()
            .copied()
            .filter(|i| *i < self.groups.len())
            .collect();
        from.sort_unstable();
        from.dedup();
        let moving: Vec<PinGroup> = from.iter().map(|i| self.groups[*i].clone()).collect();
        let mut remaining = self.groups.clone();
        for i in from.iter().rev() {
            remaining.remove(*i);
        }
        let before = from.iter().filter(|i| **i < to).count();
        let at = (to - before.min(to)).min(remaining.len());
        for (k, g) in moving.into_iter().enumerate() {
            remaining.insert(at + k, g);
        }
        for (i, g) in remaining.iter_mut().enumerate() {
            g.order = i as i64;
        }
        self.groups = remaining;
        self.save_groups();
    }
}
