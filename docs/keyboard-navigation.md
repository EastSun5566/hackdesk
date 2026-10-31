---
outline: deep
---

# Navigate with the keyboard

Move through the workbench, find commands, and discover available actions without memorizing every shortcut. These are default bindings; Settings and Keyboard Shortcuts help show your current configuration.

## See keys for where you are

A line at the bottom of the window lists the keys that matter where focus is: moving and opening notes in the folder tree, filtering in the search box, switching tabs, or the commands to reach from a note. Keys follow your current shortcuts. The line fades while you type in a note and comes back when you pause, move the pointer, or press a modifier. Choose **? Shortcuts** at its right end for the full list.

To hide the line, choose **Hide Key Hints** from the Command Palette or the View menu, or turn off **Show key hints at the bottom of the window** in **Settings → Shortcuts**.

## Run commands with a few keys

Press **Space** outside text editing, or **Cmd+J** on macOS or **Ctrl+J** on Windows/Linux anywhere, including a note, to open the leader menu. Press a letter for a group, then a letter for the command: **Space N N** makes a new note and **Cmd+J T S** splits the tab to the right. The menu lists each command's own shortcut too, and keeps unavailable commands dimmed with the reason. Press **Backspace** to go back a level or **Escape** to close.

| Key | Group | Examples |
| --- | --- | --- |
| N | Note | N new, R rename, D duplicate, M move to folder, X delete |
| T | Tab | W close, S split right, U reopen closed, H / L move left / right |
| G | Go | W switch workspace, O Quick Open, S search notes, H History, B / F back / forward |
| V | View | S sidebar, F Hack Mode, D Note Details, K key hints |
| A | AI | A Ask AI, Q Ask Your Notes, D dictate |
| F | Folder | N new, R rename, X delete |

**K** opens the Command Palette, **?** all shortcuts and **,** Settings. Editor modes keep their own Space key, including Helix's Space menu; use Cmd+J / Ctrl+J there. Change Cmd+J under **Leader Menu** in **Settings → Shortcuts**; turning off **Enable ?, / and Space outside text editing** leaves Space as an ordinary key.

## Find commands and shortcuts

Open the **Command Palette** with **Cmd+K** on macOS or **Ctrl+K** on Windows/Linux. Search for an action and press Enter to run it. Search matches whole words in any order (`tabs right`) and the first letters of words (`nn` for **New Note**), and the matched letters are highlighted. Besides actions, the palette opens a page of Settings (`settings ai`), switches workspaces, including the Local Vault, and changes the theme. With text selected in the editor and an AI provider enabled, **Cmd+K** / **Ctrl+K** opens AI actions instead. Use **Cmd+Shift+P** / **Ctrl+Shift+P** to open the Command Palette in that context.

Open **Keyboard Shortcuts** from Help or the command palette to search bindings for the current region or all actions. Outside text editing, `?` also opens help.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Quick Open | Cmd+P | Ctrl+P |
| Command Palette | Cmd+K | Ctrl+K |
| Settings | Cmd+, | Ctrl+, |
| New note | Cmd+N | Ctrl+N |
| Save note | Cmd+S | Ctrl+S |
| Close active tab | Cmd+W | Ctrl+W |
| Toggle sidebar | Cmd+B | Ctrl+B |
| Go to My Workspace / pinned team | Cmd+1 / Cmd+2–9 | Ctrl+1 / Ctrl+2–9 |
| Next workbench region | F6 | F6 |
| Previous workbench region | Shift+F6 | Shift+F6 |
| Focus Note Finder outside text editing | `/` | `/` |
| Shortcut help outside text editing | `?` | `?` |

## Write in Hack Mode

Press **Cmd+.** on macOS or **Ctrl+.** on Windows/Linux, or **V F** in the leader menu, to enter Hack Mode. It hides the sidebar, the tabs, the note header and the key hints, and keeps only the active pane, so the note sits centered in the window. Press the same key again to leave; Escape stays with the editor. Toggling the sidebar with **Cmd+B**, searching notes with `/`, or switching workspaces leaves Hack Mode first. The palette, Quick Open and Note Details work as usual. Change the key under **Toggle Hack Mode** in **Settings → Shortcuts**.

## Move between regions

Press **F6** to move through the sidebar, tabs, editor panes, and open Note Details. Press **Shift+F6** to move backwards. Collapsed or unavailable regions are skipped.

To switch workspaces, choose the workspace name at the top of the sidebar, or run **Switch Workspace…** from the leader menu (**G W**) or the command palette. Up and Down move through the list, Enter switches, and Escape closes it.

In **Search notes** and **Search settings**, focus stays in the search box: Up and Down, or Ctrl+N and Ctrl+P, move the highlighted result and Enter opens it. With an empty note search, Down moves into the folder tree.

In tabs, use Left/Right or Home/End to move focus; Enter selects the focused tab. In the folder tree, arrow keys move focus or expand and collapse folders; Enter selects a folder or opens a note.

Outside text editing, **Ctrl+U** and **Ctrl+D** scroll the focused UI region by half a page. Text editors retain their own bindings, including modal editor commands.

## Reveal navigation hints

Hold **Cmd** on macOS or **Ctrl** on Windows/Linux to reveal shortcuts and navigation codes for visible workbench elements.

![Workbench showing keyboard navigation codes over fictional notes and controls](/keyboard-navigation.png)

*V2 development build with demonstration data. Codes depend on the current targets and available keys.*

Keep the modifier held and type a displayed code. Notes, folders, tabs, and workspaces navigate directly. An ordinary action button receives focus; press Enter to execute it.

Press Backspace to remove a code prefix, Escape to cancel, or release the modifier to clear hints. Settings shows codes for its visible controls instead of workbench hints. A code focuses the control; press Enter or Space to operate it. Other dialogs, menus, and Quick Hack hide navigation hints. Recording a custom shortcut also hides hints.

**Cmd+1** / **Ctrl+1** selects My Workspace. Numbers 2–9 select the first eight pinned teams. While you hold the modifier, a card beside the sidebar shows which workspace each number opens. Utilities such as Local Vault and History do not take a workspace number.

When an editor keeps every letter for its own keys, its codes are hidden and the hints show only shortcuts.

## Customize bindings

Open **Settings → Shortcuts** to change or disable actions. The **Enable ?, / and Space outside text editing** option controls the default character shortcuts. Input fields, text editors, and IME composition retain normal input behavior.

The hint allocator avoids occupied keys. If no safe codes remain, codes are hidden; use F6, normal tab navigation, or the command palette instead.
