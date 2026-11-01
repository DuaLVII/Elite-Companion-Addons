# Sound packs

One folder per pack. The folder name is its id.

```
sounds/<Id>/
  about.json     title, author, version, description, tags
  sounds.json    which sound plays which file(s)
  *.ogg / *.wav / *.mp3   the sounds, beside sounds.json (no sub-folders)
  preview.ogg    (optional) a sound to hear in the gallery before installing (.wav / .mp3 too)
  preview.png    (optional) a picture for the gallery card
```

**Making one:** in the app, **STUDIO → Sounds editor**: choose your own files for any of the sounds (and how loud),
then **SHARE → Export for the gallery**. It writes this whole folder for you. Upload it into `sounds/` here.

`sounds.json`:

```json
{
  "name": "Cockpit",
  "author": "CMDR You",
  "description": "Chunky switches and soft chimes.",
  "sounds": {
    "ui.click":   { "files": ["click.ogg"], "volume": 0.8 },
    "login.key":  { "files": ["key1.ogg", "key2.ogg", "key3.ogg"] },
    "game.docked": { "files": ["docked.ogg"] }
  }
}
```

Several files for one sound: one is picked at random each time. `volume` is 0 to 2 (1 = as recorded). A pack only needs
the sounds it changes; the rest stay silent. The sound ids are the ones the Sounds editor lists (`app.boot`,
`ui.hover`, `ui.click`, `module.add`, `note.danger`, `game.jumped`…). A notification can have its own sound by its type:
`note.attack`, `note.lowfuel`, `note.docking`…; without one, it uses `note.info` / `note.warning` / `note.danger`.

**Limits:** 1 MB a sound, 8 MB a pack. Use OGG for anything longer than a blip, and keep them short.

**Only sounds you made or are allowed to share.** Nothing recorded from the game: those sounds belong to Frontier, so
packs with them can't be accepted. Free sound libraries are fine when their licence allows sharing (say which, and
credit them in the description).
