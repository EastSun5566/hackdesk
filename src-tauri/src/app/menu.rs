use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Runtime, Wry,
};

use crate::cmd;

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let name = app.package_info().name.clone();

    let about = PredefinedMenuItem::about(app, Some(&name), None)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let show_all = PredefinedMenuItem::show_all(app, None)?;
    let separator3 = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, None)?;

    let app_menu = SubmenuBuilder::new(app, &name)
        .items(&[
            &about,
            &separator1,
            &settings,
            &separator2,
            &hide,
            &hide_others,
            &show_all,
            &separator3,
            &quit,
        ])
        .build()?;

    let new_note = MenuItemBuilder::with_id("new_note", "New Note")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let separator4 = PredefinedMenuItem::separator(app)?;
    let close_window = PredefinedMenuItem::close_window(app, None)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .items(&[&new_note, &separator4, &close_window])
        .build()?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let separator5 = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .items(&[&undo, &redo, &separator5, &cut, &copy, &paste, &select_all])
        .build()?;

    let command_palette = MenuItemBuilder::with_id("command_palette", "Command Palette")
        .accelerator("CmdOrCtrl+K")
        .build(app)?;
    let separator6 = PredefinedMenuItem::separator(app)?;
    let reload = MenuItemBuilder::with_id("reload", "Reload This Page")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .items(&[&command_palette, &separator6, &reload])
        .build()?;

    let docs = MenuItemBuilder::with_id("docs", "Documentation").build(app)?;
    let source = MenuItemBuilder::with_id("source", "View on GitHub").build(app)?;
    let issues = MenuItemBuilder::with_id("issues", "Report Issue").build(app)?;
    let separator7 = PredefinedMenuItem::separator(app)?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .items(&[&docs, &source, &issues, &separator7])
        .build()?;

    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu],
    )
}

pub fn handler(app: &AppHandle<Wry>, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "new_note" => {
            cmd::run_script(app.clone(), "window.location.href = '/new'");
        }
        "settings" => {
            cmd::open_settings_window(app.clone());
        }
        "command_palette" => {
            cmd::open_command_palette_window(app.clone());
        }
        "reload" => {
            cmd::run_script(app.clone(), "window.location.reload()");
        }
        "docs" => {
            cmd::open_link(app.clone(), "https://hackdesk.vercel.app".to_string());
        }
        "source" => {
            cmd::open_link(
                app.clone(),
                "https://github.com/EastSun5566/hackdesk".to_string(),
            );
        }
        "issues" => {
            cmd::open_link(
                app.clone(),
                "https://github.com/EastSun5566/hackdesk/issues/new".to_string(),
            );
        }
        _ => (),
    }
}
