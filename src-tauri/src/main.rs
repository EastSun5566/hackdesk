// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod utils;

use app::{
    cmd,
    setup,
    // conf,
};

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            cmd::open_settings_window,
            cmd::redirect,
            cmd::open_link // tray::tray_blink,
        ])
        .setup(setup::init)
        // .menu(menu::init)
        // .on_menu_event(menu::handler)
        // .system_tray(tauri::SystemTray::default())
        .run(tauri::generate_context!())
        .expect("error while running HackDesk application");
}
