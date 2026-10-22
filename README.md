# Elite Companion · Addon Gallery

Community-made modules for [Elite Companion](https://github.com/DuaLVII/Elite-Companion), the Elite Dangerous
companion app.

## Installing addons

**In the app:** open **MODULES → Addon gallery**, pick one and press **Install**. It lands in your `Addons` folder and
appears in the MODULES list straight away. Updates show up there too.

**By hand:** download the addon's folder from [`addons/`](addons) and put it in the `Addons` folder next to
`EliteCompanion.exe`.

## What's safe about addons

- **Every addon is reviewed** before it's added here. Nothing is published without the owner approving it.
- **Every addon is checked automatically** on each change (`scripts/validate.py`): only the app's own building blocks
  are allowed in the look (`module.xml`), nothing that can run programs, read files or load web pages.
- **Scripts are sandboxed by the app:** no access to your files or the internet. An addon can only ask the app to
  fetch from EDSM or Spansh's public APIs, and only if it says so in `addon.json` (the gallery shows "online: EDSM").
- **Downloads are verified:** the app checks every file against the hash in `index.json` before installing.

Found a problem with an addon? [Open an issue](../../issues/new/choose).

## Making your own

See **[CONTRIBUTING.md](CONTRIBUTING.md)**. In short: copy [`template/`](template), make it yours, try it in the app,
then send a pull request adding it as `addons/<YourAddonId>/`. The full guide to what addons can do is the
`Addons\README.md` that comes with the app.

## How this repo works

```
addons/<Id>/          one folder per addon (the folder name is its id)
  addon.json          title, author, version, description, category…
  module.xml          the look (WPF XAML)
  script.js           the logic (optional)
  lang/en.json …      its texts in each language (optional)
  preview.png         a screenshot for the gallery (optional, ~600 × 340)
template/             a starting point to copy
(index.json)          the list the app reads: built after every merge and published on the "gallery" release
scripts/validate.py   the safety and format checks (runs on every pull request)
scripts/build_index.py  builds index.json (runs after every merge)
```
