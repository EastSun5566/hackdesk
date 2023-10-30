use anyhow::Result;
use serde_json::{self, json};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use tauri::{
    AppHandle,
    api::path,
    // GlobalShortcutManager,
    Manager
};

use crate::app::{
    // cmd::search_window,
    conf::{HMD_ROOT, HMD_CONFIG_NAME, DEFAULT_TITLE}
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

pub fn get_script_path(path: &str) -> PathBuf {
    path::home_dir().unwrap().join(HMD_ROOT).join("scripts").join(path)
}

pub fn read_json(content: &str) -> serde_json::Result<serde_json::Value> {
    let v: serde_json::Value = serde_json::from_str(content)?;
    Ok(v)
}

pub fn init_config(app: AppHandle) {
    let config_path = get_path(HMD_CONFIG_NAME);
    let content = fs::read_to_string(config_path).unwrap();
    let config_json = read_json(&content).unwrap_or_else(|_| json!({ "title": DEFAULT_TITLE }));
    let title = &config_json["title"].as_str().unwrap_or(DEFAULT_TITLE);
    let main_window = app.get_window("main").unwrap();

    // set title
    main_window.set_title(title).unwrap();

    // set shortcut
    // let command_palette_shortcut = &config_json["shortcut.command-palette"].as_str();
    // if !command_palette_shortcut.is_none() {
    //     let mut shortcut = app.global_shortcut_manager();
    //     let _search_shortcut = command_palette_shortcut.unwrap();
    //     shortcut.unregister_all().unwrap();
    //     let is_search_key = shortcut.is_registered(_search_shortcut);

    //     if !is_search_key.unwrap() {
    //         shortcut
    //             .register(_search_shortcut, move || {
    //                 search_window(main_window.app_handle());
    //             })
    //             .unwrap();
    //     }
    // }
}
