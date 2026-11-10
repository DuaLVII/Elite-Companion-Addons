# Random sounds

Sounds that play by themselves, now and then, whichever sound pack someone uses: voice lines, music, ambience. One
folder per set of them; the folder name is its id.

```
random/<Id>/
  about.json     title, author, version, description, tags
  random.json    the sets: which files, what kind, when they play
  *.ogg / *.wav / *.mp3   the sounds, beside random.json (no sub-folders)
  preview.ogg    (optional) a sample to hear in the gallery before installing (.wav / .mp3 too)
  preview.png    (optional) a picture for the gallery card
```

**Making one:** in the app, **STUDIO → Sounds editor → AT RANDOM**: make your sets (＋ New set, pick the files, say
what kind each is and when it plays), then **SHARE YOURS → Export for the gallery**. It writes this whole folder for
you. Upload it into `random/` here. Installing it from the gallery puts it in the app's `Sounds\Random\<Id>\`, where
every set can be switched on or off.

`random.json`:

```json
{
  "name": "Mycelium Murmurs",
  "author": "CMDR You",
  "description": "Slow dark music and the odd drip and creak.",
  "sets": [
    { "name": "Undergrowth", "kind": "music", "files": ["undergrowth.ogg", "deep-hyphae.ogg"],
      "minMinutes": 12, "maxMinutes": 30, "onlyWhilePlaying": true },
    { "name": "Drips and creaks", "kind": "effect", "files": ["drip1.ogg", "creak1.ogg"],
      "minMinutes": 3, "maxMinutes": 9, "volume": 90 },
    { "name": "Docking chatter", "kind": "voice", "files": ["line1.ogg", "line2.ogg"],
      "trigger": "game.docked", "chance": 40, "triggerOnly": true, "activities": ["docked"] }
  ]
}
```

| Key | |
|---|---|
| `kind` | `voice`: never over another voice line, and music goes quieter while it plays · `music`: one track at a time, fading in and out · `effect`: whenever it's due. Each follows its own volume in the app (SETTINGS → Sounds). |
| `files` | One is picked at random each time (never the same twice running). |
| `minMinutes`, `maxMinutes` | Plays every so often, at a random time in between (1 to 600). |
| `trigger`, `chance` | Also (or, with `"triggerOnly": true`, only) after that sound plays, this often in 100 (`game.docked`, `game.jumped`, `game.route_end` (the last jump of a plotted route), `note.danger`…: the ids the Sounds editor lists). |
| `onlyWhilePlaying` | Only while the game's running (`true` unless you say otherwise). |
| `activities` | Only while doing one of these: `docked`, `supercruise`, `exploring`, `combat`… (the ones the Sounds editor offers). |
| `volume` | 0 to 200 (%), 100 = as recorded. |

**Limits:** 6 MB a file, 24 MB in all. Use OGG for music.

**Only sounds and music you made or are allowed to share.** Nothing recorded from the game (it belongs to Frontier) and
no commercial music. Free libraries are fine when their licence allows sharing: say which, and credit them in the
description.
