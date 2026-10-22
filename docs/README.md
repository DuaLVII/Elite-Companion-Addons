# Addon guide

Everything you need to make your own Elite Companion modules, from a first "hello" to publishing in the gallery.

An addon is a folder with up to three files: **addon.json** (its name and details), **module.xml** (what it looks
like) and **script.js** (what it does). The app loads it like a built-in module: you can add copies of it, move it,
resize it, pop it out and put it on any tab.

## Start here

1. **[Your first addon](01-first-addon.md)**: a working module in about ten minutes.
2. **[addon.json](02-addon-json.md)**: name, category, version and the rest.
3. **[module.xml: the look](03-module-xml.md)**: layout, bindings, styles, theme colours, lists, buttons.
4. **[script.js: the logic](04-script.md)**: every function a script can use.

## Reference

- **[Journal events](05-journal-events.md)**: how events reach your script, replays, history, and the events you'll use most.
- **[Game state](06-game-state.md)**: everything `Game.…` / `game.…` can tell you without a script.
- **[Charts and fitting any size](07-charts-and-sizes.md)**: the app's graphs and gauges, and narrow / wide modules.
- **[Languages](08-languages.md)**: translating your addon.
- **[Going online: EDSM and Spansh](09-online.md)**: fetching data from the two allowed sites.
- **[Recipes](10-recipes.md)**: copy-paste patterns for common jobs (counting per day, countdowns, each event once…).
- **[Safety rules](11-safety.md)**: what module.xml can and can't contain, and why.

## Sharing

- **[Publishing to the gallery](12-publishing.md)**: from your Addons folder to everyone's app.
- **[Troubleshooting](13-troubleshooting.md)**: the orange error text, and the usual mistakes.

## Good to know

- **Live reload:** save any file while the app is running and every copy of the module reloads at once. Mistakes show
  in orange inside the module (script errors with the line number) instead of crashing anything.
- **Learn from the built-in addons:** the `Addons` folder next to `EliteCompanion.exe` has 21 of them (Bounty Board,
  Ship Loadout, Body Scanner, the fleet carrier, Powerplay and surface sets, Kill Tracker…). Copy freely.
- **The journal itself** is documented at [elite-journal.readthedocs.io](https://elite-journal.readthedocs.io/): every
  event and field the game writes.

Spotted something wrong or missing in this guide? Pull requests to `docs/` are welcome.
