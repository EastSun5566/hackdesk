<img src="./docs/public/logo.png" alt="HackDesk Logo" width="180">

<sub>The logo credit goes to [@Yukaii](https://github.com/Yukaii)</sub>

# HackDesk (WIP)

[![HackDesk Downloads](https://img.shields.io/github/downloads/EastSun5566/hackdesk/total.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/EastSun5566/hackdesk/release.yml?style=for-the-badge)](https://github.com/EastSun5566/cc-gram/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/EastSun5566/hackdesk.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/blob/main/LICENSE)

> 📝 An unofficial HackMD desktop app

## Introduction

### 📚 Docs: <https://hackdesk.vercel.app>

HackDesk is an unofficial desktop application for HackMD, powered by [Tauri](https://tauri.app/). It serves as a lightweight wrapper for [hackmd.io](http://hackmd.io). So, you'll find everything you love about HackMD and some additional features ✨.

Thanks to Tauri utilizing the OS's native WebView, the bundle size remains [small](https://tauri.app/v1/references/benchmarks#binary-size), and it's memory-efficient. Please keep in mind that this project is actively under development, so expect some bugs & missing features.

You should also check out the official Electron-based [HackMD desktop app](https://github.com/hackmdio/hackmd-desktop), along with some extra features inspired by the [HackMD Raycast extension](https://www.raycast.com/Yukai/hackmd) and [hackbar](https://github.com/uier/hackbar).

This project was largely inspired by [ChatGPT](https://github.com/lencx/ChatGPT) and [WA+](https://github.com/lencx/WA). Special thanks to [@lencx](https://github.com/lencx) 🙏.

And You can also follow me on [HackMD](https://hackmd.io/@EastSun5566) 😎

## Design Goals

- Should support all [hackmd.io](http://hackmd.io) features
- Should be command-line-friendly
- Should be configurable and extensible

## Features

- Multi-platform: macOS Linux Windows
- Command Palette
  - <kbd>CmdOrCtrl</kbd> + <kbd>K</kbd>
  - A quick way to execute commands or search.
- Custom settings
  - <kbd>CmdOrCtrl</kbd> + <kbd>,</kbd>
  - You can change the theme, shortcut, and preferences.

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/learn/get-started)
- [Node.js v16+](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)
- Pnpm

```sh
corepack enable
```

### Getting Started

```sh
# install deps
pnpm i

# start dev server for vite and tauri
pnpm dev
```

## License

[AGPL-3.0 License](./LICENSE)
