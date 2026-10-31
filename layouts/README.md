# Layouts

One folder per layout. The folder name is its id.

```
layouts/<Id>/
  about.json     title, author, version, description, tags
  layout.json    the layout: exactly the file LAYOUT → Export writes
  preview.png    a screenshot of it on the dashboard (optional, ~600 × 340)
```

**Making one:** set up a tab (or several) the way you like, then **LAYOUT → Export** in the app. That file
(`<name>.ecl.json`) is your `layout.json`. From the gallery it installs into the app's `Layouts` folder, and the app
offers to put it on the dashboard straight away (as new tabs, new pages, added to this page or replacing).

A layout remembers which addons it uses. Here it may only use addons that are **in this gallery** (or installable from
a link), so whoever loads it can get them: the checks refuse a layout that needs an addon only you have. The app
installs any it needs when the layout is loaded.

`about.json` is the same as a theme's: `title`, `author`, `version`, `description`, optional `tags`. Add
`"category"` if it suits a play style (`Exploration`, `Mining`, `Combat`, `Trading`…).
