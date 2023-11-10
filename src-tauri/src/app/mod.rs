pub mod cmd;
pub mod conf;
pub mod menu;
pub mod setup;
pub mod tray;

#[cfg(target_os = "macos")]
pub mod mac;
