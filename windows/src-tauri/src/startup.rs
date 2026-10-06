//! Visible startup failures: a panic hook and build-error handler that write `crash.log` and show
//! a native message box (the release build has no console, so otherwise Brink would just vanish).

use std::path::PathBuf;

pub const ISSUES: &str = "github.com/StepanBlaha/Brink/issues";
pub const WEBVIEW2_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
pub const TITLE: &str = "Brink couldn't start";

/// `--safe`: skip global hotkeys so a conflicting shortcut cannot block startup.
pub fn is_safe(args: &[String]) -> bool {
    args.iter().any(|a| a == "--safe")
}

/// True when an error message points at a missing or broken WebView2 runtime.
pub fn is_webview_error(msg: &str) -> bool {
    msg.to_lowercase().contains("webview")
}

/// Text of the message box. `webview` selects the install hint over the generic report text.
pub fn dialog_text(detail: &str, log: &str, webview: bool) -> String {
    if webview {
        return format!(
            "Brink needs Microsoft Edge WebView2. Install it from {WEBVIEW2_URL} and open Brink again.\n\nLog: {log}"
        );
    }
    let detail: String = detail.chars().take(300).collect();
    format!("Brink hit an error while starting and has to close.\n\n{detail}\n\nLog: {log}\nReport at {ISSUES}")
}

/// Full crash log entry for a panic.
pub fn crash_report(msg: &str, location: &str, backtrace: &str) -> String {
    format!("PANIC: {msg}\nat {location}\n{backtrace}\n")
}

/// Decodes a REG_SZ value (UTF-16LE bytes with a trailing NUL).
pub fn decode_reg_sz(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .take_while(|u| *u != 0)
        .collect();
    String::from_utf16_lossy(&units)
}

pub fn crash_log_path() -> PathBuf {
    crate::paths::resolve_with(&|k| std::env::var(k).ok())
        .logs
        .join("crash.log")
}

fn append_crash_log(text: &str) {
    use std::io::Write;
    let path = crash_log_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "--- {secs} brink {} ---", env!("CARGO_PKG_VERSION"));
        let _ = f.write_all(text.as_bytes());
    }
}

/// Must be the first call in `run()`.
pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let msg = match info.payload().downcast_ref::<&str>() {
            Some(s) => (*s).to_string(),
            None => info
                .payload()
                .downcast_ref::<String>()
                .cloned()
                .unwrap_or_else(|| "unknown panic".into()),
        };
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".into());
        let bt = std::backtrace::Backtrace::force_capture().to_string();
        let report = crash_report(&msg, &loc, &bt);
        append_crash_log(&report);
        crate::logging::error(&format!("panic: {msg} at {loc}"));
        let detail = format!("{msg} ({loc})");
        show_error(&dialog_text(
            &detail,
            &crash_log_path().display().to_string(),
            is_webview_error(&msg),
        ));
    }));
}

/// Handles `Builder::build` failing: log, tell the user, exit.
pub fn fatal_build_error(err: &dyn std::fmt::Display) -> ! {
    let msg = err.to_string();
    append_crash_log(&format!("BUILD ERROR: {msg}\n"));
    crate::logging::error(&format!("build error: {msg}"));
    show_error(&dialog_text(
        &msg,
        &crash_log_path().display().to_string(),
        is_webview_error(&msg),
    ));
    std::process::exit(1);
}

/// One INFO line with everything needed to triage a bug report.
pub fn log_environment() {
    let webview = tauri::webview_version().unwrap_or_else(|e| format!("unavailable ({e})"));
    crate::logging::info(&format!(
        "brink {} build {} | windows {} | arch {} | webview2 {}{}",
        env!("CARGO_PKG_VERSION"),
        env!("BRINK_BUILD"),
        windows_version(),
        std::env::consts::ARCH,
        webview,
        if is_safe(&std::env::args().collect::<Vec<_>>()) {
            " | safe mode"
        } else {
            ""
        },
    ));
}

#[cfg(windows)]
fn windows_version() -> String {
    const KEY: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";
    let get = |v: &str| crate::winreg::read_machine(KEY, v).map(|b| decode_reg_sz(&b));
    let name = get("ProductName").unwrap_or_else(|| "Windows".into());
    let disp = get("DisplayVersion").unwrap_or_default();
    let build = get("CurrentBuildNumber").unwrap_or_else(|| "?".into());
    format!("{name} {disp} build {build}")
}

#[cfg(not(windows))]
fn windows_version() -> String {
    std::env::consts::OS.to_string()
}

#[cfg(windows)]
fn show_error(text: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND,
    };
    let (t, m) = (crate::winreg::wide(TITLE), crate::winreg::wide(text));
    // SAFETY: both buffers are NUL-terminated and outlive the blocking call.
    unsafe {
        MessageBoxW(
            None,
            PCWSTR(m.as_ptr()),
            PCWSTR(t.as_ptr()),
            MB_OK | MB_ICONERROR | MB_SETFOREGROUND,
        );
    }
}

#[cfg(not(windows))]
fn show_error(text: &str) {
    eprintln!("{TITLE}: {text}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_webview_errors() {
        assert!(is_webview_error("WebView2 runtime not found"));
        assert!(is_webview_error("failed to create webview: Error"));
        assert!(!is_webview_error("window label already exists"));
    }

    #[test]
    fn webview_dialog_has_install_link() {
        let t = dialog_text("x", r"C:\l\crash.log", true);
        assert!(t.contains("Brink needs Microsoft Edge WebView2."));
        assert!(t.contains(WEBVIEW2_URL));
        assert!(t.contains(r"C:\l\crash.log"));
    }

    #[test]
    fn generic_dialog_has_log_and_issues() {
        let t = dialog_text("boom", "/l/crash.log", false);
        assert!(t.contains("boom") && t.contains("/l/crash.log") && t.contains(ISSUES));
    }

    #[test]
    fn dialog_truncates_long_detail() {
        let t = dialog_text(&"a".repeat(5000), "/l", false);
        assert!(t.len() < 700);
    }

    #[test]
    fn crash_report_layout() {
        let r = crash_report("m", "f.rs:1:2", "bt");
        assert_eq!(r, "PANIC: m\nat f.rs:1:2\nbt\n");
    }

    #[test]
    fn decodes_reg_sz() {
        let b: Vec<u8> = "10.0\0".encode_utf16().flat_map(u16::to_le_bytes).collect();
        assert_eq!(decode_reg_sz(&b), "10.0");
        assert_eq!(decode_reg_sz(&[]), "");
    }

    #[test]
    fn safe_flag() {
        assert!(is_safe(&["brink".into(), "--safe".into()]));
        assert!(!is_safe(&["brink".into()]));
    }
}
