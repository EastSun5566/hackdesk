use tauri::{
    utils::assets::EmbeddedAssets, AboutMetadata, Context, CustomMenuItem, Manager, Menu, MenuItem,
    Submenu, WindowMenuEvent, Wry,
};

use crate::cmd;

pub fn init(context: &Context<EmbeddedAssets>) -> Menu {
    let name = &context.package_info().name;
    let app_menu = Submenu::new(
        name,
        Menu::new()
            .add_native_item(MenuItem::About(name.into(), AboutMetadata::default()))
            .add_native_item(MenuItem::Separator)
            .add_item(
                CustomMenuItem::new("settings".to_string(), "Settings")
                    .accelerator("CmdOrCtrl+,".to_string()),
            )
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Hide)
            .add_native_item(MenuItem::HideOthers)
            .add_native_item(MenuItem::ShowAll)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Quit),
    );

    let file_menu = Submenu::new(
        "File",
        Menu::new()
            .add_item(
                CustomMenuItem::new("new_note".to_string(), "New Note").accelerator("CmdOrCtrl+N"),
            )
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::CloseWindow),
    );

    let edit_menu = Submenu::new(
        "Edit",
        Menu::new()
            .add_native_item(MenuItem::Undo)
            .add_native_item(MenuItem::Redo)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Cut)
            .add_native_item(MenuItem::Copy)
            .add_native_item(MenuItem::Paste)
            .add_native_item(MenuItem::SelectAll),
    );

    let view_menu = Submenu::new(
        "View",
        Menu::new()
            .add_item(
                CustomMenuItem::new("command_palette".to_string(), "Command Palette")
                    .accelerator("CmdOrCtrl+K"),
            )
            .add_native_item(MenuItem::Separator)
            .add_item(
                CustomMenuItem::new("reload".to_string(), "Reload This Page")
                    .accelerator("CmdOrCtrl+R"),
            ),
    );

    let help_menu = Submenu::new(
        "Help",
        Menu::new()
            .add_item(CustomMenuItem::new("docs".to_string(), "Documentation"))
            .add_item(CustomMenuItem::new("source".to_string(), "View on GitHub"))
            .add_item(CustomMenuItem::new("issues".to_string(), "Report Issue"))
            .add_native_item(MenuItem::Separator),
    );

    Menu::new()
        .add_submenu(app_menu)
        .add_submenu(file_menu)
        .add_submenu(edit_menu)
        .add_submenu(view_menu)
        .add_submenu(help_menu)
}

pub fn handler(event: WindowMenuEvent<Wry>) {
    let win = Some(event.window()).unwrap();
    let app = win.app_handle();
    match event.menu_item_id() {
        "new_note" => {
            cmd::run_script(app, "window.location.href = '/new'");
        }
        "settings" => {
            cmd::open_settings_window(app);
        }
        "command_palette" => {
            cmd::open_command_palette_window(app);
        }
        "reload" => {
            cmd::run_script(app, "window.location.reload()");
        }
        "docs" => {
            cmd::open_link(app, "https://hackdesk.vercel.app".to_string());
        }
        "source" => {
            cmd::open_link(app, "https://github.com/EastSun5566/hackdesk".to_string());
        }
        "issues" => {
            cmd::open_link(
                app,
                "https://github.com/EastSun5566/hackdesk/issues/new".to_string(),
            );
        }
        _ => (),
    }
}
