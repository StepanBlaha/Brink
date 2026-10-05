//! Accessibility settings the webview cannot read itself.

use crate::error::AppError;

/// Windows "Text size" slider (Settings, Accessibility) as a percent; 100 when unknown.
pub fn clamp_text_scale(percent: u32) -> u32 {
    percent.clamp(100, 225)
}

#[cfg(target_os = "windows")]
fn read_text_scale() -> u32 {
    let Some(b) = crate::winreg::read(r"Software\Microsoft\Accessibility", "TextScaleFactor")
    else {
        return 100;
    };
    let Some(raw) = b.get(..4).and_then(|s| <[u8; 4]>::try_from(s).ok()) else {
        return 100;
    };
    clamp_text_scale(u32::from_le_bytes(raw))
}

#[cfg(not(target_os = "windows"))]
fn read_text_scale() -> u32 {
    100
}

/// The text scale factor in percent (100 to 225). The UI multiplies its font sizes by it.
#[tauri::command]
pub async fn text_scale() -> Result<u32, AppError> {
    Ok(read_text_scale())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scale_is_clamped_to_the_windows_range() {
        assert_eq!(clamp_text_scale(0), 100);
        assert_eq!(clamp_text_scale(100), 100);
        assert_eq!(clamp_text_scale(150), 150);
        assert_eq!(clamp_text_scale(900), 225);
    }
}
