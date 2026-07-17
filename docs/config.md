---
outline: deep
---

# Configuration

Use **Settings** for normal changes. For manual edits, quit HackDesk first and edit `settings.json`; changes load on the next launch.

| OS      | Path                            |
| ------- | ------------------------------- |
| macOS   | `/Users/<USERNAME>/.hackdesk`   |
| Linux   | `/home/<USERNAME>/.hackdesk`    |
| Windows | `C:\Users\<USERNAME>\.hackdesk` |

```sh
tree ~/.hackdesk

.hackdesk/
└── settings.json
```

```json
{
  "title": "HackDesk",
  "appearance": {
    "theme": "system",
    "presetId": "hackmd-neo"
  },
  "editor": {
    "mode": "vim"
  },
  "shortcuts": {
    "open-command-palette": "mod+j"
  }
}
```

HackDesk validates this file and fills in omitted settings with safe defaults. Manage the HackMD token and Local Vault folder from the app; do not copy secrets or machine-specific paths into shared config.

Use **Settings → Advanced → Reset All Settings** to reset HackDesk without deleting Local Vault files.
