use tauri::{AppHandle, CustomMenuItem, SystemTray, SystemTrayEvent, SystemTrayMenu};

pub fn init() -> SystemTray {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let tray_menu = SystemTrayMenu::new().add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

pub fn handler(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "quit" => {
                app.exit(0);
            }
            _ => {}
        },
        _ => {}
    }
}
