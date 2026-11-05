---
outline: deep
---

# Get started

[Install HackDesk](./install.md), write a note, and choose where to save it.

## Write your first note

This flow is available in [main previews](./install.md#try-a-main-preview). In beta.10, open a Local Vault or connect HackMD first.

1. Write in the draft that opens on first launch. Its first line becomes the title when saved.
2. Press **Cmd+S** on macOS or **Ctrl+S** on Windows/Linux.
3. Choose **Local Vault** to select a Markdown folder, or **HackMD** to connect your account.

Your other initial drafts move into the same workspace but remain unsaved. Canceling setup keeps your text. Drafts reopen when you restart HackDesk; a recovery copy does not replace saving.

## Open a Local Vault

A Local Vault is a folder of Markdown files. No account is required.

1. Choose **Local Vault** when saving your first draft, or **Settings → Vault → Change Vault**.
2. Select a Markdown folder or an empty folder.
3. Select a note in the sidebar to open it.

Each vault keeps its own tabs and recoverable drafts. Opening a vault does not upload its files to HackMD.

## Connect HackMD

1. Create an API token in [HackMD settings](https://hackmd.io/settings#api).
2. Open **Settings → HackMD**.
3. Paste the token into **API Token** and choose **Save**.
4. Open the workspace switcher at the top of the sidebar. Choose **My Workspace** or a team.

HackDesk validates the token and encrypts it with the operating system. Do not include it in shared screenshots or configuration files.

![HackMD settings with an empty API Token field](/api-integration.png)

*HackDesk beta.10. Demonstration data; no token is shown.*

## Create and save a note

1. Select a workspace and, optionally, a folder.
2. Press **Cmd+N** on macOS or **Ctrl+N** on Windows/Linux.
3. Write your note. The first line becomes its title when saved.
4. Press **Cmd+S** / **Ctrl+S**, or choose **Save** in the note toolbar.

Saving writes a Markdown file in a Local Vault or sends the note to HackMD. The dot on the tab clears when the save finishes. A recovery copy protects unsaved work; it does not replace saving.

Next, [arrange notes in panes](./features.md#arrange-tabs-and-panes), [capture a draft with Quick Hack](./quick-hack.md), or [learn the keyboard controls](./keyboard-navigation.md).
