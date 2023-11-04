// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod utils;

use app::{cmd, setup};

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        // persist the window position and size
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            cmd::open_settings_window,
            cmd::redirect,
            // because window.open not working {@link https://github.com/tauri-apps/wry/issues/649}
            cmd::open_link
        ])
        .setup(setup::init)
        .run(tauri::generate_context!())
        .expect("error while running HackDesk application");
}
