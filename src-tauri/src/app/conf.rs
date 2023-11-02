// use std::sync::Mutex;


pub const ROOT: &str = ".hackdesk";
pub const SETTINGS_NAME: &str = "settings.json";

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const COMMAND_PALETTE_WINDOW_LABEL: &str = "command-palette";
pub const SETTINGS_WINDOW_LABEL: &str = "settings";

// pub const INIT_SCRIPT: &str = include_str!("init.js");
pub const DEFAULT_TITLE: &str = "HackDesk";
// pub const DEFAULT_URL: &str = "https://hackmd.io/login";
pub const DEFAULT_SETTINGS: &str = include_str!("settings.json");

// pub struct HMDState {
//     pub tray_blink_id: Mutex<Option<tokio::task::JoinHandle<()>>>,
// }

// impl HMDState {
//     pub fn default() -> Self {
//         HMDState {
//             tray_blink_id: Mutex::new(None),
//         }
//     }
// }
