---
outline: deep
---

# Get started

Open a local Markdown folder or connect HackMD, then create and save a note. [Install HackDesk](./install.md) before following these steps.

::: info Version
These guides follow the current v2 development build. Published betas can differ. Screenshots use fictional demonstration data.
:::

## Open a Local Vault

A Local Vault is a folder of Markdown files on your computer. It does not require an account.

1. Open HackDesk and choose **Open local folder**.
2. Select an existing Markdown folder or an empty folder for new notes.
3. Select a note in the navigator to open it.

HackDesk reads Markdown files from the selected folder. [Work with notes](./features.md) explains folders, tabs, and split panes.

## Connect HackMD

Connect your account to browse personal notes and team workspaces.

1. Create an API token in [HackMD settings](https://hackmd.io/settings#api).
2. Open HackDesk **Settings → HackMD**.
3. Paste the token into **API Token** and choose **Save**.
4. Select **My Workspace** or a team in the workspace sidebar.

HackDesk validates and stores the token locally using operating-system encryption. Keep tokens out of shared screenshots and configuration examples.

![HackMD settings showing a fictional connected account without displaying an API token](/api-integration.png)

*V2 development build with a fictional connected account. No token is shown.*

## Create and save a note

Create notes in the selected workspace. In a Local Vault, saving writes a Markdown file; in a HackMD workspace, saving sends the note to HackMD.

1. Select the destination workspace and, optionally, a folder.
2. Choose **New Note** from the command palette or press **Cmd+N** on macOS, **Ctrl+N** on Windows/Linux.
3. Enter a title and Markdown content.
4. Choose **Save** in the document toolbar, or press **Cmd+S** / **Ctrl+S**.

Wait for the dot on the note's tab to clear before treating the note as written to its destination. A recoverable draft is not the same as a saved file or HackMD note.

Continue with [Quick Hack](./quick-hack.md) to capture a draft from another app, or [keyboard navigation](./keyboard-navigation.md) to move through the workbench.
