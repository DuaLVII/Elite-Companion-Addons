# Going online: EDSM and Spansh

Scripts can't reach the internet themselves, but they can ask the app to fetch from two sites' public, read-only APIs.
[← Guide](README.md)

## 1. Say so in addon.json

```json
"web": ["edsm", "spansh"]
```

Without it the request is refused. Players see "online: EDSM" next to your addon in MODULES and the gallery.

## 2. Ask

```js
web.edsm("api-system-v1/traffic", { systemName: "Sol" }, (data, error) => {
    if (error) { set("status", error); return; }
    set("today", data.traffic.day);
});

web.spansh("api/search", { q: "Borann" }, (data, error) => { … });
```

- `path` is the API path; `query` is an object of URL parameters (arrays repeat the parameter).
- Allowed paths: EDSM `api-v1/…`, `api-system-v1/…`, `api-status-v1/…`; Spansh `api/…`.
- The answer arrives a moment later: `data` (parsed JSON, or text) and `error` = `null`, or `data` = `null` and
  `error` = what went wrong. If the script was reloaded meanwhile, the callback is skipped.

## Be polite

The app already queues requests (one at a time per site, at most one a second) and answers the same request within
5 minutes from a cache. Still: **don't call them every tick**. Ask when something changes: a jump, a search, a button.

```js
on("FSDJump", (e, replay) => { if (!replay) lookUp(e.StarSystem); });
```

## Useful calls

| Call | Gives |
|---|---|
| `web.edsm("api-v1/system", { systemName, showCoordinates: 1, showInformation: 1, showPermit: 1, showPrimaryStar: 1 })` | coordinates, allegiance, economy, security, permit, main star |
| `web.edsm("api-v1/sphere-systems", { systemName, radius: 20, showCoordinates: 1 })` | systems within a radius (max 100 ly) |
| `web.edsm("api-system-v1/bodies", { systemName })` | every known body, rings included |
| `web.edsm("api-system-v1/stations", { systemName })` | stations, with services |
| `web.edsm("api-system-v1/factions", { systemName, showHistory: 1 })` | minor factions and influence |
| `web.edsm("api-system-v1/traffic", { systemName })` · `…/deaths` | commanders passing through, ships, deaths |
| `web.edsm("api-status-v1/elite-server")` | whether the game servers are up |
| `web.spansh("api/search", { q })` | find systems / bodies / stations by name (gives `id64`) |
| `web.spansh("api/dump/" + id64)` | everything Spansh knows about a system (can be big) |

See [EDSM's API docs](https://www.edsm.net/en/api-v1). The built-in **System Traffic** addon is a complete example.
