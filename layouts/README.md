# Layouts

One folder per layout. The folder name is its id.

```
layouts/<Id>/
  about.json     title, author, version, description, tags
  layout.json    the layout: exactly the file LAYOUT → Export writes
  preview.png    a screenshot of it on the dashboard (optional, ~600 × 340)
```

**Making one:** set up a tab (or several) the way you like, then **LAYOUT → Export this tab** (or Export all tabs) in
the app. It saves a folder in the app's `Layouts` folder that's already laid out like this: `about.json` (filled in
for you: your CMDR name and what's in it), `layout.json` and `preview.png` (a picture of your dashboard as it was).
Open the Layouts folder (LAYOUT → Open Layouts folder), check the description in `about.json` reads well, then upload
the whole folder into `layouts/` here. From the gallery it installs into the same kind of folder, and the app offers to
put it on the dashboard straight away (as new tabs, new pages, added to this page or replacing).

A layout remembers which addons it uses. Here it may only use addons that are **in this gallery** (or installable from
a link), so whoever loads it can get them: the checks refuse a layout that needs an addon only you have. The app
installs any it needs when the layout is loaded.

**Spreadsheet pages come too.** A page that's a spreadsheet travels in `layout.json` with every cell, formula, colour
and column width (a trading log, a colonisation planner…), and the game's functions in it (`SHIP("fuel")`,
`COLONY("remaining")`…) read the game of whoever loads it. The checks only make sure a sheet is one the app made
(1,000 rows × 100 columns at most, proper cell names).

`about.json` is the same as a theme's: `title`, `author`, `version`, `description`, optional `tags`. Add
`"category"` if it suits a play style (`Exploration`, `Mining`, `Combat`, `Trading`…).
