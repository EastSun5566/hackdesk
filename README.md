<img src="./docs/public/logo.png" alt="HackDesk Logo" width="180">

<sub>The logo credit goes to [@Yukaii](https://github.com/Yukaii)</sub>

# HackDesk

[![HackDesk Version](https://img.shields.io/github/package-json/v/EastSun5566/hackdesk?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/releases)
[![HackDesk Downloads](https://img.shields.io/github/downloads/EastSun5566/hackdesk/total.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/EastSun5566/hackdesk/build.yml?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/actions/workflows/build.yml)
[![License](https://img.shields.io/github/license/EastSun5566/hackdesk.svg?style=for-the-badge)](https://github.com/EastSun5566/hackdesk/blob/main/LICENSE)

> 📝 A hackable HackMD desktop application

> [!WARNING]
> This project is actively under development, so expect some bugs & missing features.

## Introduction

### 📚 Docs: <https://hackdesk.eastsun.me>

HackDesk is an unofficial desktop application for HackMD, powered by [Tauri](https://tauri.app/). It serves as a lightweight wrapper for [hackmd.io](http://hackmd.io). So, you'll find everything you love about HackMD and some additional features ✨.

Thanks to Tauri utilizing the OS's native WebView, the bundle size remains [small](https://tauri.app/v1/references/benchmarks#binary-size), and it's memory-efficient. Please keep in mind that this project is actively under development, so expect some bugs & missing features.

You should also check out the official Electron-based [HackMD desktop app](https://github.com/hackmdio/hackmd-desktop), along with some extra features inspired by the [HackMD Raycast extension](https://www.raycast.com/Yukai/hackmd) and [hackbar](https://github.com/uier/hackbar).

This project was largely inspired by [ChatGPT](https://github.com/lencx/ChatGPT) 🙏.

And you can also follow me on [HackMD](https://hackmd.io/@EastSun5566) 😎

## Installation

[Installation Guide](https://hackdesk.vercel.app/install.html)

## Features

[Feature Overview](https://hackdesk.vercel.app/features.html)

## Design Goals

- Should support all [hackmd.io](http://hackmd.io) features
- Should be command-line-friendly
- Should be configurable and extensible

## Development

### Prerequisites

- [Rust v1.71+](https://www.rust-lang.org/learn/get-started)
- [Node.js v18+](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)
- [Pnpm v8+](https://pnpm.io/installation#using-corepack)

### Getting Started

```sh
# install deps
pnpm i

# start dev server for vite and tauri
pnpm dev
```

## License

[AGPL-3.0 License](./LICENSE)
