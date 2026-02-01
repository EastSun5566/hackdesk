use tauri::{App, WebviewUrl, WebviewWindowBuilder};
use tracing::{error, info};

use crate::{
    app::conf::{
        DEFAULT_TITLE, DEFAULT_URL, INIT_SCRIPT, MAIN_WINDOW_HEIGHT, MAIN_WINDOW_LABEL,
        MAIN_WINDOW_WIDTH, SETTINGS_NAME,
    },
    utils,
};

pub fn init(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    info!("Initializing HackDesk application");

    // main window
    info!("Creating main window");
    WebviewWindowBuilder::new(
        app,
        MAIN_WINDOW_LABEL,
        WebviewUrl::App(DEFAULT_URL.parse()?),
    )
    .inner_size(MAIN_WINDOW_WIDTH, MAIN_WINDOW_HEIGHT)
    .fullscreen(false)
    .resizable(true)
    .title(DEFAULT_TITLE)
    .initialization_script(INIT_SCRIPT)
    .build()
    .map_err(|e| {
        error!("Failed to create main window: {}", e);
        e
    })?;

    let app_handle = app.handle();

    // check `~/.hackdesk/settings.json`
    let settings_path = &utils::get_root_path(SETTINGS_NAME);
    match utils::exists(settings_path) {
        true => {
            info!("Applying existing settings");
            utils::apply_settings(app_handle)?
        }
        false => {
            info!("Initializing default settings");
            utils::init_settings(app_handle)?
        }
    }

    // Initialize tray icon
    info!("Initializing tray icon");
    crate::app::tray::init(app_handle).map_err(|e| {
        error!("Failed to initialize tray: {}", e);
        e
    })?;

    info!("Application initialization complete");
    Ok(())
}
