// Kill Tracker: every kill, sorted by type, with Powerplay kills tagged by the victim's power.
//
// Where kills come from (journal):
//   Bounty           a wanted ship / person destroyed (Target, VictimFaction, TotalReward)
//   CommitCrime      CrimeType "murder" / "onFoot_murder": a clean kill (Victim, Fine / Bounty)
//   FactionKillBond  a combat zone kill (Reward, AwardingFaction, VictimFaction; Thargoids are "$faction_Thargoid;")
//   CapShipBond      a capital ship
//   PVPKill          another commander (Victim, CombatRank)
// Powerplay: the journal doesn't say a kill was a Powerplay kill, but ShipTargeted (once the scan finishes) gives the
// target's Power. A kill of the same ship type soon after scanning a pledged ship is tagged with that power, and the
// PowerplayMerits that follows straight after a kill is added to it.
//
// Filters (period, types, Powerplay only) are saved per copy with store; named presets are saved with store.shared,
// so every Kill Tracker copy can load them: add several copies and give each its own filter.

wantHistory();

const CATS = [
    { id: "wanted",   name: "Wanted" },
    { id: "clean",    name: "Clean" },
    { id: "czone",    name: "Combat zone" },
    { id: "capital",  name: "Capital" },
    { id: "thargoid", name: "Thargoid" },
    { id: "cmdr",     name: "Commander" },
    { id: "foot",     name: "On foot" },
];
const CAT_NAME = Object.fromEntries(CATS.map(c => [c.id, c.name]));
// In the current language (lang/*.json: js.cat_<id> / js.period_<id>)
const catName = id => tr("js.cat_" + id, CAT_NAME[id] || id);
const periodName = p => tr("js.period_" + p.id, p.name);
const PERIODS = [
    { id: "session", name: "Session" },
    { id: "today",   name: "Today" },
    { id: "week",    name: "7 days" },
    { id: "cycle",   name: "PP cycle" },
    { id: "all",     name: "All" },
];
const MAX_KILLS = 2000;

// ---- saved state ----

let kills = store.get("kills", []);            // oldest first: { at, cat, ship, who, faction, reward, system, power, merits }
let mark = store.get("mark", { ts: "", keys: [] });
const defaults = () => ({ period: "session", types: CATS.map(c => c.id), pp: false });
let filters = Object.assign(defaults(), store.get("filters", {}));
let preset = store.get("preset", "");          // name of the preset last loaded (cleared when the filters are changed)

const saveKills = () => store.set("kills", kills);

// Saving and redrawing are batched while history is being replayed (thousands of events at start-up): one save and
// one redraw at the end instead of one per kill. Live events still show straight away.
let replaying = false, pending = false;
const onEv = (name, fn) => on(name, (e, replay) => { replaying = !!replay; fn(e); });
function dataChanged() {
    pending = true;
    if (!replaying) commit();
}
function commit() {
    if (!pending) return;
    pending = false;
    saveKills();
    store.set("mark", mark);
    store.set("encounters", encounters);
    show();
}
const saveFilters = () => { store.set("filters", filters); store.set("preset", preset); };

/** True the first time an event is seen (history, today's replay and live events overlap). */
function fresh(e) {
    const ts = e.timestamp || "";
    const key = e.event + ":" + JSON.stringify(e).length;
    if (ts < mark.ts) return false;
    if (ts === mark.ts) {
        if (mark.keys.includes(key)) return false;
        mark.keys.push(key);
    } else {
        mark = { ts, keys: [key] };
    }
    return true;
}

// ---- what's going on around the kills ----

const ms = ts => Date.parse(ts) || Date.now();
let system = "";
let onFoot = false;
let sessionStart = Date.now();
let target = null;          // last scanned ship pledged to a power: { at, power, ship, who }
let lastKill = null;        // to add the merits that follow it

for (const name of ["FSDJump", "Location", "CarrierJump"])
    on(name, e => { if (e.StarSystem) system = e.StarSystem; });
