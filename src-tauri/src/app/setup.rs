
use tauri::App;
use log::info;

use crate::{
    utils,
    app::conf::HMD_SETTINGS_NAME,
};

pub fn init(app: &mut App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    info!("stepup");

    // check `~/.hackmd/settings.json`
    let app = app.handle();
    let settings_file = &utils::get_root_path(HMD_SETTINGS_NAME);

    if !utils::exists(settings_file) {
        info!("settings.json not found, creating...");
        utils::create_settings(app, settings_file);
    } else {
        info!("settings.json found, applying...");
        utils::apply_settings(app);
    }

    Ok(())
}
