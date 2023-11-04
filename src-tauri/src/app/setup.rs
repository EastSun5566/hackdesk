use log::info;
use tauri::{App, WindowBuilder, WindowUrl};

use crate::{
    app::conf::{DEFAULT_TITLE, DEFAULT_URL, INIT_SCRIPT, MAIN_WINDOW_LABEL, SETTINGS_NAME},
    utils,
};

pub fn init(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    info!("stepup");

    WindowBuilder::new(app, MAIN_WINDOW_LABEL, WindowUrl::App(DEFAULT_URL.parse()?))
        .inner_size(800.0, 600.0)
        .fullscreen(false)
        .resizable(true)
        .title(DEFAULT_TITLE)
        .initialization_script(INIT_SCRIPT)
        .build()?;

    let app = app.handle();

    // check `~/.hackdesk/settings.json`
    let settings_path = &utils::get_root_path(SETTINGS_NAME);
    match utils::exists(settings_path) {
        true => utils::apply_settings(app)?,
        false => utils::init_settings(app)?,
    }

    Ok(())
}
