// SRV: the current (or last) trip.
//
// LaunchSRV starts a trip, DockSRV ends it, SRVDestroyed… also ends it. While driving, Status.json gives fuel, cargo,
// position and the SRV control flags; MaterialCollected is written for each pickup.
include("_shared/surface.js");

// Status.json Flags bits for the SRV
const F = { Shields: 3, Handbrake: 12, TurretView: 13, UnderShip: 14, DriveAssist: 15, InSrv: 26, HighBeam: 31 };

let trip = store.get("trip", null);      // { type, started, ended, materials: { name: { count, category } }, distance, topSpeed, destroyed }
const save = () => store.set("trip", trip);
let status = null;
let last = null;                          // last position, for distance driven

function srvName(e) {
    if (e.SRVType_Localised) return e.SRVType_Localised;
    return /combat/i.test(e.SRVType || "") ? "SRV Scorpion" : "SRV Scarab";
}

on("LaunchSRV", e => {
    trip = { type: srvName(e), loadout: e.Loadout || "", started: e.timestamp, ended: null, materials: {}, distance: 0, topSpeed: 0, destroyed: false };
    last = null;
    save(); showTrip();
});

on("DockSRV", e => { if (trip && !trip.ended) { trip.ended = e.timestamp; save(); showTrip(); } });

on("SRVDestroyed", (e, replay) => {
    if (trip) { trip.ended = e.timestamp; trip.destroyed = true; save(); }
    if (!replay) notify(tr("js.srv_destroyed", "⚠ SRV DESTROYED"), "danger", 10);
    showTrip();
});

on("MaterialCollected", e => {
    if (!trip || trip.ended) return;              // ship mining etc. isn't part of an SRV trip
    const name = e.Name_Localised || Surface.titleCase(e.Name);
    const m = trip.materials[name] || (trip.materials[name] = { count: 0, category: e.Category || "" });
    m.count += e.Count || 1;
    save(); showTrip();
});

on("Status", s => {
    status = s;
    const inSrv = Surface.flag(s, F.InSrv);
    if (inSrv && trip && !trip.ended && Surface.pos) {
        const here = { lat: Surface.pos.lat, lon: Surface.pos.lon };
        if (last) {
            const d = Surface.distance(last, here);
            if (isFinite(d) && d < 300) trip.distance += d;      // ignore jumps (e.g. a new body)
        }
        last = here;
        trip.topSpeed = Math.max(trip.topSpeed, game.GroundSpeed || 0);
    } else {
        last = null;
    }
    showLive();
});

// Save the distance now and then rather than on every Status update
let ticks = 0;
on("tick", () => {
    if (trip && !trip.ended && ++ticks % 15 === 0) save();
    if (trip && !trip.ended) set("time", duration());
});

function duration() {
    if (!trip) return "—";
    const end = trip.ended ? Date.parse(trip.ended) : Date.now();
    const s = Math.max(0, Math.round((end - Date.parse(trip.started)) / 1000));
    return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function showLive() {
    const s = status;
    const inSrv = !!(s && Surface.flag(s, F.InSrv));
    set("inSrv", inSrv);
    set("state", inSrv ? "Driving" : trip && !trip.ended ? tr("js.srv_deployed_you_re_not_in", "SRV deployed · you're not in it") : tr("js.not_in_the_srv", "Not in the SRV"));
    if (inSrv) {
        set("fuel", s.Fuel ? `${s.Fuel.FuelMain.toFixed(2)} t` : "—");
        set("cargo", s.Cargo !== undefined ? `${fmt(s.Cargo)} t` : "—");
        set("speed", tr("js.0_km_h", "{0} km/h", Math.round((game.GroundSpeed || 0) * 3.6)));
        setFlags([
            { name: tr("js.handbrake", "HANDBRAKE"), on: Surface.flag(s, F.Handbrake) },
            { name: tr("js.drive_assist", "DRIVE ASSIST"), on: Surface.flag(s, F.DriveAssist) },
            { name: tr("js.turret", "TURRET"), on: Surface.flag(s, F.TurretView) },
            { name: tr("js.under_ship", "UNDER SHIP"), on: Surface.flag(s, F.UnderShip) },
            { name: tr("js.high_beam", "HIGH BEAM"), on: Surface.flag(s, F.HighBeam) },
            { name: tr("js.shields", "SHIELDS"), on: Surface.flag(s, F.Shields) },
        ]);
    } else {
        set("fuel", "—"); set("cargo", "—"); set("speed", "—"); setFlags([]);
    }
    if (trip) {
        set("distance", Surface.metres(trip.distance));
        set("topSpeed", tr("js.0_km_h", "{0} km/h", Math.round(trip.topSpeed * 3.6)));
    }
}

// Only redraw the chips when one changes (Status.json updates several times a second)
let lastFlags = null;
function setFlags(list) {
    const key = JSON.stringify(list);
    if (key !== lastFlags) { lastFlags = key; set("flags", list); }
}

function showTrip() {
    if (!trip) {
        set("tripTitle", tr("js.no_srv_trips_yet", "No SRV trips yet"));
        set("materials", []); set("distance", "—"); set("topSpeed", "—"); set("time", "—"); set("materialsText", "");
        showLive();
        return;
    }
    const ending = trip.destroyed ? tr("js.destroyed", " · destroyed") : trip.ended ? tr("js.back_aboard", " · back aboard") : "";
    set("tripTitle", `${trip.type}${ending}`);
    set("time", duration());
    const list = Object.entries(trip.materials)
        .map(([name, m]) => ({ name, count: "×" + m.count, n: m.count, category: m.category }))
        .sort((a, b) => b.n - a.n);
    set("materials", list);
    const total = list.reduce((t, m) => t + m.n, 0);
    set("materialsText", list.length ? tr("js.materials_collected_kinds", "MATERIALS · {0} collected · {1} kinds", total, list.length) : tr("js.materials_none_yet", "MATERIALS · none yet"));
    showLive();
}

showTrip();

// Language changed: rebuild the texts the script made
on("language", () => { showLive(); showTrip(); });
