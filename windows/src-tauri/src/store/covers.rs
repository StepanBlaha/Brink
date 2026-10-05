//! Cover image cache (port of CoverCache.swift): `<cache>/covers/<fnv1a64-hex>`, keyed by the
//! URL without query or fragment so a re-signed Notion URL maps to the same file.

use super::atomic::write_atomic;
use std::path::{Path, PathBuf};

pub fn key(url: &str) -> String {
    let base = url.split('#').next().unwrap_or(url);
    let base = base.split('?').next().unwrap_or(base);
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in base.bytes() {
        hash = (hash ^ u64::from(b)).wrapping_mul(0x100000001b3);
    }
    format!("{hash:x}")
}

pub struct CoverCache {
    dir: PathBuf,
}

pub enum Download {
    Ok(Vec<u8>),
    /// 403: the signed URL expired.
    Expired,
    Failed,
}

impl CoverCache {
    pub fn new(cache_dir: &Path) -> Self {
        let dir = cache_dir.join("covers");
        let _ = std::fs::create_dir_all(&dir);
        Self { dir }
    }

    pub fn file_for(&self, url: &str) -> PathBuf {
        self.dir.join(key(url))
    }

    pub fn cached(&self, url: &str) -> Option<PathBuf> {
        let f = self.file_for(url);
        std::fs::metadata(&f)
            .ok()
            .filter(|m| m.len() > 0)
            .map(|_| f)
    }

    pub fn store(&self, url: &str, data: &[u8]) -> Option<PathBuf> {
        let f = self.file_for(url);
        write_atomic(&f, data).ok().map(|_| f)
    }
}

pub async fn download(http: &reqwest::Client, url: &str) -> Download {
    match http.get(url).send().await {
        Ok(r) => {
            let status = r.status().as_u16();
            if status == 403 {
                return Download::Expired;
            }
            if !(200..300).contains(&status) {
                return Download::Failed;
            }
            match r.bytes().await {
                Ok(b) if !b.is_empty() => Download::Ok(b.to_vec()),
                _ => Download::Failed,
            }
        }
        Err(_) => Download::Failed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_ignores_query_and_fragment_and_is_fnv1a64() {
        assert_eq!(
            key("https://a/b.png?X-Amz=1#f"),
            key("https://a/b.png?X-Amz=2")
        );
        assert_ne!(key("https://a/b.png"), key("https://a/c.png"));
        // FNV-1a 64 of "" is the offset basis.
        assert_eq!(key(""), "cbf29ce484222325");
        assert_eq!(key("a"), "af63dc4c8601ec8c");
    }
}
