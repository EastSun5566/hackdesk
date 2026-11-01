---
outline: deep
---

# Work with notes

Choose a workspace, organize notes in folders, and keep related documents open in tabs or split panes. [Get started](./intro.md) covers opening a vault and connecting HackMD.

![HackDesk workbench showing fictional project notes in two editor panes](/editor.png)

*V2 development build with demonstration data.*

## Choose a workspace

The workspace name at the top of the sidebar opens the workspace switcher, which separates your note collections:

- **My Workspace** contains your personal HackMD notes
- **Pinned** contains the teams you use most
- **More** contains unpinned teams
- **Local Vault** opens the selected local Markdown folder
- **History** shows recent HackMD browsing activity

Hover a team row to pin or unpin it. Drag pinned teams to reorder them. My Workspace stays first. Trash and your account, which opens Settings, sit at the bottom of the sidebar. Press **Cmd+B** on macOS or **Ctrl+B** on Windows/Linux to hide or show the sidebar. Use the [keyboard shortcuts](./keyboard-navigation.md) to switch workspaces without the pointer.

Opening another Local Vault restores that vault's own tabs and recoverable drafts. A Local Vault does not automatically upload notes to HackMD.

## Find and organize notes

Use **Search notes** to filter the selected workspace by title, tag or text. Matching text appears under each note with the words highlighted. In a Local Vault, the text of every note is searched. In HackMD, only the notes you have opened in HackDesk are searched by text, because HackDesk never downloads notes you have not opened. The results say how many notes were covered. Expand folders in the navigator. **View options**, next to the search box, chooses where to search and how to sort, and narrows the list by permission or tag; a badge counts the options in use. HackMD lists refresh when you come back to the window.

HackMD notes you open are kept on this computer, so they stay readable when you are offline or HackMD is unreachable, even after restarting HackDesk. A note shown this way is marked **Cached** and may be behind HackMD. To stop keeping notes, or to clear them, use **Settings → General → Offline and search**.

Create folders with **New Folder**. Use a folder's menu to edit or delete it, or drag notes and folders to move them. From the keyboard, **Move Note to Folder…** in the Command Palette lists the workspace's folders, and **Rename Note** asks for a new title and saves it. Local deletion moves files to the system trash; HackMD deletion affects remote notes.

Press **Cmd+P** / **Ctrl+P** for **Quick Open** to search notes, folders, and workspaces. Press **Cmd+K** / **Ctrl+K** for the **Command Palette** to find actions. With text selected in the editor and an AI provider enabled, this shortcut opens AI actions instead; **Cmd+Shift+P** / **Ctrl+Shift+P** still opens the Command Palette.

## Start from a template

Templates are the notes in a top-level **Templates** folder of the current workspace. This works in My Workspace, in a team, where everyone shares the team's folder, and in a Local Vault.

- To start from one, choose **New Note from Template…** from the File menu or the Command Palette. The new note opens as a draft with the template's text, and you save it like any new note. Content is copied as-is, without placeholders.
- To make a template, open a note and choose **Save as Template** from **More actions**. HackDesk copies it into the Templates folder, and creates the folder the first time.

Templates you saved in HackMD's web app are not available, because the HackMD API does not provide them. To use one, copy it into the Templates folder.

## Arrange tabs and panes

Select a note to open it in a tab. Drag a tab's icon or title to reorder tabs within its pane.

To compare two notes:

1. Open a note and choose **Pane actions → Split Right**.
2. Open another note in the other pane.
3. Drag the divider to resize the panes.

HackDesk supports two editor panes. Use **Move Tab to Other Pane** to move a tab between them. The tab strip follows the active pane.

**Close Tab** closes the active tab and keeps the workbench open after the last tab. When prompted about unsaved changes, save or discard them before closing.

