//! Maps an `Operation` to Notion calls (WriteQueue.swift `execute`).

use super::op::Operation;
use crate::notion::{NotionClient, NotionError};

pub async fn execute(op: &Operation, client: &NotionClient) -> Result<(), NotionError> {
    match op {
        Operation::ToggleDone { page_id, update } => {
            client
                .update_page_properties(page_id, std::slice::from_ref(update))
                .await?;
        }
        Operation::CreateRow {
            data_source_id,
            title,
            extra,
        } => {
            client.create_row(data_source_id, title, extra).await?;
        }
        Operation::UpdateProperty { page_id, updates } => {
            client.update_page_properties(page_id, updates).await?;
        }
        Operation::UpdateBlock {
            block_id,
            block_type,
            update,
        } => {
            client.update_block(block_id, block_type, update).await?;
        }
        Operation::AppendBlock { parent_id, block } => {
            let pos = Default::default();
            client
                .append_blocks(parent_id, std::slice::from_ref(block), &pos)
                .await?;
        }
        Operation::AppendBlocks {
            parent_id,
            blocks,
            position,
        } => {
            client.append_blocks(parent_id, blocks, position).await?;
        }
        Operation::DeleteBlock { block_id } => client.delete_block(block_id).await?,
    }
    Ok(())
}