onEv("Disembark", () => { onFoot = true; });
onEv("Embark", () => { onFoot = false; });
onEv("LoadGame", e => { sessionStart = ms(e.timestamp); onFoot = false; target = null; dataChanged(); });

onEv("ShipTargeted", e => {
    if (!e.TargetLocked || !e.Power) return;
    target = { at: ms(e.timestamp), power: e.Power, ship: (e.Ship || "").toLowerCase(), who: e.PilotName_Localised || "" };
});

/** The power of the ship just killed, if it was scanned in the last two minutes and is the same type. */
function powerOf(t, ship) {
    if (!target || t - target.at > 120000 || t < target.at) return "";
    if (ship && target.ship && ship.toLowerCase() !== target.ship) return "";
    const p = target.power;
    target = null;
    return p;
}

function add(e, kill) {
    const t = ms(e.timestamp);
    kill.at = e.timestamp;
    kill.system = system;
    kill.power = kill.power || "";
    kill.merits = 0;
    kills.push(kill);
    if (kills.length > MAX_KILLS) kills.splice(0, kills.length - MAX_KILLS);
    lastKill = { t, kill };
    dataChanged();
}

// ---- the kills ----

const isThargoid = f => /thargoid/i.test(f || "");
const footTarget = s => /suitai|_suit|citizen|soldier|guard|scavenger/i.test(s || "");

onEv("Bounty", e => {
    if (!fresh(e)) return;
    const foot = footTarget(e.Target);
    add(e, {
        cat: foot ? "foot" : "wanted",
        ship: foot ? "" : shipName(e.Target, e.Target_Localised),
        who: foot ? (e.Target_Localised || "Person") : "",
        faction: e.VictimFaction_Localised || e.VictimFaction || "",
        reward: e.TotalReward ?? e.Reward ?? 0,
        power: foot ? "" : powerOf(ms(e.timestamp), e.Target),
    });
});

onEv("CommitCrime", e => {
    const type = (e.CrimeType || "").toLowerCase();
    if (type !== "murder" && type !== "onfoot_murder") return;
    if (!fresh(e)) return;
    const foot = type === "onfoot_murder";
    add(e, {
        cat: foot ? "foot" : "clean",
        ship: "", who: e.Victim_Localised || e.Victim || "",
        faction: e.Faction || "",
        reward: -(e.Fine || e.Bounty || 0),
        power: foot ? "" : powerOf(ms(e.timestamp), ""),
    });
});

onEv("FactionKillBond", e => {
    if (!fresh(e)) return;
    const thargoid = isThargoid(e.VictimFaction);
    add(e, {
        cat: thargoid ? "thargoid" : onFoot ? "foot" : "czone",
        ship: "", who: "",
        faction: thargoid ? "Thargoid" : (e.VictimFaction_Localised || e.VictimFaction || ""),
        reward: e.Reward || 0,
        power: thargoid || onFoot ? "" : powerOf(ms(e.timestamp), ""),
    });
});

onEv("CapShipBond", e => {
    if (!fresh(e)) return;
    add(e, { cat: "capital", ship: "Capital ship", who: "", faction: e.VictimFaction_Localised || e.VictimFaction || "", reward: e.Reward || 0 });
});

onEv("PVPKill", e => {
    if (!fresh(e)) return;
    add(e, { cat: "cmdr", ship: "", who: "CMDR " + (e.Victim || "?"), faction: "", reward: 0, power: powerOf(ms(e.timestamp), "") });
});

// ---- Thargoid encounters: hyperdictions (the Thargoid music during a jump) and supercruise interdictions ----

