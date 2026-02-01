use tauri::{
    menu::{Menu, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tracing::info;

pub fn init(app: &tauri::AppHandle) -> tauri::Result<()> {
    info!("Creating tray menu");

    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = Menu::with_items(app, &[&quit])?;

    info!("Building tray icon");

    let tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(handler)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });

    let tray = tray_builder.build(app)?;

    // Keep the tray icon alive by storing it in app state
    app.manage(tray);

    info!("Tray icon created successfully");

    Ok(())
}

fn handler(app: &AppHandle, event: tauri::menu::MenuEvent) {
    info!("Tray menu event: {}", event.id().as_ref());

    if event.id().as_ref() == "quit" {
        info!("Quitting application from tray");
        app.exit(0);
    }
}
