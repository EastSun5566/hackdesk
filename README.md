<img src="./docs/public/logo.png" alt="HackDesk Logo" width="180">

<sub>The logo credit goes to [@Yukaii](https://github.com/Yukaii)</sub>

# HackDesk

[![HackDesk Version](https://img.shields.io/github/package-json/v/EastSun5566/hackdesk?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/releases)
[![HackDesk Downloads](https://img.shields.io/github/downloads/EastSun5566/hackdesk/total.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/EastSun5566/hackdesk/build.yml?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/actions/workflows/build.yml)
[![License](https://img.shields.io/github/license/EastSun5566/hackdesk.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/blob/main/LICENSE)

> 📝 A hackable HackMD desktop application

HackDesk works directly with the HackMD API and local Markdown vaults.

- **HackMD API-native:** Work with notes, folders, teams, history, and sharing.
- **Local-first:** Open any folder as a portable Markdown vault.
- **Hackable:** Tune themes, fonts, editor modes, and shortcuts in the UI or `~/.hackdesk/settings.json`.

## Install v2 beta

v2 beta builds are unsigned and use manual updates.

[Download HackDesk v2.0.0-beta.3](https://github.com/EastSun5566/hackdesk/releases/tag/v2.0.0-beta.3)

The stable v0.1.5 release remains available through Homebrew:

```sh
brew tap eastsun5566/hackdesk
brew install --cask hackdesk

# Optional
xattr -dr com.apple.quarantine /Applications/HackDesk.app
```

[Documentation](https://hackdesk.eastsun.me)

## Development

```sh
pnpm install
pnpm approve-builds --all
pnpm run dev
```

Run `pnpm run check` before opening a pull request.
