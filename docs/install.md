---
outline: deep
---

<script setup>
import { data } from './release.data.ts'
</script>

# Installation

## MacOS

- Apple Chip: <a :href="`https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v${data.version}/HackDesk_${data.version}_aarch64.dmg`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_aarch64.dmg</a>
- Intel Chip: <a :href="`https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v${data.version}/HackDesk_${data.version}_x64.dmg`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_x64.dmg</a>
- Homebrew

  ```sh
  # Tap repo
  brew tap eastsun5566/hackdesk

  # Install app (use `--no-quarantine` for unsigned apps)
  brew install --cask hackdesk --no-quarantine
  ```

::: tip
Developer cannot be verified?

[Open a Mac app from an unidentified developer](https://support.apple.com/en-sg/guide/mac-help/mh40616/mac)
:::

::: tip

`"HackDesk" is damaged and can't be opened. You should move it to the Trash.`

If you encounter this error message while installing software on macOS, it may be due to security settings restrictions in macOS. To solve this problem, please try the following command in Terminal:

```sh
xattr -cr /Applications/HackDesk.app
```

:::

## Linux

- <a :href="`https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v${data.version}/hack-desk_${data.version}_amd64.AppImage`" target="_blank" rel="noreferrer">hack-desk\_{{data.version}}\_amd64.AppImage</a>
- <a :href="`https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v${data.version}/hack-desk_${data.version}_amd64.deb`" target="_blank" rel="noreferrer">hack-desk\_{{data.version}}\_amd64.deb</a>
- Flatpak
  > WIP
- AUR
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

- <a :href="`https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v${data.version}/HackDesk_${data.version}_x64-setup.exe`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_x64-setup.exe</a>
- <a :href="`https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v${data.version}/HackDesk_${data.version}_x64_en-US.msi`" target="_blank" rel="noreferrer">HackDesk\_{{data.version}}\_x64_en-US.msi</a>
- winget
  > WIP

::: tip

`error code: STATUS_INVALID_IMAGE_HASH`

<https://github.com/tauri-apps/tauri/issues/4659#issuecomment-1452897588>
:::

---

You can see all releases on [GitHub](https://github.com/EastSun5566/hackdesk/releases)
