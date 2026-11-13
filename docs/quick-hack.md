---
outline: deep
---

# Capture a draft with Quick Hack

Capture an idea without leaving your current app. Quick Hack creates a recoverable draft in the selected workspace; it does not save a file or publish to HackMD.

## Prepare a destination

Open a Local Vault or connect HackMD and select a personal or team workspace before capturing. The History view is not a writable destination.

## Capture an idea

1. Keep HackDesk running and press **Ctrl+Alt+H**. On macOS, this is **Control+Option+H**, not Command.
2. Type the text you want to keep. Markdown works as in the note editor (see [Write Markdown](#write-markdown)).
3. Choose **Capture**, or press **Cmd+Enter** on macOS, **Ctrl+Enter** on Windows/Linux.
4. Open HackDesk when ready to edit and save the draft.

![Quick Hack popup containing a fictional idea with the Capture button](/quick-hack.png)

*HackDesk beta.10 with demonstration text.*

From another app, successful capture closes the popup without bringing the main workbench forward. From HackDesk, it returns to the main window. To capture several ideas in a row, [pin the popup](#keep-the-popup-open).

Press **Ctrl+Alt+H** again while the popup is in front to close it, like Escape. If the popup is open behind another window, the shortcut brings it back instead.

## Write Markdown

The popup highlights Markdown with the note editor's colours and keeps the source as you type it; the draft renders in the workbench.

- **Enter** continues a list, task list, numbered list, or quote. Press it on an empty item to end the list.
- **Tab** and **Shift+Tab** indent and outdent.
- **Cmd+B** / **Ctrl+B** makes the selection bold, and **Cmd+I** / **Ctrl+I** italic. Press again to undo the formatting.

## Keep the popup open

Choose the pin at the bottom left of the popup, or press **Cmd+Shift+P** / **Ctrl+Shift+P**, to keep the popup open after each capture. A pinned capture clears the text and shows **Captured**, ready for the next idea.

The pin lasts until the popup closes. To start every Quick Hack pinned, turn on **Settings → General → Quick Hack → Keep open after capture**; unpinning then lasts until the popup closes.

## Save or resume a draft

Press **Cmd+S** / **Ctrl+S** in the workbench to save the draft to its destination.

Escape closes the popup without submitting and preserves the input for reopening. A failed capture keeps the text visible with an error. Copy the text if HackDesk reports that it cannot persist or back up the capture.

## Check the global shortcut

Open **Settings → Shortcuts** and find **Quick Hack**. **Global** means the shortcut registered; **Unavailable** means registration failed, for example because another app owns it.

This shortcut is fixed. The tray menu's **Quick Hack** action (in the macOS menu bar) is another way to open the popup. Fully quitting HackDesk stops the global shortcut; closing the macOS main window can leave HackDesk running in the background.
