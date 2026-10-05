//! `pending.json` types (plan 2.6.3), Swift-compatible shapes.

use crate::notion::types::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Operation {
    ToggleDone {
        page_id: String,
        update: PropertyUpdate,
    },
    CreateRow {
        data_source_id: String,
        title: String,
        #[serde(default)]
        extra: Vec<PropertyUpdate>,
    },
    UpdateProperty {
        page_id: String,
        updates: Vec<PropertyUpdate>,
    },
    UpdateBlock {
        block_id: String,
        #[serde(rename = "type")]
        block_type: String,
        update: BlockUpdate,
    },
    AppendBlock {
        parent_id: String,
        block: NewBlock,
    },
    AppendBlocks {
        parent_id: String,
        blocks: Vec<NewBlock>,
        #[serde(default)]
        position: BlockPosition,
    },
    DeleteBlock {
        block_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingWrite {
    pub id: String,
    pub operation: Operation,
    /// Seconds since 2001-01-01T00:00:00Z (Swift `Date` default coding).
    pub created_at: f64,
}

pub const SWIFT_EPOCH_OFFSET: f64 = 978_307_200.0;

impl PendingWrite {
    pub fn new(operation: Operation) -> Self {
        let unix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);
        Self {
            id: uuid::Uuid::new_v4().to_string().to_uppercase(),
            operation,
            created_at: unix - SWIFT_EPOCH_OFFSET,
        }
    }
}
