# Safety rules

Why: module.xml is XAML, and XAML can do much more than draw: create any .NET object it can name, call methods, load
other files or web pages. So every addon's module.xml is checked **each time it loads** (built-in, from the gallery,
or copied in by hand), and the gallery runs the same checks on every pull request. Anything that breaks a rule
isn't loaded: the module shows in orange what was refused and on which line. [← Guide](README.md)

Scripts are already sandboxed by the app: no files, no internet (except [EDSM / Spansh through the app](09-online.md)),
2 seconds at most per call.

## module.xml

| Allowed | Not allowed |
|---|---|
| the WPF namespace, `x:`, and `controls:` (`clr-namespace:EliteCompanion.Controls`) | any other `xmlns` (e.g. `clr-namespace:System…`) |
| every normal WPF element: panels, text, shapes, borders, lists, buttons, check boxes, images of your own preview… | `ObjectDataProvider`, `XmlDataProvider`, `WebBrowser`, `Frame`, `MediaElement`, `InkCanvas` |
| `x:Name`, `x:Key`, `x:Type`, `x:Static` | `x:Code`, `x:FactoryMethod`, `x:Arguments`, `x:Class`, `x:XData` |
| `Tag="name"` on buttons + `on("click:name")` in the script | event handlers: `Click="…"`, `Loaded="…"`, `…Changed="…"` |
| resources in a `<….Resources>` block | `ResourceDictionary Source="…"`, merged dictionaries |
| | file paths or web addresses in any value: `http://`, `https://`, `file:`, `pack:`, `C:\…`, `\\server`, `..\` |

## The gallery also checks

- Only `addon.json`, `module.xml`, `script.js`, `lang/*.json`, `preview.png` / `.jpg` and `.md` / `.txt` notes.
- Up to 512 KB a file, 2 MB in all (the preview up to 400 KB).
- `addon.json` has the required fields; `web` only lists `edsm` / `spansh`.
- `include()` only of the app's `_shared/` helpers.
- Language files are valid, with texts inside `"Strings"`.

To run the gallery's checks yourself: put your addon in `addons/` in your copy of the gallery repo and run
`python scripts/validate.py`.
