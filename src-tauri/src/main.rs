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
    let content = tauri::generate_context!();
    tauri::Builder::default()
        // .manage(conf::HMDState::default())
        .invoke_handler(tauri::generate_handler![
            cmd::redirect_main_window,
            cmd::open_settings_window,
            // tray::tray_blink,
        ])
        .setup(setup::init)
        // .menu(menu::init(&content))
        // .on_menu_event(menu::handler)
        // .system_tray(tauri::SystemTray::default())
        // .plugin(plugins::WaExtra::default())
        .run(content)
        .expect("error while running HackDesk application");
}
