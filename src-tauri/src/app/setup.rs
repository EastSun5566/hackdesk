use tauri::{
    App,
    GlobalShortcutManager,
    Manager
};
use log::info;

use crate::{
    utils,
    app::{
        conf::{HMD_SETTINGS_NAME, DEFAULT_SETTINGS, MAIN_WINDOW_LABEL},
        cmd,
    }
};

pub fn init(app: &mut App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    info!("stepup");

    // check `~/.hackmd/settings.json`
    let app = app.handle();
    let settings_file = &utils::get_path(HMD_SETTINGS_NAME);

    if !utils::exists(settings_file) {
        // create `settings.json`
        utils::create_file(settings_file).unwrap();
        std::fs::write(settings_file, DEFAULT_SETTINGS).unwrap();

        // read settings
        let settings_json = utils::read_json(DEFAULT_SETTINGS).unwrap();
        
        // TODO: theme: https://github.com/tauri-apps/tauri/issues/5279
        // let theme = &setting_json["theme"].as_str().unwrap();

        // title
        let title = &settings_json["title"].as_str().unwrap();
        let main_window = app.get_window(MAIN_WINDOW_LABEL).unwrap();
        main_window.set_title(title).unwrap();

        // shortcuts
        let mut shortcut = app.global_shortcut_manager();

        let command_palette_shortcut = &settings_json["shortcut.command-palette"].as_str().unwrap();
        let is_registered = shortcut.is_registered(command_palette_shortcut);
        if !is_registered.unwrap() {
            shortcut
                .register(command_palette_shortcut, move|| {
                    cmd::open_command_palette_window(main_window.app_handle());
                })
                .unwrap();
        }

        let settings_shortcut = &settings_json["shortcut.settings"].as_str().unwrap();
        let is_registered = shortcut.is_registered(settings_shortcut);
        if !is_registered.unwrap() {
            let main_window = app.get_window(MAIN_WINDOW_LABEL).unwrap();
            shortcut
                .register(settings_shortcut, move|| {
                    cmd::open_settings_window(main_window.app_handle());
                })
                .unwrap();
        }
    } else {
        utils::read_settings(app);
    }

    Ok(())
}
