# Troubleshooting

[← Guide](README.md)

## The orange text in the module

| It says | It means |
|---|---|
| `module.xml: … line 12 …` | a XAML mistake on that line: an unclosed tag, a misspelt property, a missing `"` |
| `not loaded, for safety: …` | something on the [safety list](11-safety.md); the message says what and where |
| `script.js line 40: …` | a JavaScript error; the line number is in your script |
| `addon.json: …` | the file isn't valid JSON (a missing comma or quote) |
| `… took longer than 2 seconds` | a loop that never ends, or far too much work in one go |

Fix the file and save: it reloads by itself.

## Common mistakes

- **Nothing shows:** did the script `set()` the value with exactly the name the view binds (`V[jumps]` vs `set("jump", …)`)?
- **A `<Run>` stays empty:** add `Mode=OneWay` to its binding.
- **Numbers count twice after a restart:** the same events arrive again in the replay. Use the
  [each event once](05-journal-events.md#each-event-once) pattern.
- **Notifications at startup for old things:** check `replay`.
- **Colours look wrong in another theme:** a hard-coded colour (`"#FF9830"`); use `{StaticResource Hud}` etc.
- **It doesn't appear in MODULES:** the folder name starts with `_` (ignored), or the folder is somewhere other than
  the `Addons` folder next to `EliteCompanion.exe`.
- **Clicking a button does nothing:** it needs `Tag="name"` and the script `on("click:name", …)`.
- **Texts show the key (`ui.jumps`):** the key isn't in `lang/en.json`, or the texts aren't inside `"Strings"`.

## Testing without the game

Most events also arrive at startup as a replay of today's journal, so a module fills in from today's play even with
the game closed. `console.log(…)` shows in the status line at the bottom of the window.

## Still stuck?

Open an issue on the gallery repo with the orange message and your files.
