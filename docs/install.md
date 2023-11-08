---
outline: deep
---

# Installation

## MacOS

- Apple Chip: [HackDesk_0.0.5_aarch64.dmg](https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v0.0.5/HackDesk_0.0.5_aarch64.dmg)
- Intel Chip: [HackDesk_0.0.5_x64.dmg](https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v0.0.5/HackDesk_0.0.5_x64.dmg)
- Homebrew
  > WIP

::: tip
Developer cannot be verified?

[Open a Mac app from an unidentified developer](https://support.apple.com/en-sg/guide/mac-help/mh40616/mac)
:::

::: tip

`"HackDesk" is damaged and can't be opened. You should move it to the Trash.`

If you encounter this error message while installing software on macOS, it may be due to security settings restrictions in macOS. To solve this problem, please try the following command in Terminal:

```sh
xattr -cr ~/Applications/HackDesk.app
```

:::

## Linux

- [hack-desk_0.0.5_amd64.AppImage](https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v0.0.5/hack-desk_0.0.5_amd64.AppImage)
- [hack-desk_0.0.5_amd64.deb](https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v0.0.5/hack-desk_0.0.5_amd64.deb)
- [HackDesk_aarch64.app.tar.gz](https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v0.0.5/HackDesk_aarch64.app.tar.gz)
- [HackDesk_x64.app.tar.gz](https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v0.0.5/HackDesk_x64.app.tar.gz)
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

- [HackDesk_0.0.5_x64-setup.exe](https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v0.0.5/HackDesk_0.0.5_x64-setup.exe)
- [HackDesk_0.0.5_x64_en-US.msi](https://github.com/EastSun5566/hackdesk/releases/download/hackdesk-v0.0.5/HackDesk_0.0.5_x64_en-US.msi)
- winget
  > WIP

::: tip

`error code: STATUS_INVALID_IMAGE_HASH`

<https://github.com/tauri-apps/tauri/issues/4659#issuecomment-1452897588>
:::
