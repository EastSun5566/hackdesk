<img src="./docs/public/logo.png" alt="HackDesk Logo" width="180">

<sub>The logo credit goes to [@Yukaii](https://github.com/Yukaii)</sub>

# HackDesk

[![HackDesk Version](https://img.shields.io/github/package-json/v/EastSun5566/hackdesk?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/releases)
[![HackDesk Downloads](https://img.shields.io/github/downloads/EastSun5566/hackdesk/total.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/EastSun5566/hackdesk/build.yml?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/actions/workflows/build.yml)
[![License](https://img.shields.io/github/license/EastSun5566/hackdesk.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/blob/main/LICENSE)

> 📝 A hackable HackMD desktop application

📚 Docs: <https://hackdesk.eastsun.me>

## Introduction

HackDesk is an Electron desktop workspace for HackMD and local Markdown vaults.

And you can also follow me on [HackMD](https://hackmd.io/@EastSun5566) 😎

## Installation

```sh
# Tap this repo
brew tap eastsun5566/hackdesk

# Install app
brew install --cask hackdesk

# Optional: If you blocked by macOS
xattr -dr com.apple.quarantine /Applications/HackDesk.app
```

> [!NOTE]
> HackDesk is currently unsigned, so macOS may block the first launch. If that happens, open the app once from Finder with **Right-click → Open**, or allow it in **System Settings → Privacy & Security**.
>
> You can also run:
>
> ```sh
> xattr -dr com.apple.quarantine /Applications/HackDesk.app
> ```

[Full Guide](https://hackdesk.vercel.app/install.html)

## Development

```sh
pnpm install
pnpm approve-builds --all
pnpm run dev
```

Useful checks before dogfooding or opening a PR:

```sh
pnpm run check
pnpm run test:smoke
pnpm run package:check
```

`pnpm run check` runs typechecking, Oxlint, Knip, workflow lint, the pinned HackMD OpenAPI contract, unit tests, and the production build. Packaging uses the tracked icons under `build/`; it does not regenerate assets during routine builds.

Stable `v*` tags are built and published through electron-builder's GitHub provider. The generated `app-update.yml` and release assets are the updater source of truth.

HackDesk requires Node.js 24 or newer. It uses Node 24's native TypeScript type stripping for local scripts and `@typescript/native-preview` for `tsgo`, the TypeScript native preview CLI. `tsgo` is used like `tsc` for typechecking, but it is still a preview toolchain.

The Electron beta reads the same settings file at `~/.hackdesk/settings.json`. The HackMD API token stays in the Electron main process and preload API; renderer code only receives safe settings such as `hasHackmdApiToken`.

If Electron fails to start because its binary was not installed correctly, run:

```sh
pnpm approve-builds --all
pnpm rebuild electron
pnpm run dev
```

This project uses pnpm's approved build scripts. Without approving Electron's postinstall build, `node_modules/electron/dist` can be missing and `pnpm run dev:electron` may fail before the app window opens.
