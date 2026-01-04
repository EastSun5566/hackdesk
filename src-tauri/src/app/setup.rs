use log::info;
use tauri::{App, Manager};

#[cfg(target_os = "macos")]
use crate::app::mac::set_transparent_title_bar;

use crate::{
    app::conf::{INIT_SCRIPT, MAIN_WINDOW_LABEL, SETTINGS_NAME},
    utils,
};

pub fn init(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    info!("setup");

    // Get the main window that was created from config
    let main_window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .expect("Main window should exist");

    // Apply initialization script
    main_window.eval(INIT_SCRIPT)?;

    // Apply transparent titlebar on macOS
    #[cfg(target_os = "macos")]
    set_transparent_title_bar(&main_window, true, false);

    let app_handle = app.handle();

    // check `~/.hackdesk/settings.json`
    let settings_path = &utils::get_root_path(SETTINGS_NAME);
    match utils::exists(settings_path) {
        true => utils::apply_settings(app_handle)?,
        false => utils::init_settings(app_handle)?,
    }

    // Initialize tray icon
    crate::app::tray::init(app_handle)?;

    Ok(())
}
