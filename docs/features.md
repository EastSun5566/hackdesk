---
outline: deep
---

# Features

![Editor](/editor.png)

## HackMD API-native

![API Integration](/api-integration.png)

Connect a personal access token to use HackMD directly from the desktop app.

- Browse, create, edit, and organize personal or team notes
- Manage folders, history, sharing, and note metadata
- Store the API token locally instead of sending it to another service

## Local-first Markdown

Open any folder as a Local Vault—no account or API token required.

- Notes remain ordinary Markdown files that other tools can read
- Create, rename, move, trash, and reveal notes or folders from HackDesk
- Keep local drafts recoverable without uploading them to a service

## Hackable configuration

![Custom Settings](/custom-settings.png)

Use `CmdOrCtrl+,` for Settings or edit `~/.hackdesk/settings.json` while HackDesk is closed.

- Choose themes, colors, fonts, and editor sizes
- Switch between Standard, Vim, Helix, Emacs, and Kakoune modes
- Remap desktop actions and use `CmdOrCtrl+K` for the command palette

## Keyboard navigation

Press F6 (Shift+F6 for backwards) to cycle through the visible Workbench regions. Tabs and the folder tree use arrow keys to move focus; Enter selects or opens the focused item.

Hold Cmd on macOS or Ctrl on Windows/Linux to reveal shortcuts and navigation codes. Keep the modifier held while typing a code. Notes, folders, tabs, and workspaces navigate directly; ordinary buttons receive focus, then Enter performs the action. Escape cancels the current hold, Backspace removes a code prefix, and releasing the modifier clears the hints.

Press `?` outside text editing for searchable Keyboard Shortcuts help, or open it from Help or the command palette. `/` focuses Note Finder; Ctrl+U/D scrolls the focused UI region by half a page. Settings → Shortcuts shows the actual bindings and lets you customize or disable them. Text editors retain their own keys. If no safe navigation letters remain (including modal editor Ctrl bindings on Windows/Linux), hints explain this and normal keyboard navigation stays available.
