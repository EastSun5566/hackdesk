use anyhow::{Context, Result};
use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};
use tracing::{error, info};

const UPDATE_DIALOG_TITLE: &str = "HackDesk Update";
const MAX_RELEASE_NOTES_CHARS: usize = 600;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ManualUpdateStatus {
    UpToDate,
    Declined {
        version: String,
    },
    Installed {
        version: String,
        restart_required: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UpdateCheckContext {
    Startup,
    Menu,
    Settings,
}

pub fn spawn_startup_update_check<R: Runtime + 'static>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_update_flow(&app, UpdateCheckContext::Startup).await {
            error!("Startup update check failed: {error:#}");
        }
    });
}

pub fn spawn_menu_update_check<R: Runtime + 'static>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_update_flow(&app, UpdateCheckContext::Menu).await {
            error!("Manual menu update check failed: {error:#}");
            show_message_dialog(
                &app,
                UPDATE_DIALOG_TITLE,
                &format!("Failed to check for updates.\n\n{error:#}"),
                MessageDialogKind::Error,
            );
        }
    });
}

pub async fn check_for_updates_from_settings<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<ManualUpdateStatus> {
    run_update_flow(app, UpdateCheckContext::Settings).await
}

async fn run_update_flow<R: Runtime>(
    app: &AppHandle<R>,
    context: UpdateCheckContext,
) -> Result<ManualUpdateStatus> {
    let update = app
        .updater()
        .context("Failed to create updater client")?
        .check()
        .await
        .context("Failed to check update endpoint")?;

    let Some(update) = update else {
        if matches!(context, UpdateCheckContext::Menu) {
            show_message_dialog(
                app,
                UPDATE_DIALOG_TITLE,
                "You’re already on the latest version of HackDesk.",
                MessageDialogKind::Info,
            );
        }

        return Ok(ManualUpdateStatus::UpToDate);
    };

    let version = update.version.clone();

    if !prompt_for_install(app, &update) {
        info!("User deferred update {version}");
        return Ok(ManualUpdateStatus::Declined { version });
    }

    info!("Installing update {version}");
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .with_context(|| format!("Failed to download and install update {version}"))?;

    let restart_required = !cfg!(target_os = "windows");

    if restart_required
        && matches!(
            context,
            UpdateCheckContext::Startup | UpdateCheckContext::Menu
        )
    {
        show_message_dialog(
            app,
            UPDATE_DIALOG_TITLE,
            &format!(
                "HackDesk v{version} has been installed. Quit and reopen the app to finish applying the update."
            ),
            MessageDialogKind::Info,
        );
    }

    Ok(ManualUpdateStatus::Installed {
        version,
        restart_required,
    })
}

fn prompt_for_install<R: Runtime>(app: &AppHandle<R>, update: &Update) -> bool {
    app.dialog()
        .message(build_update_prompt_message(
            &update.version,
            update.body.as_deref(),
        ))
        .title(UPDATE_DIALOG_TITLE)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install".into(),
            "Later".into(),
        ))
        .blocking_show()
}

fn show_message_dialog<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
    message: &str,
    kind: MessageDialogKind,
) {
    let _ = app
        .dialog()
        .message(message.to_string())
        .title(title.to_string())
        .kind(kind)
        .blocking_show();
}

fn build_update_prompt_message(version: &str, notes: Option<&str>) -> String {
    let mut sections = vec![format!(
        "HackDesk v{version} is available. Would you like to download and install it now?"
    )];

    if let Some(notes) = normalize_release_notes(notes) {
        sections.push(format!("What’s new:\n{notes}"));
    }

    sections.join("\n\n")
}

fn normalize_release_notes(notes: Option<&str>) -> Option<String> {
    let notes = notes?.trim();

    if notes.is_empty() {
        return None;
    }

    let normalized = notes
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n");

    let note_chars = normalized.chars().count();
    if note_chars <= MAX_RELEASE_NOTES_CHARS {
        return Some(normalized);
    }

    Some(format!(
        "{}…",
        normalized
            .chars()
            .take(MAX_RELEASE_NOTES_CHARS)
            .collect::<String>()
    ))
}

#[cfg(test)]
mod tests {
    use super::{build_update_prompt_message, normalize_release_notes, ManualUpdateStatus};

    #[test]
    fn prompt_message_includes_version_and_notes() {
        let message =
            build_update_prompt_message("0.1.5", Some("### Bug Fixes\n\n- something important"));

        assert!(message.contains("HackDesk v0.1.5 is available"));
        assert!(message.contains("What’s new:"));
        assert!(message.contains("### Bug Fixes"));
    }

    #[test]
    fn release_notes_are_trimmed_when_too_long() {
        let notes = "a".repeat(700);
        let normalized = normalize_release_notes(Some(&notes)).expect("notes should exist");

        assert!(normalized.ends_with('…'));
        assert_eq!(normalized.chars().count(), 601);
    }

    #[test]
    fn manual_update_status_serializes_expected_shape() {
        let status = ManualUpdateStatus::Installed {
            version: "0.1.5".to_string(),
            restart_required: true,
        };

        let value = serde_json::to_value(status).expect("status should serialize");

        assert_eq!(value["status"], "installed");
        assert_eq!(value["version"], "0.1.5");
        assert_eq!(value["restart_required"], true);
    }
}
