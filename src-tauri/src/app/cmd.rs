use tauri::{command, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(not(target_os = "linux"))]
use window_vibrancy::{self, NSVisualEffectMaterial};

use crate::{
    app::conf::{
        COMMAND_PALETTE_HEIGHT, COMMAND_PALETTE_WIDTH, COMMAND_PALETTE_WINDOW_LABEL,
        MAIN_WINDOW_LABEL, SETTINGS_WINDOW_HEIGHT, SETTINGS_WINDOW_LABEL, SETTINGS_WINDOW_WIDTH,
    },
    utils,
};

#[cfg(target_os = "macos")]
use crate::app::mac::set_transparent_title_bar;

use tracing::{error, info};

/// Safe, predefined actions that can be executed in the main window
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum SafeScript {
    /// Navigate to a specific path on HackMD
    Navigate { path: String },
    /// Go forward in browser history
    GoForward,
    /// Go back in browser history
    GoBack,
    /// Reload the current page
    Reload,
}

#[command]
pub fn execute_action(app: AppHandle, action: SafeScript) -> Result<(), String> {
    info!("Executing action: {:?}", action);

    let win = app.get_webview_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
        error!("Main window not found");
        "Main window not found".to_string()
    })?;

    match action {
        SafeScript::Navigate { path } => {
            // Validate that the path starts with / or is a valid HackMD path
            if !path.starts_with('/') && !path.is_empty() {
                return Err(format!("Invalid navigation path: {}", path));
            }

            let script = format!(
                "window.location.href = 'https://hackmd.io{}'",
                path.replace('\'', "\\'")
            );

            win.eval(&script).map_err(|e| {
                error!("Failed to navigate to {}: {}", path, e);
                format!("Failed to navigate: {}", e)
            })?;
        }
        SafeScript::GoForward => {
            win.eval("window.history.forward()").map_err(|e| {
                error!("Failed to go forward: {}", e);
                format!("Failed to go forward: {}", e)
            })?;
        }
        SafeScript::GoBack => {
            win.eval("window.history.back()").map_err(|e| {
                error!("Failed to go back: {}", e);
                format!("Failed to go back: {}", e)
            })?;
        }
        SafeScript::Reload => {
            win.eval("window.location.reload()").map_err(|e| {
                error!("Failed to reload: {}", e);
                format!("Failed to reload: {}", e)
            })?;
        }
    }

    Ok(())
}

#[command]
pub fn open_command_palette_window(app: AppHandle) {
    info!("Opening command palette window");

    let win = app.get_webview_window(COMMAND_PALETTE_WINDOW_LABEL);
    if win.is_some() {
        info!("Command palette window already exists");
        return;
    }

    {
        let command_palette_win = WebviewWindowBuilder::new(
            &app,
            COMMAND_PALETTE_WINDOW_LABEL,
            WebviewUrl::App("/command-palette".parse().unwrap()),
        )
        .inner_size(COMMAND_PALETTE_WIDTH, COMMAND_PALETTE_HEIGHT)
        .always_on_top(true)
        .resizable(false)
        .transparent(true)
        .build()
        .unwrap();

        let app_clone = app.clone();
        command_palette_win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(is_focused) = event {
                if !is_focused {
                    if let Some(win) = app_clone.get_webview_window(COMMAND_PALETTE_WINDOW_LABEL) {
                        let _ = win.close();
                    }
                }
            }
        });

        #[cfg(target_os = "macos")]
        set_transparent_title_bar(&command_palette_win, true, true);

        #[cfg(target_os = "macos")]
        window_vibrancy::apply_vibrancy(
            &command_palette_win,
            NSVisualEffectMaterial::FullScreenUI,
            None,
            None,
        )
        .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

        #[cfg(target_os = "windows")]
        window_vibrancy::apply_blur(&command_palette_win, Some((18, 18, 18, 125)))
            .expect("Unsupported platform! 'apply_blur' is only supported on Windows");
    }
}

#[command]
pub fn open_settings_window(app: AppHandle) {
    info!("Opening settings window");

    let win = app.get_webview_window(SETTINGS_WINDOW_LABEL);
    if win.is_some() {
        info!("Settings window already exists");
        return;
    }

    {
        let settings_win = WebviewWindowBuilder::new(
            &app,
            SETTINGS_WINDOW_LABEL,
            WebviewUrl::App("/settings".parse().unwrap()),
        )
        .inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
        .center()
        .title("Settings")
        .transparent(true)
        .build()
        .unwrap();

        let app_clone = app.clone();
        settings_win.on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event {
                let _ = utils::apply_settings(&app_clone);
            }
        });

        #[cfg(target_os = "macos")]
        set_transparent_title_bar(&settings_win, true, false);

        #[cfg(target_os = "macos")]
        window_vibrancy::apply_vibrancy(&settings_win, NSVisualEffectMaterial::Sidebar, None, None)
            .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");
    }
}

#[command]
pub fn open_link(_app: AppHandle, url: String) {
    use tauri_plugin_opener::OpenerExt;
    let _ = _app.opener().open_url(url, None::<&str>);
}

#[command]
pub fn apply_settings(app: AppHandle) -> Result<(), String> {
    utils::apply_settings(&app).map_err(|e| format!("Failed to apply settings: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_script_navigate_serialization() {
        let action = SafeScript::Navigate {
            path: "/new".to_string(),
        };
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("\"type\":\"Navigate\""));
        assert!(json.contains("\"/new\""));
    }

    #[test]
    fn test_safe_script_navigate_deserialization() {
        let json = r#"{"type":"Navigate","data":{"path":"/settings"}}"#;
        let action: SafeScript = serde_json::from_str(json).unwrap();
        match action {
            SafeScript::Navigate { path } => assert_eq!(path, "/settings"),
            _ => panic!("Expected Navigate variant"),
        }
    }

    #[test]
    fn test_safe_script_go_forward() {
        let action = SafeScript::GoForward;
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("\"type\":\"GoForward\""));
    }

    #[test]
    fn test_safe_script_go_back() {
        let action = SafeScript::GoBack;
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("\"type\":\"GoBack\""));
    }

    #[test]
    fn test_safe_script_reload() {
        let action = SafeScript::Reload;
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("\"type\":\"Reload\""));
    }

    #[test]
    fn test_safe_script_all_variants_deserialize() {
        let variants = vec![
            r#"{"type":"Navigate","data":{"path":"/"}}"#,
            r#"{"type":"GoForward"}"#,
            r#"{"type":"GoBack"}"#,
            r#"{"type":"Reload"}"#,
        ];

        for json in variants {
            let result: Result<SafeScript, _> = serde_json::from_str(json);
            assert!(result.is_ok(), "Failed to deserialize: {}", json);
        }
    }
}
