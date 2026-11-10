---
outline: deep
---

# Work with notes

Open notes in tabs, arrange them in panes, and save them to a Local Vault or HackMD. To connect a workspace, [get started](./intro.md).

![Reading notes and a project plan open side by side in HackDesk](/editor.png)

*HackDesk beta.10 with demonstration notes.*

## Choose a workspace

Open the workspace switcher at the top of the sidebar:

- **My Workspace** holds your personal HackMD notes.
- **Pinned** and **More** list your teams. Hover a team to pin it, or drag a pinned team to reorder it.
- **Local** holds your Markdown folders, each listed by its folder name. **Add local folder** beside the heading opens another one.
- **Local workspaces** are named sets of those folders. The switcher lists each set, and under the open one its folders, so you can jump between them without leaving the set. Create and edit them under **Settings → Vault → Workspaces**.
- **History** shows recent HackMD browsing activity.

Settings and Trash are at the bottom of the sidebar. Press **Cmd+B** on macOS or **Ctrl+B** on Windows/Linux to hide or show the sidebar.

Switching Local Vaults restores each vault's own tabs and recoverable drafts. Files are not uploaded to HackMD.

## Find and organize notes

Use **Search notes** to find titles, tags, or text. **View options**, beside the search box, controls search scope, sorting, and filters.

Text search covers all notes in a Local Vault. For HackMD, it covers only notes you have opened in HackDesk. Results show the search coverage.

Opened HackMD notes remain readable offline, including after a restart. **Cached** means the copy may be older than HackMD. Manage these copies in **Settings → General → Offline and search**.

Create a folder with **New Folder**. Drag notes and folders to move them, or use **Move Note to Folder…** in the Command Palette. Use a folder's menu to rename or delete it. Local deletion uses the system trash; HackMD deletion affects remote notes.

Press **Cmd+P** / **Ctrl+P** for **Quick Open** to find notes, folders, and workspaces. Press **Cmd+K** / **Ctrl+K** for the **Command Palette** to find actions. If selected text opens AI actions instead, use **Cmd+Shift+P** / **Ctrl+Shift+P**.

## Arrange tabs and panes

Drag a tab's icon or title to reorder it within its pane.

1. Choose **Pane actions → Split Right** (**Cmd+\\** / **Ctrl+\\**) or **Split Down** (**Cmd+Shift+\\** / **Ctrl+Shift+\\**).
2. Open a note in the new pane.
3. Drag the divider to resize, or choose **Equalize Pane Sizes**.

Split any pane again, up to six panes. The tab strip follows the active pane. Closing a pane's last tab removes that pane; closing the last tab in the workbench leaves it open.

Choose **Zoom pane**, or press **Cmd+Shift+Enter** / **Ctrl+Shift+Enter**, to fill the editor area with one pane. Repeat to restore the layout. Use **Move Tab to Next Pane** to move a tab between panes.

