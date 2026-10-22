# Adding your addon to the gallery

Thanks for making something! Here's how to get it in.

## 1. Make it

1. Copy [`template/`](template) into the `Addons` folder next to `EliteCompanion.exe` and rename the folder. The
   folder name becomes your addon's **id**: letters, digits, `-` and `_`, starting with a letter (e.g. `MiningLog`).
   Pick something that's unlikely to clash with someone else's.
2. Edit `addon.json`, `module.xml` and `script.js`. Save while the app is running and the module reloads straight away;
   mistakes show in orange inside it. The app's `Addons\README.md` explains everything addons can do, and the addons
   that come with the app are good examples to copy from.
3. Use it for a while in real play.

## 2. Check it

`addon.json` needs these for the gallery:

```json
{
  "title": "Mining Log",
  "author": "CMDR You",
  "version": "1.0",
  "description": "What it shows, in a sentence or two (max 400 characters).",
  "category": "Trade, Mining & Missions",
  "tags": ["mining", "log"],
  "web": [],
  "minAppVersion": "1.0",
  "homepage": ""
}
```

- **category:** one of `Commander & Ship`, `Navigation & Travel`, `Combat`, `Exploration`, `Surface & On Foot`,
  `Trade, Mining & Missions`, `Fleet Carrier`, `Powerplay`, `Stats & Logs`, `Colonisation`, or your own.
- **web:** `["edsm"]`, `["spansh"]` or both if your script uses `web.edsm(…)` / `web.spansh(…)`. Nothing else is allowed.
- **minAppVersion:** the oldest Elite Companion it works with (optional).
- **tags** and **homepage** are optional.

The rules (checked automatically on your pull request):

| Allowed | Not allowed |
|---|---|
| `addon.json`, `module.xml`, `script.js`, `lang/*.json`, `preview.png`, `.md` / `.txt` notes | anything else (no `.exe`, `.dll`, `.xaml`…) |
| up to 512 KB a file, 2 MB in all (preview up to 400 KB) | |
| the WPF namespace, `x:` and `controls:` (the app's charts and gauges) in `module.xml` | any other `xmlns`, `ObjectDataProvider`, `XmlDataProvider`, `WebBrowser`, `Frame`, `MediaElement`, `x:Code`, `x:FactoryMethod` / `x:Arguments` |
| buttons with `Tag="name"` + `on("click:name", …)` in the script | event handlers like `Click="…"` |
| `include("_shared/…")` (the app's helpers) | including anything else |
| | links to files or web addresses in `module.xml` (`http://…`, `C:\…`) |

Also, please:

- Use theme colours (`{StaticResource Hud}`, `HudText`, `HudDim`, `Good`, `Warn`, `Danger`…), not `"#FF9830"`, so it
  looks right in every theme, including the light ones.
- Keep it working at any size (`size()` / `on("resize", …)`; see the app's `Addons\README.md`).
- Put texts in `lang/en.json` (and other languages if you can) with `{T key}` in the XAML, so it can be translated.

To run the same checks yourself before sending it (needs Python 3): put your folder in `addons/` in your copy of this
repo and run `python scripts/validate.py`.

## 3. Send it

1. **Fork** this repo (the Fork button, top right).
2. Add your folder as `addons/<YourAddonId>/` in your fork (on github.com: **Add file → Upload files**, drag the
   folder in).
3. Open a **pull request**. Fill in the checklist and add a screenshot.
4. The checks run automatically. If they fail, the pull request page says what to fix: fix it in your fork and the
   checks run again.
5. The gallery's owner reviews it and either merges it or asks for changes. Once merged, it shows in everyone's gallery
   within a few minutes.

## Updating your addon

Send a pull request changing the files in your folder, and **raise `version`** in `addon.json` (e.g. `1.0` → `1.1`):
that's how the app knows there's an update. Only the author (or the gallery's owner) should change an addon.

## Licence

By sending an addon you agree it can be shared under this repo's [licence](LICENSE), and confirm it's your own work
or you have permission to share it.
