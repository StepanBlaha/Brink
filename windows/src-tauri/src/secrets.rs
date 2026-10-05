//! Credentials (port of Keychain.swift): `TokenStore` over a `SecretBackend`.
//! Windows Credential Manager via `keyring` (target `<account>.<service>`), memory in tests.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

pub const SERVICE: &str = "cz.stepanblaha.brink";
const ACCESS: &str = "notion-token";
const REFRESH: &str = "notion-refresh-token";
const META: &str = "notion-oauth-meta";
/// Windows limits credential blobs to 2560 bytes.
pub const MAX_SECRET_BYTES: usize = 2048;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthKind {
    Internal,
    Oauth,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthWorkspace {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bot_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct SecretError(pub String);

pub trait SecretBackend: Send + Sync {
    fn set(&self, account: &str, data: &[u8]) -> Result<(), SecretError>;
    fn get(&self, account: &str) -> Option<Vec<u8>>;
    fn remove(&self, account: &str);
}

/// Process-local backend for tests, previews and demo mode.
#[derive(Default)]
pub struct MemoryBackend(Mutex<HashMap<String, Vec<u8>>>);

impl MemoryBackend {
    pub fn new() -> Self {
        Self::default()
    }
}

impl SecretBackend for MemoryBackend {
    fn set(&self, account: &str, data: &[u8]) -> Result<(), SecretError> {
        self.0
            .lock()
            .unwrap()
            .insert(account.to_string(), data.to_vec());
        Ok(())
    }
    fn get(&self, account: &str) -> Option<Vec<u8>> {
        self.0.lock().unwrap().get(account).cloned()
    }
    fn remove(&self, account: &str) {
        self.0.lock().unwrap().remove(account);
    }
}

/// Windows Credential Manager (generic credentials); macOS Keychain on dev machines.
#[cfg(any(windows, target_os = "macos"))]
pub struct KeyringBackend {
    service: String,
}

#[cfg(any(windows, target_os = "macos"))]
impl KeyringBackend {
    pub fn new(service: &str) -> Self {
        Self {
            service: service.to_string(),
        }
    }
    fn entry(&self, account: &str) -> Result<keyring::Entry, SecretError> {
        keyring::Entry::new(&self.service, account).map_err(|e| SecretError(e.to_string()))
    }
}

#[cfg(any(windows, target_os = "macos"))]
impl SecretBackend for KeyringBackend {
    fn set(&self, account: &str, data: &[u8]) -> Result<(), SecretError> {
        self.entry(account)?
            .set_secret(data)
            .map_err(|e| SecretError(format!("Credential save failed: {e}")))
    }
    fn get(&self, account: &str) -> Option<Vec<u8>> {
        self.entry(account).ok()?.get_secret().ok()
    }
    fn remove(&self, account: &str) {
        if let Ok(e) = self.entry(account) {
            let _ = e.delete_credential();
        }
    }
}

/// The production backend for this platform.
pub fn default_backend() -> Box<dyn SecretBackend> {
    #[cfg(any(windows, target_os = "macos"))]
    {
        Box::new(KeyringBackend::new(SERVICE))
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Box::new(MemoryBackend::new())
    }
}

pub struct TokenStore {
    backend: Box<dyn SecretBackend>,
}

impl TokenStore {
    pub fn new(backend: Box<dyn SecretBackend>) -> Self {
        Self { backend }
    }

    fn put(&self, account: &str, data: &[u8]) -> Result<(), SecretError> {
        if data.len() >= MAX_SECRET_BYTES {
            return Err(SecretError("The credential is too large to store.".into()));
        }
        self.backend.set(account, data)
    }

    fn text(&self, account: &str) -> Option<String> {
        self.backend
            .get(account)
            .and_then(|d| String::from_utf8(d).ok())
    }

    /// Saves a pasted internal token, dropping any OAuth leftovers.
    pub fn save(&self, token: &str) -> Result<(), SecretError> {
        self.put(ACCESS, token.as_bytes())?;
        self.backend.remove(REFRESH);
        self.backend.remove(META);
        Ok(())
    }

    pub fn load(&self) -> Option<String> {
        self.text(ACCESS)
    }

    pub fn save_oauth(
        &self,
        access: &str,
        refresh: Option<&str>,
        workspace: &OAuthWorkspace,
    ) -> Result<(), SecretError> {
        self.put(ACCESS, access.as_bytes())?;
        match refresh.filter(|r| !r.is_empty()) {
            Some(r) => self.put(REFRESH, r.as_bytes())?,
            None => self.backend.remove(REFRESH),
        }
        let meta = serde_json::to_vec(workspace).map_err(|e| SecretError(e.to_string()))?;
        self.put(META, &meta)
    }

    pub fn load_refresh_token(&self) -> Option<String> {
        self.text(REFRESH)
    }

    pub fn load_workspace(&self) -> Option<OAuthWorkspace> {
        self.backend
            .get(META)
            .and_then(|d| serde_json::from_slice(&d).ok())
    }

    pub fn kind(&self) -> Option<AuthKind> {
        self.load()?;
        Some(if self.backend.get(META).is_some() {
            AuthKind::Oauth
        } else {
            AuthKind::Internal
        })
    }

    pub fn delete(&self) {
        for a in [ACCESS, REFRESH, META] {
            self.backend.remove(a);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> TokenStore {
        TokenStore::new(Box::new(MemoryBackend::new()))
    }

    #[test]
    fn save_load_kind_delete() {
        let s = store();
        assert_eq!(s.kind(), None);
        s.save("secret_abc").unwrap();
        assert_eq!(s.load().as_deref(), Some("secret_abc"));
        assert_eq!(s.kind(), Some(AuthKind::Internal));
        s.delete();
        assert_eq!(s.load(), None);
        assert_eq!(s.kind(), None);
    }

    #[test]
    fn oauth_kind_and_refresh_semantics() {
        let s = store();
        let ws = OAuthWorkspace {
            workspace_name: Some("Acme".into()),
            ..Default::default()
        };
        s.save_oauth("acc", Some("ref"), &ws).unwrap();
        assert_eq!(s.kind(), Some(AuthKind::Oauth));
        assert_eq!(s.load_refresh_token().as_deref(), Some("ref"));
        assert_eq!(s.load_workspace(), Some(ws.clone()));
        s.save_oauth("acc2", Some(""), &ws).unwrap();
        assert_eq!(
            s.load_refresh_token(),
            None,
            "empty refresh counts as absent"
        );
        assert_eq!(s.load().as_deref(), Some("acc2"));
    }

    #[test]
    fn pasting_a_token_removes_oauth_leftovers() {
        let s = store();
        s.save_oauth("acc", Some("ref"), &OAuthWorkspace::default())
            .unwrap();
        s.save("pasted").unwrap();
        assert_eq!(s.kind(), Some(AuthKind::Internal));
        assert_eq!(s.load_refresh_token(), None);
        assert_eq!(s.load_workspace(), None);
    }

    #[test]
    fn rejects_oversized_credentials() {
        let s = store();
        assert!(s.save(&"x".repeat(2048)).is_err());
        assert!(s.save(&"x".repeat(2047)).is_ok());
    }
}
