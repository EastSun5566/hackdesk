---
outline: deep
---

# Work with notes

Choose a workspace, organize notes in folders, and keep related documents open in tabs or split panes. [Get started](./intro.md) covers opening a vault and connecting HackMD.

![HackDesk workbench showing fictional project notes in two editor panes](/editor.png)

*V2 development build with demonstration data.*

## Choose a workspace

The workspace sidebar separates your note collections:

- **My Workspace** contains your personal HackMD notes
- **Pinned** contains the teams you use most
- **More** contains unpinned teams
- **Local Vault** opens the selected local Markdown folder
- **History** shows recent HackMD browsing activity

Hover a team row to pin or unpin it. Drag pinned teams to reorder them. My Workspace stays first. Use the [keyboard shortcuts](./keyboard-navigation.md) to switch workspaces without the pointer.

Opening another Local Vault restores that vault's own tabs and recoverable drafts. A Local Vault does not automatically upload notes to HackMD.

## Find and organize notes

Use **Search notes** to filter the selected workspace by title, tag or text. Matching text appears under each note with the words highlighted. In a Local Vault, the text of every note is searched. In HackMD, only the notes you have opened in HackDesk are searched by text, because HackDesk never downloads notes you have not opened. The results say how many notes were covered. Expand folders in the navigator, or use the tag browser to narrow the list.

HackMD notes you open are kept on this computer, so they stay readable when you are offline or HackMD is unreachable, even after restarting HackDesk. A note shown this way is marked **Cached** and may be behind HackMD. To stop keeping notes, or to clear them, use **Settings → General → Offline and search**.

Create folders with **New Folder**. Use a folder's menu to edit or delete it, or drag notes and folders to move them. Local deletion moves files to the system trash; HackMD deletion affects remote notes.

Press **Cmd+P** / **Ctrl+P** for **Quick Open** to search notes, folders, and workspaces. Press **Cmd+K** / **Ctrl+K** for the **Command Palette** to find actions. With text selected in the editor and an AI provider enabled, this shortcut opens AI actions instead; **Cmd+Shift+P** / **Ctrl+Shift+P** still opens the Command Palette.

## Arrange tabs and panes

Select a note to open it in a tab. Drag a tab's icon or title to reorder tabs within its pane.

To compare two notes:

1. Open a note and choose **Pane actions → Split Right**.
2. Open another note in the other pane.
3. Drag the divider to resize the panes.

HackDesk supports two editor panes. Use **Move Tab to Other Pane** to move a tab between them. The tab strip follows the active pane.

**Close Tab** closes the active tab and keeps the workbench open after the last tab. When prompted about unsaved changes, save or discard them before closing.

## Link and embed notes

HackDesk understands the ways HackMD links notes:

- **Links**: In a Local Vault, `[Plan](./plan.md)` links to another note by its path. In HackMD, use the note's URL, such as `https://hackmd.io/@you/plan`.
- **Embeds**: A line with `{%hackmd @you/plan %}` or `{%hackmd <short ID> %}` embeds a HackMD note.
- **Link previews**: A line with `{%preview https://… %}` shows a preview card on HackMD.

To insert one, type `[text](` to pick a note by title, or `{%hackmd ` to pick a note to embed. When you paste a URL, choose **URL**, **Reference** (`[title](url)`) or **Preview** (`{%preview %}`).

Embeds and previews appear as cards under their line, with the note's title and an **Open** button. Choosing **Open link** next to a link, or **Open** on a card, opens the note in a tab when HackDesk knows it, and anything else in your browser. Cards and links use what HackDesk already has on this computer. Opening a HackMD link that it does not recognize asks HackMD once, which counts toward your API limit.

**Note Details → Linked from** lists the notes that link to or embed the current note. It covers every note in your Local Vault, and only the HackMD notes you have opened in HackDesk.

## Save changes

Choose **Save** in the document toolbar to write the active note to its workspace. Save status distinguishes changes still in the editor from a saved note.

HackDesk keeps recovery copies of unsaved edits. Recovery does not replace saving, and a reported backup failure means the edits need attention. If a note changed elsewhere, review the conflict or recovery message before saving again.

## Write with AI

AI is optional and off by default. Install and sign in to the Codex or Claude CLI separately, then enable it in **Settings → AI**.

Select text and press **Cmd+K** / **Ctrl+K** to choose a writing action. Review the result, then choose **Replace**, **Insert**, or **Discard**. To work on the whole note without selecting text, choose **Ask AI...** from the Command Palette.

Save and reorder your own prompts in **Settings → AI**. AI requests use your CLI provider's service and account limits. They send the selected text, note title, nearby context and instruction to that provider; see [privacy and network behavior](./code-signing-policy.md#privacy-and-network-behavior).

## Dictate

Dictation is available on macOS 26 or later and is off by default. Turn it on in **Settings → Dictation** and choose a language. The first time you use a language, choose **Download**: macOS fetches its speech model from Apple once and shares it with other apps.

In a note, press **Cmd+Shift+D** to dictate at the cursor. What you say appears at the cursor as you speak, but the note changes only when you finish. Press **Cmd+Shift+D** again or **Enter** to insert the text, or **Escape** to cancel. A recording stops on its own after five minutes. The first recording asks for microphone access.

The inserted text stays selected. With an AI provider enabled, press **Cmd+K** and choose **Clean up dictation**, first in the list, to remove filler words and fix punctuation. Review the result before replacing the text; undo brings back the original dictation.

## Edit Note Details

Open **Note Details** to change the title and inspect metadata. HackMD notes also expose tags, permissions, and sharing information where supported. For a Local Vault note, Note Details shows only the notes linking to it.

Local files and HackMD notes have different metadata. Controls reflect the selected workspace; they do not provide full team administration.

For capture outside the main window, use [Quick Hack](./quick-hack.md). For editor modes and appearance, [customize HackDesk](./config.md).