To write without the rest of the workbench, press **Cmd+.** / **Ctrl+.** for [Hack Mode](./keyboard-navigation.md#write-in-hack-mode): only the active note stays, centered in the window.

## Link and embed notes

HackDesk understands the ways HackMD links notes:

- **Links**: In a Local Vault, `[Plan](./plan.md)` links to another note by its path. In HackMD, use the note's URL, such as `https://hackmd.io/@you/plan`.
- **Embeds**: A line with `{%hackmd @you/plan %}` or `{%hackmd <short ID> %}` embeds a HackMD note.
- **Link previews**: A line with `{%preview https://… %}` shows a preview card on HackMD.

To insert one, type `[text](` to pick a note by title, or `{%hackmd ` to pick a note to embed. When you paste a URL, choose **URL**, **Reference** (`[title](url)`) or **Preview** (`{%preview %}`).

Embeds and previews appear as cards under their line, with the note's title and an **Open** button. Choosing **Open link** next to a link, or **Open** on a card, opens the note in a tab when HackDesk knows it, and anything else in your browser. Cards and links use what HackDesk already has on this computer. Opening a HackMD link that it does not recognize asks HackMD once, which counts toward your API limit.

**Note Details → Linked from** lists the notes that link to or embed the current note. It covers every note in your Local Vault, and only the HackMD notes you have opened in HackDesk.

### Suggestions while you type

The editor suggests HackMD syntax as you type it. Use the arrow keys and Enter to choose, or Esc to dismiss.

- `:` and two letters, such as `:smi`, lists emoji. A colon after a letter or digit, as in `10:30` or `https:`, does not.
- ` ``` ` and a letter lists code languages and diagrams such as `mermaid`.
- `:::` and a letter lists container styles such as `warning`.
- `{%` at the start of a line lists embeds such as `youtube` and `hackmd`.
- `[!` in a blockquote lists alert types such as `NOTE` and `WARNING`.
- `[` and a letter at the start of a line offers `[TOC]`. In a blockquote or list item it offers `[name=]` with your HackMD name, `[time=]` with the current time, and `[color=]`.
- `<!-- .` lists `slide:` and `element:`, then the attributes slides accept, such as `class="fragment"`.
- In front matter, keys such as `title`, `tags`, `type` and `slideOptions` are suggested, then fixed values such as `type: slide` or a slide `theme`.
- `tags:` in front matter, and a `###### tags:` line, offer the tags your notes already use. Local Vault notes do not have tags yet, so this works in HackMD workspaces.

For a new code block or container, the closing line is added for you. Suggestions do not appear inside code, and only front matter suggestions appear inside front matter.

## Read books

A HackMD book is a note whose headings and bulleted links form a table of contents. When you open a note that HackMD publishes as a book, HackDesk shows its **Book contents** beside the editor. To read any note as a book, including a Local Vault note, choose **Open as Book** from the note's **More actions** menu or the Command Palette.

- Headings and link-less bullets are sections.
- Each bulleted link is a chapter.
- A link marked `[target=_blank]` opens in your browser.

Choose a chapter to open it in a tab. While you read, the contents mark the current chapter. **Previous Chapter** and **Next Chapter** move through the book, from the buttons under the note or from the Command Palette. Chapters open the same way as other links, so a HackMD chapter HackDesk has not seen before asks HackMD once.

To change the book, edit its links in the editor; the contents update when you save. **Close book** hides the contents until you open the book again.

## Present slides

Choose **Present** from a note's **More actions** menu, the **View** menu, or the Command Palette to show the note as full-screen slides. Unsaved changes are included. Notes that HackMD publishes as slides, or that have `type: slide` in their front matter, also show **Present** in the document toolbar.

- A `---` line with a blank line above and below starts a new slide; `----` starts a slide below the current one. This applies inside code blocks too, so leave out the blank lines around `---` in code samples.
- Everything after a line starting with `note:` is speaker notes, which are hidden.
- `<!-- .slide: data-background="#123456" -->` and `<!-- .element: class="fragment" -->` set attributes on the slide or the element before the comment.
- In code blocks, `js=` numbers the lines and `js=[1,3|4]` highlights lines step by step. Math works as it does in the editor.
- `slideOptions` in the front matter set [reveal.js options](https://revealjs.com/config/) such as `theme`, `transition`, and `controls`. Options that would load scripts are ignored, and `hash` and `history` stay off because the window keeps its own place in the URL.

Use the arrow keys or Space to move, **O** for an overview, and **Esc** to leave. Embeds such as `{%youtube %}` and diagrams show as text. Themes that use web fonts use system fonts instead.

## Save changes

Choose **Save** in the document toolbar to write the active note to its workspace. A dot on the note's tab shows unsaved changes, saving, or a problem, and disappears once the note is saved. The header is one line: the note's workspace, folders and title, which stays in view as you scroll. Choose the workspace or a folder there to show it in the sidebar. The header names the state only when it needs attention, such as a failed save or a conflict. Document toolbar buttons appear when you point at or tab into the header, and stay visible while the note has unsaved changes.

HackDesk keeps recovery copies of unsaved edits. Recovery does not replace saving, and a reported backup failure means the edits need attention. If a note changed elsewhere, review the conflict or recovery message before saving again.

## Write with AI

AI is optional and off by default. Install and sign in to the Codex or Claude CLI separately, then enable it in **Settings → AI**.

Select text and press **Cmd+K** / **Ctrl+K** to choose a writing action. Review the result, then choose **Replace**, **Insert**, or **Discard**. To work on the whole note without selecting text, choose **Ask AI...** from the Command Palette.

Save and reorder your own prompts in **Settings → AI**. AI requests use your CLI provider's service and account limits. They send the selected text, note title, nearby context and instruction to that provider; see [privacy and network behavior](./code-signing-policy.md#privacy-and-network-behavior).

### Ask your notes

Choose **Ask Your Notes...** from the Command Palette or the **Edit** menu, then ask a question in any language, such as what a meeting decided. HackDesk finds the passages that best match among the current workspace's notes it already has: every Local Vault note, or the HackMD notes you have opened. It never downloads other notes. Your AI provider answers from those passages only, with tools still off, and marks where each point comes from as `[1]`, `[2]`.

The numbered sources appear above the answer. Choose one, or a `[1]` in the answer, to open that note; the conversation is still there when you open Ask Your Notes again. Follow-up questions include the previous answers, so you can ask "and after that?". **New conversation** starts over, and so does moving to another workspace. If no notes match, HackDesk says so without asking the AI.

## Dictate

Dictation is available on macOS 26 or later and is off by default. Turn it on in **Settings → Dictation** and choose a language. The first time you use a language, choose **Download**: macOS fetches its speech model from Apple once and shares it with other apps.

In a note, press **Cmd+Shift+D** to dictate at the cursor. What you say appears at the cursor as you speak, but the note changes only when you finish. Press **Cmd+Shift+D** again or **Enter** to insert the text, or **Escape** to cancel. A recording stops on its own after five minutes. The first recording asks for microphone access.

The inserted text stays selected. With an AI provider enabled, press **Cmd+K** and choose **Clean up dictation**, first in the list, to remove filler words and fix punctuation. Review the result before replacing the text; undo brings back the original dictation.

## Edit Note Details

Choose **Rename Note** from the note's More actions, the command palette, or **N R** in the leader menu to change a note's title; for a Local Vault note the file takes the new name. Open **Note Details** to inspect metadata. It slides in over the right side of the note, so the editor keeps its width, and takes keyboard focus; press **Escape** to close it and return to the note. HackMD notes also expose tags, permissions, and sharing information where supported. For a Local Vault note, Note Details shows only the notes linking to it.

Local files and HackMD notes have different metadata. Controls reflect the selected workspace; they do not provide full team administration.

For capture outside the main window, use [Quick Hack](./quick-hack.md). For editor modes and appearance, [customize HackDesk](./config.md).
