use std::sync::Mutex;


pub const HMD_ROOT: &str = ".hackmd";
pub const HMD_CONFIG_NAME: &str = "config.json";

pub const INIT_SCRIPT: &str = include_str!("init.js");
pub const DEFAULT_TITLE: &str = "HackMD";
pub const DEFAULT_CONFIG: &str = include_str!("config.json");

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
