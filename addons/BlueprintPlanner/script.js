// ================================================================== your materials (kept here so the addon stands alone)
//
// The game's "Materials" event (each time you load the game) lists everything you hold; every change after it is
// counted: collected, discarded, traded, used by an engineer or synthesis, given to a broker or a research drive,
// or rewarded. Kept with store, each event counted once (by its time and contents), so the app reading today's journal
// again at start-up doesn't count twice.

const CAPS = [0, 300, 250, 200, 150, 100];
let have = store.get("have", {});
let matNames = store.get("matNames", {});
let lastAt = store.get("lastAt", "");
let lastKeys = store.get("lastKeys", []);
let matsKnown = store.get("matsKnown", false);
const matListeners = [];

function matKey(name) {
    return String(name || "").toLowerCase().replace(/^\$/, "").replace(/_name;?$/, "").replace(/[^a-z0-9]/g, "");
}
let MAT_BY_KEY = null;   // (made the first time it's needed: the data is at the end of the file)
function matIndex() {
    if (!MAT_BY_KEY) {
        MAT_BY_KEY = {};
        for (const id of Object.keys(MATERIALS)) { MAT_BY_KEY[id] = id; MAT_BY_KEY[matKey(id)] = id; MAT_BY_KEY[matKey(MATERIALS[id][0])] = id; }
    }
    return MAT_BY_KEY;
}

function mat(name) {
    const id = matIndex()[matKey(name)];
    if (!id) return null;
    const d = MATERIALS[id];
    return { id, name: d[0], cat: d[1], grade: d[2], group: d[3], cap: CAPS[d[2]] || 0 };
}
function matName(id) {
    const m = mat(id);
    return matNames[id] || (m ? tr("mat." + id, m.name) : id);
}
function groupName(g) { return tr("mat.g." + g, MATERIAL_GROUPS[g] || g); }
function catName(c) { return c === "r" ? tr("mat.raw", "Raw") : c === "m" ? tr("mat.manufactured", "Manufactured") : tr("mat.encoded", "Encoded"); }
function tradable(m) { return m && !/Guardian|Thargoid/.test(m.group); }

function freshEvent(e) {
    const t = e.timestamp || "";
    if (!t) return true;
    const sig = JSON.stringify(e);
    if (lastAt && t < lastAt) return false;
    if (t === lastAt) { if (lastKeys.includes(sig)) return false; }
    else { lastAt = t; lastKeys = []; }
    lastKeys.push(sig);
    return true;
}
function saveMats() {
    store.set("have", have); store.set("matNames", matNames); store.set("lastAt", lastAt); store.set("lastKeys", lastKeys); store.set("matsKnown", matsKnown);
    matListeners.forEach(f => f());
}
function addMat(name, count, localised) {
    const m = mat(name);
    if (!m) return;
    if (localised && localised !== m.name) matNames[m.id] = localised;
    have[m.id] = Math.max(0, Math.min(m.cap || 9999, (have[m.id] || 0) + count));
}

on("Materials", e => {
    if (!freshEvent(e)) return;
    have = {};
    for (const list of [e.Raw, e.Manufactured, e.Encoded])
        for (const it of list || []) addMat(it.Name, it.Count || 0, it.Name_Localised);
    matsKnown = true;
    saveMats();
});
on("MaterialCollected", e => { if (freshEvent(e)) { addMat(e.Name, e.Count || 1, e.Name_Localised); saveMats(); } });
on("MaterialDiscarded", e => { if (freshEvent(e)) { addMat(e.Name, -(e.Count || 1), e.Name_Localised); saveMats(); } });
on("MaterialTrade", e => {
    if (!freshEvent(e)) return;
    if (e.Paid) addMat(e.Paid.Material, -(e.Paid.Quantity || 0), e.Paid.Material_Localised);
    if (e.Received) addMat(e.Received.Material, e.Received.Quantity || 0, e.Received.Material_Localised);
    saveMats();
});
function spendMats(list) { for (const it of list || []) addMat(it.Name, -(it.Count || 0), it.Name_Localised); }
const craftListeners = [];   // (a roll at an engineer: the plan counts it done)
on("EngineerCraft", e => { if (freshEvent(e)) { spendMats(e.Ingredients); craftListeners.forEach(f => f(e)); saveMats(); } });
on("Synthesis", e => { if (freshEvent(e)) { spendMats(e.Materials); saveMats(); } });
on("TechnologyBroker", e => { if (freshEvent(e)) { spendMats(e.Materials); saveMats(); } });
on("ScientificResearch", e => { if (freshEvent(e)) { addMat(e.Name, -(e.Count || 0), e.Name_Localised); saveMats(); } });
on("EngineerContribution", e => { if (freshEvent(e) && e.Type === "Materials") { addMat(e.Material, -(e.Quantity || 0), e.Material_Localised); saveMats(); } });
on("MissionCompleted", e => {
    if (!freshEvent(e) || !e.MaterialsReward) return;
    for (const it of e.MaterialsReward) addMat(it.Name, it.Count || 0, it.Name_Localised);
    saveMats();
});

// ================================================================== material traders
//
// At a trader of the right kind (raw, manufactured or encoded), within one category: a grade up costs 6 of the grade
// below, a grade down gives 3 of the grade below for 1; and swapping to another group (column) costs 6 times as much
// on top. Guardian and Thargoid materials can't be traded.

function traderName(cat) {
    return cat === "r" ? tr("trade.raw", "Raw material trader") : cat === "m" ? tr("trade.manufactured", "Manufactured material trader") : tr("trade.encoded", "Encoded data trader");
}

/// How many of `from` buy `n` of `to` (0 if they can't be traded for each other).
function tradeCost(from, to, n) {
    if (!tradable(from) || !tradable(to) || from.cat !== to.cat || from.id === to.id) return 0;
    const d = to.grade - from.grade;
    const cross = from.group === to.group ? 1 : 6;
    return d >= 0 ? n * Math.pow(6, d) * cross : Math.ceil(n * cross / Math.pow(3, -d));
}

/// What `units` of `from` get you of `to`.
function tradeGets(from, to, units) {
    if (!tradable(from) || !tradable(to) || from.cat !== to.cat || from.id === to.id) return 0;
    const d = to.grade - from.grade;
    const cross = from.group === to.group ? 1 : 6;
    return d >= 0 ? Math.floor(units / (Math.pow(6, d) * cross)) : Math.floor(units * Math.pow(3, -d) / cross);
}

/// Ways to get `n` of `want` from what you have to spare (spare: id → how many you can give): best first.
function tradeOptions(want, n, spare) {
    const out = [];
    for (const id of Object.keys(spare)) {
        const from = mat(id);
        const cost = tradeCost(from, want, n);
        if (!cost) continue;
        const can = spare[id];
        if (can <= 0) continue;
        const enough = can >= cost;
        const get = enough ? n : tradeGets(from, want, can);
        if (get <= 0) continue;
        const give = enough ? cost : tradeCost(from, want, get);   // (part of it: only what that many takes)
        out.push({ from, give, get, enough, sameGroup: from.group === want.group,
                   score: enough ? give / Math.max(1, can) : 1000 - get + give / Math.max(1, can) / 100 });
    }
    return out.sort((a, b) => a.score - b.score);
}
// Blueprint Planner: the engineering you're aiming for, and the materials it takes.
//
// Pick a module, a blueprint, the grades (from → to), how many rolls at each grade, and an experimental effect if you
// want one, then + Add. The plan totals the materials against what you have (your materials are kept from the
// journal), says what you're short of and how to trade for it from what you've got spare, and counts rolls off by
// itself when you engineer at an engineer. Everything it needs is in this file (the data is at the end).

let plan = store.get("plan", []);        // [{ id, type, bp, name, from, to, rolls: { g: left }, exp, expName, expDone }]
let onlyShort = store.get("onlyShort", false);
let reserve = store.get("reserve", 0);   // % of each material's cap kept back from trades

function newId() { return Math.random().toString(36).slice(2, 9); }
function modName(t) { return tr("eng.m." + t, MODULE_NAMES[t] || String(t).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, "-")); }
function bpsFor(type) { return BLUEPRINTS.filter(b => b[2].includes(type)); }
function bpFor(type, fd) { return BLUEPRINTS.find(b => b[0] === fd && b[2].includes(type)); }

// ------------------------------------------------------------------ the pickers
//
// Each drop-down shows a list of names (V[xNames]) and its SelectedIndex is bound to V[xIdx]; what's picked is kept
// here by id (sel), so the lists can change underneath without losing it.

let sel = store.get("sel", { type: "FrameShiftDrive", bp: "fsd_longrange", from: 1, to: 5, exp: "", rolls: "3" });
let lists = { type: [], bp: [], from: [], to: [], exp: [] };

function pickers() {
    lists.type = [...new Set(BLUEPRINTS.flatMap(b => b[2]))].filter(t => t !== "UnknownType")
        .map(t => ({ id: t, name: modName(t) })).sort((a, b) => a.name.localeCompare(b.name));
    if (!lists.type.some(t => t.id === sel.type)) sel.type = lists.type[0].id;

    const bps = [];
    for (const b of bpsFor(sel.type)) if (!bps.some(x => x.id === b[0])) bps.push({ id: b[0], name: tr("bp." + b[0], b[1]) });
    lists.bp = bps.sort((a, b) => a.name.localeCompare(b.name));
    if (!lists.bp.some(x => x.id === sel.bp)) sel.bp = lists.bp.length ? lists.bp[0].id : "";

    const b = bpFor(sel.type, sel.bp);
    const grades = b ? Object.keys(b[3]).map(Number).sort((x, y) => x - y) : [1];
    lists.from = lists.to = grades.map(g => ({ id: g, name: tr("js.grade", "Grade {0}", g) }));
    if (!grades.includes(sel.from)) sel.from = grades[0];
    if (!grades.includes(sel.to)) sel.to = grades[grades.length - 1];

    lists.exp = [{ id: "", name: tr("js.no_exp", "No experimental") }].concat(
        EXPERIMENTALS.filter(x => x[2].includes(sel.type)).map(x => ({ id: x[0], name: tr("bp." + x[0], x[1]) })));
    if (!lists.exp.some(x => x.id === sel.exp)) sel.exp = "";

    for (const k of Object.keys(lists)) {
        set(k + "Names", lists[k].map(x => x.name));
        set(k + "Idx", Math.max(0, lists[k].findIndex(x => x.id === sel[k])));
    }
    set("rolls", sel.rolls);
    store.set("sel", sel);
}

for (const k of ["type", "bp", "from", "to", "exp"])
    on("change:" + k + "Idx", v => {
        const i = Number(v);
        if (v === null || v === undefined || isNaN(i) || i < 0 || !lists[k][i]) return;   // (a list being swapped: not a pick)
        if (sel[k] === lists[k][i].id) return;
        sel[k] = lists[k][i].id;
        if (k === "type") { sel.bp = ""; sel.exp = ""; }
        if (k === "type" || k === "bp") { sel.from = 0; sel.to = 0; }
        pickers();
    });
on("change:rolls", v => { sel.rolls = String(v || ""); store.set("sel", sel); });

on("click:add", () => {
    const type = sel.type, bp = sel.bp;
    const b = bpFor(type, bp);
    if (!b) return;
    let from = sel.from, to = sel.to;
    if (from > to) { const t = from; from = to; to = t; }
    const rollsEach = Math.max(1, Math.min(20, parseInt(sel.rolls, 10) || 1));
    const rolls = {};
    for (const g of Object.keys(b[3]).map(Number)) if (g >= from && g <= to) rolls[g] = rollsEach;
    const exp = sel.exp || "";
    const x = EXPERIMENTALS.find(e => e[0] === exp && e[2].includes(type));
    plan.push({ id: newId(), type, bp, name: tr("bp." + bp, b[1]), from, to, rolls, exp: x ? exp : "", expName: x ? tr("bp." + exp, x[1]) : "", expDone: false });
    store.set("plan", plan);
    show();
});
on("click:remove", id => { plan = plan.filter(p => p.id !== id); store.set("plan", plan); show(); });
on("click:roll", id => {     // (a roll done somewhere the journal didn't see: count it by hand)
    const p = plan.find(x => x.id === id);
    if (!p) return;
    const g = Object.keys(p.rolls).map(Number).sort((a, b) => a - b).find(k => p.rolls[k] > 0);
    if (g !== undefined) p.rolls[g]--; else if (p.exp && !p.expDone) p.expDone = true;
    store.set("plan", plan);
    show();
});
on("click:clearDone", () => { plan = plan.filter(p => !isDone(p)); store.set("plan", plan); show(); });
on("change:onlyShort", v => { onlyShort = !!v; store.set("onlyShort", onlyShort); show(); });
on("change:reserve", v => { reserve = Math.max(0, Math.min(90, parseInt(v, 10) || 0)); store.set("reserve", reserve); show(); });

// a roll at an engineer: the plan's matching blueprint counts one off at that grade (or the experimental)
craftListeners.push(e => {
    const fd = String(e.BlueprintName || "").toLowerCase();
    const level = e.Level || 0;
    const exp = String(e.ApplyExperimentalEffect || "").toLowerCase();
    let changed = false;
    if (exp) {
        const p = plan.find(x => x.exp === exp && !x.expDone);
        if (p) { p.expDone = true; changed = true; }
    } else {
        const p = plan.find(x => x.bp === fd && (x.rolls[level] || 0) > 0);
        if (p) { p.rolls[level]--; changed = true; }
    }
    if (changed) store.set("plan", plan);
});

