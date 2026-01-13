use std::fs::{self, File};
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde_json::{self, json};
use tauri::{AppHandle, Manager};
use tracing::{error, info, warn};

use crate::app::conf::{DEFAULT_SETTINGS, DEFAULT_TITLE, MAIN_WINDOW_LABEL, ROOT, SETTINGS_NAME};

pub fn exists(path: &Path) -> bool {
    path.exists()
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

pub fn read_json(content: &str) -> Result<serde_json::Value> {
    serde_json::from_str(content).map_err(Into::into)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_root_path() {
        let path = get_root_path("test.json");
        assert!(path.to_str().unwrap().contains(".hackdesk"));
        assert!(path.to_str().unwrap().ends_with("test.json"));
    }

    #[test]
    fn test_read_json_valid() {
        let json_str = r#"{"key": "value", "number": 42}"#;
        let result = read_json(json_str);
        assert!(result.is_ok());
        let json = result.unwrap();
        assert_eq!(json["key"], "value");
        assert_eq!(json["number"], 42);
    }

    #[test]
    fn test_read_json_invalid() {
        let json_str = "invalid json {";
        let result = read_json(json_str);
        assert!(result.is_err());
    }

    #[test]
    fn test_read_json_empty() {
        let json_str = "{}";
        let result = read_json(json_str);
        assert!(result.is_ok());
        let json = result.unwrap();
        assert!(json.is_object());
    }

    #[test]
    fn test_exists() {
        // Test that exists returns false for non-existent path
        let non_existent = Path::new("/this/path/should/not/exist/test.json");
        assert!(!exists(non_existent));

        // Test that exists returns true for current directory
        let current_dir = Path::new(".");
        assert!(exists(current_dir));
    }
}
