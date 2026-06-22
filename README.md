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

HackDesk is a desktop application for HackMD, powered by [Tauri](https://tauri.app/). It serves as a lightweight wrapper for [hackmd.io](http://hackmd.io), so you'll find everything you love about HackMD, plus some additional features ✨.

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

## Electron Beta Development

HackDesk still ships the Tauri app as the stable path. The Electron app is a parallel beta for the hybrid native rewrite: native workspace, search, settings, note CRUD, and HackMD web editor fallback.

```sh
pnpm install
pnpm approve-builds --all
pnpm run dev:electron
```

Useful checks before dogfooding or opening a PR:

```sh
pnpm run check:electron
pnpm run package:electron:check
pnpm run test
```

`pnpm run check` runs the `tsgo` typecheck, Oxlint, Knip, GitHub Actions workflow lint, the pinned HackMD OpenAPI contract check, Rust format check, and Clippy. `check:electron` runs the same typecheck baseline, Electron-scoped Oxlint check, Electron unit tests, Electron main/preload build, and renderer build. The normal `pnpm run test` command should still pass because the Tauri source is intentionally kept during Electron parity work.

`package:electron:check` runs the Electron icon generation, bundles the Electron app, and asks electron-builder for an unpacked package with `--dir --publish never`. CI uses it as a package smoke test only; it does not upload or publish Electron artifacts.

Electron beta releases use a separate `electron-v*` release path. The `.github/workflows/electron-release.yml` workflow builds signed Electron installers, uploads them to a GitHub prerelease, and lets the docs build publish updater metadata at `https://hackdesk.eastsun.me/electron-updates/`. The in-app Electron updater is manual-only from Settings; startup auto-check is intentionally disabled for now.

HackDesk requires Node.js 24 or newer. It uses Node 24's native TypeScript type stripping for local scripts and `@typescript/native-preview` for `tsgo`, the TypeScript native preview CLI. `tsgo` is used like `tsc` for typechecking, but it is still a preview toolchain.

The Electron beta reads the same settings file at `~/.hackdesk/settings.json`. The HackMD API token stays in the Electron main process and preload API; renderer code only receives safe settings such as `hasHackmdApiToken`.

If Electron fails to start because the binary was not downloaded or installed correctly, run:

```sh
pnpm approve-builds --all
pnpm rebuild electron
pnpm run dev:electron
```

This project uses pnpm's approved build scripts. Without approving Electron's postinstall build, `node_modules/electron/dist` can be missing and `pnpm run dev:electron` may fail before the app window opens.