For distraction-free writing, press **Cmd+.** / **Ctrl+.** to enter [Hack Mode](./keyboard-navigation.md#write-in-hack-mode).

## Save changes

Press **Cmd+S** / **Ctrl+S** to save the active note. A dot on its tab marks unsaved work, saving, or a problem. It disappears after a successful save.

The note header shows its location. Choose a workspace or folder there to reveal it in the sidebar. Toolbar actions appear on hover or keyboard focus, and stay visible while edits are unsaved.

HackDesk keeps recovery copies of unsaved edits. If a backup fails, save or copy the text. If a note changes elsewhere, review the conflict before saving again.

## Review versions and conflicts

For a HackMD note, choose **More actions → Version History…**. Select a version to compare it with the saved HackMD content, or choose **Full text**. Unsaved edits are excluded. Use **Restore into Editor** to load a version for editing, or open it as a new draft. Confirm before replacing unsaved edits, then save when ready. Local Vault notes do not have HackMD version history.

If a note changes elsewhere, choose **Compare with disk** or **Compare with HackMD** in the conflict message. The latest saved content appears beside **Your draft**. Opening the comparison does not save or replace your edits.

## Start from a template

Templates are notes in a top-level **Templates** folder in the current workspace, including Local Vaults and teams.

- Choose **New Note from Template…** from the File menu or Command Palette. Edit the new draft, then save it.
- Choose **Save as Template** from a note's **More actions** menu to copy it into Templates. HackDesk creates the folder if needed.

Template content is copied as written; placeholders are not expanded. Templates saved through HackMD's web app are not exposed by its API. Copy them into the Templates folder to use them here.

## Link and embed notes

In a Local Vault, link by relative path: `[Plan](./plan.md)`. In HackMD, use the note URL: `https://hackmd.io/@you/plan`.

Type `[text](` to pick a note, or `{%hackmd ` to pick an embed. When pasting a URL, choose **URL**, **Reference**, or **Preview**. Standalone embeds and previews appear as cards with an **Open** button.

Known notes open in tabs; other links open in your browser. Resolving an unknown HackMD note makes an API request. **Note Details → Linked from** lists backlinks across the Local Vault or the HackMD notes you have opened.

For local images, use a path relative to the note, such as `![Diagram](./images/diagram.png)`. Paths must stay inside the vault. New drafts need to be saved before relative images can resolve.

### Insert Markdown syntax

Start typing syntax to see suggestions. Use arrow keys and Enter to choose, or Escape to dismiss.

| Start typing | Suggestions |
| --- | --- |
| `:smi` | Emoji |
| Three backticks followed by a letter | Code languages and diagrams |
| `:::w` | Container styles |
| `{%` at the start of a line | Embeds |
| `> [!` | Alerts |
| `<!-- .` | Slide and element attributes |
| Front matter keys and values | Metadata and slide options |

HackMD tag fields also suggest existing tags. New code blocks and containers include a closing line.

## Read books

A book note uses headings and bulleted links as its table of contents. HackMD books open with **Book contents** beside the editor. For another note, choose **Open as Book** from **More actions** or the Command Palette.

Choose a chapter, or use **Previous Chapter** and **Next Chapter**. Chapters follow the same link rules as other notes. Edit the table of contents and save to update it. **Close book** hides the contents.

## Present slides

Choose **Present** from **More actions**, the View menu, or the Command Palette. The presentation includes unsaved edits. Notes with `type: slide` also show Present in the toolbar.

- Use `---` on its own line, with blank lines above and below, for a new slide; use `----` for a slide below. These separators also apply inside code blocks.
- Start a line with `note:` for hidden speaker notes.
- Use `<!-- .slide: ... -->` and `<!-- .element: ... -->` for slide and element attributes.
- Set the theme, transition, and controls through `slideOptions` in front matter. Script-loading options are ignored.

Arrow keys or Space advance, **O** opens the overview, and **Escape** exits. Math is supported; embeds and diagrams remain text. Themes use system fonts instead of remote web fonts.

## Write with AI

Install and sign in to the Codex or Claude CLI, then enable the provider in **Settings → AI**. AI is off by default.

Select text and press **Cmd+K** / **Ctrl+K**. Choose an action, review the result, then **Replace**, **Insert**, or **Discard**. Use **Compare changes** for a full-note comparison. For the whole note, choose **Ask AI...** from the Command Palette.

Save custom prompts in **Settings → AI**. Requests use your CLI account and send note text and context to the provider. Read the [privacy and network details](./code-signing-policy.md#privacy-and-network-behavior).

### Ask your notes

Choose **Ask Your Notes...** from the Edit menu or Command Palette. Ask a question; HackDesk finds relevant passages in the current workspace's local copies and sends them to your AI provider. It searches all Local Vault notes or the HackMD notes you have opened, without downloading other notes.

Choose a numbered source to open its note. Follow-up questions keep the conversation. **New conversation** or switching workspaces starts over. If no notes match, HackDesk does not send a request.

## Dictate

On macOS 26 or later, enable **Settings → Dictation**, choose a language, and download its speech model.

1. Press **Cmd+Shift+D** in a note. Allow microphone access when prompted.
2. Speak. Press **Cmd+Shift+D** again or **Enter** to insert the text, or **Escape** to cancel.

A recording stops after five minutes. Speech recognition runs on your Mac; HackDesk does not save the audio. With AI enabled, select **Clean up dictation** to review a revised version before replacing the text.

## Edit Note Details

Choose **Rename Note** from **More actions** or the Command Palette to change a saved note's title. In a Local Vault, this also renames the file.

Open **Note Details** to view metadata and backlinks. HackMD notes also offer tags, permissions, and sharing controls. Press **Escape** to close the panel and return to the note.

For capture outside the main window, use [Quick Hack](./quick-hack.md). For themes and editor modes, [customize HackDesk](./config.md).
