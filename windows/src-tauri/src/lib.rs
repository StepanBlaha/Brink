//! Brink for Windows: Rust core. Later milestones fill the modules in.

pub mod error;
pub mod logging;
pub mod paths;
pub mod window;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersion {
    pub marketing: String,
    pub build: String,
}

#[tauri::command]
async fn app_version() -> Result<AppVersion, error::AppError> {
    Ok(AppVersion {
        marketing: env!("CARGO_PKG_VERSION").to_string(),
        build: "0".to_string(),
    })
}

pub fn run() {
    logging::init();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_version])
        .setup(|app| {
            window::notch_window::setup(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Brink");
}
