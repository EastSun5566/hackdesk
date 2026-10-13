---
outline: deep
---

<script setup>
import { data } from './release.data.ts'
</script>

# Install HackDesk

Download the v2 beta for your platform. Betas are unsigned and use manual updates. For older installations, see [legacy releases](#legacy-releases).

<div v-if="data.notice" class="warning custom-block">
  <p class="custom-block-title">Download information</p>
  <p>{{ data.notice }} <a :href="data.releasesUrl" target="_blank" rel="noreferrer">Check GitHub Releases</a> for current downloads.</p>
</div>

## Download the v2 beta

<template v-if="data.beta">
<p>The current published beta is v{{ data.beta.version }}. Choose your platform:</p>
<ul>
  <li v-for="link in data.beta.links" :key="link.url"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.label }}</a></li>
</ul>
</template>
<p v-else>No beta download is available in this listing. Check <a :href="data.releasesUrl" target="_blank" rel="noreferrer">GitHub Releases</a>.</p>

V2 guides and demonstration screenshots follow the current development build. Some details can differ from the published beta.

### macOS

V2 requires macOS 13 or later. Choose the Apple silicon or Intel disk image and move HackDesk to Applications.

For an unsigned build downloaded from the official repository, remove its quarantine attribute:

```sh
xattr -dr com.apple.quarantine "/Applications/HackDesk.app"
```

If macOS still blocks launch, try opening HackDesk once. Then open **System Settings → Privacy & Security → Open Anyway**, authenticate, and confirm **Open**.

### Windows

Download and run the x64 installer. An unsigned beta can show a Microsoft Defender SmartScreen warning. For the official download, choose **More info → Run anyway** to continue.

### Linux

Download the x64 AppImage and allow it to run. Replace the example name with your downloaded file:

```sh
chmod +x ./hackdesk_download.AppImage
./hackdesk_download.AppImage
```

## Update a beta

Save open notes, quit HackDesk, and download the next beta manually. V2 reuses the settings folder at `~/.hackdesk` or `%USERPROFILE%\.hackdesk`.

If upgrading from beta.4 or earlier, save all edits before closing the old version. Beta.4 cannot restore unsaved edits to existing notes after restart.

V0.1.x does not update to v2 automatically. Install the v2 beta separately, following the platform steps above.

## Try a main preview

[GitHub Releases](https://github.com/EastSun5566/hackdesk/releases) also lists `main-<commit>` previews after CI passes. These builds include newer changes, are unsigned, and require manual installation and updates. Choose a published beta when you do not need a specific main change.

## Legacy releases

The stable download channel currently contains the older v0.1 series. Its installers and package-manager entries are separate from v2 beta downloads.

<template v-if="data.stable">
<p>The listed stable release is v{{ data.stable.version }}.</p>
<ul>
  <li v-for="link in data.stable.links" :key="link.url"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.label }}</a></li>
</ul>
</template>
<p v-else>Find older releases on <a :href="data.releasesUrl" target="_blank" rel="noreferrer">GitHub Releases</a>.</p>

### macOS legacy install

The Homebrew cask currently installs v0.1.5, not the v2 beta. Trust the official tap, install it, then remove quarantine:

```sh
brew trust --tap eastsun5566/hackdesk && brew install --cask eastsun5566/hackdesk/hackdesk
xattr -dr com.apple.quarantine "/Applications/HackDesk.app"
```

If needed, use the **Open Anyway** steps above. Only use these overrides for official HackDesk downloads.

### Windows legacy install

For the older Windows package, use:

```sh
winget install EastSun5566.HackDesk
```

Report installation problems on [GitHub Issues](https://github.com/EastSun5566/hackdesk/issues). See the [Code signing policy](./code-signing-policy.md) for current signing status.
