// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
// mod conf;
// mod utils;

use app::{
    // cmd,
    setup,
    // window
};
// use conf::AppConf;
// use tauri_plugin_autostart::MacosLauncher;
// use tauri_plugin_log::LogTarget;

#[tokio::main]
async fn main() {
//   let app_conf = AppConf::read().write();
    let context = tauri::generate_context!();

//   let mut log = tauri_plugin_log::Builder::default()
//     .targets([
//       LogTarget::Folder(utils::app_root()),
//       LogTarget::Stdout,
//       LogTarget::Webview,
//     ])
//     .level(log::LevelFilter::Debug);

//   if cfg!(debug_assertions) {
//     log = log.with_colors(ferng::colors::ColoredLevelConfig::new());
//   }

    let builder = tauri::Builder::default()
    // .plugin(log.build())
    // .plugin(tauri_plugin_autostart::init(
    //   MacosLauncher::LaunchAgent,
    //   None,
    // ))
    // .invoke_handler(tauri::generate_handler![
    //   cmd::wa_window,
    //   window::cmd::window_reload,
    // ])
    .setup(setup::init);

    builder
        .run(context)
        .expect("error while running HackMD app");
}