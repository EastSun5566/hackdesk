use std::fs::{self, File};
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde_json::{self, json};
use tauri::{AppHandle, Manager};
use tracing::{error, info, warn};

use crate::app::conf::{DEFAULT_SETTINGS, DEFAULT_TITLE, MAIN_WINDOW_LABEL, ROOT, SETTINGS_NAME};

pub fn exists(path: &Path) -> bool {
    Path::new(path).exists()
}

pub fn create_file(path: &Path) -> Result<File> {
    if let Some(p) = path.parent() {
        info!("Creating directory: {:?}", p);
        fs::create_dir_all(p).map_err(|e| {
            error!("Failed to create directory {:?}: {}", p, e);
            e
        })?;
    }

    info!("Creating file: {:?}", path);
    File::create(path).map_err(|e| {
        error!("Failed to create file {:?}: {}", path, e);
        e.into()
    })
}

pub fn get_root_path(path: &str) -> PathBuf {
    dirs::home_dir().unwrap().join(ROOT).join(path)
}

// pub fn get_script_path(path: &str) -> PathBuf {
//     dirs::home_dir().unwrap().join(HMD_ROOT).join("scripts").join(path)
// }

pub fn read_json(content: &str) -> serde_json::Result<serde_json::Value> {
    let value: serde_json::Value = serde_json::from_str(content)?;
    Ok(value)
}

pub fn init_settings(app: &AppHandle) -> Result<()> {
    info!("Initializing settings file");
    let settings_path = &get_root_path(SETTINGS_NAME);

    // create `settings.json`
    create_file(settings_path)?;
    fs::write(settings_path, DEFAULT_SETTINGS).map_err(|e| {
        error!("Failed to write default settings: {}", e);
        e
    })?;

    // read settings
    let settings_json = read_json(DEFAULT_SETTINGS)?;

    // set title
    let title = settings_json["title"].as_str().unwrap_or(DEFAULT_TITLE);
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        info!("Setting window title to: {}", title);
        main_window.set_title(title).map_err(|e| {
            error!("Failed to set window title: {}", e);
            e
        })?;
    }

    Ok(())
}

pub fn apply_settings(app: &AppHandle) -> Result<()> {
    info!("Applying settings from file");
    let settings_path = get_root_path(SETTINGS_NAME);
    let settings = fs::read_to_string(&settings_path).map_err(|e| {
        error!("Failed to read settings file: {}", e);
        e
    })?;

    let settings_json = read_json(&settings).unwrap_or_else(|e| {
        warn!("Failed to parse settings, using defaults: {}", e);
        json!({ "title": DEFAULT_TITLE })
    });

    // set title
    let title = settings_json["title"].as_str().unwrap_or(DEFAULT_TITLE);
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        info!("Setting window title to: {}", title);
        main_window.set_title(title).map_err(|e| {
            error!("Failed to set window title: {}", e);
            e
        })?;
    }

    Ok(())
}
