// Wing Missions: the shared delivery missions you're in, with the whole wing's progress.
//
// The game writes CargoDepot whenever cargo for a wing mission is collected or delivered, by you or a wingmate
// ("WingUpdate"), with the wing's totals: collected, delivered, and how many it needs. Missions come from
// MissionAccepted (Wing: true) and go when they're completed, abandoned or failed. Kept between sessions.

// ---- little helpers (kept in this file so the addon stands alone)
function cmdrName(s) {
    // "$cmdr_decorate:#name=Jameson;" → "Jameson"; plain names as they are
    const m = /#name=([^;]+);?/.exec(String(s || ""));
    return m ? m[1] : String(s || "").replace(/^\$/, "");
}
function clock(t) {
    const d = new Date(t);
    if (isNaN(d)) return "";
    const p = n => (n < 10 ? "0" : "") + n;
    return p(d.getHours()) + ":" + p(d.getMinutes());
}
function since(t) {
    const ms = Date.now() - Date.parse(t);
    if (!(ms >= 0)) return "";
    const m = Math.floor(ms / 60000);
    return m < 1 ? tr("js.just_now", "just now") : m < 60 ? tr("js.min", "{0} min", m) : m < 48 * 60 ? tr("js.h_min", "{0} h {1} min", Math.floor(m / 60), m % 60) : tr("js.days", "{0} days", Math.floor(m / 1440));
}
function left(t) {
    const ms = Date.parse(t) - Date.now();
    if (isNaN(ms)) return "";
    if (ms <= 0) return tr("js.expired", "expired");
    const m = Math.floor(ms / 60000);
    return m < 60 ? tr("js.min", "{0} min", m) : m < 48 * 60 ? tr("js.h_min", "{0} h {1} min", Math.floor(m / 60), m % 60) : tr("js.days", "{0} days", Math.floor(m / 1440));
}
/// Each event once: the same event can come again (today's journal read back at start-up, a reload).
function makeSeen(key) {
    let mark = store.get(key, { t: "", sigs: [] });
    return e => {
        const t = e.timestamp || "";
        if (!t) return true;
        const sig = JSON.stringify(e).length + ":" + (e.event || "");
        if (t < mark.t) return false;
        if (t === mark.t) { if (mark.sigs.includes(sig)) return false; mark.sigs.push(sig); }
        else mark = { t, sigs: [sig] };
        store.set(key, mark);
        return true;
    };
}


wantHistory();   // missions taken days ago
let missions = store.get("missions", {});   // id → { id, name, commodity, need, collected, delivered, mine, to, toStation, expiry, reward, accepted, done, updated }
let alerted = store.get("alerted", {});     // id → highest milestone told
const seen = makeSeen("seen");
function save() { store.set("missions", missions); store.set("alerted", alerted); }

function m(id) { return missions[id] || (missions[id] = { id, name: "", commodity: "", need: 0, collected: 0, delivered: 0, mine: 0, to: "", toStation: "", expiry: "", reward: 0, accepted: "", done: "", updated: "" }); }

