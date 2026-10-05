//! Launch at sign-in for the unpackaged build (plan 3.i): `HKCU\...\Run\Brink = "<exe>" --autostart`.
//! `--autostart` starts the notch and tray only; onboarding opens on a manual launch.
//! The state the user can change in Task Manager lives in `...\Explorer\StartupApproved\Run`.

use crate::error::AppError;
use serde::Serialize;
use std::path::Path;

pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const APPROVED_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
pub const VALUE: &str = "Brink";
pub const FLAG: &str = "--autostart";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Enabled,
    /// Turned off in Task Manager or Windows Settings, Apps, Startup.
    DisabledByUser,
    Off,
}

/// The Run value: the quoted exe and the flag.
pub fn run_command(exe: &Path) -> String {
    format!("\"{}\" {FLAG}", exe.display())
}

/// StartupApproved bytes: an even first byte (2, 6) is enabled, an odd one (3, 7) is disabled.
pub fn approved_enabled(bytes: &[u8]) -> bool {
    bytes.first().map_or(true, |b| b % 2 == 0)
}

pub fn status_from(has_run: bool, approved: Option<&[u8]>) -> Status {
    match (has_run, approved) {
        (false, _) => Status::Off,
        (true, Some(b)) if !approved_enabled(b) => Status::DisabledByUser,
        (true, _) => Status::Enabled,
    }
}

pub fn has_autostart_flag(args: impl IntoIterator<Item = String>) -> bool {
    args.into_iter().any(|a| a == FLAG)
}

#[cfg(target_os = "windows")]
mod imp {
    use super::*;
    use crate::winreg::{read, wide};
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, KEY_SET_VALUE, KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    pub fn status() -> Status {
        let run = read(RUN_KEY, VALUE).is_some();
        let approved = read(APPROVED_KEY, VALUE);
        status_from(run, approved.as_deref())
    }

    pub fn set(enabled: bool, exe: &Path) -> Result<(), AppError> {
        let (k, v) = (wide(RUN_KEY), wide(VALUE));
        // SAFETY: HKCU Run key writes; the handle is closed on every path.
        unsafe {
            let mut h = HKEY::default();
            if enabled {
                let rc = RegCreateKeyExW(
                    HKEY_CURRENT_USER,
                    PCWSTR(k.as_ptr()),
                    None,
                    PCWSTR::null(),
                    REG_OPTION_NON_VOLATILE,
                    KEY_WRITE,
                    None,
                    &mut h,
                    None,
                );
                if rc.is_err() {
                    return Err(AppError::new("io", "Could not turn on launch at sign-in."));
                }
                let data: Vec<u8> = wide(&run_command(exe))
                    .iter()
                    .flat_map(|u| u.to_le_bytes())
                    .collect();
                let rc = RegSetValueExW(h, PCWSTR(v.as_ptr()), None, REG_SZ, Some(&data));
                let _ = RegCloseKey(h);
                if rc.is_err() {
                    return Err(AppError::new("io", "Could not turn on launch at sign-in."));
                }
            } else if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(k.as_ptr()),
                None,
                KEY_SET_VALUE,
                &mut h,
            )
            .is_ok()
            {
                let _ = RegDeleteValueW(h, PCWSTR(v.as_ptr()));
                let _ = RegCloseKey(h);
            }
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    static ON: AtomicBool = AtomicBool::new(false);

    pub fn status() -> Status {
        if ON.load(Ordering::SeqCst) {
            Status::Enabled
        } else {
            Status::Off
        }
    }

    pub fn set(enabled: bool, _exe: &Path) -> Result<(), AppError> {
        ON.store(enabled, Ordering::SeqCst);
        Ok(())
    }
}

#[tauri::command]
pub async fn autostart_status() -> Result<Status, AppError> {
    if crate::demo::is_active() {
        return Ok(Status::Off);
    }
    Ok(imp::status())
}

#[tauri::command]
pub async fn autostart_set(enabled: bool) -> Result<Status, AppError> {
    if crate::demo::is_active() {
        return Ok(Status::Off); // demo mode never touches the Run key
    }
    let exe = std::env::current_exe().map_err(|e| AppError::new("io", e.to_string()))?;
    imp::set(enabled, &exe)?;
    Ok(imp::status())
}

/// True when this run was started by the Run key.
#[tauri::command]
pub async fn launched_at_login() -> Result<bool, AppError> {
    Ok(launched_at_login_args())
}

pub fn launched_at_login_args() -> bool {
    has_autostart_flag(std::env::args().skip(1))
}

#[tauri::command]
pub async fn open_startup_settings() -> Result<(), AppError> {
    crate::shell::launch_url("ms-settings:startupapps")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_value_quotes_the_path() {
        let p = Path::new(r"C:\Users\Jo Doe\AppData\Local\Brink\Brink.exe");
        assert_eq!(
            run_command(p),
            r#""C:\Users\Jo Doe\AppData\Local\Brink\Brink.exe" --autostart"#
        );
    }

    #[test]
    fn startup_approved_bytes() {
        assert!(approved_enabled(&[2, 0, 0, 0]));
        assert!(approved_enabled(&[6, 0]));
        assert!(!approved_enabled(&[3, 0, 0]));
        assert!(!approved_enabled(&[7]));
        assert!(approved_enabled(&[]));
    }

    #[test]
    fn status_mapping() {
        assert_eq!(status_from(false, Some(&[3])), Status::Off);
        assert_eq!(status_from(true, None), Status::Enabled);
        assert_eq!(status_from(true, Some(&[2])), Status::Enabled);
        assert_eq!(status_from(true, Some(&[3])), Status::DisabledByUser);
    }

    #[test]
    fn flag_detection() {
        assert!(has_autostart_flag(["--autostart".to_string()]));
        assert!(!has_autostart_flag(["--capture".to_string()]));
        assert!(!has_autostart_flag(Vec::<String>::new()));
    }
}
