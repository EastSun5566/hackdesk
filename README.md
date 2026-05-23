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
```

> [!NOTE]
> HackDesk is currently unsigned, so macOS may block the first launch. If that happens, open the app once from Finder with **Right-click → Open**, or allow it in **System Settings → Privacy & Security**.
>
> If you trust the app and prefer the terminal, you can run
>
> ```sh
> xattr -dr com.apple.quarantine /Applications/HackDesk.app
> ```

[Full Guide](https://hackdesk.vercel.app/install.html)
