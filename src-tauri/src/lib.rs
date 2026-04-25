// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod utils;

use app::{cmd, menu, setup};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .with_target(false)
        .init();

    tracing::info!("Starting HackDesk application");

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(cmd::CurrentPageContextStore::default())
        .invoke_handler(tauri::generate_handler![
            cmd::execute_action,
            cmd::open_command_palette_window,
            cmd::open_agent_window,
            cmd::open_settings_window,
            cmd::apply_settings,
            cmd::open_link,
            cmd::set_current_page_context,
            cmd::get_current_note_context,
            cmd::send_agent_message,
            cmd::get_agent_runtime_status,
            cmd::validate_agent_provider_config,
            cmd::validate_hackmd_token,
            cmd::list_hackmd_notes,
            cmd::list_hackmd_teams,
            cmd::list_hackmd_team_notes,
            cmd::create_hackmd_note,
            cmd::create_hackmd_team_note,
            cmd::delete_hackmd_note,
            cmd::delete_hackmd_team_note
        ])
        .setup(setup::init)
        .menu(menu::init)
        .on_menu_event(menu::handler)
        .run(tauri::generate_context!())
        .expect("error while running HackDesk application");
}
