//! Real Credential Manager round trip. Runs on Windows CI only.
#![cfg(windows)]

use brink_lib::secrets::{AuthKind, KeyringBackend, OAuthWorkspace, TokenStore};

#[test]
fn credential_manager_save_load_kind_delete() {
    let s = TokenStore::new(Box::new(KeyringBackend::new("cz.stepanblaha.brink.test")));
    s.delete();
    assert_eq!(s.kind(), None);
    s.save("secret_test_token").unwrap();
    assert_eq!(s.load().as_deref(), Some("secret_test_token"));
    assert_eq!(s.kind(), Some(AuthKind::Internal));
    let ws = OAuthWorkspace {
        workspace_name: Some("Test".into()),
        ..Default::default()
    };
    s.save_oauth("acc", Some("ref"), &ws).unwrap();
    assert_eq!(s.kind(), Some(AuthKind::Oauth));
    assert_eq!(s.load_refresh_token().as_deref(), Some("ref"));
    assert_eq!(s.load_workspace(), Some(ws));
    s.delete();
    assert_eq!(s.load(), None);
    assert_eq!(s.kind(), None);
}
