use tauri::{
    App,
    GlobalShortcutManager,
    Manager
};

use crate::{
    utils,
    app::conf::{HMD_SETTINGS_NAME, DEFAULT_SETTINGS},
    app::cmd
};

pub fn init(app: &mut App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    // check `~/.hackmd/settings.json`
    let app = app.handle();
    let settings_file = &utils::get_path(HMD_SETTINGS_NAME);

    if !utils::exists(settings_file) {
        // create config.json
        utils::create_file(settings_file).unwrap();
        std::fs::write(settings_file, DEFAULT_SETTINGS).unwrap();

        // init config
        let settings_json = utils::read_json(DEFAULT_SETTINGS).unwrap();
        
        // TODO: theme: https://github.com/tauri-apps/tauri/issues/5279
        // let theme = &setting_json["theme"].as_str().unwrap();

        let title = &settings_json["title"].as_str().unwrap();

        let command_palette_shortcut = &settings_json["shortcut.command-palette"].as_str().unwrap();
        let mut shortcut = app.global_shortcut_manager();
        let is_registered = shortcut.is_registered(command_palette_shortcut);

        let main_window = app.get_window("main").unwrap();
        main_window.set_title(title).unwrap();
        // let app = main_window.app_handle();

        // std::thread::spawn(move|| {
        //     cmd::new_window(app, "help".to_string(), "WA+ Help".to_string(), "/help".to_string())
        // });

        if !is_registered.unwrap() {
            shortcut
                .register(command_palette_shortcut, move|| {
                    cmd::open_command_palette_window(main_window.app_handle());
                })
                .unwrap();
        }
    } else {
        utils::init_settings(app);
    }

    Ok(())
}
