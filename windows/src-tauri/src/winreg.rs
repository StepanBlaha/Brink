//! Tiny registry read helper shared by autostart and the system accent (Windows only).

use windows::core::PCWSTR;
use windows::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
    KEY_READ,
};

pub fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// `Some(bytes)` of a value under HKCU, `None` when the key or value is missing.
pub fn read(key: &str, value: &str) -> Option<Vec<u8>> {
    read_in(HKEY_CURRENT_USER, key, value)
}

/// Same as [`read`] but under HKLM (Windows version, WebView2 runtime).
pub fn read_machine(key: &str, value: &str) -> Option<Vec<u8>> {
    read_in(HKEY_LOCAL_MACHINE, key, value)
}

fn read_in(root: HKEY, key: &str, value: &str) -> Option<Vec<u8>> {
    let (k, v) = (wide(key), wide(value));
    // SAFETY: plain registry reads; the handle is closed before returning.
    unsafe {
        let mut h = HKEY::default();
        if RegOpenKeyExW(root, PCWSTR(k.as_ptr()), None, KEY_READ, &mut h).is_err() {
            return None;
        }
        let mut len = 0u32;
        let probe = RegQueryValueExW(h, PCWSTR(v.as_ptr()), None, None, None, Some(&mut len));
        let mut buf = vec![0u8; len as usize];
        let ok = probe.is_ok()
            && RegQueryValueExW(
                h,
                PCWSTR(v.as_ptr()),
                None,
                None,
                Some(buf.as_mut_ptr()),
                Some(&mut len),
            )
            .is_ok();
        let _ = RegCloseKey(h);
        ok.then_some(buf)
    }
}
