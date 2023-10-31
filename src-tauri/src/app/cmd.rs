// use std::fs;
use tauri::{
    AppHandle,
    WindowBuilder,
    // api::dialog,
    command,
    Manager,
    WindowEvent,
    WindowUrl
};

#[cfg(not(target_os = "linux"))]
use window_shadows::set_shadow;
#[cfg(not(target_os = "linux"))]
use window_vibrancy::{self, NSVisualEffectMaterial};

use crate::{
    // utils,
    app::conf::{INIT_SCRIPT, COMMAND_PALETTE_WINDOW_LABEL}
};

#[cfg(target_os = "macos")]
use crate::app::mac::set_transparent_title_bar;

#[command]
pub async fn open_app_window(
    app: AppHandle,
    label: String,
    title: String,
    url: String,
    // script: Option<String>,
) {
    // window.open not working: https://github.com/tauri-apps/wry/issues/649
    let mut user_script = INIT_SCRIPT.to_string();
    // if script.is_some() && !script.as_ref().unwrap().is_empty() {
    //     let script = utils::get_script_path(&script.unwrap());
    //     let script_path = script.to_string_lossy().to_string();
    //     let content = fs::read_to_string(script).unwrap_or_else(|msg| {
    //         let main_window = app.get_window("main").unwrap();
    //         let err_msg = format!("[app.items.script] {}\n{}", script_path, msg);
    //         dialog::message(Some(&main_window), &title, err_msg);
    //         "".to_string()
    //     });
    //     user_script = format!("{}\n\n// ***** [{}] User Script Inject ***** \n\n{}\n", user_script, title, content);
    // }

    user_script = format!("(function() {{window.addEventListener('DOMContentLoaded', function() {{{}}})}})();", user_script);

    std::thread::spawn(move || {
        let _window = WindowBuilder::new(
            &app,
            label,
            WindowUrl::App(url.parse().unwrap()),
        )
        .initialization_script(&user_script)
        .title(title)
        .build()
        .unwrap();

        // TODO: window - menu event
        // window.on_menu_event(move|event| {
        //     dbg!(event);
        // });
    });
}

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

        // search_win.on_window_event(move |event| match event {
        //     WindowEvent::Focused(is_focused) => {
        //         if !is_focused {
        //             app.get_window(COMMAND_PALETTE_WINDOW_LABEL).unwrap().close().unwrap();
        //         }
        //     }
        //     _ => (),
        // });
        command_palette_win.on_window_event(move |event| if let WindowEvent::Focused(is_focused) = event {
            if !is_focused {
                app.get_window(COMMAND_PALETTE_WINDOW_LABEL).unwrap().close().unwrap();
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

// #[command]
// pub fn open_config_window(app: AppHandle) {
//     let win = app.get_window("setting");
//     if win.is_none() {
//         std::thread::spawn(move || {
//             WindowBuilder::new(
//                 &app,
//                 "setting",
//                 WindowUrl::App("/setting?mode=shortcut".parse().unwrap()),
//             )
//             .inner_size(800.0, 600.0)
//             .center()
//             .title("WA+ Setting")
//             .build()
//             .unwrap()
//             .on_window_event(move |event| if let WindowEvent::Destroyed { .. } = event {
//                 utils::init_config(app.clone());
//                 app.get_window("main")
//                     .unwrap()
//                     .emit("WA_EVENT", "SETTING_RELOAD")
//                     .unwrap();
//             });
//             // .on_window_event(move |event| match event {
//             //     WindowEvent::Destroyed { .. } => {
//             //         utils::setting_init(app.clone());
//             //         app.get_window("main")
//             //             .unwrap()
//             //             .emit("WA_EVENT", "SETTING_RELOAD")
//             //             .unwrap();
//             //     }
//             //     _ => (),
//             // });
//         });
//     }
// }

// #[command]
// pub fn new_window(app: AppHandle, label: String, title: String, url: String) {
//     let win = app.get_window(&label);
//     if win.is_none() {
//         std::thread::spawn(move || {
//             WindowBuilder::new(
//                 &app,
//                 label,
//                 WindowUrl::App(url.parse().unwrap()),
//             )
//             .inner_size(800.0, 600.0)
//             .center()
//             .title(title)
//             .build()
//             .unwrap();
//         });
//     }
// }
