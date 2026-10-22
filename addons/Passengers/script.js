// Passengers: the cabin manifest.
//
// Where it comes from:
//   Passengers        the game's manifest (at login and when it changes): MissionID, Type, VIP, Wanted, Count
//   MissionAccepted   the details the manifest doesn't have: destination, deadline, reward (passenger missions
//                     can last days, so wantHistory() reads back the last few weeks and the details are stored)
//   Missions          the login snapshot of active missions: anything stored that's no longer active is dropped
//   MissionCompleted / Abandoned / Failed   they've left
//   Loadout           your passenger cabins

wantHistory();

let missions = store.get("missions", {});   // MissionID → { type, count, vip, wanted, dest, station, expiry, reward }
const save = () => store.set("missions", missions);
let manifest = null;                         // the game's latest Passengers manifest (null: not seen yet)
let cabins = [];                             // [{ cls, count }]

const CLASS = { 1: "economy", 2: "business", 3: "first", 4: "luxury" };

// "PoliceOfficer" → "Police Officer", "$Mission_Sightseeing;" style names are left to the manifest's Type
const pretty = s => String(s || "").replace(/^\$|;$/g, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();

function left(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return { text: tr("js.overdue", "overdue"), soon: true };
    const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
    const text = d >= 1 ? tr("js.d_h", "{0}d {1}h", d, h % 24) : h >= 1 ? tr("js.h_m", "{0}h {1}m", h, Math.floor(ms / 60000) % 60) : tr("js.m", "{0}m", Math.max(1, Math.floor(ms / 60000)));
    return { text, soon: ms < 2 * 3600000 };
}

on("MissionAccepted", (e, replay) => {
    if (!e.PassengerCount) return;   // not a passenger mission
    missions[e.MissionID] = {
        type: pretty(e.PassengerType) || tr("js.passengers", "Passengers"),
        count: e.PassengerCount, vip: !!e.PassengerVIPs, wanted: !!e.PassengerWanted,
        dest: e.DestinationSystem || "", station: e.DestinationStation || "",
        expiry: e.Expiry || "", reward: e.Reward || 0,
    };
    save();
    if (!replay && e.PassengerWanted)
        notify(tr("js.wanted_aboard", "⚠ WANTED PASSENGERS ABOARD · keep clear of security scans"), "warning", 8);
    show();
});

function gone(e) {
    if (missions[e.MissionID]) { delete missions[e.MissionID]; save(); }
    if (manifest) manifest = manifest.filter(m => m.MissionID !== e.MissionID);
    show();
}
on("MissionCompleted", gone);
on("MissionAbandoned", gone);
on("MissionFailed", gone);

on("Passengers", e => {
    manifest = Array.isArray(e.Manifest) ? e.Manifest : [];
    show();
});

on("Missions", e => {
    if (!Array.isArray(e.Active)) return;
    const active = new Set(e.Active.map(m => m.MissionID));
    let changed = false;
    for (const id of Object.keys(missions)) if (!active.has(Number(id))) { delete missions[id]; changed = true; }
    if (changed) save();
    show();
});

on("Loadout", e => {
    const counts = {};
    for (const m of e.Modules || []) {
        const hit = /passengercabin_size(\d)_class(\d)/i.exec(m.Item || "");
        if (hit) counts[hit[2]] = (counts[hit[2]] || 0) + 1;
    }
    cabins = Object.keys(counts).sort().map(c => ({ cls: CLASS[c] || c, count: counts[c] }));
    show();
});

// Deadlines count down
let lastTick = 0;
on("tick", () => { if (Date.now() - lastTick > 30000) { lastTick = Date.now(); show(); } });

function show() {
    // The game's manifest is the truth for who's aboard; the stored missions fill in the details.
    // Before the manifest's been seen (or with an older journal), the stored missions are used on their own.
    const source = manifest
        ? manifest.map(m => ({ id: m.MissionID, type: pretty(m.Type), count: m.Count || 0, vip: !!m.VIP, wanted: !!m.Wanted }))
        : Object.keys(missions).map(id => ({ id: Number(id), ...missions[id] }));

    let total = 0, vips = 0, wanted = 0;
    const rows = source.map(p => {
        const d = missions[p.id] || {};
        const due = d.expiry ? left(d.expiry) : null;
        total += p.count;
        if (p.vip) vips += p.count;
        if (p.wanted) wanted += p.count;
        return {
            who: `${p.count} × ${p.type || d.type || tr("js.passengers", "Passengers")}`,
            vip: p.vip, wanted: p.wanted,
            dest: d.dest ? (d.station ? `${d.dest} · ${d.station}` : d.dest) : tr("js.destination_unknown", "destination not in recent journals"),
            due: due ? due.text : "", soon: !!(due && due.soon),
            reward: d.reward ? short(d.reward, "cr") : "",
            order: d.expiry ? Date.parse(d.expiry) : Number.MAX_SAFE_INTEGER,
        };
    }).sort((a, b) => a.order - b.order);

    set("total", fmt(total));
    set("vips", fmt(vips));
    set("wanted", fmt(wanted));
    set("hasWanted", wanted > 0);
    set("hasVips", vips > 0);
    set("rows", rows);
    set("empty", rows.length === 0 ? tr("js.empty", "No passengers aboard. Passenger missions are on the station's mission board, under Passenger Lounge.") : "");
    set("cabins", cabins.length
        ? tr("js.cabins", "Cabins: {0}", cabins.map(c => `${c.count} × ${tr("js.cabin_" + c.cls, c.cls.charAt(0).toUpperCase() + c.cls.slice(1))}`).join(", "))
        : "");
    set("wantedNote", wanted > 0 ? tr("js.wanted_note", "Wanted passengers aboard: being scanned by station or system security can get you fined.") : "");
    set("vipNote", vips > 0 ? tr("js.vip_note", "VIPs aboard: they may not like hull damage, interdictions or going somewhere dangerous.") : "");
}

show();
