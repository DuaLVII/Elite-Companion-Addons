# addon.json

The addon's details. All optional for your own use (without it, the folder name is the title), but the gallery needs
`title`, `author`, `version`, `description` and `category`. `// comments` and trailing commas are allowed.
[← Guide](README.md)

```json
{
  "title": "Mining Log",
  "author": "CMDR You",
  "version": "1.2",
  "description": "What it shows, in a sentence or two.",
  "category": "Trade, Mining & Missions",
  "tags": ["mining", "log"],
  "web": ["edsm"],
  "minAppVersion": "1.0",
  "homepage": "https://github.com/you/mining-log",
  "view": "module.xml",
  "script": "script.js"
}
```

| Field | What it's for |
|---|---|
| `title` | The module's name in MODULES and on its title bar. |
| `author` | You. Shown in the gallery. |
| `version` | `1.0`, `1.2.3`… Raise it with every update you publish: that's how the app knows there's an update. |
| `description` | Shown when hovering the module in MODULES, and in the gallery (max 400 characters there). |
| `category` | Where it's listed in MODULES: `Commander & Ship`, `Navigation & Travel`, `Combat`, `Exploration`, `Surface & On Foot`, `Trade, Mining & Missions`, `Fleet Carrier`, `Powerplay`, `Stats & Logs`, `Colonisation`. Short forms work (`combat`, `carrier`…). Anything else makes a new category; none puts it under **Addons**. |
| `tags` | Words people can search the gallery for. |
| `web` | The sites the script may fetch from: `"edsm"`, `"spansh"` or both. See [Going online](09-online.md). |
| `minAppVersion` | The oldest app version it works with. Older apps see "Needs Elite Companion x.y". |
| `homepage` | An `https://` link shown as "More info" in the gallery. |
| `view` / `script` | Other file names for the look and logic (rarely needed). |

The texts (`title`, `description`) can be translated too: see [Languages](08-languages.md).
