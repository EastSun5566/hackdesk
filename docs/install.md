---
outline: deep
---

<!-- markdownlint-disable MD033 MD041 -->

<script setup>
import { data } from './release.data.ts'
</script>

# Installation

## macOS

- Apple Chip: <a :href="`${data.releaseDownloadBaseUrl}/HackDesk_${data.version}_aarch64.dmg`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_aarch64.dmg</a>
- Intel Chip: <a :href="`${data.releaseDownloadBaseUrl}/HackDesk_${data.version}_x64.dmg`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_x64.dmg</a>
- Homebrew tap ([`EastSun5566/homebrew-hackdesk`](https://github.com/EastSun5566/homebrew-hackdesk))

  ```sh
  # Tap this repo
  brew tap eastsun5566/hackdesk

  # Install app
  brew install --cask hackdesk
  ```

::: tip
HackDesk is currently unsigned, so macOS may block the first launch. If that happens, open the app once from Finder with **Right-click → Open**, or allow it in **System Settings → Privacy & Security**.

Developer cannot be verified?

[Open a Mac app from an unidentified developer](https://support.apple.com/en-sg/guide/mac-help/mh40616/mac)
:::

::: tip

`"HackDesk" is damaged and can't be opened. You should move it to the Trash.`

If you trust the app and prefer the Terminal, you can remove the quarantine attribute manually:

```sh
xattr -dr com.apple.quarantine /Applications/HackDesk.app
```

:::

## Linux

- <a :href="`${data.releaseDownloadBaseUrl}/hack-desk_${data.version}_amd64.AppImage`" target="_blank" rel="noreferrer">hack-desk\_{{data.version}}\_amd64.AppImage</a>
- <a :href="`${data.releaseDownloadBaseUrl}/hack-desk_${data.version}_amd64.deb`" target="_blank" rel="noreferrer">hack-desk\_{{data.version}}\_amd64.deb</a>
- Flatpak / AUR
  > WIP

::: tip
Download `.deb` installer, advantage small size, disadvantage poor compatibility.
`tar.gz` Works reliably, you can try it if `.deb` fails to run.
:::

::: tip

`error while loading shared libraries: libthai.so.0: cannot open shared object file: No such file or directory`

If you encounter this problem, please install the libthai package.It's a issue caused by AppImage packaging.
:::

## Windows

- <a :href="`${data.releaseDownloadBaseUrl}/HackDesk_${data.version}_x64-setup.exe`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_x64-setup.exe</a>
- <a :href="`${data.releaseDownloadBaseUrl}/HackDesk_${data.version}_x64_en-US.msi`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_x64_en-US.msi</a>
- winget

  ```sh
  winget install EastSun5566.HackDesk
  ```

::: tip

`error code: STATUS_INVALID_IMAGE_HASH`

<https://github.com/tauri-apps/tauri/issues/4659#issuecomment-1452897588>
:::

---

You can see all releases on [GitHub](https://github.com/EastSun5566/hackdesk/releases)
