# Themes

One folder per theme. The folder name is its id.

```
themes/<Id>/
  about.json     title, author, version, description, tags
  theme.json     the theme itself: exactly the file the app saves in its Themes folder
  preview.png    a screenshot of the app wearing it (optional, ~600 × 340)
  assets/        (optional) the theme's own files: fonts (.ttf, .otf) and their licences (.txt), textures and
                 pictures (.png, .jpg); folders inside it are fine
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

Raise `version` when you change it, so everyone who has it gets the update. Themes hold colours, fonts and style
settings, and (app 0.9.7 on) shapes, textures, drifting motes, decoration, icons, reactions and a matching sound pack:
see the app's `Themes\README.md`. Nothing in a theme runs. The checks make sure every colour is a colour (or a
`texture(…)`), and that every file the theme names (a font, a picture) is in its `assets/`.

**Fonts:** only ones whose licence lets you share them, like the SIL Open Font License, with the licence text beside
them. **Limits:** 2 MB a file in `assets/`, 8 MB in all.
