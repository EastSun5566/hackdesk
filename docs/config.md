---
outline: deep
---

# Customize HackDesk

Open **Settings** with **Cmd+,** on macOS or **Ctrl+,** on Windows/Linux.

Use **Search settings** to find a field. For example, search `font` and choose **Editor font** to open Appearance and focus the input. Arrow keys move through results; Enter opens one. Searching does not save changes.

## Change appearance

In **Settings → Appearance**, choose a theme, colors, fonts, and text sizes. Search the font picker for an installed font. Prose uses a proportional font by default; code stays monospace.

Choose **Apply Theme** to keep the preview or **Cancel Preview** to restore the saved appearance. **Smooth text** controls font smoothing. **Indent guides** and **Status line** take effect immediately.

![Appearance settings with the HackMD Neo dark preset](/custom-settings.png)

*HackDesk beta.10 with demonstration data.*

## Choose an editor mode

In **Settings → Editor**, choose Standard, Vim, Helix, Emacs, or experimental Kakoune, then **Save**.

Under **New tab opens**, choose **Empty page** or **Duplicate current note**. This preference takes effect immediately.

Editor modes control text editing. [Workbench navigation](./keyboard-navigation.md) uses separate commands.

## Change shortcuts

In **Settings → Shortcuts**, find an action, record a shortcut, then **Save**. Use its reset control to restore the default. You can also disable `?`, `/`, and Space outside text editing.

Quick Hack's global **Ctrl+Alt+H** is fixed. Its row shows whether registration succeeded.

## Manage HackMD and Local Vault

Use **Settings → HackMD** to connect or disconnect an account. Disconnecting removes the saved token and offline HackMD copies; it does not delete remote notes.

Use **Settings → Vault** to change or forget a vault. Forgetting keeps its files and saved workspace layout. Selecting it again restores its tabs and drafts.

## Edit settings.json

Quit HackDesk before editing the file. Preserve unrelated fields; changes load on the next launch.

| Platform | File |
| --- | --- |
| macOS / Linux | `~/.hackdesk/settings.json` |
| Windows | `%USERPROFILE%\.hackdesk\settings.json` |

For example, merge this field into your existing configuration to use Vim mode:

```json
{
  "editor": { "mode": "vim" },
  "appIcon": "nightly"
}
```

Set tokens and vault paths through Settings. Do not copy them into shared configuration.

`appIcon` sets the Dock, taskbar, and window icon while HackDesk runs. Use `system` (the default) to follow the OS light/dark appearance, or pick a style in **Settings → General → App Icon**. Unknown values fall back to `system`.

## Protect your token

HackDesk encrypts tokens using the operating system. Existing plaintext tokens migrate when encryption is available. Do not edit encrypted token fields manually.

If the keyring is locked or unavailable, follow the Settings error message. Local Vault remains usable. Linux's plaintext keyring fallback cannot store new tokens.

## Recover damaged settings

If HackDesk cannot read its settings, it opens a recovery dialog:

- **Try Again** reloads the file after you fix it.
- **Reveal Settings File** locates it.
- **Quit** leaves it unchanged.
- **Back Up and Reset…** backs up the file beside the original and starts with defaults, after confirmation.

After resetting, reconnect HackMD and select your vault. **Settings → Advanced → Reset All Settings** also resets preferences without deleting vault files.