let encounters = store.get("encounters", []);   // { at, kind: "hyperdiction" | "interdiction", system, to }
let jump = null;                                // { t, to } between StartJump and FSDJump
const addEncounter = (e, kind, to) => {
    encounters.push({ at: e.timestamp, kind, system, to: to || "" });
    if (encounters.length > 500) encounters.splice(0, encounters.length - 500);
    dataChanged();
};
onEv("StartJump", e => { if (e.JumpType === "Hyperspace") jump = { t: ms(e.timestamp), to: e.StarSystem || "" }; });
onEv("FSDJump", e => {
    // Arriving back in the system you left instead of the one you jumped to = hyperdicted
    const j = jump;
    jump = null;
    if (j && j.to && e.StarSystem && e.StarSystem.toLowerCase() !== j.to.toLowerCase() && fresh(e))
        addEncounter(e, "hyperdiction", j.to);
});
onEv("Music", e => {
    if (e.MusicTrack !== "Unknown_Encounter" || !jump || ms(e.timestamp) - jump.t > 120000) return;
    const to = jump.to;
    jump = null;
    if (fresh(e)) addEncounter(e, "hyperdiction", to);
});
onEv("Interdicted", e => {
    if (!/thargoid/i.test((e.Interdictor || "") + (e.Faction || "") + (e.Interdictor_Localised || ""))) return;
    if (fresh(e)) addEncounter(e, "interdiction");
});

// Merits that land straight after a kill belong to it
onEv("PowerplayMerits", e => {
    if (!lastKill || !fresh(e)) return;
    const t = ms(e.timestamp);
    if (t < lastKill.t || t - lastKill.t > 10000 || lastKill.kill.merits) return;
    lastKill.kill.merits = e.MeritsGained || 0;
    dataChanged();
});

// ---- filters ----

function startOf(period, now) {
    const d = new Date(now);
    switch (period) {
        case "session": return sessionStart;
        case "today": return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        case "week": return now - 7 * 86400000;
        case "cycle": {
            // Powerplay cycles start on Thursday at 07:00 UTC
            const c = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 7);
            let start = c - ((d.getUTCDay() - 4 + 7) % 7) * 86400000;
            if (start > now) start -= 7 * 86400000;
            return start;
        }
        default: return 0;
    }
}

const changed = () => { preset = ""; saveFilters(); show(); };

on("click:period", id => { filters.period = String(id); changed(); });
on("click:type", id => {
    id = String(id);
    filters.types = filters.types.includes(id) ? filters.types.filter(x => x !== id) : filters.types.concat(id);
    changed();
});
on("click:allTypes", () => {
    filters.types = filters.types.length === CATS.length ? [] : CATS.map(c => c.id);
    changed();
});
on("click:pp", () => { filters.pp = !filters.pp; changed(); });
on("click:toggleFilters", () => { showFilters = !showFilters; store.set("showFilters", showFilters); show(); });

// ---- presets (shared by every copy) ----

let presets = store.shared.get("presets", []);
let presetsJson = JSON.stringify(presets);
const savePresets = () => { presetsJson = JSON.stringify(presets); store.shared.set("presets", presets); };

on("click:savePreset", () => {
    const name = String(get("presetName") || "").trim();
    if (!name) { set("presetMsg", tr("js.type_a_name_first", "Type a name first")); return; }
    const p = { name, period: filters.period, types: filters.types.slice(), pp: filters.pp };
    const i = presets.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
    if (i >= 0) presets[i] = p; else presets.push(p);
    savePresets();
    preset = name;
    saveFilters();
    set("presetName", "");
    set("presetMsg", i >= 0 ? tr("js.updated", "Updated \"{0}\"", name) : tr("js.saved", "Saved \"{0}\"", name));
    show();
});
on("click:loadPreset", name => {
    const p = presets.find(x => x.name === String(name));
    if (!p) return;
    filters = Object.assign(defaults(), { period: p.period, types: p.types.slice(), pp: !!p.pp });
    preset = p.name;
    saveFilters();
    set("presetMsg", "");
    show();
});
on("click:deletePreset", name => {
    presets = presets.filter(x => x.name !== String(name));
    savePresets();
    if (preset === String(name)) { preset = ""; saveFilters(); }
    set("presetMsg", tr("js.deleted_0", "Deleted \"{0}\"", name));
    show();
});
on("click:clearKills", () => {
    if (!clearArmed) { clearArmed = Date.now(); set("clearText", tr("js.click_again_to_clear", "Click again to clear")); return; }
    kills = []; lastKill = null; saveKills(); clearArmed = 0; set("clearText", tr("js.clear_history", "Clear history")); show();
});
let clearArmed = 0;

