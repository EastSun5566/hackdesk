// use crate::{App, AppConf, AppManager};
use log::{error, info};
use tauri::{utils::config::WindowUrl, window::WindowBuilder, App};
// use wry::application::accelerator::Accelerator;

pub fn init(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  info!("Setting up HackMD");

  // let app_conf = AppConf::read();
  // let theme = AppConf::theme_mode();

  // if !app_conf.hide_dock_icon {
    let app = app.handle();
    tauri::async_runtime::spawn(async move {
      let url = "https://hackmd.io";
      let main_win = WindowBuilder::new(&app, "core", WindowUrl::App(url.into()))
        .title("HackMD")
        .resizable(true)
        .fullscreen(false);
        // .inner_size(app_conf.main_width, app_conf.main_height)
        // .theme(Some(theme))
        // .always_on_top(app_conf.stay_on_top)
        // .initialization_script(&utils::user_script())
        // .initialization_script(&load_script("core.js"))
        // .user_agent(&app_conf.ua_window);

      // if url == "https://hackmd.io" {
      //   main_win = main_win
      //     .initialization_script(include_str!("../vendors/floating-ui-core.js"))
      //     .initialization_script(include_str!("../vendors/floating-ui-dom.js"))
      //     .initialization_script(include_str!("../vendors/html2canvas.js"))
      //     .initialization_script(include_str!("../vendors/jspdf.js"))
      //     .initialization_script(include_str!("../vendors/turndown.js"))
      //     .initialization_script(include_str!("../vendors/turndown-plugin-gfm.js"))
      //     .initialization_script(&load_script("popup.core.js"))
      //     .initialization_script(&load_script("export.js"))
      //     .initialization_script(&load_script("markdown.export.js"))
      //     .initialization_script(&load_script("cmd.js"))
      //     .initialization_script(&load_script("chat.js"))
      // }

      if let Err(err) = main_win.build() {
        error!("core_build_error: {}", err);
      }
    });
  // }

  Ok(())
}
