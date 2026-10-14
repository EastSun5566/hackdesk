<img src="./docs/public/logo.png" alt="HackDesk Logo" width="180">

<sub>The logo credit goes to [@Yukaii](https://github.com/Yukaii)</sub>

# HackDesk

[![HackDesk Version](https://img.shields.io/github/package-json/v/EastSun5566/hackdesk?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/releases)
[![HackDesk Downloads](https://img.shields.io/github/downloads/EastSun5566/hackdesk/total.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/EastSun5566/hackdesk/build.yml?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/actions/workflows/build.yml)
[![License](https://img.shields.io/github/license/EastSun5566/hackdesk.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/blob/main/LICENSE)

> 📝 A hackable HackMD desktop application

Work with HackMD notes and local Markdown vaults.

- **HackMD:** Browse personal and team notes, organize folders, and view history.
- **Local Vault:** Open a folder of Markdown files without an account.
- **Customize:** Change themes, fonts, editor modes, and shortcuts in Settings.

## Install

[Download HackDesk v2.0.0-beta.6](https://github.com/EastSun5566/hackdesk/releases/tag/v2.0.0-beta.6) for macOS, Windows, or Linux. On macOS, v2 requires macOS 13 or later. Beta builds are unsigned and use manual updates.

Save all open notes before upgrading from beta.4 or earlier; those versions cannot restore unsaved edits to existing notes after a restart.

See the [installation guide](https://hackdesk.eastsun.me/install) for platform steps and the [code signing policy](docs/code-signing-policy.md) for signing status.

### Main previews

[Releases](https://github.com/EastSun5566/hackdesk/releases) also lists `main-<commit>` previews after CI passes. These builds include newer changes, are unsigned, and use manual updates.

### Legacy macOS install

Homebrew currently installs v0.1.5, not the v2 beta:

```sh
brew trust --tap eastsun5566/hackdesk && brew install --cask eastsun5566/hackdesk/hackdesk
xattr -dr com.apple.quarantine "/Applications/HackDesk.app"
```

## Guides

[Get started](docs/intro.md) · [Work with notes](docs/features.md) · [Quick Hack](docs/quick-hack.md) · [Keyboard navigation](docs/keyboard-navigation.md) · [Customize HackDesk](docs/config.md)

The [documentation website](https://hackdesk.eastsun.me) follows the current v2 development build. Published betas can differ.

## Development

Use Node.js 24 and the pnpm version specified in `package.json`.

```sh
pnpm install
pnpm approve-builds --all
pnpm run dev
```

Run `pnpm run check` before opening a pull request.
