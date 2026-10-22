# Languages

The app speaks English, German, French, Spanish and Czech. Your addon can too: it brings its own texts in a `lang`
folder, one file per language, and follows the player's language straight away. [← Guide](README.md)

```
MyAddon/
  lang/
    en.json      ← English: the fallback for anything another language leaves out
    de.json
    fr.json
```

```json
{
  "Language": "Deutsch",
  "Code": "de",
  "Strings": {
    "addon.title": "Sprungzähler",
    "addon.description": "Sprünge seit App-Start und das letzte System.",
    "ui.jumps": "SPRÜNGE",
    "js.milestone": "{0} Sprünge!"
  }
}
```

- The texts go inside `"Strings"`.
- `addon.title` / `addon.description`: the module's name and description (otherwise addon.json's are used).

## In module.xml

```xml
<TextBlock Style="{StaticResource Label}" Text="{T ui.jumps}"/>
```

## In script.js

```js
notify(tr("js.milestone", "{0} jumps!", jumps), "info", 5);   // key, the English, then values for {0}, {1}…
if (lang() === "de") { … }                                     // the current language code
on("language", () => show());                                   // rebuild texts the script made
```

If you have a `show()` function and no `on("language")`, the app calls `show()` for you when the language changes.

## Tips

- Name keys by where they're used: `ui.` for the view, `js.` for the script.
- Keep `{0}`, `{1}` and symbols (`·`, `→`, `★`) in every translation; move them where the language needs them.
- Don't translate values the view compares against (`"idle"` in a `DataTrigger`): keep those in plain code.
- An addon can bring a language the app doesn't have (say `it.json`): each module gets a 🌐 button in its title bar
  to pick it, saved per module copy.
