//! Brink for Windows: Rust core. Later milestones fill the modules in.

pub mod autostart;
pub mod capture;
pub mod clipboard;
pub mod commands;
pub mod deeplink;
pub mod demo;
pub mod error;
pub mod hotkeys;
pub mod logging;
pub mod notify;
pub mod notion;
pub mod paths;
pub mod queue;
pub mod secrets;
pub mod shell;
pub mod startup;
pub mod store;
pub mod tray;
pub mod window;
#[cfg(target_os = "windows")]
pub mod winreg;

use serde::Serialize;
use tauri::Manager;

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
        build: env!("BRINK_BUILD").to_string(),
    })
}

/// Subsystems are independent: each logs its own failures and the rest keep going.
fn setup_app(app: &tauri::AppHandle) {
    let safe = startup::is_safe(&std::env::args().collect::<Vec<_>>());
    let step = |name: &str| logging::info(&format!("setup: {name}"));
    // The frontend can invoke async commands while setup is still running, so every
    // state those commands read must exist before any subsystem starts. The modules'
    // own `manage` calls then become no-ops.
    app.manage(tray::TrayState::default());
    app.manage(tray::menu::MenuHandles::default());
    app.manage(hotkeys::HotkeyState::default());
    app.manage(capture::ToastGen::default());
    app.manage(deeplink::DeepLinks::default());
    app.manage(window::notch_window::NotchState::new());
    step("state");
    commands::setup(app);
    step("notify");
    commands::notify::setup(app);
    step("windows");
    commands::windows::setup(app);
    step("notch");
    window::notch_window::setup(app);
    step("backdrop");
    demo::backdrop::setup(app);
    step("capture");
    capture::setup(app);
    step("tray");
    tray::setup(app);
    if safe {
        logging::info("setup: hotkeys skipped (--safe)");
        app.manage(hotkeys::HotkeyState::default());
    } else {
        step("hotkeys");
        hotkeys::setup(app);
    }
    step("deeplink");
    deeplink::setup(app);
    logging::info("startup ok");
}

pub fn run() {
    startup::install_panic_hook();
    demo::init();
    logging::init();
    startup::log_environment();
    tauri::Builder::default()
        .plugin(deeplink::single_instance())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_version,
            demo::demo_state,
            demo::demo_finish,
            demo::markers::demo_mark,
            demo::markers::demo_wait,
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
            commands::notion_cmds::read_image_file,
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
            commands::cache::page_backup,
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
            deeplink::deeplink_ready,
            commands::notify::notify_status,
            commands::notify::notify_pending,
            commands::notify::notify_apply,
            commands::windows::window_open,
            commands::windows::system_accent,
            commands::a11y::text_scale,
            commands::windows::emoji_panel_open,
            autostart::autostart_status,
            autostart::autostart_set,
            autostart::launched_at_login,
            autostart::open_startup_settings
        ])
        .setup(|app| {
            setup_app(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| startup::fatal_build_error(&e))
        .run(|_, event| {
            if let tauri::RunEvent::Exit = event {
                demo::cleanup();
            }
        });
}
