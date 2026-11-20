---
description: Choose, verify, and install an official HackDesk beta with a coding agent.
---

# Install with an agent

Give your agent this request:

> Read https://hackdesk.eastsun.me/install-agent.md and help me install the latest published HackDesk v2 beta for my operating system and processor. Check the official download and preserve my existing notes and settings.

The [documentation index](/llms.txt) links to Markdown guides. [llms-full.txt](/llms-full.txt) contains the complete guides.

## Choose a release

1. Identify the operating system and processor. On macOS, run `uname -m`: `arm64` means Apple silicon; `x86_64` means Intel. V2 requires macOS 13 or later.
2. Read the [official release listing](https://api.github.com/repos/EastSun5566/hackdesk/releases). Follow pagination when needed. Choose the most recently published, non-draft tag matching `v2.0.0-beta.<number>`.
3. Read that release's notes and assets. Skip `main-<commit>` previews unless requested. GitHub's latest stable release, Homebrew, and WinGet currently refer to the older v0.1 series.

| System | Asset suffix | Install |
| --- | --- | --- |
| macOS, Apple silicon | `-arm64.zip` or `-arm64.dmg` | Extract the ZIP or mount the DMG; move `HackDesk.app` to Applications. |
| macOS, Intel | `-x64.zip` or `-x64.dmg` | Extract the ZIP or mount the DMG; move `HackDesk.app` to Applications. |
| Windows, x64 | `-x64.exe` | Run the installer. |
| Linux, x64 | `-x86_64.AppImage` | Make the downloaded AppImage executable, then launch it. |

Windows and Linux releases provide x64 builds. Do not substitute one for a native ARM build.

## Download and verify

Use an asset's `browser_download_url` from the official listing, or use GitHub CLI. Replace `TAG`, `ASSET`, and `DIRECTORY` with the selected release tag, exact asset name, and a new download directory:

```sh
gh release download TAG --repo EastSun5566/hackdesk \
  --pattern ASSET --dir DIRECTORY
```

Compare the file's byte size and SHA-256 with that asset's `size` and `digest` fields in the GitHub API response. The digest has the form `sha256:<hex>`.

- macOS: `shasum -a 256 PATH_TO_DOWNLOAD`
- Linux: `sha256sum PATH_TO_DOWNLOAD`
- Windows PowerShell: `Get-FileHash -Algorithm SHA256 -LiteralPath PATH_TO_DOWNLOAD`

Stop if the download is incomplete, the digest is missing, or either value differs. Do not use a mirror or a different file as a fallback. Matching the digest checks the download; it does not make an unsigned app signed or notarized.

## Install and open

Save open notes and quit HackDesk before replacing an existing app. Preserve its notes, Local Vault folders, `~/.hackdesk` (Windows: `%USERPROFILE%\.hackdesk`), and Electron app data. Do not downgrade without checking the release's migration notes.

On macOS, extract a ZIP with:

```sh
ditto -x -k PATH_TO_DOWNLOAD NEW_EXTRACTION_DIRECTORY
```

Move the extracted app to Applications. Betas are unsigned. Explain any macOS quarantine or Windows SmartScreen warning before proceeding; follow the [platform installation steps](./install.md). Do not disable Gatekeeper globally. Downloads made by `gh` normally avoid browser quarantine, but remain unsigned.

On Linux, run `chmod +x PATH_TO_DOWNLOAD`, then launch the AppImage. Do not add `--no-sandbox` to work around a launch failure.

Open HackDesk and confirm its version matches the selected tag. Start with a blank draft or a test folder. Connecting HackMD is optional; do not request tokens in chat or enable AI and dictation as part of installation.
