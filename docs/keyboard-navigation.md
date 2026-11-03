---
outline: deep
---

# Navigate with the keyboard

Use shortcuts for frequent actions, the leader menu to explore commands, and navigation hints to reach visible controls. Change bindings in **Settings → Shortcuts**.

## Run commands with a few keys

Press **Space** outside text editing, or **Cmd+J** / **Ctrl+J** anywhere, to open the leader menu. Choose a group, then a command. For example, **Space N N** creates a note; **Cmd+J P S** splits right.

![Leader menu showing command groups and their keys](/leader-menu.png)

*HackDesk beta.10 with demonstration notes.*

| Key | Group | Examples |
| --- | --- | --- |
| N | Note | N new, R rename, S save, X delete |
| T | Tab | W close, U reopen, H / L move left / right |
| P | Pane | S split right, D split down, H / J / K / L focus, Z zoom, = equalize |
| G | Go | W workspace, O Quick Open, S search, H History |
| V | View | S sidebar, F Hack Mode, D Note Details, K key hints |
| A | AI | A Ask AI, Q Ask Your Notes, D dictate |
| F | Folder | N new, R rename, X delete |

The menu shows shortcuts and explains unavailable actions. **Backspace** returns to the previous group; **Escape** closes it. **K** opens the Command Palette, **?** shortcut help, and **,** Settings.

Text inputs and editor modes keep their Space key. Use **Cmd+J** / **Ctrl+J** there, including in Helix.

## Find commands and shortcuts

Press **Cmd+K** / **Ctrl+K** for the Command Palette. Search for actions, Settings pages, workspaces, or themes. Word order and initials work: `tabs right` or `nn` for New Note.

With text selected and AI enabled, this shortcut opens AI actions. **Cmd+Shift+P** / **Ctrl+Shift+P** always opens the Command Palette.

Open **Help → Keyboard Shortcuts**, or press `?` outside text editing, to search bindings by region or across all actions.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Quick Open | Cmd+P | Ctrl+P |
| Command Palette | Cmd+K | Ctrl+K |
| Leader menu | Cmd+J | Ctrl+J |
| Settings | Cmd+, | Ctrl+, |
| New note | Cmd+N | Ctrl+N |
| Save | Cmd+S | Ctrl+S |
| Close tab | Cmd+W | Ctrl+W |
| Toggle sidebar | Cmd+B | Ctrl+B |
| My Workspace / pinned teams | Cmd+1 / Cmd+2–9 | Ctrl+1 / Ctrl+2–9 |
| Next region / previous region | F6 / Shift+F6 | F6 / Shift+F6 |
| Search outside text editing | `/` | `/` |
| Shortcut help outside text editing | `?` | `?` |

## Write in Hack Mode

Press **Cmd+.** / **Ctrl+.**, or **V F** in the leader menu, to show only the active note. Repeat to restore the workbench.

The palette, Quick Open, and Note Details remain available. Showing the sidebar, searching notes, or switching workspaces exits Hack Mode. Escape retains its editor behavior.

## Move between regions

Press **F6** or **Shift+F6** to cycle through the sidebar, tabs, editors, and open Note Details. Hidden regions are skipped.

- **Tabs:** Left/Right or Home/End moves focus; Enter selects.
- **Folder tree:** Arrow keys move focus or expand and collapse folders; Enter selects a folder or opens a note.
- **Search notes and Search settings:** Up/Down or Ctrl+N / Ctrl+P highlights results; Enter opens one. With an empty note search, Down enters the tree.
- **Panes:** Use the leader menu's **P** group and H / J / K / L to focus left / down / up / right.

Outside text editing, **Ctrl+U** / **Ctrl+D** scrolls the focused region by half a page. Editors keep their own bindings.

## Reveal navigation hints

Hold **Cmd** on macOS or **Ctrl** on Windows/Linux to show shortcuts and codes for visible controls. Keep it held and type a code.

![Keyboard hints over the sidebar, note tabs, and editor controls](/keyboard-navigation.png)

*HackDesk beta.10. Codes depend on visible targets and available keys.*

Notes, folders, tabs, and workspaces navigate directly. Other buttons receive focus; press Enter to act. Backspace removes a prefix, Escape cancels, and releasing the modifier clears hints.

Settings shows hints for its own controls. Other dialogs, menus, Quick Hack, and shortcut recording hide them. Editors with no safe letters show existing shortcuts only.

While the modifier is held, a workspace card lists **Cmd+1–9** / **Ctrl+1–9**: My Workspace, then up to eight pinned teams. Local Vault and History do not use these numbers.

## Customize bindings

In **Settings → Shortcuts**, change or disable an action. Hints and menus follow your saved bindings. **Enable ?, / and Space outside text editing** controls the default character keys; inputs and IME composition retain normal behavior.

If no safe navigation codes remain, use F6, Tab, or the Command Palette.
