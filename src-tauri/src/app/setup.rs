use tauri::{
  App, 
  // GlobalShortcutManager,
  Manager
};

use crate::{
  utils,
  app::conf::{HMD_CONFIG_NAME, DEFAULT_CONFIG},
  // app::cmd
};

pub fn init(app: &mut App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    // check `~/.hackmd/config.json`
    let app = app.handle();
    let config_file = &utils::get_path(HMD_CONFIG_NAME);

    if !utils::exists(config_file) {
        // create config.json
        utils::create_file(config_file).unwrap();
        std::fs::write(config_file, DEFAULT_CONFIG).unwrap();

        // init config
        let setting_json = utils::read_json(DEFAULT_CONFIG).unwrap();
        
        // TODO: theme: https://github.com/tauri-apps/tauri/issues/5279
        // let theme = &setting_json["theme"].as_str().unwrap();

        let title = &setting_json["title"].as_str().unwrap();

        // let command_palette_shortcut = &setting_json["shortcut.command-palette"].as_str().unwrap();
        // let mut shortcut = app.global_shortcut_manager();
        // let is_search_key = shortcut.is_registered(command_palette_shortcut);

        let main_window = app.get_window("main").unwrap();
        main_window.set_title(title).unwrap();
        // let app = main_window.app_handle();

        // std::thread::spawn(move|| {
        //     cmd::new_window(app, "help".to_string(), "WA+ Help".to_string(), "/help".to_string())
        // });

        // if !is_search_key.unwrap() {
        //     shortcut
        //         .register(search_shortcut, move|| {
        //             cmd::search_window(main_window.app_handle());
        //         })
        //         .unwrap();
        // }
    } else {
        utils::init_config(app);
    }

    Ok(())
}
