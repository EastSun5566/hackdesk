// use std::fs;
use tauri::{api, command, AppHandle, Manager, WindowBuilder, WindowEvent, WindowUrl};

#[cfg(not(target_os = "linux"))]
use window_shadows::set_shadow;
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
    let win = app.get_window(COMMAND_PALETTE_WINDOW_LABEL);
    if win.is_none() {
        let command_palette_win = WindowBuilder::new(
            &app,
            COMMAND_PALETTE_WINDOW_LABEL,
            WindowUrl::App("/command-palette".parse().unwrap()),
        )
        .inner_size(560.0, 312.0)
        .always_on_top(true)
        .resizable(false)
        .transparent(true)
        .build()
        .unwrap();

        command_palette_win.on_window_event(move |event| {
            if let WindowEvent::Focused(is_focused) = event {
                if !is_focused {
                    app.get_window(COMMAND_PALETTE_WINDOW_LABEL)
                        .unwrap()
                        .close()
                        .unwrap();
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

        #[cfg(not(target_os = "linux"))]
        set_shadow(&command_palette_win, true).expect("Unsupported platform!");

        #[cfg(target_os = "windows")]
        window_vibrancy::apply_blur(&command_palette_win, Some((18, 18, 18, 125)))
            .expect("Unsupported platform! 'apply_blur' is only supported on Windows");
    }
}

#[command]
pub fn open_settings_window(app: AppHandle) {
    let win = app.get_window(SETTINGS_WINDOW_LABEL);
    if win.is_none() {
        std::thread::spawn(move || {
            WindowBuilder::new(
                &app,
                "setting",
                WindowUrl::App("/settings".parse().unwrap()),
            )
            .inner_size(800.0, 600.0)
            .center()
            .title("Settings")
            .build()
            .unwrap()
            .on_window_event(move |event| {
                if let WindowEvent::Destroyed { .. } = event {
                    utils::apply_settings(app.clone()).unwrap();
                    // app.get_window(MAIN_WINDOW_LABEL)
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
    app.get_window(MAIN_WINDOW_LABEL)
        .unwrap()
        .eval(script)
        .unwrap();
}

#[command]
pub fn open_link(app: AppHandle, url: String) {
    api::shell::open(&app.shell_scope(), url, None).unwrap();
}
