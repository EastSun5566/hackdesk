use log::info;
use tauri::{App, WebviewUrl, WebviewWindowBuilder};

use crate::{
    app::conf::{DEFAULT_TITLE, DEFAULT_URL, INIT_SCRIPT, MAIN_WINDOW_LABEL, SETTINGS_NAME},
    utils,
};

pub fn init(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    info!("setup");

    // main window
    WebviewWindowBuilder::new(
        app,
        MAIN_WINDOW_LABEL,
        WebviewUrl::App(DEFAULT_URL.parse()?),
    )
    .inner_size(800.0, 600.0)
    .fullscreen(false)
    .resizable(true)
    .title(DEFAULT_TITLE)
    .initialization_script(INIT_SCRIPT)
    .build()?;

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
