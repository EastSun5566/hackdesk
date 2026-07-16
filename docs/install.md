---
outline: deep
---

<!-- markdownlint-disable MD033 MD041 -->

<script setup>
import { data } from './release.data.ts'
</script>

# Installation

## macOS

- Apple Chip: <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-arm64.dmg`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-arm64.dmg</a>
- Intel Chip: <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-x64.dmg`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-x64.dmg</a>
- Homebrew tap ([`EastSun5566/homebrew-hackdesk`](https://github.com/EastSun5566/homebrew-hackdesk))

  ```sh
  # Tap this repo
  brew tap eastsun5566/hackdesk

  # Install app
  brew install --cask hackdesk

  # Optional: If you blocked by macOS
  xattr -dr com.apple.quarantine /Applications/HackDesk.app
  ```

::: tip

HackDesk is currently unsigned, so macOS may block the first launch. If that happens, open the app once from Finder with **Right-click → Open**, or allow it in **System Settings → Privacy & Security**.

---

`Developer cannot be verified?`

[Open a Mac app from an unidentified developer](https://support.apple.com/en-sg/guide/mac-help/mh40616/mac)

---

`"HackDesk.app" is damaged and can't be opened. You should move it to the Trash.`

You can run:

```sh
xattr -dr com.apple.quarantine /Applications/HackDesk.app
```

:::

## Linux

- <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-x64.AppImage`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-x64.AppImage</a>
- Flatpak / AUR
  > WIP

::: tip

Download `.deb` installer, advantage small size, disadvantage poor compatibility.
`tar.gz` Works reliably, you can try it if `.deb` fails to run.

---

`error while loading shared libraries: libthai.so.0: cannot open shared object file: No such file or directory`

If you encounter this problem, please install the libthai package.It's a issue caused by AppImage packaging.

:::

## Windows

- <a :href="`${data.releaseDownloadBaseUrl}/HackDesk-${data.version}-x64.exe`" target="_blank" rel="noreferrer">HackDesk-{{data.version}}-x64.exe</a>
- winget

  ```sh
  winget install EastSun5566.HackDesk
  ```

You can see all releases on [GitHub](https://github.com/EastSun5566/hackdesk/releases)
