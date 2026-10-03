---
outline: deep
---

# Configuration

Use **Settings** for normal changes. For manual edits, quit HackDesk first and edit `settings.json`; changes load on the next launch.

HackDesk stores its HackMD API token as OS-encrypted data. Set or replace the token in Settings; do not edit `hackmdApiTokenEncrypted` manually. Existing plaintext tokens migrate on launch. If encryption is unavailable, the existing token is preserved until migration can succeed, and Settings reports the problem. Local Vault and unrelated settings remain usable; unlock your system keyring or disconnect HackMD to clear the stored token. Linux's `basic_text` fallback is not accepted for saving new tokens. Importing from hackmd-cli encrypts HackDesk's copy and leaves the CLI configuration unchanged.

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
