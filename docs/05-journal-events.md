# Journal events

Elite Dangerous writes everything you do to journal files (one JSON line per event). The app reads them and passes
each event to every script that asked for it with `on("EventName", …)`. [← Guide](README.md)

Every event and field is documented at **[elite-journal.readthedocs.io](https://elite-journal.readthedocs.io/)**.

## How events arrive

| When | `replay` | What you get |
|---|---|---|
| The app starts (or your module is added / reloaded) | `true` | today's events so far, oldest first |
| …and if you called `wantHistory()` | `true` | before those, the last ~5 weeks of carrier, mission and travel events |
| While playing | `false` | each event as it happens |

So at startup your script catches up, then carries on live. Use `replay` to avoid alerts for old events:

```js
on("Docked", (e, replay) => {
    set("station", e.StationName);
    if (!replay) notify(`Docked at ${e.StationName}`, "info", 4);
});
```

## History

```js
wantHistory();   // at the top of the script
```

Useful for anything spread over days: missions (accepted days ago), fleet carrier, "yesterday" and "this week" totals.

## Each event once

History, today's replay and a reload can deliver the same event again. If you **add things up and store them**, skip
events you've already counted. A simple pattern, keyed on the timestamp:

```js
let st = store.get("state1", { total: 0, mark: { ts: "", keys: [] } });

function fresh(e) {
    const ts = e.timestamp || "", key = e.event + ":" + JSON.stringify(e).length;
    if (ts < st.mark.ts) return false;
    if (ts === st.mark.ts) { if (st.mark.keys.includes(key)) return false; st.mark.keys.push(key); }
    else st.mark = { ts, keys: [key] };
    return true;
}

on("Bounty", e => {
    if (!fresh(e)) return;
    st.total += e.TotalReward || 0;
    store.set("state1", st);
    show();
});
```

If you only show **the latest state** (where you are, what's in the cabins) you don't need this: just overwrite.

## Events you'll use most

| Event | When | Handy fields |
|---|---|---|
| `LoadGame` | logging in | `Commander`, `Ship`, `Credits`, `GameMode` |
| `Location` | at login / respawn | `StarSystem`, `Docked`, `StationName`, `Body` |
| `FSDJump` | arriving after a hyperspace jump | `StarSystem`, `JumpDist`, `FuelUsed`, `StarPos`, `SystemAllegiance` |
| `StartJump` | the jump countdown starts | `JumpType` (`Hyperspace` / `Supercruise`), `StarSystem`, `StarClass` |
| `SupercruiseEntry` / `SupercruiseExit` | in / out of supercruise | `StarSystem`, `Body` |
| `Docked` / `Undocked` | at a station | `StationName`, `StationType`, `MarketID` |
| `Touchdown` / `Liftoff` | on a planet | `Latitude`, `Longitude`, `Body` |
| `Loadout` | ship changes, at login | `Ship`, `ShipName`, `Modules[]` (`Slot`, `Item`, `Engineering`) |
| `Cargo` | cargo changes | `Inventory[]` (`Name`, `Name_Localised`, `Count`) |
| `MarketBuy` / `MarketSell` | trading | `Type`, `Count`, `BuyPrice` / `SellPrice`, `TotalCost` / `TotalSale` |
| `MiningRefined` | a refined ton | `Type` |
| `Bounty` | a bounty kill | `Target`, `TotalReward`, `VictimFaction` |
| `FactionKillBond` | a combat zone kill | `Reward`, `AwardingFaction` |
| `Died` | you died | `KillerName` |
| `MissionAccepted` | taking a mission | `MissionID`, `Name`, `Destination…`, `Expiry`, `Reward`, `Passenger…`, `Commodity`, `Count` |
| `MissionCompleted` / `MissionAbandoned` / `MissionFailed` | finishing one | `MissionID`, `Reward` |
| `Missions` | at login | `Active[]`, `Failed[]`, `Complete[]` |
| `Passengers` | at login, and when the manifest changes | `Manifest[]` (`MissionID`, `Type`, `VIP`, `Wanted`, `Count`) |
| `Scan` | scanning a body | `BodyName`, `PlanetClass`, `StarType`, `Landable`, `WasDiscovered` |
| `FSSDiscoveryScan` / `FSSAllBodiesFound` | honking / everything found | `BodyCount` |
| `SAASignalsFound` | mapping a body | `Signals[]`, `Genuses[]` |
| `ScanOrganic` | sampling exobiology | `ScanType`, `Genus`, `Species`, `Variant` |
| `Embark` / `Disembark` | on foot ↔ ship / SRV | `SRV`, `OnStation`, `OnPlanet` |
| `ShipTargeted` | locking a target | `Ship`, `PilotName`, `LegalStatus`, `Bounty`, `Power` |
| `Interdicted` / `Interdiction` | being / doing an interdiction | `Submitted`, `Interdictor`, `IsPlayer` |
| `Powerplay` / `PowerplayMerits` | Powerplay | `Power`, `Rank`, `Merits` / `MeritsGained`, `TotalMerits` |
| `CarrierJumpRequest` / `CarrierJump` / `CarrierStats` | your fleet carrier | `SystemName`, `DepartureTime` / `Finance`, `FuelLevel` |
| `ColonisationConstructionDepot` / `ColonisationContribution` | system colonisation | `MarketID`, `ResourcesRequired[]` / `Contributions[]` |

Names the game shows in your language usually come in two fields: `Type` (`"painite"`) and `Type_Localised`
(`"Painite"`). Prefer `_Localised` for display, the plain one for comparisons.

## Status.json

`on("Status", s => …)` gets each update of the game's live status file: `s.Flags` and `s.Flags2` (bit fields),
`s.Fuel`, `s.Pips`, `s.Latitude` / `s.Longitude` / `s.Altitude` / `s.Heading`, `s.Oxygen`, `s.Health`… Most of it is
already readable as [`game.…`](06-game-state.md) (`game.Docked`, `game.FuelPercent`, `game.Heading`), which is easier.

## Side files

The game also keeps a few separate files up to date. `on("Market", m => …)` etc. runs when one changes:
`Backpack`, `ShipLocker`, `ModulesInfo`, `Market`, `Outfitting`, `Shipyard`, `FCMaterials`.
