//! Brink for Windows: Rust core. Later milestones fill the modules in.

pub mod capture;
pub mod clipboard;
pub mod commands;
pub mod deeplink;
pub mod error;
pub mod hotkeys;
pub mod logging;
pub mod notion;
pub mod paths;
pub mod queue;
pub mod secrets;
pub mod shell;
pub mod store;
pub mod tray;
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
        .plugin(deeplink::single_instance())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_version,
            shell::open_in_notion,
            shell::show_settings,
            shell::open_url,
            commands::auth::auth_status,
            commands::auth::auth_save_token,
            commands::auth::auth_disconnect,
            commands::auth::auth_test_connection,
            commands::auth::oauth_available,
            commands::auth::oauth_start,
            commands::notion_cmds::notion_search,
            commands::notion_cmds::notion_retrieve_database,
            commands::notion_cmds::notion_retrieve_data_source,
            commands::notion_cmds::notion_query_data_source,
            commands::notion_cmds::notion_create_row,
            commands::notion_cmds::notion_update_page_properties,
            commands::notion_cmds::notion_set_page_emoji_icon,
            commands::notion_cmds::notion_retrieve_page,
            commands::notion_cmds::notion_block_children,
            commands::notion_cmds::notion_retrieve_block,
            commands::notion_cmds::notion_update_block,
            commands::notion_cmds::notion_append_blocks,
            commands::notion_cmds::notion_delete_block,
            commands::notion_cmds::notion_upload_file,
            commands::notion_cmds::upload_image,
            commands::pins::pins_get,
            commands::pins::pins_add,
            commands::pins::pins_remove,
            commands::pins::pins_update,
            commands::pins::pins_move_within_group,
            commands::pins::pins_move_among_all,
            commands::pins::pins_set_group,
            commands::pins::groups_get,
            commands::pins::groups_add,
            commands::pins::groups_rename,
            commands::pins::groups_delete,
            commands::pins::groups_move,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::panel_size_get,
            commands::settings::panel_size_set,
            commands::settings::panel_size_reset,
            commands::cache::cache_load,
            commands::cache::cache_save,
            commands::cache::cache_clear,
            commands::cache::cover_get,
            commands::queue::queue_submit,
            commands::queue::queue_process,
            commands::queue::queue_pending_count,
            window::notch_window::notch_configure,
            window::notch_window::notch_set_hit_rects,
            window::notch_window::notch_capture,
            window::notch_window::notch_request_focus,
            window::notch_window::notch_release_focus,
            window::notch_window::notch_reduce_motion,
            window::notch_window::debug_window_styles,
            hotkeys::hotkeys_apply,
            hotkeys::hotkeys_suspend,
            hotkeys::hotkeys_status,
            capture::capture_show,
            capture::capture_hide,
            capture::toast_show,
            tray::tray_set_count,
            tray::tray_flyout_toggle,
            tray::tray_flyout_hide,
            clipboard::clipboard_read,
            deeplink::deeplink_ready
        ])
        .setup(|app| {
            commands::setup(app.handle());
            window::notch_window::setup(app.handle());
            capture::setup(app.handle());
            tray::setup(app.handle());
            hotkeys::setup(app.handle());
            deeplink::setup(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Brink");
}
