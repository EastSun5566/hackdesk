// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
    not(debug_assertions),
    windows_subsystem = "windows"
)]

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
// #[tauri::command]
// fn greet(name: &str) -> String {
//     format!("Hello, {}! You've been greeted from Rust!", name)
// }

// fn main() {
//     tauri::Builder::default()
//         .invoke_handler(tauri::generate_handler![greet])
//         .run(tauri::generate_context!())
//         .expect("error while running tauri application");
// }

mod app;
mod utils;
// mod conf;

use app::{
    cmd,
    setup,
    conf
    // window
};
// use conf::AppConf;
// use tauri_plugin_autostart::MacosLauncher;
// use tauri_plugin_log::LogTarget;

#[tokio::main]
async fn main() {
    let content = tauri::generate_context!();
    tauri::Builder::default()
        .manage(conf::HMDState::default())
        .setup(setup::init)
        .invoke_handler(tauri::generate_handler![
            cmd::open_app_window,
            // tray::tray_blink,
        ])
        // .menu(menu::init(&content))
        // .on_menu_event(menu::handler)
        // .system_tray(tauri::SystemTray::default())
        // .plugin(plugins::WaExtra::default())
        .run(content)
        .expect("error while running HackMD application");
}
