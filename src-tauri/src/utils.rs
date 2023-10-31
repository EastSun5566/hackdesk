use anyhow::Result;
use serde_json::{self, json};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use tauri::{
    AppHandle,
    api::path,
    GlobalShortcutManager,
    Manager
};

use crate::app::{
    cmd::open_command_palette_window,
    conf::{HMD_ROOT, HMD_SETTINGS_NAME, DEFAULT_TITLE}
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

pub fn get_path(path: &str) -> PathBuf {
    path::home_dir().unwrap().join(HMD_ROOT).join(path)
}

// pub fn get_script_path(path: &str) -> PathBuf {
//     path::home_dir().unwrap().join(HMD_ROOT).join("scripts").join(path)
// }

pub fn read_json(content: &str) -> serde_json::Result<serde_json::Value> {
    let v: serde_json::Value = serde_json::from_str(content)?;
    Ok(v)
}

pub fn init_settings(app: AppHandle) {
    let settings_path = get_path(HMD_SETTINGS_NAME);
    let content = fs::read_to_string(settings_path).unwrap();
    let settings_json = read_json(&content).unwrap_or_else(|_| json!({ "title": DEFAULT_TITLE }));
    let title = &settings_json["title"].as_str().unwrap_or(DEFAULT_TITLE);
    let main_window = app.get_window("main").unwrap();

    // set title
    main_window.set_title(title).unwrap();

    // set shortcut
    let command_palette_shortcut = &settings_json["shortcut.command-palette"].as_str();
    if !command_palette_shortcut.is_none() {
        let mut shortcut_manager = app.global_shortcut_manager();
        let shortcut = command_palette_shortcut.unwrap();
        shortcut_manager.unregister_all().unwrap();
        let is_registered = shortcut_manager.is_registered(shortcut);

        if !is_registered.unwrap() {
            shortcut_manager
                .register(shortcut, move || {
                    open_command_palette_window(main_window.app_handle());
                })
                .unwrap();
        }
    }
}