// Another copy saved or deleted a preset: pick it up; and keep "Session" / "Today" fresh
let lastMinute = 0;
on("tick", () => {
    if (pending) { replaying = false; commit(); }
    const s = store.shared.get("presets", []);
    const j = JSON.stringify(s);
    if (j !== presetsJson) { presets = s; presetsJson = j; show(); return; }
    if (clearArmed && Date.now() - clearArmed > 4000) { clearArmed = 0; set("clearText", tr("js.clear_history", "Clear history")); }
    const m = Math.floor(Date.now() / 60000);
    if (m !== lastMinute) { lastMinute = m; show(); }
});

// ---- the view ----

let showFilters = store.get("showFilters", false);

function when(at) {
    const d = new Date(at), now = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (d.toDateString() === now.toDateString()) return time;
    return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })} ${time}`;
}

function top(list, key, n) {
    const counts = {};
    for (const k of list) { const v = key(k); if (v) counts[v] = (counts[v] || 0) + 1; }
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
    const most = rows.length ? rows[0][1] : 1;
    return rows.map(([name, c]) => ({ name, text: fmt(c), fill: (c / most) + "*", rest: (1 - c / most + 0.0001) + "*" }));
}

function show() {
    const now = Date.now();
    const from = startOf(filters.period, now);
    // In the period (and Powerplay only, if chosen): counted per type for the chips
    const inPeriod = kills.filter(k => ms(k.at) >= from && (!filters.pp || k.power));
    const shown = inPeriod.filter(k => filters.types.includes(k.cat));

    const byCat = {};
    for (const k of inPeriod) byCat[k.cat] = (byCat[k.cat] || 0) + 1;

    set("periods", PERIODS.map(p => ({ id: p.id, name: periodName(p), on: p.id === filters.period })));
    set("types", CATS.map(c => ({ id: c.id, name: catName(c.id), count: fmt(byCat[c.id] || 0), on: filters.types.includes(c.id) })));
    set("ppOn", filters.pp);
    set("ppText", filters.pp ? tr("js.powerplay_kills_only", "Powerplay kills only ✓") : tr("js.powerplay_kills_only_2", "Powerplay kills only"));
    set("allTypesText", filters.types.length === CATS.length ? tr("js.none", "None") : tr("js.all", "All"));

    const typeText = filters.types.length === CATS.length ? tr("js.all_kills", "All kills")
        : filters.types.length === 0 ? tr("js.no_types_picked", "No types picked")
        : filters.types.map(t => catName(t)).join(", ");
    const periodText = (p => p ? periodName(p) : "")(PERIODS.find(p => p.id === filters.period));
    set("summary", `${preset ? preset + " · " : ""}${periodText} · ${typeText}${filters.pp ? " · Powerplay" : ""}`);
    set("showFilters", showFilters);
    set("filterArrow", showFilters ? tr("js.filters", "FILTERS ▴") : tr("js.filters_2", "FILTERS ▾"));

    set("presets", presets.map(p => ({ name: p.name, on: p.name === preset })));
    set("hasPresets", presets.length > 0);

    // Totals
    let credits = 0, fines = 0, merits = 0, pp = 0;
    for (const k of shown) {
        if (k.reward >= 0) credits += k.reward; else fines -= k.reward;
        merits += k.merits || 0;
        if (k.power) pp++;
    }
    set("kills", fmt(shown.length));
    set("credits", short(credits, "cr"));
    set("fines", fines ? "−" + short(fines, "cr") + tr("js.fines", " fines") : "");
    set("merits", fmt(merits));
    set("ppKills", pp ? tr("js.powerplay", "{0} Powerplay", fmt(pp)) : "");

    // Rate over the session
    const hours = filters.period === "session" ? (now - sessionStart) / 3600000 : 0;
    set("rate", hours > 0.05 && shown.length ? `${(shown.length / hours).toFixed(1)} / h` : "");

    // Breakdown
    set("byPower", top(shown.filter(k => k.power), k => k.power, 12));
    set("hasPowers", shown.some(k => k.power));
    set("topShips", top(shown, k => k.ship, 6));
    set("hasShips", shown.some(k => k.ship));
    set("topFactions", top(shown, k => k.faction, 6));
    set("hasFactions", shown.some(k => k.faction));

    // Thargoid encounters in the period (shown with the Thargoid type)
    const enc = encounters.filter(x => ms(x.at) >= from);
    const hyper = enc.filter(x => x.kind === "hyperdiction").length, inter = enc.length - hyper;
    set("encounters", enc.length && filters.types.includes("thargoid")
        ? [hyper ? (hyper === 1 ? tr("js.one_hyperdiction", "1 hyperdiction") : tr("js.hyperdictions", "{0} hyperdictions", fmt(hyper))) : "", inter ? (inter === 1 ? tr("js.one_interdiction", "1 interdiction") : tr("js.interdictions", "{0} interdictions", fmt(inter))) : ""]
              .filter(Boolean).join(" · ") + (enc.length ? tr("js.last", " · last {0}{1}", when(enc[enc.length - 1].at), enc[enc.length - 1].to ? tr("js.to", " (to {0})", enc[enc.length - 1].to) : "") : "")
        : "");

    set("recent", shown.slice(-40).reverse().map(k => ({
        when: when(k.at),
        cat: k.cat,
        type: catName(k.cat),
        what: [k.who || k.ship, k.who && k.ship ? k.ship : "", k.faction].filter(Boolean).join(" · "),
        power: k.power || "",
        reward: k.reward > 0 ? short(k.reward, "cr") : k.reward < 0 ? tr("js.fine", "fine ") + short(-k.reward, "cr") : "",
        merits: k.merits ? "+" + fmt(k.merits) + tr("js.merits", " merits") : "",
        system: k.system || "",
    })));
    set("empty", shown.length ? ""
        : kills.length ? "No kills match these filters."
        : "No kills yet. They're read back from the last few weeks of journals at startup, and added live.");
    if (get("clearText") == null) set("clearText", tr("js.clear_history", "Clear history"));
}

// ---- ship names (journal codes → readable) ----

const SHIPS = {
    sidewinder: "Sidewinder", eagle: "Eagle", hauler: "Hauler", adder: "Adder", viper: "Viper Mk III",
    viper_mkiv: "Viper Mk IV", cobramkiii: "Cobra Mk III", cobramkiv: "Cobra Mk IV", cobramkv: "Cobra Mk V",
    type6: "Type-6", type7: "Type-7", type8: "Type-8", type9: "Type-9", type9_military: "Type-10", type10: "Type-10",
    asp: "Asp Explorer", asp_scout: "Asp Scout", vulture: "Vulture", empire_trader: "Imperial Clipper",
    empire_courier: "Imperial Courier", empire_eagle: "Imperial Eagle", federation_dropship: "Federal Dropship",
    federation_dropship_mkii: "Federal Assault Ship", federation_gunship: "Federal Gunship",
    federation_corvette: "Federal Corvette", cutter: "Imperial Cutter", anaconda: "Anaconda", anacondamkii: "Anaconda Mk II", python: "Python",
    python_nx: "Python Mk II", orca: "Orca", ferdelance: "Fer-de-Lance", mamba: "Mamba", krait_mkii: "Krait Mk II",
    krait_light: "Krait Phantom", diamondback: "Diamondback Scout", diamondbackxl: "Diamondback Explorer",
    dolphin: "Dolphin", belugaliner: "Beluga Liner", independant_trader: "Keelback", typex: "Alliance Chieftain",
    typex_2: "Alliance Crusader", typex_3: "Alliance Challenger", mandalay: "Mandalay", corsair: "Corsair",
    panthermkii: "Panther Clipper Mk II", type8_transport: "Type-8", explorer_nx: "Caspian Explorer",
};
function shipName(code, localised) {
    const c = (code || "").toLowerCase();
    if (SHIPS[c]) return SHIPS[c];
    if (localised && !/^\$/.test(localised)) return localised;
    return c.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

set("presetName", "");
set("presetMsg", "");
show();
