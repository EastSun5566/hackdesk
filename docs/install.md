---
outline: deep
---

<!-- markdownlint-disable MD033 MD041 -->

<script setup>
import { data } from './release.data.ts'
</script>

# Installation

<div v-if="data.notice" class="warning custom-block">
  <p class="custom-block-title">Release details</p>
  <p>{{ data.notice }} <a :href="data.releasesUrl" target="_blank" rel="noreferrer">GitHub Releases</a></p>
</div>

## v2 Beta

On macOS, HackDesk v2 beta requires macOS 13 or later. Beta builds are unsigned and use manual updates. Existing v0.1.5 installs do not update to v2 automatically. Your settings under `~/.hackdesk` are reused.

<template v-if="data.beta">
<p>The current beta is v{{ data.beta.version }}.</p>
<ul>
  <li v-for="link in data.beta.links" :key="link.url"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.label }}</a></li>
</ul>
</template>
<p v-else>No beta download is listed here right now. Find betas on <a :href="data.releasesUrl" target="_blank" rel="noreferrer">GitHub Releases</a>.</p>

On macOS, move HackDesk to Applications, then run:

```sh
xattr -dr com.apple.quarantine "/Applications/HackDesk.app"
```

If that does not work, try to open HackDesk once. Then open **System Settings → Privacy & Security**, scroll to **Security**, and click **Open Anyway**. Authenticate and confirm **Open**.

On Windows, Microsoft Defender SmartScreen may show an unknown publisher warning. Choose **More info → Run anyway** to continue.

Download each new beta manually from [GitHub Releases](https://github.com/EastSun5566/hackdesk/releases).

Report beta problems on [GitHub Issues](https://github.com/EastSun5566/hackdesk/issues).

## Stable release

<p v-if="data.stable">The current stable release is v{{ data.stable.version }}.</p>
<p v-else>Stable downloads are not listed here right now. Find them on <a :href="data.releasesUrl" target="_blank" rel="noreferrer">GitHub Releases</a>.</p>

### macOS

<ul v-if="data.stable">
  <li v-for="link in data.stable.links.filter((item) => item.platform === 'macos')" :key="link.url"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.fileName }}</a> ({{ link.label }})</li>
</ul>

```sh
brew trust --tap eastsun5566/hackdesk && brew install --cask eastsun5566/hackdesk/hackdesk
xattr -dr com.apple.quarantine "/Applications/HackDesk.app"
```

If the Terminal setup does not work, try to open HackDesk once. Then open **System Settings → Privacy & Security**, scroll to **Security**, and click **Open Anyway**. This option is available for about one hour after the failed open attempt. Authenticate and confirm **Open**.

Only use these overrides for HackDesk downloaded from the official tap or GitHub Releases.

### Linux

<ul v-if="data.stable">
  <li v-for="link in data.stable.links.filter((item) => item.platform === 'linux')" :key="link.url"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.fileName }}</a></li>
</ul>

### Windows

<ul v-if="data.stable">
  <li v-for="link in data.stable.links.filter((item) => item.platform === 'windows')" :key="link.url"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.fileName }}</a></li>
</ul>

```sh
winget install EastSun5566.HackDesk
```

You can see all releases on [GitHub](https://github.com/EastSun5566/hackdesk/releases)
