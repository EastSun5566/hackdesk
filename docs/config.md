---
outline: deep
---

# Application Config

| OS      | Path                            |
| ------- | ------------------------------- |
| MacOS   | `/Users/<USERNAME>/.hackdesk`   |
| Linux   | `/home/<USERNAME>/.hackdesk`    |
| Windows | `C:\Users\<USERNAME>\.hackdesk` |

```sh
tree ~/.hackdesk

.hackdesk/ # App config directory
└── settings.json # App settings file
```

```sh
cat ~/.hackdesk/settings.json

{
  "title": "HackDesk" # currently only can change the title bar
}
```

---

You can remove this directory to reset the application settings.

```sh
rm -rf ~/.hackdesk
```