on("MissionAccepted", e => {
    if (!e.Wing || !seen(e)) return;
    const x = m(e.MissionID);
    x.name = e.LocalisedName || e.Name || x.name;
    x.commodity = e.Commodity_Localised || e.Commodity || x.commodity;
    x.need = e.Count || x.need;
    x.to = e.DestinationSystem || ""; x.toStation = e.DestinationStation || "";
    x.expiry = e.Expiry || ""; x.reward = e.Reward || 0; x.accepted = e.timestamp || "";
    save(); show();
});
on("CargoDepot", (e, replay) => {
    if (!seen(e)) return;
    const x = m(e.MissionID);
    if (e.CargoType_Localised || e.CargoType) x.commodity = e.CargoType_Localised || e.CargoType;
    if (e.TotalItemsToDeliver) x.need = e.TotalItemsToDeliver;
    if (typeof e.ItemsCollected === "number") x.collected = e.ItemsCollected;
    if (typeof e.ItemsDelivered === "number") x.delivered = e.ItemsDelivered;
    if (e.UpdateType === "Deliver") x.mine += e.Count || 0;
    x.updated = e.timestamp || "";
    if (!x.name) x.name = tr("js.wing_mission", "Wing mission");
    save(); show();
    // milestones (live only)
    if (!replay && x.need > 0) {
        const pct = x.delivered / x.need;
        const step = pct >= 1 ? 100 : pct >= 0.9 ? 90 : pct >= 0.5 ? 50 : 0;
        if (step > (alerted[x.id] || 0)) {
            alerted[x.id] = step; save();
            notify(step === 100 ? tr("js.n_done", "Wing mission delivered: {0}", x.commodity) : tr("js.n_step", "Wing mission {0}% delivered: {1} of {2} {3}", step, fmt(x.delivered), fmt(x.need), x.commodity), step === 100 ? "info" : "info", 6);
        }
    }
});
function finish(e, how) {
    if (!seen(e) || !missions[e.MissionID]) return;
    missions[e.MissionID].done = how;
    missions[e.MissionID].updated = e.timestamp || "";
    save(); show();
}
on("MissionCompleted", e => finish(e, "completed"));
on("MissionAbandoned", e => finish(e, "abandoned"));
on("MissionFailed", e => finish(e, "failed"));
on("Missions", e => {
    // at login: anything we think is active that the game doesn't list any more is over
    if (!Array.isArray(e.Active)) return;
    const active = new Set(e.Active.map(a => a.MissionID));
    for (const x of Object.values(missions)) if (!x.done && !active.has(x.id) && x.accepted) { x.done = "gone"; x.updated = e.timestamp || ""; }
    save(); show();
});
on("click:copy", s => { copy(s); notify(tr("js.copied", "{0} copied", s), "info", 3); });
on("click:clearDone", () => { for (const id of Object.keys(missions)) if (missions[id].done) delete missions[id]; save(); show(); });
on("tick", () => { if ((Date.now() / 1000 | 0) % 60 === 0) show(); });

function doneText(d) {
    return d === "completed" ? tr("js.completed", "completed") : d === "abandoned" ? tr("js.abandoned", "abandoned") : d === "failed" ? tr("js.failed", "failed") : tr("js.over", "over");
}
function show() {
    // tidy: finished ones older than 3 days go
    const cut = Date.now() - 3 * 86400000;
    for (const id of Object.keys(missions)) { const x = missions[id]; if (x.done && Date.parse(x.updated) < cut) delete missions[id]; }
    const list = Object.values(missions).sort((a, b) => (!!a.done - !!b.done) || (Date.parse(a.expiry || 0) - Date.parse(b.expiry || 0)));
    set("rows", list.map(x => {
        const p = x.need ? Math.min(1, x.delivered / x.need) : 0;
        return {
            id: String(x.id), title: x.commodity ? tr("js.deliver", "{0} {1}", x.need ? fmt(x.need) : "", x.commodity) : x.name,
            sub: [x.to && x.toStation ? `${x.toStation} · ${x.to}` : x.to, x.reward ? fmt(x.reward) + " cr" : ""].filter(s => s).join("  ·  "),
            system: x.to,
            p, pct: Math.round(p * 100) + "%", done: !!x.done, full: p >= 1,
            stats: tr("js.stats", "collected {0} · delivered {1} of {2} · you {3}", fmt(x.collected), fmt(x.delivered), fmt(x.need || 0), fmt(x.mine)),
            left: x.done ? doneText(x.done) : p >= 1 ? tr("js.hand_in", "all delivered: hand it in for the reward") : x.need ? tr("js.left", "{0} t to go · {1} left", fmt(Math.max(0, x.need - x.delivered)), x.expiry ? left(x.expiry) : "?") : "",
        };
    }));
    const active = list.filter(x => !x.done).length;
    set("summary", active ? tr("js.summary", "{0} wing mission(s) active", active) : "");
    set("empty", list.length ? "" : tr("js.none", "No wing missions. Take one from a mission board's \"Wing\" tab and share it with your wing: its progress shows here."));
    set("hasDone", list.some(x => x.done));
}
on("language", show);
show();