function isDone(p) { return Object.values(p.rolls).every(n => n <= 0) && (!p.exp || p.expDone); }

// ------------------------------------------------------------------ the sums

function needs(p) {
    const b = bpFor(p.type, p.bp);
    const out = {};
    if (b) for (const [g, left] of Object.entries(p.rolls))
        for (const [m, n] of b[3][g] || []) out[m] = (out[m] || 0) + n * left;
    if (p.exp && !p.expDone) {
        const x = EXPERIMENTALS.find(e => e[0] === p.exp && e[2].includes(p.type));
        if (x) for (const [m, n] of x[3]) out[m] = (out[m] || 0) + n;
    }
    return out;
}

/// The next roll of a plan item, and whether you have the materials for it right now.
function nextRoll(p) {
    const b = bpFor(p.type, p.bp);
    const g = Object.keys(p.rolls).map(Number).sort((a, c) => a - c).find(k => p.rolls[k] > 0);
    const list = g !== undefined && b ? b[3][g] : (p.exp && !p.expDone ? (EXPERIMENTALS.find(e => e[0] === p.exp && e[2].includes(p.type)) || [, , , []])[3] : null);
    if (!list) return null;
    const missing = list.filter(([m, n]) => (have[m] || 0) < n).map(([m]) => matName(m));
    return { grade: g, exp: g === undefined, missing };
}

function show() {
    pickers();
    set("onlyShort", onlyShort);
    set("reserve", String(reserve));

    // the plan
    const total = {};
    const rows = plan.map(p => {
        const n = needs(p);
        for (const [m, c] of Object.entries(n)) total[m] = (total[m] || 0) + c;
        const left = Object.values(p.rolls).reduce((a, c) => a + Math.max(0, c), 0);
        const next = nextRoll(p);
        const done = isDone(p);
        return {
            id: p.id, done,
            title: `${modName(p.type)} · ${p.name} G${p.from}${p.to > p.from ? "–" + p.to : ""}` + (p.exp ? " + " + p.expName : ""),
            detail: done ? tr("js.done", "Done ✓")
                : tr("js.left", "{0} roll(s) left", left) + (p.exp && !p.expDone ? " · " + tr("js.exp_left", "experimental to do") : ""),
            next: done || !next ? "" : next.missing.length === 0
                ? (next.exp ? tr("js.can_exp", "✓ You can apply the experimental now") : tr("js.can_roll", "✓ You can roll G{0} now", next.grade))
                : tr("js.short_for", "For the next roll: {0}", next.missing.slice(0, 4).join(", ") + (next.missing.length > 4 ? "…" : "")),
            ready: !!next && next.missing.length === 0,
        };
    });
    set("plan", rows);
    set("hasDone", plan.some(isDone));
    set("empty", plan.length ? "" : tr("js.empty", "Nothing planned yet: pick a module and a blueprint above, then + Add."));

    // the materials, against what you have
    const mats = Object.entries(total).filter(([, n]) => n > 0).map(([id, need]) => {
        const m = mat(id);
        const h = have[id] || 0;
        return { id, m, name: matName(id), need, have: h, short: Math.max(0, need - h), grade: m ? "G" + m.grade : "", cat: m ? catName(m.cat) : "" };
    }).sort((a, b) => (b.short > 0) - (a.short > 0) || (a.m && b.m ? a.m.cat.localeCompare(b.m.cat) || a.m.grade - b.m.grade : 0) || a.name.localeCompare(b.name));
    const shortList = mats.filter(x => x.short > 0);
    set("mats", (onlyShort ? shortList : mats).map(x => ({ name: x.name, grade: x.grade, need: fmt(x.need), have: fmt(x.have),
        status: x.short > 0 ? tr("js.short_n", "short {0}", fmt(x.short)) : "✓", short: x.short > 0 })));
    set("summary", !matsKnown ? tr("js.no_mats", "Waiting for your materials: the game lists them when you load into the game.")
        : plan.length === 0 ? "" : shortList.length === 0 ? tr("js.all_there", "✓ You have everything the plan needs.")
        : tr("js.short_sum", "Short of {0} material(s) for the whole plan.", shortList.length));
    set("summaryLevel", shortList.length ? "short" : "ok");

    // trades for what's short, from what the plan doesn't need (keeping the reserve)
    const spare = {};
    for (const id of Object.keys(have)) {
        const m = mat(id);
        if (!tradable(m)) continue;
        const keep = Math.ceil(m.cap * reserve / 100) + (total[id] || 0);
        if (have[id] - keep > 0) spare[id] = have[id] - keep;
    }
    const trades = [];
    for (const x of shortList) {
        if (!tradable(x.m)) { trades.push({ text: tr("js.no_trade", "{0}: can't be traded (find or earn it)", x.name), sub: "" }); continue; }
        const opts = tradeOptions(x.m, x.short, spare);
        if (!opts.length) { trades.push({ text: tr("js.nothing_spare", "{0}: nothing spare to trade for it", x.name), sub: "" }); continue; }
        const o = opts[0];
        spare[o.from.id] -= o.give;   // (one trade at a time: the next shortfall uses what's left)
        trades.push({
            text: tr("js.trade", "{0}: give {1} {2} → get {3}", x.name, fmt(o.give), matName(o.from.id), fmt(o.get)) + (o.enough ? "" : " " + tr("js.part", "(part of it)")),
            sub: traderName(x.m.cat) + (opts.length > 1 ? " · " + tr("js.or", "or {0} {1}", fmt(opts[1].give), matName(opts[1].from.id)) + (opts[1].enough ? "" : " " + tr("js.part", "(part of it)")) : ""),
        });
    }
    set("trades", trades);
}

matListeners.push(show);
on("language", show);

