---
outline: deep
---

<!-- markdownlint-disable MD033 MD041 -->

<script setup>
import { data } from './release.data.ts'
</script>

# Installation

## v2 Beta

HackDesk v2 beta is unsigned and uses manual updates. Existing v0.1.5 installs do not update to v2 automatically. Your settings under `~/.hackdesk` are reused.

- [macOS · Apple silicon](https://github.com/EastSun5566/hackdesk/releases/download/v2.0.0-beta.2/HackDesk-2.0.0-beta.2-arm64.dmg)
- [macOS · Intel](https://github.com/EastSun5566/hackdesk/releases/download/v2.0.0-beta.2/HackDesk-2.0.0-beta.2-x64.dmg)
- [Windows · x64](https://github.com/EastSun5566/hackdesk/releases/download/v2.0.0-beta.2/HackDesk-2.0.0-beta.2-x64.exe)
- [Linux · x64 AppImage](https://github.com/EastSun5566/hackdesk/releases/download/v2.0.0-beta.2/HackDesk-2.0.0-beta.2-x64.AppImage)

On macOS, use **Right-click → Open** in Finder. If macOS still blocks the app, allow it under **System Settings → Privacy & Security**.

On Windows, Microsoft Defender SmartScreen may show an unknown publisher warning. Choose **More info → Run anyway** to continue.

Download each new beta manually from [GitHub Releases](https://github.com/EastSun5566/hackdesk/releases).

Report beta problems on [GitHub Issues](https://github.com/EastSun5566/hackdesk/issues).

## Stable release

The current stable release is v{{data.version}}.

### macOS

- Apple Chip: <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-arm64.dmg`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-arm64.dmg</a>
- Intel Chip: <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-x64.dmg`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-x64.dmg</a>
- Homebrew tap ([`EastSun5566/homebrew-hackdesk`](https://github.com/EastSun5566/homebrew-hackdesk))

  ```sh
  # Tap this repo
  brew tap eastsun5566/hackdesk

  # Install app
  brew install --cask hackdesk
  ```

v0.1.5 is unsigned. If macOS blocks it, use **Right-click → Open**.

### Linux

- <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-x64.AppImage`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-x64.AppImage</a>

### Windows

- <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-x64.exe`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-x64.exe</a>
- winget

  ```sh
  winget install EastSun5566.HackDesk
  ```

You can see all releases on [GitHub](https://github.com/EastSun5566/hackdesk/releases)
