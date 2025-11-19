// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod utils;

use app::{cmd, menu, setup};

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            cmd::open_command_palette_window,
            cmd::open_settings_window,
            cmd::run_script,
            // because window.open not working {@link https://github.com/tauri-apps/wry/issues/649}
            cmd::open_link
        ])
        .setup(setup::init)
        .menu(menu::init)
        .on_menu_event(menu::handler)
        .run(tauri::generate_context!())
        .expect("error while running HackDesk application");
}
