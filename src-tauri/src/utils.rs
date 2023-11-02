use std::fs::{self, File};
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde_json::{self, json};
use tauri::{
    AppHandle,
    api::path,
    GlobalShortcutManager,
    Manager
};

use crate::app::{
    cmd::{open_command_palette_window, open_settings_window},
    conf::{ROOT, SETTINGS_NAME, DEFAULT_TITLE, MAIN_WINDOW_LABEL, DEFAULT_SETTINGS}
};

pub fn exists(path: &Path) -> bool {
    Path::new(path).exists()
}

pub fn create_file(path: &Path) -> Result<File> {
    if let Some(p) = path.parent() {
        fs::create_dir_all(p)?
    }

    File::create(path).map_err(Into::into)
}

pub fn get_root_path(path: &str) -> PathBuf {
    path::home_dir().unwrap().join(ROOT).join(path)
}

// pub fn get_script_path(path: &str) -> PathBuf {
//     path::home_dir().unwrap().join(HMD_ROOT).join("scripts").join(path)
// }

pub fn read_json(content: &str) -> serde_json::Result<serde_json::Value> {
    let v: serde_json::Value = serde_json::from_str(content)?;
    Ok(v)
}

pub fn create_settings(app: AppHandle, settings_file: &Path) {
    // create `settings.json`
    create_file(settings_file).unwrap();
    fs::write(settings_file, DEFAULT_SETTINGS).unwrap();

    // read settings
    let settings_json = read_json(DEFAULT_SETTINGS).unwrap();
    
    // TODO: theme: https://github.com/tauri-apps/tauri/issues/5279
    // let theme = &setting_json["theme"].as_str().unwrap();

    // title
    let title = &settings_json["title"].as_str().unwrap();
    let main_window = app.get_window(MAIN_WINDOW_LABEL).unwrap();
    main_window.set_title(title).unwrap();

    // shortcuts
    let mut shortcut_manager = app.global_shortcut_manager();

    let command_palette_shortcut = &settings_json["shortcut.command-palette"].as_str().unwrap();
    if !shortcut_manager.is_registered(command_palette_shortcut).unwrap() {
        let main_window = app.get_window(MAIN_WINDOW_LABEL).unwrap();
        shortcut_manager
            .register(command_palette_shortcut, move|| {
                if main_window.is_focused().unwrap() {
                    open_command_palette_window(main_window.app_handle());
                }
            })
            .unwrap();
    }

    let settings_shortcut = &settings_json["shortcut.settings"].as_str().unwrap();
    if !shortcut_manager.is_registered(settings_shortcut).unwrap() {
        let main_window = app.get_window(MAIN_WINDOW_LABEL).unwrap();
        shortcut_manager
            .register(settings_shortcut, move|| {
                if main_window.is_focused().unwrap() {
                    open_settings_window(main_window.app_handle());
                }
            })
            .unwrap();
    }
}

pub fn apply_settings(app: AppHandle) {
    let settings_path = get_root_path(SETTINGS_NAME);
    let content = fs::read_to_string(settings_path).unwrap();
    let settings_json = read_json(&content).unwrap_or_else(|_| json!({ "title": DEFAULT_TITLE }));
    let title = &settings_json["title"].as_str().unwrap_or(DEFAULT_TITLE);
    let main_window = app.get_window(MAIN_WINDOW_LABEL).unwrap();

    // set title
    main_window.set_title(title).unwrap();

    // set shortcut
    let mut shortcut_manager = app.global_shortcut_manager();
    shortcut_manager.unregister_all().unwrap();

    let command_palette_shortcut = &settings_json["shortcut.command-palette"].as_str();
    if !command_palette_shortcut.is_none() {
        let shortcut_key = command_palette_shortcut.unwrap();
        if !shortcut_manager.is_registered(shortcut_key).unwrap() {
            let main_window = app.get_window(MAIN_WINDOW_LABEL).unwrap();
            shortcut_manager
                .register(shortcut_key, move || {
                    if main_window.is_focused().unwrap() {
                        open_command_palette_window(main_window.app_handle());
                    }
                })
                .unwrap();
        }
    }

    let settings_shortcut = &settings_json["shortcut.settings"].as_str();
    if !settings_shortcut.is_none() {
        let shortcut_key = settings_shortcut.unwrap();
        if !shortcut_manager.is_registered(shortcut_key).unwrap() {
            let main_window = app.get_window(MAIN_WINDOW_LABEL).unwrap();
            shortcut_manager
                .register(shortcut_key, move || {
                    if main_window.is_focused().unwrap() {
                        open_settings_window(main_window.app_handle());
                    }
                })
                .unwrap();
        }
    }
}
