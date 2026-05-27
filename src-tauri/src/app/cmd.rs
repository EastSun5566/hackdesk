use tauri::{
    command, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(not(target_os = "linux"))]
use window_vibrancy::{self, NSVisualEffectMaterial};

use crate::{
    app::{
        conf::{
            classify_url_open_target, UrlOpenTarget, COMMAND_PALETTE_HEIGHT, COMMAND_PALETTE_WIDTH,
            COMMAND_PALETTE_WINDOW_LABEL, MAIN_WINDOW_LABEL, SETTINGS_WINDOW_HEIGHT,
            SETTINGS_WINDOW_LABEL, SETTINGS_WINDOW_WIDTH,
        },
        hackmd::{self, HackmdCreateNoteInput, HackmdNoteDto, HackmdTeamDto, HackmdUserDto},
        updater,
    },
    utils,
};

#[cfg(target_os = "macos")]
use crate::app::mac::set_transparent_title_bar;

use tracing::{error, info, warn};

pub const COMMAND_PALETTE_OPEN_EVENT: &str = "command-palette:open";

static COMMAND_PALETTE_UI_READY: AtomicBool = AtomicBool::new(false);
static COMMAND_PALETTE_OPEN_PENDING: AtomicBool = AtomicBool::new(false);

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

fn emit_command_palette_open(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(COMMAND_PALETTE_WINDOW_LABEL) {
        if let Err(error) = win.emit(COMMAND_PALETTE_OPEN_EVENT, ()) {
            error!("Failed to emit command palette open event: {}", error);
        }
    }
}

fn show_command_palette(app: &AppHandle) {
    let Some(win) = app.get_webview_window(COMMAND_PALETTE_WINDOW_LABEL) else {
        error!("Command palette window not found");
        return;
    };

    if let Err(error) = win.show() {
        error!("Failed to show command palette window: {}", error);
        return;
    }

    if let Err(error) = win.set_focus() {
        error!("Failed to focus command palette window: {}", error);
    }

    emit_command_palette_open(app);
}

#[command]
pub fn command_palette_ready(app: AppHandle) {
    COMMAND_PALETTE_UI_READY.store(true, Ordering::SeqCst);

    if COMMAND_PALETTE_OPEN_PENDING.swap(false, Ordering::SeqCst) {
        show_command_palette(&app);
    }
}

#[command]
pub fn open_command_palette_window(app: AppHandle) {
    info!("Opening command palette window");

    if let Err(error) = preload_command_palette_window(&app) {
        error!("Failed to ensure command palette window exists: {}", error);
        return;
    }

    if !COMMAND_PALETTE_UI_READY.load(Ordering::SeqCst) {
        COMMAND_PALETTE_OPEN_PENDING.store(true, Ordering::SeqCst);
        return;
    }

    show_command_palette(&app);
}

pub fn preload_command_palette_window(app: &AppHandle) -> Result<(), String> {
    if app
        .get_webview_window(COMMAND_PALETTE_WINDOW_LABEL)
        .is_some()
    {
        return Ok(());
    }

    info!("Preloading command palette window");
    build_command_palette_window(app)?;
    Ok(())
}

fn build_command_palette_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let command_palette_win = WebviewWindowBuilder::new(
        app,
        COMMAND_PALETTE_WINDOW_LABEL,
        WebviewUrl::App("/command-palette".parse().unwrap()),
    )
    .inner_size(COMMAND_PALETTE_WIDTH, COMMAND_PALETTE_HEIGHT)
    .always_on_top(true)
    .resizable(false)
    .visible(false)
    .transparent(true)
    .build()
    .map_err(|error| error.to_string())?;

    let app_clone = app.clone();
    command_palette_win.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(is_focused) = event {
            if *is_focused {
                return;
            }

            let app_clone = app_clone.clone();
            tauri::async_runtime::spawn(async move {
                std::thread::sleep(std::time::Duration::from_millis(150));

                let Some(win) = app_clone.get_webview_window(COMMAND_PALETTE_WINDOW_LABEL) else {
                    return;
                };

                if win.is_focused().unwrap_or(true) {
                    return;
                }

                let _ = win.hide();
            });
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
    .map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    window_vibrancy::apply_blur(&command_palette_win, Some((18, 18, 18, 125)))
        .map_err(|error| error.to_string())?;

    let _ = command_palette_win.hide();

    Ok(command_palette_win)
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
pub fn open_link(app: AppHandle, url: String) {
    match Url::parse(&url) {
        Ok(parsed_url) => match classify_url_open_target(&parsed_url) {
            Some(UrlOpenTarget::InlineHackmd { path }) => {
                info!("Routing HackMD URL inline: {}", url);

                if let Err(e) = execute_action(app.clone(), SafeScript::Navigate { path }) {
                    error!("Failed to route URL {} inline: {}", url, e);
                }
            }
            Some(UrlOpenTarget::External) => {
                if let Err(e) = app.opener().open_url(&url, None::<&str>) {
                    error!("Failed to open URL {}: {}", url, e);
                }
            }
            None => {
                warn!(
                    "Blocked open_link request for unsupported scheme: {}",
                    parsed_url.scheme()
                );
            }
        },
        Err(e) => {
            warn!("Blocked open_link request for invalid URL format: {}", e);
        }
    }
}

#[command]
pub fn apply_settings(app: AppHandle) -> Result<(), String> {
    utils::apply_settings(&app).map_err(|e| format!("Failed to apply settings: {}", e))
}

#[command]
pub async fn check_for_updates(app: AppHandle) -> Result<updater::ManualUpdateStatus, String> {
    updater::check_for_updates_from_settings(&app)
        .await
        .map_err(|error| error.to_string())
}

#[command]
pub async fn validate_hackmd_token(token: String) -> Result<HackmdUserDto, String> {
    hackmd::validate_hackmd_token(&token)
        .await
        .map_err(|error| error.to_string())
}

#[command]
pub async fn list_hackmd_notes() -> Result<Vec<HackmdNoteDto>, String> {
    hackmd::list_hackmd_notes()
        .await
        .map_err(|error| error.to_string())
}

#[command]
pub async fn list_hackmd_teams() -> Result<Vec<HackmdTeamDto>, String> {
    hackmd::list_hackmd_teams()
        .await
        .map_err(|error| error.to_string())
}

#[command]
pub async fn list_hackmd_team_notes(team_path: String) -> Result<Vec<HackmdNoteDto>, String> {
    hackmd::list_hackmd_team_notes(&team_path)
        .await
        .map_err(|error| error.to_string())
}

#[command]
pub async fn create_hackmd_note(payload: HackmdCreateNoteInput) -> Result<HackmdNoteDto, String> {
    hackmd::create_hackmd_note(payload)
        .await
        .map_err(|error| error.to_string())
}

#[command]
pub async fn create_hackmd_team_note(
    team_path: String,
    payload: HackmdCreateNoteInput,
) -> Result<HackmdNoteDto, String> {
    hackmd::create_hackmd_team_note(&team_path, payload)
        .await
        .map_err(|error| error.to_string())
}

#[command]
pub async fn delete_hackmd_note(note_id: String) -> Result<(), String> {
    hackmd::delete_hackmd_note(&note_id)
        .await
        .map_err(|error| error.to_string())
}

#[command]
pub async fn delete_hackmd_team_note(team_path: String, note_id: String) -> Result<(), String> {
    hackmd::delete_hackmd_team_note(&team_path, &note_id)
        .await
        .map_err(|error| error.to_string())
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
