//! The native right-click menu (AppDelegate.buildMenu) and its actions.

use super::place::{pill_label, pill_toggle};
use crate::commands::{emit, AppState};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, Manager};

pub const HELP_URL: &str = "https://brinknotch.site/#faq";
pub const FEEDBACK_URL: &str = "mailto:stepa15.b@gmail.com?subject=Brink%20feedback";

pub struct MenuItems {
    edges: [(&'static str, CheckMenuItem<tauri::Wry>); 3],
    pill: MenuItem<tauri::Wry>,
}

#[derive(Default)]
pub struct MenuHandles(pub Mutex<Option<MenuItems>>);

pub fn build(app: &AppHandle, settings: &Value) -> tauri::Result<Menu<tauri::Wry>> {
    let edge = settings["dockEdge"].as_str().unwrap_or("right");
    let pill_now = settings["pillStyle"].as_str().unwrap_or("line");
    let mk = |id: &'static str, text: &str| {
        CheckMenuItem::with_id(
            app,
            format!("dock:{id}"),
            text,
            true,
            edge == id,
            None::<&str>,
        )
    };
    let edges = [
        ("left", mk("left", "Dock on Left")?),
        ("right", mk("right", "Dock on Right")?),
        ("top", mk("top", "Dock on Top")?),
    ];
    let pill = MenuItem::with_id(app, "pill", pill_label(pill_now), true, None::<&str>)?;
    let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
    let (about, set, help) = (
        item("about", "About Brink")?,
        item("settings", "Settings...")?,
        item("help", "Help")?,
    );
    let (feedback, privacy, terms, quit) = (
        item("feedback", "Send Feedback")?,
        item("privacy", "Privacy Policy")?,
        item("terms", "Terms of Use")?,
        item("quit", "Quit Brink")?,
    );
    let sep = || PredefinedMenuItem::separator(app);
    let (s1, s2, s3) = (sep()?, sep()?, sep()?);
    let menu = Menu::with_items(
        app,
        &[
            &edges[0].1,
            &edges[1].1,
            &edges[2].1,
            &s1,
            &pill,
            &s2,
            &about,
            &set,
            &help,
            &feedback,
            &privacy,
            &terms,
            &s3,
            &quit,
        ],
    )?;
    *app.state::<MenuHandles>().0.lock().unwrap() = Some(MenuItems { edges, pill });
    Ok(menu)
}

/// Keeps the check marks and the pill label in step with settings.
pub fn refresh(app: &AppHandle, settings: &Value) {
    let edge = settings["dockEdge"].as_str().unwrap_or("right");
    let pill = settings["pillStyle"].as_str().unwrap_or("line");
    if let Some(items) = app.state::<MenuHandles>().0.lock().unwrap().as_ref() {
        for (id, item) in &items.edges {
            let _ = item.set_checked(*id == edge);
        }
        let _ = items.pill.set_text(pill_label(pill));
    }
}

fn write_setting(app: &AppHandle, patch: Value) {
    let state = app.state::<AppState>();
    let result = state.settings.lock().unwrap().set(&patch);
    if let Ok(v) = result {
        refresh(app, &v);
        emit(app, "settings://changed", v);
    }
}

pub fn on_event(app: &AppHandle, id: &str) {
    let open = |url: &str| {
        let _ = crate::shell::launch_url(url);
    };
    let window = |name: &str| emit(app, "window://open", json!({ "name": name }));
    match id {
        "dock:left" | "dock:right" | "dock:top" => {
            write_setting(app, json!({ "dockEdge": &id[5..] }));
        }
        "pill" => {
            let cur = app.state::<AppState>().settings.lock().unwrap().get();
            let next = pill_toggle(cur["pillStyle"].as_str().unwrap_or("line"));
            write_setting(app, json!({ "pillStyle": next }));
        }
        "about" => window("about"),
        "privacy" => window("legal:privacy"),
        "terms" => window("legal:terms"),
        "settings" => crate::deeplink::show_settings(app),
        "help" => open(HELP_URL),
        "feedback" => open(FEEDBACK_URL),
        "quit" => app.exit(0),
        _ => {}
    }
}
