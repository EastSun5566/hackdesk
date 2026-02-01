use tauri::{App, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use tracing::{error, info, warn};

use crate::{
    app::conf::{
        DEFAULT_TITLE, DEFAULT_URL, INIT_SCRIPT, MAIN_WINDOW_HEIGHT, MAIN_WINDOW_LABEL,
        MAIN_WINDOW_WIDTH, SETTINGS_NAME,
    },
    utils,
};

pub fn init(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    info!("Initializing HackDesk application");

    let app_handle_for_new_window = app.handle().clone();

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
    .on_new_window(move |url, _features| {
        // Handle window.open() and similar JavaScript navigation requests
        // by opening URLs externally in the default browser

        // Validate URL scheme for security - only allow http(s) and mailto
        let scheme = url.scheme();
        if scheme != "http" && scheme != "https" && scheme != "mailto" {
            warn!(
                "Blocked new window request for unsupported scheme: {}",
                scheme
            );
            return tauri::webview::NewWindowResponse::Deny;
        }

        // Log validated URL
        info!("New window requested for URL: {}", url);

        // Open URL externally and log any errors
        if let Err(e) = app_handle_for_new_window
            .opener()
            .open_url(url.as_str(), None::<&str>)
        {
            error!("Failed to open URL {}: {}", url, e);
        }

        tauri::webview::NewWindowResponse::Deny
    })
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
