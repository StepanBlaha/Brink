//! Tiny cross-platform native helpers used by the poll thread.

#[cfg(target_os = "windows")]
pub fn any_mouse_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    // SAFETY: GetAsyncKeyState has no preconditions. The high bit is "currently down".
    unsafe {
        (GetAsyncKeyState(i32::from(VK_LBUTTON.0)) | GetAsyncKeyState(i32::from(VK_RBUTTON.0))) < 0
    }
}

#[cfg(target_os = "macos")]
pub fn any_mouse_button_down() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceButtonState(state_id: i32, button: u32) -> bool;
    }
    // kCGEventSourceStateCombinedSessionState = 0; buttons 0 = left, 1 = right.
    // SAFETY: plain CoreGraphics query without pointers.
    unsafe { CGEventSourceButtonState(0, 0) || CGEventSourceButtonState(0, 1) }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn any_mouse_button_down() -> bool {
    false
}
