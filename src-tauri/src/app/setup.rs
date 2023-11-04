use log::info;
use tauri::App;

use crate::{app::conf::SETTINGS_NAME, utils};

pub fn init(app: &mut App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    info!("stepup");

    // check `~/.hackdesk/settings.json`
    let app = app.handle();
    let settings_file = &utils::get_root_path(SETTINGS_NAME);

    if !utils::exists(settings_file) {
        info!("settings.json not found, creating...");
        utils::init_settings(app, settings_file);
    } else {
        info!("settings.json found, applying...");
        utils::apply_settings(app);
    }

    Ok(())
}