// ================================================================== data (from EDDiscovery's EliteDangerousCore, Apache 2.0)
const MATERIALS = {
    "carbon": ["Carbon", "r", 1, "RawCategory1"],
    "phosphorus": ["Phosphorus", "r", 1, "RawCategory2"],
    "sulphur": ["Sulphur", "r", 1, "RawCategory3"],
    "iron": ["Iron", "r", 1, "RawCategory4"],
    "nickel": ["Nickel", "r", 1, "RawCategory5"],
    "rhenium": ["Rhenium", "r", 1, "RawCategory6"],
    "lead": ["Lead", "r", 1, "RawCategory7"],
    "vanadium": ["Vanadium", "r", 2, "RawCategory1"],
    "chromium": ["Chromium", "r", 2, "RawCategory2"],
    "manganese": ["Manganese", "r", 2, "RawCategory3"],
    "zinc": ["Zinc", "r", 2, "RawCategory4"],
    "germanium": ["Germanium", "r", 2, "RawCategory5"],
    "arsenic": ["Arsenic", "r", 2, "RawCategory6"],
    "zirconium": ["Zirconium", "r", 2, "RawCategory7"],
    "niobium": ["Niobium", "r", 3, "RawCategory1"],
    "molybdenum": ["Molybdenum", "r", 3, "RawCategory2"],
    "cadmium": ["Cadmium", "r", 3, "RawCategory3"],
    "tin": ["Tin", "r", 3, "RawCategory4"],
    "tungsten": ["Tungsten", "r", 3, "RawCategory5"],
    "mercury": ["Mercury", "r", 3, "RawCategory6"],
    "boron": ["Boron", "r", 3, "RawCategory7"],
    "yttrium": ["Yttrium", "r", 4, "RawCategory1"],
    "technetium": ["Technetium", "r", 4, "RawCategory2"],
    "ruthenium": ["Ruthenium", "r", 4, "RawCategory3"],
    "selenium": ["Selenium", "r", 4, "RawCategory4"],
    "tellurium": ["Tellurium", "r", 4, "RawCategory5"],
    "polonium": ["Polonium", "r", 4, "RawCategory6"],
    "antimony": ["Antimony", "r", 4, "RawCategory7"],
    "scrambledemissiondata": ["Exceptional Scrambled Emission Data", "e", 1, "EncodedEmissionData"],
    "disruptedwakeechoes": ["Atypical Disrupted Wake Echoes", "e", 1, "EncodedWakeScans"],
    "shieldcyclerecordings": ["Distorted Shield Cycle Recordings", "e", 1, "EncodedShieldData"],
    "encryptedfiles": ["Unusual Encrypted Files", "e", 1, "EncodedEncryptionFiles"],
    "bulkscandata": ["Anomalous Bulk Scan Data", "e", 1, "EncodedDataArchives"],
    "legacyfirmware": ["Specialised Legacy Firmware", "e", 1, "EncodedFirmware"],
    "archivedemissiondata": ["Irregular Emission Data", "e", 2, "EncodedEmissionData"],
    "fsdtelemetry": ["Anomalous FSD Telemetry", "e", 2, "EncodedWakeScans"],
    "shieldsoakanalysis": ["Inconsistent Shield Soak Analysis", "e", 2, "EncodedShieldData"],
    "encryptioncodes": ["Tagged Encryption Codes", "e", 2, "EncodedEncryptionFiles"],
    "scanarchives": ["Unidentified Scan Archives", "e", 2, "EncodedDataArchives"],
    "consumerfirmware": ["Modified Consumer Firmware", "e", 2, "EncodedFirmware"],
    "emissiondata": ["Unexpected Emission Data", "e", 3, "EncodedEmissionData"],
    "wakesolutions": ["Strange Wake Solutions", "e", 3, "EncodedWakeScans"],
    "shielddensityreports": ["Untypical Shield Scans", "e", 3, "EncodedShieldData"],
    "symmetrickeys": ["Open Symmetric Keys", "e", 3, "EncodedEncryptionFiles"],
    "scandatabanks": ["Classified Scan Databanks", "e", 3, "EncodedDataArchives"],
    "industrialfirmware": ["Cracked Industrial Firmware", "e", 3, "EncodedFirmware"],
    "decodedemissiondata": ["Decoded Emission Data", "e", 4, "EncodedEmissionData"],
    "hyperspacetrajectories": ["Eccentric Hyperspace Trajectories", "e", 4, "EncodedWakeScans"],
    "shieldpatternanalysis": ["Aberrant Shield Pattern Analysis", "e", 4, "EncodedShieldData"],
    "encryptionarchives": ["Atypical Encryption Archives", "e", 4, "EncodedEncryptionFiles"],
    "encodedscandata": ["Divergent Scan Data", "e", 4, "EncodedDataArchives"],
    "securityfirmware": ["Security Firmware Patch", "e", 4, "EncodedFirmware"],
    "compactemissionsdata": ["Abnormal Compact Emissions Data", "e", 5, "EncodedEmissionData"],
    "dataminedwake": ["Datamined Wake Exceptions", "e", 5, "EncodedWakeScans"],
    "shieldfrequencydata": ["Peculiar Shield Frequency Data", "e", 5, "EncodedShieldData"],
    "adaptiveencryptors": ["Adaptive Encryptors Capture", "e", 5, "EncodedEncryptionFiles"],
    "classifiedscandata": ["Classified Scan Fragment", "e", 5, "EncodedDataArchives"],
    "embeddedfirmware": ["Modified Embedded Firmware", "e", 5, "EncodedFirmware"],
    "chemicalstorageunits": ["Chemical Storage Units", "m", 1, "ManufacturedChemical"],
    "temperedalloys": ["Tempered Alloys", "m", 1, "ManufacturedThermic"],
    "heatconductionwiring": ["Heat Conduction Wiring", "m", 1, "ManufacturedHeat"],
    "basicconductors": ["Basic Conductors", "m", 1, "ManufacturedConductive"],
    "mechanicalscrap": ["Mechanical Scrap", "m", 1, "ManufacturedMechanicalComponents"],
    "gridresistors": ["Grid Resistors", "m", 1, "ManufacturedCapacitors"],
    "wornshieldemitters": ["Worn Shield Emitters", "m", 1, "ManufacturedShielding"],
    "compactcomposites": ["Compact Composites", "m", 1, "ManufacturedComposite"],
    "crystalshards": ["Crystal Shards", "m", 1, "ManufacturedCrystals"],
    "salvagedalloys": ["Salvaged Alloys", "m", 1, "ManufacturedAlloys"],
    "chemicalprocessors": ["Chemical Processors", "m", 2, "ManufacturedChemical"],
    "heatresistantceramics": ["Heat Resistant Ceramics", "m", 2, "ManufacturedThermic"],
    "heatdispersionplate": ["Heat Dispersion Plate", "m", 2, "ManufacturedHeat"],
    "conductivecomponents": ["Conductive Components", "m", 2, "ManufacturedConductive"],
    "mechanicalequipment": ["Mechanical Equipment", "m", 2, "ManufacturedMechanicalComponents"],
    "hybridcapacitors": ["Hybrid Capacitors", "m", 2, "ManufacturedCapacitors"],
    "shieldemitters": ["Shield Emitters", "m", 2, "ManufacturedShielding"],
    "filamentcomposites": ["Filament Composites", "m", 2, "ManufacturedComposite"],
    "uncutfocuscrystals": ["Flawed Focus Crystals", "m", 2, "ManufacturedCrystals"],
    "galvanisingalloys": ["Galvanising Alloys", "m", 2, "ManufacturedAlloys"],
    "chemicaldistillery": ["Chemical Distillery", "m", 3, "ManufacturedChemical"],
    "precipitatedalloys": ["Precipitated Alloys", "m", 3, "ManufacturedThermic"],
    "heatexchangers": ["Heat Exchangers", "m", 3, "ManufacturedHeat"],
    "conductiveceramics": ["Conductive Ceramics", "m", 3, "ManufacturedConductive"],
    "mechanicalcomponents": ["Mechanical Components", "m", 3, "ManufacturedMechanicalComponents"],
    "electrochemicalarrays": ["Electrochemical Arrays", "m", 3, "ManufacturedCapacitors"],
    "shieldingsensors": ["Shielding Sensors", "m", 3, "ManufacturedShielding"],
    "highdensitycomposites": ["High Density Composites", "m", 3, "ManufacturedComposite"],
    "focuscrystals": ["Focus Crystals", "m", 3, "ManufacturedCrystals"],
    "phasealloys": ["Phase Alloys", "m", 3, "ManufacturedAlloys"],
    "chemicalmanipulators": ["Chemical Manipulators", "m", 4, "ManufacturedChemical"],
    "thermicalloys": ["Thermic Alloys", "m", 4, "ManufacturedThermic"],
    "heatvanes": ["Heat Vanes", "m", 4, "ManufacturedHeat"],
    "conductivepolymers": ["Conductive Polymers", "m", 4, "ManufacturedConductive"],
    "configurablecomponents": ["Configurable Components", "m", 4, "ManufacturedMechanicalComponents"],
    "polymercapacitors": ["Polymer Capacitors", "m", 4, "ManufacturedCapacitors"],
    "compoundshielding": ["Compound Shielding", "m", 4, "ManufacturedShielding"],
    "fedproprietarycomposites": ["Proprietary Composites", "m", 4, "ManufacturedComposite"],
    "refinedfocuscrystals": ["Refined Focus Crystals", "m", 4, "ManufacturedCrystals"],
    "protolightalloys": ["Proto Light Alloys", "m", 4, "ManufacturedAlloys"],
    "pharmaceuticalisolators": ["Pharmaceutical Isolators", "m", 5, "ManufacturedChemical"],
    "militarygradealloys": ["Military Grade Alloys", "m", 5, "ManufacturedThermic"],
    "protoheatradiators": ["Proto Heat Radiators", "m", 5, "ManufacturedHeat"],
    "biotechconductors": ["Biotech Conductors", "m", 5, "ManufacturedConductive"],
    "improvisedcomponents": ["Improvised Components", "m", 5, "ManufacturedMechanicalComponents"],
    "militarysupercapacitors": ["Military Supercapacitors", "m", 5, "ManufacturedCapacitors"],
    "imperialshielding": ["Imperial Shielding", "m", 5, "ManufacturedShielding"],
    "fedcorecomposites": ["Core Dynamics Composites", "m", 5, "ManufacturedComposite"],
    "exquisitefocuscrystals": ["Exquisite Focus Crystals", "m", 5, "ManufacturedCrystals"],
    "protoradiolicalloys": ["Proto Radiolic Alloys", "m", 5, "ManufacturedAlloys"],
    "guardian_vesselblueprint": ["Guardian Vessel Blueprint Fragment", "e", 5, "EncodedGuardian"],
    "ancientbiologicaldata": ["Pattern Alpha Obelisk Data", "e", 4, "EncodedGuardianObelisk"],
    "ancientculturaldata": ["Pattern Beta Obelisk Data", "e", 4, "EncodedGuardianObelisk"],
    "ancienthistoricaldata": ["Pattern Gamma Obelisk Data", "e", 4, "EncodedGuardianObelisk"],
    "ancientlanguagedata": ["Pattern Delta Obelisk Data", "e", 4, "EncodedGuardianObelisk"],
    "ancienttechnologicaldata": ["Pattern Epsilon Obelisk Data", "e", 4, "EncodedGuardianObelisk"],
    "guardian_moduleblueprint": ["Guardian Module Blueprint Fragment", "e", 4, "EncodedGuardian"],
    "guardian_weaponblueprint": ["Guardian Weapon Blueprint Fragment", "e", 4, "EncodedGuardian"],
    "tg_residuedata": ["Thargoid Residue Data", "e", 4, "EncodedThargoid1"],
    "tg_shipsystemsdata": ["Ship Systems Data", "e", 4, "EncodedThargoid1"],
    "unknownwakedata": ["Thargoid Wake Data", "e", 4, "EncodedThargoid1"],
    "tg_structuraldata": ["Thargoid Structural Data", "e", 2, "EncodedThargoid1"],
    "tg_compositiondata": ["Thargoid Material Composition Data", "e", 3, "EncodedThargoid1"],
    "tg_shipflightdata": ["Ship Flight Data", "e", 3, "EncodedThargoid2"],
    "unknownshipsignature": ["Thargoid Ship Signature", "e", 3, "EncodedThargoid2"],
    "tg_interdictiondata": ["Thargoid Interdiction Telemetry", "e", 3, "EncodedThargoid2"],
    "tg_shutdowndata": ["Massive Energy Surge Analytics", "e", 3, "EncodedThargoid2"],
    "tg_structuraldata02": ["Thargoid Capital Ship Data", "e", 3, "EncodedThargoid2"],
    "guardian_powercell": ["Guardian Power Cell", "m", 1, "ManufacturedGuardian"],
    "guardian_sentinel_wreckagecomponents": ["Guardian Wreckage Components", "m", 1, "ManufacturedGuardian"],
    "tg_abrasion03": ["Hardened Surface Fragments", "m", 1, "ManufacturedThargoid1"],
    "guardian_powerconduit": ["Guardian Power Conduit", "m", 2, "ManufacturedGuardian"],
    "unknowncarapace": ["Thargoid Carapace", "m", 2, "ManufacturedThargoid1"],
    "unknowncorechip": ["Tactical Core Chip", "m", 2, "ManufacturedThargoid1"],
    "guardian_sentinel_weaponparts": ["Guardian Sentinel Weapon Parts", "m", 3, "ManufacturedGuardian"],
    "guardian_techcomponent": ["Guardian Technology Component", "m", 3, "ManufacturedGuardian"],
    "tg_abrasion02": ["Phasing Membrane Residue", "m", 3, "ManufacturedThargoid1"],
    "tg_biomechanicalconduits": ["Bio-Mechanical Conduits", "m", 3, "ManufacturedThargoid1"],
    "tg_causticgeneratorparts": ["Corrosive Mechanisms", "m", 3, "ManufacturedThargoid2"],
    "tg_causticshard": ["Caustic Shard", "m", 3, "ManufacturedThargoid2"],
    "unknownenergycell": ["Thargoid Energy Cell", "m", 3, "ManufacturedThargoid2"],
    "tg_wreckagecomponents": ["Wreckage Components", "m", 3, "ManufacturedThargoid2"],
    "tg_causticcrystal": ["Caustic Crystal", "m", 4, "ManufacturedThargoid2"],
    "tg_weaponparts": ["Weapon Parts", "m", 4, "ManufacturedThargoid3"],
    "unknowntechnologycomponents": ["Thargoid Technological Components", "m", 4, "ManufacturedThargoid3"],
    "tg_abrasion01": ["Heat Exposure Specimen", "m", 5, "ManufacturedThargoid3"],
    "tg_propulsionelement": ["Propulsion Elements", "m", 5, "ManufacturedThargoid3"],
    "unknownenergysource": ["Sensor Fragment", "m", 5, "ManufacturedThargoid3"],
    "unknownorganiccircuitry": ["Thargoid Organic Circuitry", "m", 5, "ManufacturedThargoid4"],
};
const MATERIAL_GROUPS = {
    "RawCategory1": "Raw \u00b7 category 1",
    "RawCategory2": "Raw \u00b7 category 2",
    "RawCategory3": "Raw \u00b7 category 3",
    "RawCategory4": "Raw \u00b7 category 4",
    "RawCategory5": "Raw \u00b7 category 5",
    "RawCategory6": "Raw \u00b7 category 6",
    "RawCategory7": "Raw \u00b7 category 7",
    "EncodedEmissionData": "Emission data",
    "EncodedWakeScans": "Wake scans",
    "EncodedShieldData": "Shield data",
    "EncodedEncryptionFiles": "Encryption files",
    "EncodedDataArchives": "Data archives",
    "EncodedFirmware": "Encoded firmware",
    "EncodedGuardian": "Guardian data",
    "EncodedGuardianObelisk": "Guardian obelisk data",
    "EncodedThargoid1": "Thargoid data",
    "EncodedThargoid2": "Thargoid data (2)",
    "ManufacturedChemical": "Chemical",
    "ManufacturedThermic": "Thermic",
    "ManufacturedHeat": "Heat",
    "ManufacturedConductive": "Conductive",
    "ManufacturedMechanicalComponents": "Mechanical components",
    "ManufacturedCapacitors": "Capacitors",
    "ManufacturedShielding": "Shielding",
    "ManufacturedComposite": "Composite",
    "ManufacturedCrystals": "Crystals",
    "ManufacturedAlloys": "Alloys",
    "ManufacturedGuardian": "Guardian technology",
    "ManufacturedThargoid1": "Thargoid technology",
    "ManufacturedThargoid2": "Thargoid technology (2)",
    "ManufacturedThargoid3": "Thargoid technology (3)",
    "ManufacturedThargoid4": "Thargoid technology (4)"
};
const MODULE_NAMES = {
    "AXMissileRack": "AX Missile Rack",
    "AbrasionBlaster": "Abrasion Blaster",
    "Armour": "Armour",
    "AutoFieldMaintenanceUnit": "AFM Unit",
    "BeamLaser": "Beam Laser",
    "BurstLaser": "Burst Laser",
    "Cannon": "Cannon",
    "CargoRack": "Cargo Rack",
    "CargoScanner": "Manifest Scanner",
    "CausticSinkLauncher": "Caustic Sink Launcher",
    "ChaffLauncher": "Chaff Launcher",
    "CollectorLimpetController": "Collector Limpets",
    "DiscoveryScanner": "Discovery Scanner",
    "ElectronicCountermeasure": "ECM",
    "EnzymeMissileRack": "Enzyme Missile Rack",
    "FragmentCannon": "Fragment Cannon",
    "FrameShiftDrive": "Frame Shift Drive",
    "FrameShiftDriveInterdictor": "FSD Interdictor",
    "FuelScoop": "Fuel Scoop",
    "FuelTransferLimpetController": "Fuel Transfer Limpets",
    "HatchBreakerLimpetController": "Hatch Breaker Limpets",
    "HeatSinkLauncher": "Heat Sink Launcher",
    "HullReinforcementPackage": "Hull Reinforcement",
    "KillWarrantScanner": "Kill Warrant Scanner",
    "LifeSupport": "Life Support",
    "MineLauncher": "Mine Launcher",
    "MiningLaser": "Mining Laser",
    "MissileRack": "Missile Rack",
    "ModuleReinforcementPackage": "Module Reinforcement",
    "Multi_Cannon": "Multi-cannon",
    "PlasmaAccelerator": "Plasma Accelerator",
    "PointDefence": "Point Defence",
    "PowerDistributor": "Power Distributor",
    "PowerPlant": "Power Plant",
    "PrismaticShieldGenerator": "Prismatic Shields",
    "ProspectorLimpetController": "Prospector Limpets",
    "PulseLaser": "Pulse Laser",
    "RailGun": "Rail Gun",
    "Refinery": "Refinery",
    "SeekerMissileRack": "Seeker Missile Rack",
    "Sensor": "Sensors",
    "ShieldBooster": "Shield Booster",
    "ShieldCellBank": "Shield Cell Bank",
    "ShieldGenerator": "Shield Generator",
    "SurfaceScanner": "Surface Scanner",
    "Thrusters": "Thrusters",
    "TorpedoPylon": "Torpedo Pylon",
    "WakeScanner": "FSD Wake Scanner"
};
// [blueprint id, name, module types, { grade: [[material, count], …] }]
const BLUEPRINTS = [
    ["abrasionblaster_farreaching","Far-reaching",["AbrasionBlaster"],{"2":[["sulphur",1],["heatdispersionplate",1],["consumerfirmware",1]],"3":[["chromium",1],["consumerfirmware",1],["heatexchangers",1]],"4":[["consumerfirmware",1],["conductivepolymers",1],["selenium",1],["heatvanes",1]],"5":[["industrialfirmware",1],["thermicalloys",1],["biotechconductors",1],["protoheatradiators",1]]}],
    ["weapon_longrange","Long range, Focused",["AXMissileRack"],{"1":[]}],
    ["weapon_overcharged","Overcharged, Focused",["AXMissileRack"],{"1":[]}],
    ["weapon_rapidfire","Rapid fire, High capacity",["AXMissileRack"],{"1":[]}],
    ["weapon_longrange","Long range, Focused",["MiningLaser"],{"1":[]}],
    ["weapon_highcapacity","High Capacity Magazine",["AXMissileRack"],{"1":[]}],
    ["weapon_longrange","Long range",["AbrasionBlaster"],{"1":[]}],
    ["guardianmodule_sturdy","Anti-Guardian Zone Resistance",["AXMissileRack"],{"1":[["tg_abrasion03",2],["tg_causticcrystal",1]]}],
    ["misc_shielded","Shielded",["AutoFieldMaintenanceUnit"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["armour_advanced","Lightweight Armour",["Armour"],{"1":[["iron",1]],"2":[["iron",1],["conductivecomponents",1]],"3":[["iron",1],["conductivecomponents",1],["highdensitycomposites",1]],"4":[["germanium",1],["conductiveceramics",1],["fedproprietarycomposites",1]],"5":[["conductiveceramics",1],["tin",1],["militarygradealloys",1]]}],
    ["armour_explosive","Blast Resistant Armour",["Armour"],{"1":[["nickel",1]],"2":[["carbon",1],["zinc",1]],"3":[["salvagedalloys",1],["vanadium",1],["zirconium",1]],"4":[["galvanisingalloys",1],["tungsten",1],["mercury",1]],"5":[["phasealloys",1],["molybdenum",1],["ruthenium",1]]}],
    ["armour_heavyduty","Heavy Duty Armour",["Armour"],{"1":[["carbon",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["armour_kinetic","Kinetic Resistant Armour",["Armour"],{"1":[["nickel",1]],"2":[["nickel",1],["vanadium",1]],"3":[["salvagedalloys",1],["vanadium",1],["highdensitycomposites",1]],"4":[["galvanisingalloys",1],["tungsten",1],["fedproprietarycomposites",1]],"5":[["phasealloys",1],["molybdenum",1],["fedcorecomposites",1]]}],
    ["armour_thermic","Thermal Resistant Armour",["Armour"],{"1":[["heatconductionwiring",1]],"2":[["nickel",1],["heatdispersionplate",1]],"3":[["salvagedalloys",1],["vanadium",1],["heatexchangers",1]],"4":[["galvanisingalloys",1],["tungsten",1],["heatvanes",1]],"5":[["phasealloys",1],["molybdenum",1],["protoheatradiators",1]]}],
    ["weapon_efficient","Efficient Weapon",["BeamLaser"],{"1":[["sulphur",1]],"2":[["sulphur",1],["heatdispersionplate",1]],"3":[["scrambledemissiondata",1],["chromium",1],["heatexchangers",1]],"4":[["archivedemissiondata",1],["selenium",1],["heatvanes",1]],"5":[["emissiondata",1],["cadmium",1],["protoheatradiators",1]]}],
    ["weapon_lightweight","Light Weight Mount",["BeamLaser"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_longrange","Long-Range Weapon",["BeamLaser"],{"1":[["sulphur",1]],"2":[["sulphur",1],["consumerfirmware",1]],"3":[["sulphur",1],["consumerfirmware",1],["focuscrystals",1]],"4":[["consumerfirmware",1],["focuscrystals",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["thermicalloys",1],["biotechconductors",1]]}],
    ["weapon_overcharged","Overcharged Weapon",["BeamLaser"],{"1":[["nickel",1]],"2":[["nickel",1],["conductivecomponents",1]],"3":[["nickel",1],["conductivecomponents",1],["electrochemicalarrays",1]],"4":[["zinc",1],["conductiveceramics",1],["polymercapacitors",1]],"5":[["zirconium",1],["conductivepolymers",1],["embeddedfirmware",1]]}],
    ["weapon_shortrange","Short-Range Blaster",["BeamLaser"],{"1":[["nickel",1]],"2":[["nickel",1],["consumerfirmware",1]],"3":[["nickel",1],["consumerfirmware",1],["electrochemicalarrays",1]],"4":[["consumerfirmware",1],["electrochemicalarrays",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["configurablecomponents",1],["biotechconductors",1]]}],
    ["weapon_sturdy","Sturdy Mount",["BeamLaser"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["beamlaser_thermalplasmaconversion","Plasma conversion",["BeamLaser"],{"1":[["phosphorus",1],["heatconductionwiring",1]],"2":[["arsenic",1],["heatconductionwiring",1],["heatdispersionplate",1]],"3":[["arsenic",1],["heatdispersionplate",1],["phasealloys",1]],"4":[["heatdispersionplate",1],["phasealloys",1],["refinedfocuscrystals",1],["configurablecomponents",1]],"5":[["technetium",1],["thermicalloys",1],["militarysupercapacitors",1],["embeddedfirmware",1]]}],
    ["beamlaser_overloaded","Overloaded",["BeamLaser"],{"2":[["chromium",1],["conductivecomponents",1],["nickel",1]],"3":[["chromium",1],["conductivecomponents",1],["electrochemicalarrays",1]],"4":[["electrochemicalarrays",1],["highdensitycomposites",1],["polymercapacitors",1],["focuscrystals",1]],"5":[["zirconium",1],["militarysupercapacitors",1],["embeddedfirmware",1],["focuscrystals",1]]}],
    ["weapon_efficient","Efficient Weapon",["BurstLaser"],{"1":[["sulphur",1]],"2":[["sulphur",1],["heatdispersionplate",1]],"3":[["scrambledemissiondata",1],["chromium",1],["heatexchangers",1]],"4":[["archivedemissiondata",1],["selenium",1],["heatvanes",1]],"5":[["emissiondata",1],["cadmium",1],["protoheatradiators",1]]}],
    ["weapon_focused","Focused Weapon",["BurstLaser"],{"1":[["iron",1]],"2":[["iron",1],["conductivecomponents",1]],"3":[["iron",1],["chromium",1],["conductiveceramics",1]],"4":[["germanium",1],["focuscrystals",1],["polymercapacitors",1]],"5":[["niobium",1],["refinedfocuscrystals",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["BurstLaser"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_longrange","Long-Range Weapon",["BurstLaser"],{"1":[["sulphur",1]],"2":[["sulphur",1],["consumerfirmware",1]],"3":[["sulphur",1],["consumerfirmware",1],["focuscrystals",1]],"4":[["consumerfirmware",1],["focuscrystals",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["thermicalloys",1],["biotechconductors",1]]}],
    ["weapon_overcharged","Overcharged Weapon",["BurstLaser"],{"1":[["nickel",1]],"2":[["nickel",1],["conductivecomponents",1]],"3":[["nickel",1],["conductivecomponents",1],["electrochemicalarrays",1]],"4":[["zinc",1],["conductiveceramics",1],["polymercapacitors",1]],"5":[["zirconium",1],["conductivepolymers",1],["embeddedfirmware",1]]}],
    ["weapon_rapidfire","Rapid Fire Modification",["BurstLaser"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["heatdispersionplate",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["technetium",1]]}],
    ["weapon_shortrange","Short-Range Blaster",["BurstLaser"],{"1":[["nickel",1]],"2":[["nickel",1],["consumerfirmware",1]],"3":[["nickel",1],["consumerfirmware",1],["electrochemicalarrays",1]],"4":[["consumerfirmware",1],["electrochemicalarrays",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["configurablecomponents",1],["biotechconductors",1]]}],
    ["weapon_sturdy","Sturdy Mount",["BurstLaser"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["burstlaser_regenerative","Regenerative",["BurstLaser"],{"2":[],"3":[],"4":[],"5":[]}],
    ["burstlaser_thermalplasmaconversion","Plasma conversion",["BurstLaser"],{"1":[["phosphorus",1],["heatconductionwiring",1]],"2":[["arsenic",1],["heatconductionwiring",1],["heatdispersionplate",1]],"3":[["arsenic",1],["heatdispersionplate",1],["phasealloys",1]],"4":[["heatdispersionplate",1],["phasealloys",1],["refinedfocuscrystals",1],["configurablecomponents",1]],"5":[["technetium",1],["thermicalloys",1],["militarysupercapacitors",1],["embeddedfirmware",1]]}],
    ["weapon_efficient","Efficient Weapon",["Cannon"],{"1":[["sulphur",1]],"2":[["sulphur",1],["heatdispersionplate",1]],"3":[["scrambledemissiondata",1],["chromium",1],["heatexchangers",1]],"4":[["archivedemissiondata",1],["selenium",1],["heatvanes",1]],"5":[["emissiondata",1],["cadmium",1],["protoheatradiators",1]]}],
    ["weapon_highcapacity","High Capacity Magazine",["Cannon"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["vanadium",1]],"3":[["mechanicalscrap",1],["vanadium",1],["niobium",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1]],"5":[["mechanicalcomponents",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["Cannon"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_longrange","Long-Range Weapon",["Cannon"],{"1":[["sulphur",1]],"2":[["sulphur",1],["consumerfirmware",1]],"3":[["sulphur",1],["consumerfirmware",1],["focuscrystals",1]],"4":[["consumerfirmware",1],["focuscrystals",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["thermicalloys",1],["biotechconductors",1]]}],
    ["weapon_overcharged","Overcharged Weapon",["Cannon"],{"1":[["nickel",1]],"2":[["nickel",1],["conductivecomponents",1]],"3":[["nickel",1],["conductivecomponents",1],["electrochemicalarrays",1]],"4":[["zinc",1],["conductiveceramics",1],["polymercapacitors",1]],"5":[["zirconium",1],["conductivepolymers",1],["embeddedfirmware",1]]}],
    ["weapon_rapidfire","Rapid Fire Modification",["Cannon"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["heatdispersionplate",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["technetium",1]]}],
    ["weapon_shortrange","Short-Range Blaster",["Cannon"],{"1":[["nickel",1]],"2":[["nickel",1],["consumerfirmware",1]],"3":[["nickel",1],["consumerfirmware",1],["electrochemicalarrays",1]],"4":[["consumerfirmware",1],["electrochemicalarrays",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["configurablecomponents",1],["biotechconductors",1]]}],
    ["weapon_sturdy","Sturdy Mount",["Cannon"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["cannon_forceimpact","Force impact",["Cannon"],{"2":[],"3":[],"4":[],"5":[]}],
    ["sensor_fastscan","Fast Scanner",["CargoScanner"],{"1":[["phosphorus",1]],"2":[["phosphorus",1],["uncutfocuscrystals",1]],"3":[["phosphorus",1],["uncutfocuscrystals",1],["symmetrickeys",1]],"4":[["manganese",1],["focuscrystals",1],["encryptionarchives",1]],"5":[["arsenic",1],["refinedfocuscrystals",1],["adaptiveencryptors",1]]}],
    ["misc_lightweight","Lightweight",["CargoScanner"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["sensor_longrange","Long-Range Scanner",["CargoScanner"],{"1":[["iron",1]],"2":[["iron",1],["hybridcapacitors",1]],"3":[["iron",1],["hybridcapacitors",1],["emissiondata",1]],"4":[["germanium",1],["electrochemicalarrays",1],["decodedemissiondata",1]],"5":[["niobium",1],["polymercapacitors",1],["compactemissionsdata",1]]}],
    ["misc_reinforced","Reinforced",["CargoScanner"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["CargoScanner"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["sensor_wideangle","Wide Angle Scanner",["CargoScanner"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["germanium",1]],"3":[["mechanicalscrap",1],["germanium",1],["scandatabanks",1]],"4":[["mechanicalequipment",1],["niobium",1],["encodedscandata",1]],"5":[["mechanicalcomponents",1],["tin",1],["classifiedscandata",1]]}],
    ["misc_chaffcapacity","Chaff Ammo Capacity",["ChaffLauncher"],{"1":[["mechanicalscrap",1]]}],
    ["misc_lightweight","Lightweight",["ChaffLauncher"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["misc_reinforced","Reinforced",["ChaffLauncher"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["ChaffLauncher"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["misc_lightweight","Lightweight",["CollectorLimpetController"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["misc_reinforced","Reinforced",["CollectorLimpetController"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["CollectorLimpetController"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["misc_heatsinkcapacity","Ammo capacity",["CausticSinkLauncher"],{"1":[["mechanicalscrap",1],["vanadium",1],["niobium",1]]}],
    ["misc_lightweight","Lightweight",["CausticSinkLauncher"],{"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"2":[["salvagedalloys",1],["manganese",1]],"1":[["phosphorus",1]]}],
    ["misc_reinforced","Reinforced",["CausticSinkLauncher"],{"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"2":[["nickel",1],["shieldemitters",1]],"1":[["nickel",1]]}],
    ["misc_shielded","Shielded",["CausticSinkLauncher"],{"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"2":[["carbon",1],["shieldemitters",1]],"1":[["wornshieldemitters",1]]}],
    ["detailedsurfacescanner_longrange","Long range detailed",["DiscoveryScanner"],{"2":[["mechanicalscrap",1],["germanium",1],["consumerfirmware",1]],"3":[["mechanicalscrap",1],["germanium",1],["phasealloys",1]],"4":[["mechanicalequipment",1],["niobium",1],["phasealloys",1],["protolightalloys",1]],"5":[["mechanicalequipment",1],["mechanicalcomponents",1],["tin",1],["protoradiolicalloys",1]]}],
    ["misc_lightweight","Lightweight",["ElectronicCountermeasure"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["misc_reinforced","Reinforced",["ElectronicCountermeasure"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["ElectronicCountermeasure"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["enzymemissilerack_highyield","High-yield",["EnzymeMissileRack"],{"2":[["mechanicalscrap",1],["vanadium",1],["conductivecomponents",1]],"3":[["mechanicalscrap",1],["vanadium",1],["electrochemicalarrays",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1],["polymercapacitors",1]],"5":[["mechanicalcomponents",1],["fedproprietarycomposites",1],["embeddedfirmware",1],["militarysupercapacitors",1]]}],
    ["engine_dirty","Dirty Drive Tuning",["Thrusters"],{"1":[["legacyfirmware",1]],"2":[["legacyfirmware",1],["mechanicalequipment",1]],"3":[["legacyfirmware",1],["chromium",1],["mechanicalcomponents",1]],"4":[["consumerfirmware",1],["selenium",1],["configurablecomponents",1]],"5":[["industrialfirmware",1],["cadmium",1],["pharmaceuticalisolators",1]]}],
    ["engine_reinforced","Drive Strengthening",["Thrusters"],{"1":[["carbon",1]],"2":[["heatconductionwiring",1],["vanadium",1]],"3":[["heatconductionwiring",1],["vanadium",1],["shieldingsensors",1]],"4":[["heatdispersionplate",1],["highdensitycomposites",1],["compoundshielding",1]],"5":[["heatexchangers",1],["fedproprietarycomposites",1],["imperialshielding",1]]}],
    ["engine_tuned","Clean Drive Tuning",["Thrusters"],{"1":[["sulphur",1]],"2":[["legacyfirmware",1],["conductivecomponents",1]],"3":[["legacyfirmware",1],["conductivecomponents",1],["emissiondata",1]],"4":[["consumerfirmware",1],["conductiveceramics",1],["decodedemissiondata",1]],"5":[["conductiveceramics",1],["tin",1],["compactemissionsdata",1]]}],
    ["weapon_doubleshot","Double Shot",["FragmentCannon"],{"1":[["carbon",1]],"2":[["carbon",1],["mechanicalequipment",1]],"3":[["carbon",1],["mechanicalequipment",1],["industrialfirmware",1]],"4":[["vanadium",1],["mechanicalcomponents",1],["securityfirmware",1]],"5":[["highdensitycomposites",1],["configurablecomponents",1],["embeddedfirmware",1]]}],
    ["weapon_efficient","Efficient Weapon",["FragmentCannon"],{"1":[["sulphur",1]],"2":[["sulphur",1],["heatdispersionplate",1]],"3":[["scrambledemissiondata",1],["chromium",1],["heatexchangers",1]],"4":[["archivedemissiondata",1],["selenium",1],["heatvanes",1]],"5":[["emissiondata",1],["cadmium",1],["protoheatradiators",1]]}],
    ["weapon_highcapacity","High Capacity Magazine",["FragmentCannon"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["vanadium",1]],"3":[["mechanicalscrap",1],["vanadium",1],["niobium",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1]],"5":[["mechanicalcomponents",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["FragmentCannon"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_overcharged","Overcharged Weapon",["FragmentCannon"],{"1":[["nickel",1]],"2":[["nickel",1],["conductivecomponents",1]],"3":[["nickel",1],["conductivecomponents",1],["electrochemicalarrays",1]],"4":[["zinc",1],["conductiveceramics",1],["polymercapacitors",1]],"5":[["zirconium",1],["conductivepolymers",1],["embeddedfirmware",1]]}],
    ["weapon_rapidfire","Rapid Fire Modification",["FragmentCannon"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["heatdispersionplate",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["technetium",1]]}],
    ["weapon_sturdy","Sturdy Mount",["FragmentCannon"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["fragmentcannonsmall_doublescreaming","Double screaming",["FragmentCannon"],{"2":[["carbon",1],["mechanicalscrap",1],["mechanicalequipment",1]],"3":[["carbon",1],["mechanicalequipment",1],["tin",1]],"4":[["vanadium",1],["industrialfirmware",1],["mechanicalcomponents",1],["securityfirmware",1]],"5":[["highdensitycomposites",1],["mechanicalcomponents",1],["configurablecomponents",1],["embeddedfirmware",1]]}],
    ["fragmentcannonlarge_doublescreaming","Double screaming",["FragmentCannon"],{"2":[["carbon",1],["mechanicalscrap",1],["mechanicalequipment",1]],"3":[["carbon",1],["mechanicalequipment",1],["tin",1]],"4":[["vanadium",1],["industrialfirmware",1],["mechanicalcomponents",1],["securityfirmware",1]],"5":[["highdensitycomposites",1],["mechanicalcomponents",1],["configurablecomponents",1],["embeddedfirmware",1]]}],
    ["fsd_fastboot","Faster FSD Boot Sequence",["FrameShiftDrive"],{"1":[["gridresistors",1]],"2":[["gridresistors",1],["chromium",1]],"3":[["gridresistors",1],["heatdispersionplate",1],["selenium",1]],"4":[["hybridcapacitors",1],["heatexchangers",1],["cadmium",1]],"5":[["electrochemicalarrays",1],["heatvanes",1],["tellurium",1]]}],
    ["fsd_longrange","Increased FSD Range",["FrameShiftDrive"],{"1":[["disruptedwakeechoes",1]],"2":[["disruptedwakeechoes",1],["chemicalprocessors",1]],"3":[["phosphorus",1],["chemicalprocessors",1],["wakesolutions",1]],"4":[["manganese",1],["chemicaldistillery",1],["hyperspacetrajectories",1]],"5":[["arsenic",1],["chemicalmanipulators",1],["dataminedwake",1]]}],
    ["fsd_shielded","Shielded FSD",["FrameShiftDrive"],{"1":[["nickel",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["zinc",1],["shieldingsensors",1]],"4":[["vanadium",1],["highdensitycomposites",1],["compoundshielding",1]],"5":[["tungsten",1],["fedproprietarycomposites",1],["imperialshielding",1]]}],
    ["fsdinterdictor_expanded","Expanded FSD Interdictor Capture Arc",["FrameShiftDriveInterdictor"],{"1":[["mechanicalscrap",1]],"2":[["encryptedfiles",1],["mechanicalequipment",1]],"3":[["gridresistors",1],["encryptioncodes",1],["mechanicalcomponents",1]],"4":[["mechanicalequipment",1],["wakesolutions",1],["encodedscandata",1]],"5":[["mechanicalcomponents",1],["hyperspacetrajectories",1],["classifiedscandata",1]]}],
    ["fsdinterdictor_longrange","Longer Range FSD Interdictor",["FrameShiftDriveInterdictor"],{"1":[["encryptedfiles",1]],"2":[["disruptedwakeechoes",1],["encryptioncodes",1]],"3":[["bulkscandata",1],["fsdtelemetry",1],["symmetrickeys",1]],"4":[["scanarchives",1],["wakesolutions",1],["encryptionarchives",1]],"5":[["scandatabanks",1],["hyperspacetrajectories",1],["adaptiveencryptors",1]]}],
    ["misc_shielded","Shielded",["FuelScoop"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["fuelscoop_efficiency","Scoop rate enhanced",["FuelScoop"],{"1":[["phosphorus",1],["gridresistors",1]],"2":[["chromium",1],["gridresistors",1],["chemicalprocessors",1]],"3":[["chromium",1],["chemicalprocessors",1],["conductiveceramics",1]],"4":[["chemicalprocessors",2],["chemicaldistillery",1],["protolightalloys",1]],"5":[["tellurium",1],["chemicalmanipulators",1],["protoheatradiators",1],["protoradiolicalloys",1]]}],
    ["misc_lightweight","Lightweight",["FuelTransferLimpetController"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["misc_reinforced","Reinforced",["FuelTransferLimpetController"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["FuelTransferLimpetController"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["misc_lightweight","Lightweight",["HatchBreakerLimpetController"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["misc_reinforced","Reinforced",["HatchBreakerLimpetController"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["HatchBreakerLimpetController"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["misc_heatsinkcapacity","Heatsink Ammo Capacity",["HeatSinkLauncher"],{"1":[["mechanicalscrap",1],["vanadium",1],["niobium",1]]}],
    ["misc_lightweight","Lightweight",["HeatSinkLauncher"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["misc_reinforced","Reinforced",["HeatSinkLauncher"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["HeatSinkLauncher"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["hullreinforcement_advanced","Lightweight Hull Reinforcement",["HullReinforcementPackage"],{"1":[["iron",1]],"2":[["iron",1],["conductivecomponents",1]],"3":[["iron",1],["conductivecomponents",1],["highdensitycomposites",1]],"4":[["germanium",1],["conductiveceramics",1],["fedproprietarycomposites",1]],"5":[["conductiveceramics",1],["tin",1],["militarygradealloys",1]]}],
    ["hullreinforcement_explosive","Blast Resistant Hull Reinforcement",["HullReinforcementPackage"],{"1":[["nickel",1]],"2":[["carbon",1],["zinc",1]],"3":[["salvagedalloys",1],["vanadium",1],["zirconium",1]],"4":[["galvanisingalloys",1],["tungsten",1],["mercury",1]],"5":[["phasealloys",1],["molybdenum",1],["ruthenium",1]]}],
    ["hullreinforcement_heavyduty","Heavy Duty Hull Reinforcement",["HullReinforcementPackage"],{"1":[["carbon",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["hullreinforcement_kinetic","Kinetic Resistant Hull Reinforcement",["HullReinforcementPackage"],{"1":[["nickel",1]],"2":[["nickel",1],["vanadium",1]],"3":[["salvagedalloys",1],["vanadium",1],["highdensitycomposites",1]],"4":[["galvanisingalloys",1],["tungsten",1],["fedproprietarycomposites",1]],"5":[["phasealloys",1],["molybdenum",1],["fedcorecomposites",1]]}],
    ["hullreinforcement_thermic","Thermal Resistant Hull Reinforcement",["HullReinforcementPackage"],{"1":[["heatconductionwiring",1]],"2":[["nickel",1],["heatdispersionplate",1]],"3":[["salvagedalloys",1],["vanadium",1],["heatexchangers",1]],"4":[["galvanisingalloys",1],["tungsten",1],["heatvanes",1]],"5":[["phasealloys",1],["molybdenum",1],["protoheatradiators",1]]}],
    ["sensor_fastscan","Fast Scanner",["KillWarrantScanner"],{"1":[["phosphorus",1]],"2":[["phosphorus",1],["uncutfocuscrystals",1]],"3":[["phosphorus",1],["uncutfocuscrystals",1],["symmetrickeys",1]],"4":[["manganese",1],["focuscrystals",1],["encryptionarchives",1]],"5":[["arsenic",1],["refinedfocuscrystals",1],["adaptiveencryptors",1]]}],
    ["misc_lightweight","Lightweight",["KillWarrantScanner"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["sensor_longrange","Long-Range Scanner",["KillWarrantScanner"],{"1":[["iron",1]],"2":[["iron",1],["hybridcapacitors",1]],"3":[["iron",1],["hybridcapacitors",1],["emissiondata",1]],"4":[["germanium",1],["electrochemicalarrays",1],["decodedemissiondata",1]],"5":[["niobium",1],["polymercapacitors",1],["compactemissionsdata",1]]}],
    ["misc_reinforced","Reinforced",["KillWarrantScanner"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["KillWarrantScanner"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["sensor_wideangle","Wide Angle Scanner",["KillWarrantScanner"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["germanium",1]],"3":[["mechanicalscrap",1],["germanium",1],["scandatabanks",1]],"4":[["mechanicalequipment",1],["niobium",1],["encodedscandata",1]],"5":[["mechanicalcomponents",1],["tin",1],["classifiedscandata",1]]}],
    ["misc_lightweight","Lightweight",["LifeSupport"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["misc_reinforced","Reinforced",["LifeSupport"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["LifeSupport"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["weapon_highcapacity","High Capacity Magazine",["LifeSupport"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["vanadium",1]],"3":[["mechanicalscrap",1],["vanadium",1],["niobium",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1]],"5":[["mechanicalcomponents",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["LifeSupport"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_rapidfire","Rapid Fire Modification",["LifeSupport"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["heatdispersionplate",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["technetium",1]]}],
    ["weapon_sturdy","Sturdy Mount",["LifeSupport"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["weapon_highcapacity","High Capacity Magazine",["MissileRack","SeekerMissileRack"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["vanadium",1]],"3":[["mechanicalscrap",1],["vanadium",1],["niobium",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1]],"5":[["mechanicalcomponents",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["MissileRack","SeekerMissileRack"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_rapidfire","Rapid Fire Modification",["MissileRack","SeekerMissileRack"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["heatdispersionplate",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["technetium",1]]}],
    ["weapon_sturdy","Sturdy Mount",["MissileRack","SeekerMissileRack"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["seekermissilerack_drag","Drag",["SeekerMissileRack"],{"2":[["mechanicalscrap",1],["vanadium",1],["heatdispersionplate",1]],"3":[["mechanicalscrap",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["highdensitycomposites",1],["thermicalloys",1]],"5":[["mechanicalcomponents",1],["fedproprietarycomposites",1],["technetium",1],["militarysupercapacitors",1]]}],
    ["seekermissilerack_lightweightthermal","Lightweight thermal",["SeekerMissileRack"],{"2":[["mechanicalscrap",1],["vanadium",1],["manganese",1]],"3":[["mechanicalscrap",1],["mechanicalequipment",1],["conductiveceramics",1]],"4":[["consumerfirmware",1],["phasealloys",1],["protolightalloys",1],["thermicalloys",1]],"5":[["mechanicalcomponents",1],["protolightalloys",1],["protoradiolicalloys",1],["militarysupercapacitors",1]]}],
    ["seekermissilerackmedium_lockdown","Lockdown",["SeekerMissileRack"],{"2":[["mechanicalscrap",1],["nickel",1],["vanadium",1]],"3":[["mechanicalscrap",1],["mechanicalequipment",1],["tungsten",1]],"4":[["consumerfirmware",1],["tungsten",1],["molybdenum",1],["thermicalloys",1]],"5":[["mechanicalcomponents",1],["molybdenum",1],["technetium",1],["militarysupercapacitors",1]]}],
    ["seekermissileracklarge_lockdown","Lockdown",["SeekerMissileRack"],{"2":[["mechanicalscrap",1],["nickel",1],["vanadium",1]],"3":[["mechanicalscrap",1],["mechanicalequipment",1],["tungsten",1]],"4":[["consumerfirmware",1],["tungsten",1],["molybdenum",1],["thermicalloys",1]],"5":[["mechanicalcomponents",1],["molybdenum",1],["technetium",1],["militarysupercapacitors",1]]}],
    ["seekermissileracklarge_exposingmissiles","Exposing",["SeekerMissileRack"],{"2":[],"3":[],"4":[],"5":[]}],
    ["weapon_highcapacity","High Capacity Magazine",["MineLauncher"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["vanadium",1]],"3":[["mechanicalscrap",1],["vanadium",1],["niobium",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1]],"5":[["mechanicalcomponents",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["MineLauncher"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_rapidfire","Rapid Fire Modification",["MineLauncher"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["heatdispersionplate",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["technetium",1]]}],
    ["weapon_sturdy","Sturdy Mount",["MineLauncher"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["mininglaser_longrange","Long range",["MiningLaser"],{"2":[["sulphur",1],["heatdispersionplate",1],["consumerfirmware",1]],"3":[["chromium",1],["consumerfirmware",1],["heatexchangers",1]],"4":[["consumerfirmware",1],["conductivepolymers",1],["selenium",1],["heatvanes",1]],"5":[["industrialfirmware",1],["thermicalloys",1],["biotechconductors",1],["protoheatradiators",1]]}],
    ["weapon_efficient","Efficient Weapon",["Multi_Cannon"],{"1":[["sulphur",1]],"2":[["sulphur",1],["heatdispersionplate",1]],"3":[["scrambledemissiondata",1],["chromium",1],["heatexchangers",1]],"4":[["archivedemissiondata",1],["selenium",1],["heatvanes",1]],"5":[["emissiondata",1],["cadmium",1],["protoheatradiators",1]]}],
    ["weapon_highcapacity","High Capacity Magazine",["Multi_Cannon"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["vanadium",1]],"3":[["mechanicalscrap",1],["vanadium",1],["niobium",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1]],"5":[["mechanicalcomponents",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["Multi_Cannon"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_longrange","Long-Range Weapon",["Multi_Cannon"],{"1":[["sulphur",1]],"2":[["sulphur",1],["consumerfirmware",1]],"3":[["sulphur",1],["consumerfirmware",1],["focuscrystals",1]],"4":[["consumerfirmware",1],["focuscrystals",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["thermicalloys",1],["biotechconductors",1]]}],
    ["weapon_overcharged","Overcharged Weapon",["Multi_Cannon"],{"1":[["nickel",1]],"2":[["nickel",1],["conductivecomponents",1]],"3":[["nickel",1],["conductivecomponents",1],["electrochemicalarrays",1]],"4":[["zinc",1],["conductiveceramics",1],["polymercapacitors",1]],"5":[["zirconium",1],["conductivepolymers",1],["embeddedfirmware",1]]}],
    ["weapon_rapidfire","Rapid Fire Modification",["Multi_Cannon"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["heatdispersionplate",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["technetium",1]]}],
    ["weapon_shortrange","Short-Range Blaster",["Multi_Cannon"],{"1":[["nickel",1]],"2":[["nickel",1],["consumerfirmware",1]],"3":[["nickel",1],["consumerfirmware",1],["electrochemicalarrays",1]],"4":[["consumerfirmware",1],["electrochemicalarrays",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["configurablecomponents",1],["biotechconductors",1]]}],
    ["weapon_sturdy","Sturdy Mount",["Multi_Cannon"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["multicannon_rapid","Rapid phase",["Multi_Cannon"],{"2":[["mechanicalscrap",1],["heatdispersionplate",1],["conductivecomponents",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["conductiveceramics",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["conductiveceramics",1],["technetium",1]]}],
    ["modulereinforcement_heavyduty","Heavy duty",["ModuleReinforcementPackage"],{"2":[["carbon",1],["iron",1],["shieldemitters",1]],"3":[["iron",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["shieldemitters",1],["highdensitycomposites",1],["fedproprietarycomposites",1],["tungsten",1]],"5":[["compoundshielding",1],["ruthenium",1],["protoheatradiators",1],["fedcorecomposites",1]]}],
    ["weapon_efficient","Efficient Weapon",["PlasmaAccelerator"],{"1":[["sulphur",1]],"2":[["sulphur",1],["heatdispersionplate",1]],"3":[["scrambledemissiondata",1],["chromium",1],["heatexchangers",1]],"4":[["archivedemissiondata",1],["selenium",1],["heatvanes",1]],"5":[["emissiondata",1],["cadmium",1],["protoheatradiators",1]]}],
    ["weapon_focused","Focused Weapon",["PlasmaAccelerator"],{"1":[["iron",1]],"2":[["iron",1],["conductivecomponents",1]],"3":[["iron",1],["chromium",1],["conductiveceramics",1]],"4":[["germanium",1],["focuscrystals",1],["polymercapacitors",1]],"5":[["niobium",1],["refinedfocuscrystals",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["PlasmaAccelerator"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_longrange","Long-Range Weapon",["PlasmaAccelerator"],{"1":[["sulphur",1]],"2":[["sulphur",1],["consumerfirmware",1]],"3":[["sulphur",1],["consumerfirmware",1],["focuscrystals",1]],"4":[["consumerfirmware",1],["focuscrystals",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["thermicalloys",1],["biotechconductors",1]]}],
    ["weapon_overcharged","Overcharged Weapon",["PlasmaAccelerator"],{"1":[["nickel",1]],"2":[["nickel",1],["conductivecomponents",1]],"3":[["nickel",1],["conductivecomponents",1],["electrochemicalarrays",1]],"4":[["zinc",1],["conductiveceramics",1],["polymercapacitors",1]],"5":[["zirconium",1],["conductivepolymers",1],["embeddedfirmware",1]]}],
    ["weapon_rapidfire","Rapid Fire Modification",["PlasmaAccelerator"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["heatdispersionplate",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["technetium",1]]}],
    ["weapon_shortrange","Short-Range Blaster",["PlasmaAccelerator"],{"1":[["nickel",1]],"2":[["nickel",1],["consumerfirmware",1]],"3":[["nickel",1],["consumerfirmware",1],["electrochemicalarrays",1]],"4":[["consumerfirmware",1],["electrochemicalarrays",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["configurablecomponents",1],["biotechconductors",1]]}],
    ["weapon_sturdy","Sturdy Mount",["PlasmaAccelerator"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_lightweight","Lightweight",["PointDefence"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["misc_pointdefensecapacity","Point Defence Ammo Capacity",["PointDefence"],{"1":[["mechanicalscrap",1],["vanadium",1],["niobium",1]]}],
    ["misc_reinforced","Reinforced",["PointDefence"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["PointDefence"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["powerdistributor_highcapacity","High Charge Capacity Power Distributor",["PowerDistributor"],{"1":[["sulphur",1]],"2":[["legacyfirmware",1],["chromium",1]],"3":[["legacyfirmware",1],["chromium",1],["highdensitycomposites",1]],"4":[["consumerfirmware",1],["selenium",1],["fedproprietarycomposites",1]],"5":[["industrialfirmware",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["powerdistributor_highfrequency","Charge Enhanced Power Distributor",["PowerDistributor"],{"1":[["legacyfirmware",1]],"2":[["legacyfirmware",1],["chemicalprocessors",1]],"3":[["gridresistors",1],["consumerfirmware",1],["chemicaldistillery",1]],"4":[["hybridcapacitors",1],["industrialfirmware",1],["chemicalmanipulators",1]],"5":[["industrialfirmware",1],["chemicalmanipulators",1],["exquisitefocuscrystals",1]]}],
    ["powerdistributor_priorityengines","Engine Focused Power Distributor",["PowerDistributor"],{"1":[["sulphur",1]],"2":[["sulphur",1],["conductivecomponents",1]],"3":[["bulkscandata",1],["chromium",1],["electrochemicalarrays",1]],"4":[["scanarchives",1],["selenium",1],["polymercapacitors",1]],"5":[["scandatabanks",1],["cadmium",1],["militarysupercapacitors",1]]}],
    ["powerdistributor_prioritysystems","System Focused Power Distributor",["PowerDistributor"],{"1":[["sulphur",1]],"2":[["sulphur",1],["conductivecomponents",1]],"3":[["bulkscandata",1],["chromium",1],["electrochemicalarrays",1]],"4":[["scanarchives",1],["selenium",1],["polymercapacitors",1]],"5":[["scandatabanks",1],["cadmium",1],["militarysupercapacitors",1]]}],
    ["powerdistributor_priorityweapons","Weapon Focused Power Distributor",["PowerDistributor"],{"1":[["sulphur",1]],"2":[["sulphur",1],["conductivecomponents",1]],"3":[["bulkscandata",1],["hybridcapacitors",1],["selenium",1]],"4":[["scanarchives",1],["electrochemicalarrays",1],["cadmium",1]],"5":[["scandatabanks",1],["polymercapacitors",1],["tellurium",1]]}],
    ["powerdistributor_shielded","Shielded Power Distributor",["PowerDistributor"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["powerdistributor_balanced","Balanced",["PowerDistributor"],{"2":[["sulphur",1],["legacyfirmware",1],["chemicalprocessors",1]],"3":[["legacyfirmware",1],["chemicalprocessors",1],["highdensitycomposites",1]],"4":[["chemicalprocessors",1],["highdensitycomposites",1],["selenium",1],["chemicalmanipulators",1]],"5":[["fedproprietarycomposites",1],["chemicalmanipulators",1],["militarysupercapacitors",1],["exquisitefocuscrystals",1]]}],
    ["powerdistributors3c2_supportfocused","Support focused",["PowerDistributor"],{"2":[["sulphur",1],["legacyfirmware",1],["conductivecomponents",1]],"3":[["bulkscandata",1],["chromium",1],["electrochemicalarrays",1]],"4":[["scanarchives",1],["consumerfirmware",1],["selenium",1],["polymercapacitors",1]],"5":[["scandatabanks",1],["cadmium",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["powerdistributors3c5_supportfocused","Support focused",["PowerDistributor"],{"2":[["sulphur",1],["legacyfirmware",1],["conductivecomponents",1]],"3":[["bulkscandata",1],["chromium",1],["electrochemicalarrays",1]],"4":[["scanarchives",1],["consumerfirmware",1],["selenium",1],["polymercapacitors",1]],"5":[["scandatabanks",1],["cadmium",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["powerdistributors4c2_supportfocused","Support focused",["PowerDistributor"],{"3":[["bulkscandata",1],["chromium",1],["electrochemicalarrays",1]],"4":[["scanarchives",1],["consumerfirmware",1],["selenium",1],["polymercapacitors",1]],"5":[["scandatabanks",1],["cadmium",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["powerdistributors4c5_supportfocused","Support focused",["PowerDistributor"],{"2":[["sulphur",1],["legacyfirmware",1],["conductivecomponents",1]],"3":[["bulkscandata",1],["chromium",1],["electrochemicalarrays",1]],"4":[["scanarchives",1],["consumerfirmware",1],["selenium",1],["polymercapacitors",1]],"5":[["scandatabanks",1],["cadmium",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["powerdistributors6c5_supportfocused","Support focused",["PowerDistributor"],{"2":[["sulphur",1],["legacyfirmware",1],["conductivecomponents",1]],"3":[["bulkscandata",1],["chromium",1],["electrochemicalarrays",1]],"4":[["scanarchives",1],["consumerfirmware",1],["selenium",1],["polymercapacitors",1]],"5":[["scandatabanks",1],["cadmium",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["powerplant_armoured","Armoured Power Plant",["PowerPlant"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["powerplant_boosted","Overcharged Power Plant",["PowerPlant"],{"1":[["sulphur",1]],"2":[["heatconductionwiring",1],["conductivecomponents",1]],"3":[["heatconductionwiring",1],["conductivecomponents",1],["selenium",1]],"4":[["heatdispersionplate",1],["conductiveceramics",1],["cadmium",1]],"5":[["conductiveceramics",1],["chemicalmanipulators",1],["tellurium",1]]}],
    ["powerplant_stealth","Low Emissions Power Plant",["PowerPlant"],{"1":[["iron",1]],"2":[["iron",1],["archivedemissiondata",1]],"3":[["iron",1],["archivedemissiondata",1],["heatexchangers",1]],"4":[["germanium",1],["emissiondata",1],["heatvanes",1]],"5":[["niobium",1],["decodedemissiondata",1],["protoheatradiators",1]]}],
    ["misc_lightweight","Lightweight",["ProspectorLimpetController"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["misc_reinforced","Reinforced",["ProspectorLimpetController"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["ProspectorLimpetController"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["weapon_efficient","Efficient Weapon",["PulseLaser"],{"1":[["sulphur",1]],"2":[["sulphur",1],["heatdispersionplate",1]],"3":[["scrambledemissiondata",1],["chromium",1],["heatexchangers",1]],"4":[["archivedemissiondata",1],["selenium",1],["heatvanes",1]],"5":[["emissiondata",1],["cadmium",1],["protoheatradiators",1]]}],
    ["weapon_focused","Focused Weapon",["PulseLaser"],{"1":[["iron",1]],"2":[["iron",1],["conductivecomponents",1]],"3":[["iron",1],["chromium",1],["conductiveceramics",1]],"4":[["germanium",1],["focuscrystals",1],["polymercapacitors",1]],"5":[["niobium",1],["refinedfocuscrystals",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["PulseLaser"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_longrange","Long-Range Weapon",["PulseLaser"],{"1":[["sulphur",1]],"2":[["sulphur",1],["consumerfirmware",1]],"3":[["sulphur",1],["consumerfirmware",1],["focuscrystals",1]],"4":[["consumerfirmware",1],["focuscrystals",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["thermicalloys",1],["biotechconductors",1]]}],
    ["weapon_overcharged","Overcharged Weapon",["PulseLaser"],{"1":[["nickel",1]],"2":[["nickel",1],["conductivecomponents",1]],"3":[["nickel",1],["conductivecomponents",1],["electrochemicalarrays",1]],"4":[["zinc",1],["conductiveceramics",1],["polymercapacitors",1]],"5":[["zirconium",1],["conductivepolymers",1],["embeddedfirmware",1]]}],
    ["weapon_rapidfire","Rapid Fire Modification",["PulseLaser"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["heatdispersionplate",1]],"3":[["legacyfirmware",1],["mechanicalequipment",1],["precipitatedalloys",1]],"4":[["consumerfirmware",1],["mechanicalcomponents",1],["thermicalloys",1]],"5":[["precipitatedalloys",1],["configurablecomponents",1],["technetium",1]]}],
    ["weapon_shortrange","Short-Range Blaster",["PulseLaser"],{"1":[["nickel",1]],"2":[["nickel",1],["consumerfirmware",1]],"3":[["nickel",1],["consumerfirmware",1],["electrochemicalarrays",1]],"4":[["consumerfirmware",1],["electrochemicalarrays",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["configurablecomponents",1],["biotechconductors",1]]}],
    ["weapon_sturdy","Sturdy Mount",["PulseLaser"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["pulselaser_thermalplasmaconversion","Plasma conversion",["PulseLaser"],{"1":[["phosphorus",1],["heatconductionwiring",1]],"2":[["arsenic",1],["heatconductionwiring",1],["heatdispersionplate",1]],"3":[["arsenic",1],["heatdispersionplate",1],["phasealloys",1]],"4":[["heatdispersionplate",1],["phasealloys",1],["refinedfocuscrystals",1],["configurablecomponents",1]],"5":[["technetium",1],["thermicalloys",1],["militarysupercapacitors",1],["embeddedfirmware",1]]}],
    ["weapon_highcapacity","High Capacity Magazine",["RailGun"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["vanadium",1]],"3":[["mechanicalscrap",1],["vanadium",1],["niobium",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1]],"5":[["mechanicalcomponents",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["weapon_lightweight","Light Weight Mount",["RailGun"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_longrange","Long-Range Weapon",["RailGun"],{"1":[["sulphur",1]],"2":[["sulphur",1],["consumerfirmware",1]],"3":[["sulphur",1],["consumerfirmware",1],["focuscrystals",1]],"4":[["consumerfirmware",1],["focuscrystals",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["thermicalloys",1],["biotechconductors",1]]}],
    ["weapon_shortrange","Short-Range Blaster",["RailGun"],{"1":[["nickel",1]],"2":[["nickel",1],["consumerfirmware",1]],"3":[["nickel",1],["consumerfirmware",1],["electrochemicalarrays",1]],"4":[["consumerfirmware",1],["electrochemicalarrays",1],["conductivepolymers",1]],"5":[["industrialfirmware",1],["configurablecomponents",1],["biotechconductors",1]]}],
    ["weapon_sturdy","Sturdy Mount",["RailGun"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["railgun_longshot","Enduring feedback",["RailGun"],{"2":[["mechanicalscrap",1],["sulphur",1],["consumerfirmware",1]],"3":[["sulphur",1],["consumerfirmware",1],["niobium",1]],"4":[["consumerfirmware",1],["niobium",1],["conductivepolymers",1],["tin",1]],"5":[["mechanicalcomponents",1],["thermicalloys",1],["militarysupercapacitors",1],["biotechconductors",1]]}],
    ["misc_shielded","Shielded",["Refinery"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["sensor_lightweight","Light Weight Scanner",["Sensor"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["sensor_longrange","Long-Range Scanner",["Sensor"],{"1":[["iron",1]],"2":[["iron",1],["hybridcapacitors",1]],"3":[["iron",1],["hybridcapacitors",1],["emissiondata",1]],"4":[["germanium",1],["electrochemicalarrays",1],["decodedemissiondata",1]],"5":[["niobium",1],["polymercapacitors",1],["compactemissionsdata",1]]}],
    ["sensor_wideangle","Wide Angle Scanner",["Sensor"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["germanium",1]],"3":[["mechanicalscrap",1],["germanium",1],["scandatabanks",1]],"4":[["mechanicalequipment",1],["niobium",1],["encodedscandata",1]],"5":[["mechanicalcomponents",1],["tin",1],["classifiedscandata",1]]}],
    ["shieldbooster_explosive","Blast Resistant Shield Booster",["ShieldBooster"],{"1":[["iron",1]],"2":[["iron",1],["conductivecomponents",1]],"3":[["iron",1],["conductivecomponents",1],["focuscrystals",1]],"4":[["germanium",1],["shielddensityreports",1],["refinedfocuscrystals",1]],"5":[["niobium",1],["shieldpatternanalysis",1],["exquisitefocuscrystals",1]]}],
    ["shieldbooster_heavyduty","Heavy Duty Shield Booster",["ShieldBooster"],{"1":[["gridresistors",1]],"2":[["shieldcyclerecordings",1],["hybridcapacitors",1]],"3":[["shieldcyclerecordings",1],["hybridcapacitors",1],["niobium",1]],"4":[["shieldsoakanalysis",1],["electrochemicalarrays",1],["tin",1]],"5":[["shielddensityreports",1],["polymercapacitors",1],["antimony",1]]}],
    ["shieldbooster_kinetic","Kinetic Resistant Shield Booster",["ShieldBooster"],{"1":[["iron",1]],"2":[["gridresistors",1],["germanium",1]],"3":[["salvagedalloys",1],["hybridcapacitors",1],["focuscrystals",1]],"4":[["galvanisingalloys",1],["shielddensityreports",1],["refinedfocuscrystals",1]],"5":[["phasealloys",1],["shieldpatternanalysis",1],["exquisitefocuscrystals",1]]}],
    ["shieldbooster_resistive","Resistance Augmented Shield Booster",["ShieldBooster"],{"1":[["phosphorus",1]],"2":[["phosphorus",1],["conductivecomponents",1]],"3":[["phosphorus",1],["conductivecomponents",1],["focuscrystals",1]],"4":[["manganese",1],["conductiveceramics",1],["refinedfocuscrystals",1]],"5":[["conductiveceramics",1],["refinedfocuscrystals",1],["imperialshielding",1]]}],
    ["shieldbooster_thermic","Thermal Resistant Shield Booster",["ShieldBooster"],{"1":[["iron",1]],"2":[["heatconductionwiring",1],["germanium",1]],"3":[["heatconductionwiring",1],["heatdispersionplate",1],["focuscrystals",1]],"4":[["heatdispersionplate",1],["shielddensityreports",1],["refinedfocuscrystals",1]],"5":[["heatexchangers",1],["shieldpatternanalysis",1],["exquisitefocuscrystals",1]]}],
    ["shieldcellbank_rapid","Rapid Charge ShieldCellBank Bank",["ShieldCellBank"],{"1":[["sulphur",1]],"2":[["gridresistors",1],["chromium",1]],"3":[["sulphur",1],["hybridcapacitors",1],["precipitatedalloys",1]],"4":[["chromium",1],["electrochemicalarrays",1],["thermicalloys",1]]}],
    ["shieldcellbank_specialised","Specialised ShieldCellBank Bank",["ShieldCellBank"],{"1":[["legacyfirmware",1]],"2":[["legacyfirmware",1],["conductivecomponents",1]],"3":[["scrambledemissiondata",1],["conductivecomponents",1],["industrialfirmware",1]],"4":[["conductivecomponents",1],["industrialfirmware",1],["yttrium",1]]}],
    ["shieldgenerator_kinetic","Kinetic Resistant Shields",["ShieldGenerator","PrismaticShieldGenerator"],{"1":[["shieldcyclerecordings",1]],"2":[["shieldcyclerecordings",1],["consumerfirmware",1]],"3":[["shieldcyclerecordings",1],["consumerfirmware",1],["selenium",1]],"4":[["shieldsoakanalysis",1],["focuscrystals",1],["mercury",1]],"5":[["shielddensityreports",1],["refinedfocuscrystals",1],["ruthenium",1]]}],
    ["shieldgenerator_optimised","Enhanced, Low Power Shields",["ShieldGenerator","PrismaticShieldGenerator"],{"1":[["shieldcyclerecordings",1]],"2":[["shieldcyclerecordings",1],["germanium",1]],"3":[["shieldcyclerecordings",1],["germanium",1],["precipitatedalloys",1]],"4":[["shieldsoakanalysis",1],["niobium",1],["thermicalloys",1]],"5":[["shielddensityreports",1],["tin",1],["militarygradealloys",1]]}],
    ["shieldgenerator_reinforced","Reinforced Shields",["ShieldGenerator","PrismaticShieldGenerator"],{"1":[["phosphorus",1]],"2":[["phosphorus",1],["conductivecomponents",1]],"3":[["phosphorus",1],["conductivecomponents",1],["mechanicalcomponents",1]],"4":[["manganese",1],["conductiveceramics",1],["configurablecomponents",1]],"5":[["arsenic",1],["conductivepolymers",1],["improvisedcomponents",1]]}],
    ["shieldgenerator_thermic","Thermal Resistant Shields",["ShieldGenerator","PrismaticShieldGenerator"],{"1":[["shieldcyclerecordings",1]],"2":[["shieldcyclerecordings",1],["germanium",1]],"3":[["shieldcyclerecordings",1],["germanium",1],["selenium",1]],"4":[["shieldsoakanalysis",1],["focuscrystals",1],["mercury",1]],"5":[["shielddensityreports",1],["refinedfocuscrystals",1],["ruthenium",1]]}],
    ["sensor_expanded","Expanded Probe Scanning Radius",["SurfaceScanner"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["germanium",1]],"3":[["mechanicalscrap",1],["germanium",1],["phasealloys",1]],"4":[["mechanicalequipment",1],["niobium",1],["protolightalloys",1]],"5":[["mechanicalcomponents",1],["tin",1],["protoradiolicalloys",1]]}],
    ["weapon_lightweight","Light Weight Mount",["TorpedoPylon"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["weapon_sturdy","Sturdy Mount",["TorpedoPylon"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["sensor_fastscan","Fast Scanner",["WakeScanner"],{"1":[["phosphorus",1]],"2":[["phosphorus",1],["uncutfocuscrystals",1]],"3":[["phosphorus",1],["uncutfocuscrystals",1],["symmetrickeys",1]],"4":[["manganese",1],["focuscrystals",1],["encryptionarchives",1]],"5":[["arsenic",1],["refinedfocuscrystals",1],["adaptiveencryptors",1]]}],
    ["misc_lightweight","Lightweight",["WakeScanner"],{"1":[["phosphorus",1]],"2":[["salvagedalloys",1],["manganese",1]],"3":[["salvagedalloys",1],["manganese",1],["conductiveceramics",1]],"4":[["conductivecomponents",1],["phasealloys",1],["protolightalloys",1]],"5":[["conductiveceramics",1],["protolightalloys",1],["protoradiolicalloys",1]]}],
    ["sensor_longrange","Long-Range Scanner",["WakeScanner"],{"1":[["iron",1]],"2":[["iron",1],["hybridcapacitors",1]],"3":[["iron",1],["hybridcapacitors",1],["emissiondata",1]],"4":[["germanium",1],["electrochemicalarrays",1],["decodedemissiondata",1]],"5":[["niobium",1],["polymercapacitors",1],["compactemissionsdata",1]]}],
    ["misc_reinforced","Reinforced",["WakeScanner"],{"1":[["nickel",1]],"2":[["nickel",1],["shieldemitters",1]],"3":[["nickel",1],["shieldemitters",1],["tungsten",1]],"4":[["zinc",1],["tungsten",1],["molybdenum",1]],"5":[["highdensitycomposites",1],["molybdenum",1],["technetium",1]]}],
    ["misc_shielded","Shielded",["WakeScanner"],{"1":[["wornshieldemitters",1]],"2":[["carbon",1],["shieldemitters",1]],"3":[["carbon",1],["shieldemitters",1],["highdensitycomposites",1]],"4":[["vanadium",1],["shieldingsensors",1],["fedproprietarycomposites",1]],"5":[["tungsten",1],["compoundshielding",1],["fedcorecomposites",1]]}],
    ["sensor_wideangle","Wide Angle Scanner",["WakeScanner"],{"1":[["mechanicalscrap",1]],"2":[["mechanicalscrap",1],["germanium",1]],"3":[["mechanicalscrap",1],["germanium",1],["scandatabanks",1]],"4":[["mechanicalequipment",1],["niobium",1],["encodedscandata",1]],"5":[["mechanicalcomponents",1],["tin",1],["classifiedscandata",1]]}],
    ["cargoracks5c1_extended","Extended",["CargoRack"],{"2":[["mechanicalscrap",1],["vanadium",1],["manganese",1]],"3":[["mechanicalscrap",1],["vanadium",1],["niobium",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1],["niobium",1]],"5":[["mechanicalequipment",1],["mechanicalcomponents",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["cargoracks6c1_extended","Extended",["CargoRack"],{"2":[["mechanicalscrap",1],["vanadium",1],["manganese",1]],"3":[["mechanicalscrap",1],["vanadium",1],["niobium",1]],"4":[["mechanicalequipment",1],["highdensitycomposites",1],["tin",1],["niobium",1]],"5":[["mechanicalequipment",1],["mechanicalcomponents",1],["fedproprietarycomposites",1],["militarysupercapacitors",1]]}],
    ["cargorack_increasedcapacity","Increase Capcacity",["CargoRack"],{"2":[],"3":[],"4":[],"5":[]}],
    ["sensor_fastscan","Expanded Probe Scanning Radius",["SurfaceScanner"],{"5":[]}],
    ["guardianweapon_sturdy","Guardian Upgrade Obsolete",["UnknownType"],{"5":[["carbon",1]]}],
    ["guardianmodule_sturdy","Guardian Upgrade Obsolete",["UnknownType"],{"5":[["carbon",1]]}],
];
// [experimental id, name, module types, [[material, count], …]]
const EXPERIMENTALS = [
    ["special_armour_kinetic","Angled Plating",["Armour"],[["compactcomposites",5],["highdensitycomposites",3],["zirconium",3]]],
    ["special_hullreinforcement_kinetic","Angled Plating",["HullReinforcementPackage"],[["temperedalloys",5],["zirconium",3],["carbon",5],["highdensitycomposites",3]]],
    ["special_shieldbooster_explosive","Blast Block",["ShieldBooster"],[["shieldsoakanalysis",5],["heatresistantceramics",3],["heatdispersionplate",3],["selenium",2]]],
    ["special_powerdistributor_capacity","Cluster Capacitors",["PowerDistributor"],[["phosphorus",5],["heatresistantceramics",3],["cadmium",1]]],
    ["special_fsd_fuelcapacity","Deep Charge",["FrameShiftDrive"],[["disruptedwakeechoes",5],["galvanisingalloys",3],["hyperspacetrajectories",1]]],
    ["special_armour_chunky","Deep Plating",["Armour"],[["compactcomposites",5],["mechanicalequipment",3],["molybdenum",2]]],
    ["special_hullreinforcement_chunky","Deep Plating",["HullReinforcementPackage"],[["compactcomposites",5],["molybdenum",3],["ruthenium",2]]],
    ["special_engine_toughened","Double Braced",["Thrusters"],[["iron",5],["hybridcapacitors",3],["fedproprietarycomposites",1]]],
    ["special_fsd_toughened","Double Braced",["FrameShiftDrive"],[["disruptedwakeechoes",5],["galvanisingalloys",3],["configurablecomponents",1]]],
    ["special_powerdistributor_toughened","Double Braced",["PowerDistributor"],[["phosphorus",5],["heatresistantceramics",3],["fedproprietarycomposites",1]]],
    ["special_powerplant_toughened","Double Braced",["PowerPlant"],[["gridresistors",5],["vanadium",3],["fedproprietarycomposites",1]]],
    ["special_shield_toughened","Double Braced",["ShieldGenerator"],[["wornshieldemitters",5],["uncutfocuscrystals",3],["configurablecomponents",1]]],
    ["special_shieldbooster_toughened","Double Braced",["ShieldBooster"],[["shieldcyclerecordings",5],["galvanisingalloys",3],["shieldemitters",3]]],
    ["special_weapon_toughened","Double Braced",["Weapon"],[["mechanicalscrap",5],["compactcomposites",5],["vanadium",3]]],
    ["special_engine_overloaded","Drag Drives",["Thrusters"],[["iron",5],["hybridcapacitors",3],["securityfirmware",1]]],
    ["special_engine_haulage","Drive Distributors",["Thrusters"],[["iron",5],["hybridcapacitors",3],["securityfirmware",1]]],
    ["special_shield_regenerative","Fast Charge",["ShieldGenerator"],[["wornshieldemitters",5],["uncutfocuscrystals",3],["compoundshielding",1]]],
    ["special_feedback_cascade_cooled","Feedback Cascade",["RailGun"],[["symmetrickeys",5],["shieldemitters",5],["filamentcomposites",5]]],
    ["special_feedback_cascade","Feedback Cascade",["RailGun"],[["symmetrickeys",5],["shieldemitters",5],["filamentcomposites",5]]],
    ["special_powerdistributor_efficient","Flow Control",["PowerDistributor"],[["phosphorus",5],["heatresistantceramics",3],["conductivepolymers",1]]],
    ["special_shieldbooster_efficient","Flow Control",["ShieldBooster"],[["shieldsoakanalysis",5],["securityfirmware",3],["focuscrystals",3],["niobium",3]]],
    ["special_weapon_efficient","Flow Control",["Weapon"],[["mechanicalscrap",5],["hybridcapacitors",3],["embeddedfirmware",1]]],
    ["special_shield_kinetic","Force Block",["ShieldGenerator"],[["wornshieldemitters",5],["uncutfocuscrystals",3],["decodedemissiondata",1]]],
    ["special_shieldbooster_kinetic","Force Block",["ShieldBooster"],[["scanarchives",5],["shieldingsensors",3],["shieldpatternanalysis",2]]],
    ["special_force_shell","Force Shell",["Cannon"],[["mechanicalscrap",5],["zinc",5],["phasealloys",3],["heatconductionwiring",3]]],
    ["special_shield_health","Hi-Cap",["ShieldGenerator"],[["wornshieldemitters",5],["uncutfocuscrystals",3],["conductivepolymers",1]]],
    ["special_high_yield_shell","High Yield Shell",["Cannon"],[["mechanicalscrap",5],["protolightalloys",3],["chemicalmanipulators",3],["nickel",5]]],
    ["special_distortion_field","Inertial Impact",["BurstLaser"],[["uncutfocuscrystals",5],["shieldcyclerecordings",5],["disruptedwakeechoes",5]]],
    ["special_choke_canister","Ion Disruption",["LifeSupport"],[["sulphur",5],["phosphorus",5],["chemicaldistillery",3],["electrochemicalarrays",3]]],
    ["special_armour_explosive","Layered Plating",["Armour"],[["heatconductionwiring",5],["highdensitycomposites",3],["niobium",1]]],
    ["special_hullreinforcement_explosive","Layered Plating",["HullReinforcementPackage"],[["heatconductionwiring",5],["shieldingsensors",3],["tungsten",3]]],
    ["special_shield_efficient","Lo-draw",["ShieldGenerator"],[["wornshieldemitters",5],["uncutfocuscrystals",3],["conductivepolymers",1]]],
    ["special_mass_lock","Mass Lock Munition",["TorpedoPylon"],[["mechanicalequipment",5],["highdensitycomposites",3],["shieldpatternanalysis",3]]],
    ["special_fsd_heavy","Mass Manager",["FrameShiftDrive"],[["disruptedwakeechoes",5],["galvanisingalloys",3],["hyperspacetrajectories",1]]],
    ["special_powerplant_highcharge","Monstered",["PowerPlant"],[["gridresistors",5],["vanadium",3],["polymercapacitors",1]]],
    ["special_shield_resistive","Multi-weave",["ShieldGenerator"],[["wornshieldemitters",5],["uncutfocuscrystals",3],["shieldpatternanalysis",1]]],
    ["special_weapon_damage","Oversized",["Weapon"],[["mechanicalscrap",5],["mechanicalcomponents",3],["ruthenium",1]]],
    ["special_deep_cut_payload","Penetrator Payload",["TorpedoPylon"],[["mechanicalcomponents",3],["tungsten",3],["bulkscandata",5],["selenium",3]]],
    ["special_plasma_slug","Plasma Slug",["PlasmaAccelerator"],[["heatexchangers",3],["embeddedfirmware",2],["refinedfocuscrystals",2],["mercury",4]]],
    ["special_plasma_slug_cooled","Plasma Slug",["RailGun"],[["heatexchangers",3],["embeddedfirmware",2],["refinedfocuscrystals",2],["mercury",4]]],
    ["special_radiant_canister","Radiant Canister",["LifeSupport"],[["polonium",1],["phasealloys",3],["heatdispersionplate",4]]],
    ["special_armour_thermic","Reflective Plating",["Armour"],[["compactcomposites",5],["heatdispersionplate",3],["thermicalloys",2]]],
    ["special_hullreinforcement_thermic","Reflective Plating",["HullReinforcementPackage"],[["heatconductionwiring",5],["heatdispersionplate",3],["protolightalloys",1],["zinc",4]]],
    ["special_regeneration_sequence","Regeneration Sequence",["BeamLaser"],[["refinedfocuscrystals",3],["shieldingsensors",4],["shieldfrequencydata",1]]],
    ["special_screening_shell","Screening Shell",["FragmentCannon"],[["mechanicalscrap",5],["shieldcyclerecordings",5],["consumerfirmware",5],["niobium",3]]],
    ["special_shiftlock_canister","Shift-lock Canister",["LifeSupport"],[["temperedalloys",5],["wakesolutions",3],["salvagedalloys",5]]],
    ["special_engine_lightweight","Stripped Down",["Thrusters"],[["iron",5],["hybridcapacitors",3],["protolightalloys",1]]],
    ["special_fsd_lightweight","Stripped Down",["FrameShiftDrive"],[["disruptedwakeechoes",5],["galvanisingalloys",3],["protolightalloys",1]]],
    ["special_powerdistributor_lightweight","Stripped Down",["PowerDistributor"],[["phosphorus",5],["heatresistantceramics",3],["protolightalloys",1]]],
    ["special_powerplant_lightweight","Stripped Down",["PowerPlant"],[["gridresistors",5],["vanadium",3],["protolightalloys",1]]],
    ["special_shield_lightweight","Stripped Down",["ShieldGenerator"],[["wornshieldemitters",5],["uncutfocuscrystals",3],["protolightalloys",1]]],
    ["special_weapon_lightweight","Stripped Down",["Weapon"],[["salvagedalloys",5],["carbon",5],["tin",1]]],
    ["special_shieldbooster_chunky","Super Capacitors",["ShieldBooster"],[["shielddensityreports",3],["compactcomposites",5],["cadmium",2]]],
    ["special_powerdistributor_fast","Super Conduits",["PowerDistributor"],[["phosphorus",5],["heatresistantceramics",3],["securityfirmware",1]]],
    ["special_super_penetrator_cooled","Super Penetrator",["RailGun"],[["protolightalloys",3],["refinedfocuscrystals",3],["zirconium",3],["shielddensityreports",5]]],
    ["special_super_penetrator","Super Penetrator",["RailGun"],[["protolightalloys",3],["refinedfocuscrystals",3],["zirconium",3],["shielddensityreports",5]]],
    ["special_lock_breaker","Target Lock Breaker",["PlasmaAccelerator"],[["selenium",5],["securityfirmware",3],["adaptiveencryptors",1]]],
    ["special_engine_cooled","Thermal Spread",["Thrusters"],[["iron",5],["hybridcapacitors",3],["heatvanes",1]]],
    ["special_fsd_cooled","Thermal Spread",["FrameShiftDrive"],[["disruptedwakeechoes",5],["galvanisingalloys",3],["heatvanes",1],["gridresistors",3]]],
    ["special_powerplant_cooled","Thermal Spread",["PowerPlant"],[["gridresistors",5],["vanadium",3],["heatvanes",1]]],
    ["special_thermal_vent","Thermal Vent",["BeamLaser"],[["uncutfocuscrystals",5],["conductivepolymers",3],["precipitatedalloys",3]]],
    ["special_shield_thermic","Thermo Block",["ShieldGenerator"],[["wornshieldemitters",5],["uncutfocuscrystals",3],["heatvanes",1]]],
    ["special_shieldbooster_thermic","Thermo Block",["ShieldBooster"],[["bulkscandata",5],["conductiveceramics",3],["heatvanes",3]]],
];

show();
