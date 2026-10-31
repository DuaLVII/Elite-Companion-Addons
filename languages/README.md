# Languages

One folder per language. **The folder name is the language code**: `it`, `pt-BR`, `ja`, `pl`…

```
languages/<code>/
  about.json      title (the language's name), author (the translators), version, description
  language.json   the translation: exactly the file the app's language editor saves
```

**Making one:** in the app, **STUDIO → LANGUAGES** (or copy `Languages\en.json` from the app, rename it to your code and
translate the texts). The file it writes in the app's `Languages` folder is your `language.json`; its `"Code"` must
match the folder name. From the gallery it installs into that folder and shows under SETTINGS → LANGUAGE.

Texts that aren't translated yet show in English, so a partly done language is still useful: say how far it is in the
description. When the app gains new texts, send an update with them translated and raise `version`.

Improvements to the languages that come with the app (Deutsch, Français, Español, Čeština) are welcome too: add them
here under their code, and the gallery's version replaces the app's once installed.
