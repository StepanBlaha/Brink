//! Win32 fix-ups for the notch HWND (plan 3.a.2 to 3.a.5). Compiled on Windows only.

use super::hit_test::SharedHit;
use super::placement::{taskbar_overlaps, Rect};
use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use windows::core::{w, BOOL};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_EXCLUDED_FROM_PEEK, DWMWA_TRANSITIONS_FORCEDISABLED,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::HiDpi::{
    GetAwarenessFromDpiAwarenessContext, GetThreadDpiAwarenessContext,
};
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId,
    IsWindow, SetForegroundWindow, SetWindowLongPtrW, SetWindowPos, ShowWindow,
    SystemParametersInfoW, GWL_EXSTYLE, HWND_TOPMOST, SPI_GETCLIENTAREAANIMATION, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
    WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

/// Foreground window before the panel took focus; restored on collapse.
static PREV_FOREGROUND: AtomicIsize = AtomicIsize::new(0);

fn hwnd_of(raw: isize) -> HWND {
    HWND(raw as *mut c_void)
}

pub fn raw_hwnd(win: &tauri::WebviewWindow) -> Option<isize> {
    win.hwnd().ok().map(|h| h.0 as isize)
}

/// Tool window (no Alt-Tab, no taskbar button), no-activate, square corners, no DWM fade.
pub fn apply_styles(raw: isize) {
    let hwnd = hwnd_of(raw);
    // SAFETY: `hwnd` is the live notch window owned by this process.
    unsafe {
        let mut ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        ex |= WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0;
        ex &= !WS_EX_APPWINDOW.0;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex as isize);
        let corner = DWMWCP_DONOTROUND.0;
        let on: BOOL = true.into();
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner as *const _ as *const c_void,
            size_of::<i32>() as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            &on as *const _ as *const c_void,
            size_of::<BOOL>() as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_EXCLUDED_FROM_PEEK,
            &on as *const _ as *const c_void,
            size_of::<BOOL>() as u32,
        );
    }
    let awareness = unsafe { GetAwarenessFromDpiAwarenessContext(GetThreadDpiAwarenessContext()) };
    crate::logging::info(&format!("notch dpi awareness: {}", awareness.0));
}

pub fn exstyle_bits(raw: isize) -> u32 {
    // SAFETY: read-only query on our own window.
    unsafe { GetWindowLongPtrW(hwnd_of(raw), GWL_EXSTYLE) as u32 }
}

pub fn show_no_activate(raw: isize) {
    // SAFETY: our own window.
    unsafe {
        let _ = ShowWindow(hwnd_of(raw), SW_SHOWNOACTIVATE);
    }
    assert_topmost(raw);
}

pub fn assert_topmost(raw: isize) {
    // SAFETY: our own window.
    unsafe {
        let _ = SetWindowPos(
            hwnd_of(raw),
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

fn set_noactivate(hwnd: HWND, on: bool) {
    // SAFETY: our own window.
    unsafe {
        let mut ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        if on {
            ex |= WS_EX_NOACTIVATE.0;
        } else {
            ex &= !WS_EX_NOACTIVATE.0;
        }
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex as isize);
    }
}

/// Take keyboard focus for typing, remembering who had it.
pub fn request_focus(raw: isize) {
    let hwnd = hwnd_of(raw);
    // SAFETY: Win32 focus calls on our own window and the current foreground window.
    unsafe {
        let prev = GetForegroundWindow();
        if prev != hwnd && !prev.0.is_null() {
            PREV_FOREGROUND.store(prev.0 as isize, Ordering::SeqCst);
        }
        set_noactivate(hwnd, false);
        if !SetForegroundWindow(hwnd).as_bool() && !prev.0.is_null() {
            let fg_thread = GetWindowThreadProcessId(prev, None);
            let me = GetCurrentThreadId();
            let _ = AttachThreadInput(me, fg_thread, true);
            let _ = SetForegroundWindow(hwnd);
            let _ = AttachThreadInput(me, fg_thread, false);
        }
    }
}

/// Give focus back to the previous window (only if we still hold it) and stop activating.
pub fn release_focus(raw: isize) {
    let hwnd = hwnd_of(raw);
    set_noactivate(hwnd, true);
    let prev = PREV_FOREGROUND.swap(0, Ordering::SeqCst);
    if prev == 0 {
        return;
    }
    let p = hwnd_of(prev);
    // SAFETY: IsWindow validates the stale handle before use.
    unsafe {
        if IsWindow(Some(p)).as_bool() && GetForegroundWindow() == hwnd {
            let _ = SetForegroundWindow(p);
        }
    }
}

/// Settings > Accessibility > Animation effects off means reduce motion.
pub fn reduce_motion() -> bool {
    let mut on = BOOL(1);
    // SAFETY: the out pointer is a live BOOL.
    let ok = unsafe {
        SystemParametersInfoW(
            SPI_GETCLIENTAREAANIMATION,
            0,
            Some(&mut on as *mut BOOL as *mut c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
    };
    ok.is_ok() && !on.as_bool()
}

fn taskbar_rect() -> Option<Rect> {
    // SAFETY: plain window lookup and rect query.
    unsafe {
        let bar = FindWindowW(w!("Shell_TrayWnd"), None).ok()?;
        let mut r = RECT::default();
        GetWindowRect(bar, &mut r).ok()?;
        Some(Rect::new(r.left, r.top, r.right - r.left, r.bottom - r.top))
    }
}

/// 250 ms ticker: auto-hide taskbar overlap; every 2 s: re-assert topmost and D3D full screen.
pub fn spawn_extras(app: AppHandle, label: &'static str, hit: SharedHit) {
    std::thread::spawn(move || {
        let (mut tick, mut overlap, mut full) = (0u32, false, false);
        loop {
            std::thread::sleep(Duration::from_millis(250));
            tick = tick.wrapping_add(1);
            let Some(win) = app.get_webview_window(label) else {
                continue;
            };
            let (Some(raw), Ok(true)) = (raw_hwnd(&win), win.is_visible()) else {
                continue;
            };
            if let (Some(bar), Ok(Some(mon)), Ok(pos)) =
                (taskbar_rect(), win.current_monitor(), win.outer_position())
            {
                let s = win.scale_factor().unwrap_or(1.0);
                let shapes: Vec<Rect> = hit
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .rects
                    .iter()
                    .map(|r| {
                        Rect::new(
                            pos.x + (r.x * s) as i32,
                            pos.y + (r.y * s) as i32,
                            (r.w * s) as i32,
                            (r.h * s) as i32,
                        )
                    })
                    .collect();
                let m = Rect::new(
                    mon.position().x,
                    mon.position().y,
                    mon.size().width as i32,
                    mon.size().height as i32,
                );
                let now = taskbar_overlaps(bar, m, &shapes);
                if now != overlap {
                    overlap = now;
                    let _ = app.emit_to(label, "notch://taskbar-overlap", now);
                }
            }
            if tick % 8 == 0 {
                assert_topmost(raw);
                // SAFETY: shell query without preconditions.
                let state = unsafe { SHQueryUserNotificationState() };
                let now = matches!(state, Ok(s) if s == QUNS_RUNNING_D3D_FULL_SCREEN);
                if now != full {
                    full = now;
                    let _ = app.emit_to(label, "notch://fullscreen", now);
                }
            }
        }
    });
}
