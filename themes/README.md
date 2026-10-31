# Themes

One folder per theme. The folder name is its id.

```
themes/<Id>/
  about.json     title, author, version, description, tags
  theme.json     the theme itself: exactly the file the app saves in its Themes folder
  preview.png    a screenshot of the app wearing it (optional, ~600 × 340)
```

**Making one:** in the app, **SETTINGS → THEME → ＋ New theme** (or ✎ Edit this theme), then **Save**. The file it
writes in the app's `Themes` folder is your `theme.json`. Installing from the gallery puts it back in that folder as
`<Id>.json`, and it shows under SETTINGS → THEME like any other.

`about.json`:

```json
{
  "title": "Cobalt",
  "author": "CMDR You",
  "version": "1.0",
  "description": "Deep navy with ice-blue highlights.",
  "tags": ["blue", "dark"]
}
```

Raise `version` when you change it, so everyone who has it gets the update. Themes only hold colours, a font name and
style settings: the checks make sure every colour is a colour.
