use tauri::{
    menu::{Menu, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn init(app: &tauri::AppHandle) -> tauri::Result<()> {
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = Menu::with_items(app, &[&quit])?;

    let tray_builder = TrayIconBuilder::new()
        .menu(&menu)
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

    let _tray = tray_builder.build(app)?;

    Ok(())
}

fn handler(app: &AppHandle, event: tauri::menu::MenuEvent) {
    if event.id().as_ref() == "quit" {
        app.exit(0);
    }
}
