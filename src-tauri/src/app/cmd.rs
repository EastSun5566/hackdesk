// use std::fs;
use log::{error, warn};
use tauri::{command, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use url::Url;

#[cfg(not(target_os = "linux"))]
use window_vibrancy::{self, NSVisualEffectMaterial};

use crate::{
    app::conf::{COMMAND_PALETTE_WINDOW_LABEL, MAIN_WINDOW_LABEL, SETTINGS_WINDOW_LABEL},
    utils,
};

#[cfg(target_os = "macos")]
use crate::app::mac::set_transparent_title_bar;

#[command]
pub fn open_command_palette_window(app: AppHandle) {
    let win = app.get_webview_window(COMMAND_PALETTE_WINDOW_LABEL);
    if win.is_none() {
        let command_palette_win = WebviewWindowBuilder::new(
            &app,
            COMMAND_PALETTE_WINDOW_LABEL,
            WebviewUrl::App("/command-palette".parse().unwrap()),
        )
        .inner_size(560.0, 312.0)
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
            .inner_size(800.0, 600.0)
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
pub fn open_link(app: AppHandle, url: String) {
    // Validate URL scheme for security - only allow http(s) and mailto
    match Url::parse(&url) {
        Ok(parsed_url) => {
            let scheme = parsed_url.scheme();
            if scheme != "http" && scheme != "https" && scheme != "mailto" {
                warn!(
                    "Blocked open_link request for unsupported scheme: {}",
                    scheme
                );
                return;
            }

            // Open validated URL externally and log any errors
            if let Err(e) = app.opener().open_url(&url, None::<&str>) {
                error!("Failed to open URL {}: {}", url, e);
            }
        }
        Err(e) => {
            warn!("Blocked open_link request for invalid URL format: {}", e);
        }
    }
}

#[command]
pub fn apply_settings(app: AppHandle) -> Result<(), String> {
    utils::apply_settings(&app).map_err(|e| format!("Failed to apply settings: {}", e))
}
