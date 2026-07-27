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

- [macOS · Apple silicon](https://github.com/EastSun5566/hackdesk/releases/download/v2.0.0-beta.3/HackDesk-2.0.0-beta.3-arm64.dmg)
- [macOS · Intel](https://github.com/EastSun5566/hackdesk/releases/download/v2.0.0-beta.3/HackDesk-2.0.0-beta.3-x64.dmg)
- [Windows · x64](https://github.com/EastSun5566/hackdesk/releases/download/v2.0.0-beta.3/HackDesk-2.0.0-beta.3-x64.exe)
- [Linux · x64 AppImage](https://github.com/EastSun5566/hackdesk/releases/download/v2.0.0-beta.3/HackDesk-2.0.0-beta.3-x86_64.AppImage)

On macOS, move HackDesk to Applications, then run:

```sh
xattr -dr com.apple.quarantine "/Applications/HackDesk.app"
```

If that does not work, try to open HackDesk once. Then open **System Settings → Privacy & Security**, scroll to **Security**, and click **Open Anyway**. Authenticate and confirm **Open**.

On Windows, Microsoft Defender SmartScreen may show an unknown publisher warning. Choose **More info → Run anyway** to continue.

Download each new beta manually from [GitHub Releases](https://github.com/EastSun5566/hackdesk/releases).

Report beta problems on [GitHub Issues](https://github.com/EastSun5566/hackdesk/issues).

## Stable release

The current stable release is v{{data.version}}.

### macOS

- Apple Chip: <a :href="`${data.releaseDownloadBaseUrl}/HackDesk_${data.version}_aarch64.dmg`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_aarch64.dmg</a>
- Intel Chip: <a :href="`${data.releaseDownloadBaseUrl}/HackDesk_${data.version}_x64.dmg`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_x64.dmg</a>

```sh
brew trust --tap eastsun5566/hackdesk && brew install --cask eastsun5566/hackdesk/hackdesk
xattr -dr com.apple.quarantine "/Applications/HackDesk.app"
```

If the Terminal setup does not work, try to open HackDesk once. Then open **System Settings → Privacy & Security**, scroll to **Security**, and click **Open Anyway**. This option is available for about one hour after the failed open attempt. Authenticate and confirm **Open**.

Only use these overrides for HackDesk downloaded from the official tap or GitHub Releases.

### Linux

- <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-x64.AppImage`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-x64.AppImage</a>

### Windows

- <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-x64.exe`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-x64.exe</a>

```sh
winget install EastSun5566.HackDesk
```

You can see all releases on [GitHub](https://github.com/EastSun5566/hackdesk/releases)
