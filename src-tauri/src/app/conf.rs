use std::sync::Mutex;


pub const HMD_ROOT: &str = ".hackmd";
pub const HMD_SETTINGS_NAME: &str = "settings.json";

pub const COMMAND_PALETTE_WINDOW_LABEL: &str = "command-palette";

pub const INIT_SCRIPT: &str = include_str!("init.js");
pub const DEFAULT_TITLE: &str = "HackMD";
pub const DEFAULT_SETTINGS: &str = include_str!("settings.json");

pub struct HMDState {
    pub tray_blink_id: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl HMDState {
    pub fn default() -> Self {
        HMDState {
            tray_blink_id: Mutex::new(None),
        }
    }
}
