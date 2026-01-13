// use std::fs;
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
    let win = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or("Main window not found")?;

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

            win.eval(&script)
                .map_err(|e| format!("Failed to navigate: {}", e))?;
        }
        SafeScript::GoForward => {
            win.eval("window.history.forward()")
                .map_err(|e| format!("Failed to go forward: {}", e))?;
        }
        SafeScript::GoBack => {
            win.eval("window.history.back()")
                .map_err(|e| format!("Failed to go back: {}", e))?;
        }
        SafeScript::Reload => {
            win.eval("window.location.reload()")
                .map_err(|e| format!("Failed to reload: {}", e))?;
        }
    }

    Ok(())
}

#[command]
pub fn open_command_palette_window(app: AppHandle) {
    let win = app.get_webview_window(COMMAND_PALETTE_WINDOW_LABEL);
    if win.is_none() {
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
    let win = app.get_webview_window(SETTINGS_WINDOW_LABEL);
    if win.is_none() {
        std::thread::spawn(move || {
            let settings_win = WebviewWindowBuilder::new(
                &app,
                SETTINGS_WINDOW_LABEL,
                WebviewUrl::App("/settings".parse().unwrap()),
            )
            .inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
            .center()
            .title("Settings")
            .build()
            .unwrap();

            let app_clone = app.clone();
            settings_win.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    let _ = utils::apply_settings(&app_clone);
                    // app.get_webview_window(MAIN_WINDOW_LABEL)
                    //     .unwrap()
                    //     .emit("HMD_EVENT", "RELOAD")
                    //     .unwrap();
                }
            });
        });
    }
}

#[command]
pub fn run_script(app: AppHandle, script: &str) {
    if let Some(win) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = win.eval(script);
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
