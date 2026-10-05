//! Page backups: the last-known page content as Markdown, written before a save that deletes
//! blocks. Files are `<pageId>-<timestamp>.md` in `<data>/backups`, newest 20 kept per page.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const KEEP_PER_PAGE: usize = 20;

/// Ids come from the webview; keep only characters that are safe in a file name.
fn safe_id(page_id: &str) -> String {
    page_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

/// Writes one backup and prunes older ones for the same page. Returns the file written.
pub fn write_backup(
    dir: &Path,
    page_id: &str,
    markdown: &str,
    now_ms: u128,
) -> io::Result<PathBuf> {
    let id = safe_id(page_id);
    if id.is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "empty page id"));
    }
    fs::create_dir_all(dir)?;
    // Zero-padded so names sort chronologically; a repeat in the same millisecond gets a suffix.
    let mut path = dir.join(format!("{id}-{now_ms:016}.md"));
    let mut n = 1;
    while path.exists() {
        path = dir.join(format!("{id}-{now_ms:016}-{n}.md"));
        n += 1;
    }
    fs::write(&path, markdown)?;
    // Best effort: a failed prune must not turn a successful backup into an error.
    let _ = prune(dir, &id, KEEP_PER_PAGE);
    Ok(path)
}

/// `<id>-<digits>[-n].md`: the char after the prefix must be a digit, so page ids that merely
/// start with another id do not collide.
fn is_backup_of(name: &str, prefix: &str) -> bool {
    let Some(rest) = name.strip_prefix(prefix) else {
        return false;
    };
    rest.starts_with(|c: char| c.is_ascii_digit()) && name.ends_with(".md")
}

/// Removes all but the newest `keep` backups of `id` (the `safe_id` form).
pub fn prune(dir: &Path, id: &str, keep: usize) -> io::Result<()> {
    let prefix = format!("{id}-");
    let mut files = Vec::new();
    for entry in fs::read_dir(dir)?.flatten() {
        if let Ok(name) = entry.file_name().into_string() {
            if is_backup_of(&name, &prefix) {
                files.push(name);
            }
        }
    }
    files.sort();
    let excess = files.len().saturating_sub(keep);
    for name in files.into_iter().take(excess) {
        let _ = fs::remove_file(dir.join(name));
    }
    Ok(())
}
