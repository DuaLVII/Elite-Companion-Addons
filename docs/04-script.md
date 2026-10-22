# script.js: the logic

Modern JavaScript (`let`, arrow functions, template strings, spread, classes…). It runs inside the app with **no access
to files or the internet** (except asking the app to fetch from [EDSM or Spansh](09-online.md)), and any single call
that runs longer than 2 seconds is stopped. Each copy of a module runs its own script. [← Guide](README.md)

## At a glance

| Function | What it does |
|---|---|
| [`on(name, fn)`](#on) | run `fn` for journal events, Status updates, side files, ticks, clicks, changes… |
| [`set(name, value)` / `get(name)`](#set-and-get) | values the view shows as `{Binding V[name]}` |
| [`store`](#store) | values saved between sessions, per module copy (`store.shared`: for every copy) |
| [`metric(name, n, label, unit)`](#metric) | a point on a graph |
| [`notify(text, level, seconds)`](#notify) | a notification on the top bar |
| `log(text)` | a line in the Ship's Log module |
| `console.log(…)` | shows in the status line at the bottom of the window (for testing) |
| `fmt(n, decimals)` | `1234567` → `1,234,567` |
| `short(n, "cr")` | `1234567` → `1.2M cr` |
| [`game.…`](06-game-state.md) | read anything the app knows: `game.StarSystem`, `game.Credits`… |
| [`wantHistory()`](05-journal-events.md#history) | also receive the last ~5 weeks of key events at startup |
| `include("_shared/file.js")` | run one of the app's shared helper scripts first |
| [`web.edsm(…)` / `web.spansh(…)`](09-online.md) | ask the app to fetch from EDSM / Spansh |
| [`size()`](07-charts-and-sizes.md#in-the-script) | `"tiny"`, `"compact"`, `"normal"` or `"wide"` |
| [`tr(key, english, …)` / `lang()`](08-languages.md) | a translated text / the current language |

Don't name your own variables after any of these (`on`, `set`, `get`, `store`, `metric`, `notify`, `log`, `console`,
`fmt`, `short`, `game`, `wantHistory`, `include`, `web`, `size`, `tr`, `lang`).

## on

```js
on("FSDJump", (e, replay) => { … });   // a journal event: e is exactly what the game wrote
on("*", (e, replay) => { … });          // every journal event
on("Status", s => { … });               // each Status.json update (flags, fuel, pips, lat/long…)
on("tick", () => { … });                // once a second
on("Market", m => { … });               // side files: Backpack, ShipLocker, ModulesInfo, Market, Outfitting, Shipyard, FCMaterials
on("click:reset", value => { … });      // a button with Tag="reset" was clicked (value = its CommandParameter)
on("change:search", value => { … });    // the view changed V[search] (a two-way bound box, check box, slider)
on("change", (name, value) => { … });   // any of those
on("resize", size => { … });            // the module's width class changed
on("language", () => { … });            // the player changed language
```

`replay` is `true` while the app reads back earlier events at startup (or when the module is added part-way through a
session): fill in your numbers, but don't pop notifications for old events. See [Journal events](05-journal-events.md).

The game also writes some side-file names as journal events (sometimes without the lists), so check arrays exist:
`if (Array.isArray(m.Items)) …`.

## set and get

```js
set("jumps", 12);                       // {Binding V[jumps]}
set("rows", [{ name: "Gold", tons: 3 }]);
set("lowFuel", true);                   // for a DataTrigger
let search = get("search");             // read back a value (e.g. one the view changed)
```

Values that haven't really changed aren't sent to the view again, so it's fine to call `show()` often.

## store

Saved between sessions in `addondata.json` next to the app's settings.

```js
let st = store.get("state", { total: 0, days: {} });   // the fallback is used the first time
st.total++;
store.set("state", st);

store.shared.set("presets", list);   // shared by every copy of this addon
store.shared.get("presets", []);
```

- `store` is per module copy, so two copies can track different things.
- Save whole objects; keep them small (trim old entries, e.g. keep 60 days).
- Bump the key (`"state2"`) if you change the shape of what you store.

## metric

```js
metric("myaddon.earned", total, "Earned this session", "cr");
```

Adds a point to a graph series called `addon.myaddon.earned`, shown with
`<controls:TimeSeriesChart Series="addon.myaddon.earned"/>`. Prefix the name with your addon's id so it doesn't clash.

## notify

```js
notify("★ BIG BOUNTY · 1,200,000 CR", "warning", 8);   // "info", "warning" or "danger"; seconds on screen
```

Players can switch addon messages off under ALERTS → "Messages from addons". Don't notify during `replay`.

## A typical script

```js
wantHistory();                                     // if you need older events too

let st = store.get("state1", { count: 0 });
const save = () => store.set("state1", st);

on("Bounty", (e, replay) => {
    st.count++;
    save();
    if (!replay && e.TotalReward >= 1000000) notify("Big one!", "info", 5);
    show();
});

function show() {                                  // one place that sends everything to the view
    set("count", fmt(st.count));
}

show();
```

Having a single `show()` keeps things simple, and the app calls it for you when the language changes.
