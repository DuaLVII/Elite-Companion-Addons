// Fighter Bay: your ship-launched fighters this session: what's out, who's flying it, losses and rebuilds.
//
// From LaunchFighter (which loadout, you or your crew flying), DockFighter, FighterDestroyed, FighterRebuilt and
// VehicleSwitch (you jumping between ship and fighter), plus CrewLaunchFighter in multicrew. The game says when a
// destroyed fighter is ready again (FighterRebuilt); in between it shows as rebuilding, with the time since.

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


let out = {};          // id → { id, loadout, player, t }
let rebuilding = [];   // [{ loadout, t }]
let stats = { launched: 0, lost: 0, rebuilt: 0 };
let feed = [];          // [{ t, text, bad }]
let inFighter = false;
let haveBay = store.get("haveBay", null);   // from Loadout: does the ship have a fighter hangar?

function add(t, text, bad) { feed.unshift({ t, text, bad: !!bad }); feed = feed.slice(0, 20); }
function loadoutName(l) {
    const s = String(l || "");
    return s ? tr("js.loadout", "loadout {0}", s.replace(/_/g, " ")) : tr("js.fighter", "fighter");
}
function reset() { out = {}; rebuilding = []; stats = { launched: 0, lost: 0, rebuilt: 0 }; feed = []; inFighter = false; }

on("LoadGame", () => { reset(); show(); });
on("Loadout", e => {
    if (!Array.isArray(e.Modules)) return;
    haveBay = e.Modules.some(m => /fighterbay/i.test(m.Item || ""));
    store.set("haveBay", haveBay);
    show();
});
on("LaunchFighter", (e, replay) => {
    const id = String(e.ID !== undefined ? e.ID : stats.launched);
    out[id] = { id, loadout: e.Loadout || "", player: !!e.PlayerControlled, t: e.timestamp || "" };
    stats.launched++;
    add(e.timestamp, e.PlayerControlled ? tr("js.l_you", "Launched {0}, flown by you", loadoutName(e.Loadout)) : tr("js.l_crew", "Launched {0}, flown by your crew", loadoutName(e.Loadout)));
    show();
});
on("CrewLaunchFighter", e => {
    stats.launched++;
    add(e.timestamp, tr("js.l_multicrew", "{0} launched a fighter", cmdrName(e.Crew)));
    show();
});
on("DockFighter", e => {
    const id = String(e.ID !== undefined ? e.ID : "");
    const f = out[id] || Object.values(out)[0];
    if (f) delete out[f.id];
    add(e.timestamp, tr("js.docked", "Fighter docked"));
    show();
});
on("FighterDestroyed", (e, replay) => {
    const id = String(e.ID !== undefined ? e.ID : "");
    const f = out[id] || Object.values(out)[0];
    if (f) delete out[f.id];
    stats.lost++;
    rebuilding.push({ loadout: f ? f.loadout : "", t: e.timestamp || "" });
    add(e.timestamp, tr("js.destroyed", "Fighter destroyed: rebuilding"), true);
    show();
    if (!replay && setting("notifyLoss", true)) notify(tr("js.n_destroyed", "Fighter destroyed"), "warning", 5);
});
on("FighterRebuilt", (e, replay) => {
    rebuilding.shift();
    stats.rebuilt++;
    add(e.timestamp, tr("js.rebuilt", "{0} rebuilt: ready to launch", loadoutName(e.Loadout)));
    show();
    if (!replay && setting("notifyReady", true)) notify(tr("js.n_rebuilt", "Fighter rebuilt: ready to launch"), "info", 5);
});
on("VehicleSwitch", e => { inFighter = String(e.To || "").toLowerCase() === "fighter"; show(); });
on("Died", () => { out = {}; rebuilding = []; show(); });
on("tick", () => { if (rebuilding.length || Object.keys(out).length) show(); });

function show() {
    const fighters = Object.values(out);
    set("status", fighters.length ? tr("js.out", "{0} OUT", fighters.length) : rebuilding.length ? tr("js.rebuilding", "REBUILDING") : tr("js.docked_all", "ALL DOCKED"));
    set("statusKind", fighters.length ? "out" : rebuilding.length ? "rebuild" : "docked");
    set("where", inFighter ? tr("js.you_fighter", "You're flying the fighter") : fighters.some(f => !f.player) ? tr("js.crew_flying", "Your crew is flying") : "");
    set("fighters", fighters.map(f => ({ text: loadoutName(f.loadout) + " · " + (f.player ? tr("js.by_you", "you") : tr("js.by_crew", "crew")), when: tr("js.for", "out {0}", since(f.t)) })));
    set("rebuilds", rebuilding.map(r => ({ text: loadoutName(r.loadout), when: tr("js.rebuild_for", "rebuilding {0}", since(r.t)) })));
    set("stats", tr("js.stats", "This session: {0} launched · {1} lost · {2} rebuilt", stats.launched, stats.lost, stats.rebuilt));
    set("log", feed.slice(0, 6).map(l => ({ when: clock(l.t), text: l.text, bad: l.bad })));
    set("note", haveBay === false ? tr("js.no_bay", "This ship has no fighter hangar.") : "");
}
on("language", show);
show();
