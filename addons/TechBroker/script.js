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


// Tech Broker: what each technology broker unlock takes, what you have of it and what's still short.
//
// Human brokers (pre-engineered FSDs, shock cannons, AX weapons, meta-alloy hull…) and Guardian brokers (Guardian
// modules and weapons, which also need Guardian blueprint fragments). Click one for its materials and commodities;
// ★ Track it to keep it at the top with a combined shopping list. Unlocks the game reports (TechnologyBroker) are
// ticked off. Materials are kept from the journal; commodities are what's in your ship's hold (not your carrier).

let tab = store.get("tab", "h");            // h human · g Guardian modules · w Guardian weapons · t tracked
let selName = store.get("selName", "");
let tracked = store.get("tracked", []);     // names
let unlocked = store.get("unlocked", []);   // name keys and journal ids the game said you unlocked
let cargo = store.get("cargo", {});         // commodity key → count (from Cargo events with an inventory)

function key(s) { return String(s || "").toLowerCase().replace(/^\$/, "").replace(/_name;?$/, "").replace(/[^a-z0-9]/g, ""); }
let COMM_BY_KEY = null;
function commIndex() {
    if (!COMM_BY_KEY) {
        COMM_BY_KEY = {};
        for (const id of Object.keys(COMMODITIES)) { COMM_BY_KEY[key(id)] = id; COMM_BY_KEY[key(COMMODITIES[id])] = id; }
        COMM_BY_KEY["powertransferbus"] = "powertransferconduits";   // (the game's name for it)
    }
    return COMM_BY_KEY;
}
function isComm(id) { return Object.prototype.hasOwnProperty.call(COMMODITIES, id); }

/// What's in the hold: the app's own list (kept up to date from Cargo.json), else the last inventory the journal gave.
function liveHold() {
    const live = game.CargoItems;
    if (!live) return null;
    const n = live.length !== undefined ? live.length : live.Count;
    if (typeof n !== "number") return null;
    const out = {};
    for (let i = 0; i < n; i++) {
        const c = live[i];
        if (!c) continue;
        const id = commIndex()[key(c.Key || "")] || commIndex()[key(c.Name || "")];
        if (id) out[id] = (out[id] || 0) + (Number(c.Count) || 0);
    }
    return out;
}
let holdCache = null;   // (read once per redraw)
function holdCount(id) {
    const live = holdCache || liveHold();
    return live ? (live[id] || 0) : (cargo[id] || 0);
}
on("Cargo", e => {
    if (e.Vessel && e.Vessel !== "Ship") return;
    if (!Array.isArray(e.Inventory)) return;
    cargo = {};
    for (const it of e.Inventory) {
        const id = commIndex()[key(it.Name)];
        if (id) cargo[id] = (cargo[id] || 0) + (it.Count || 0);
    }
    store.set("cargo", cargo);
    show();
});

function countOf(id) { return isComm(id) ? holdCount(id) : (have[id] || 0); }
function itemName(id) { return isComm(id) ? tr("com." + id, COMMODITIES[id]) : matName(id); }
function isUnlocked(b) { return unlocked.includes(key(b[0])) || (b[2] && unlocked.includes(b[2])); }
function brokerName(t) { return t === "h" ? tr("js.b_human", "Human tech broker") : t === "g" ? tr("js.b_guardian", "Guardian tech broker · modules") : tr("js.b_weapons", "Guardian tech broker · weapons"); }

on("TechnologyBroker", e => {
    // (the materials it took are counted off above; this ticks the unlock)
    for (const it of e.ItemsUnlocked || []) {
        for (const k of [key(it.Name_Localised), String(it.Name || "").toLowerCase()]) if (k && !unlocked.includes(k)) unlocked.push(k);
        const b = BROKER.find(x => (x[2] && x[2] === String(it.Name || "").toLowerCase()) || key(x[0]) === key(it.Name_Localised));
        if (b) { if (!unlocked.includes(key(b[0]))) unlocked.push(key(b[0])); tracked = tracked.filter(n => n !== b[0]); }
    }
    store.set("unlocked", unlocked); store.set("tracked", tracked);
    show();
});

on("click:tab", t => { if (["h", "g", "w", "t"].includes(t)) { tab = t; store.set("tab", tab); show(); } });
on("click:pick", name => { selName = name; store.set("selName", selName); show(); });
on("click:track", () => {
    if (!selName) return;
    tracked = tracked.includes(selName) ? tracked.filter(n => n !== selName) : tracked.concat([selName]);
    store.set("tracked", tracked);
    show();
});
on("click:unlocked", () => {   // ticked by hand (unlocked before the app was watching)
    const b = BROKER.find(x => x[0] === selName);
    if (!b) return;
    const k = key(b[0]);
    unlocked = unlocked.includes(k) ? unlocked.filter(x => x !== k && x !== b[2]) : unlocked.concat([k]);
    store.set("unlocked", unlocked);
    show();
});

/// How far along: share of the units needed that you hold (each ingredient counted up to what it needs).
function progressOf(ing) {
    let need = 0, got = 0;
    for (const [id, n] of ing) { need += n; got += Math.min(n, countOf(id)); }
    return need ? got / need : 0;
}

function show() {
    holdCache = liveHold();
    try { showNow(); } finally { holdCache = null; }
}

function showNow() {
    const counts = { h: 0, g: 0, w: 0 };
    for (const b of BROKER) if (isUnlocked(b)) counts[b[1]]++;
    set("tabs", [
        { id: "h", name: tr("js.t_human", "Human"), on: tab === "h" },
        { id: "g", name: tr("js.t_modules", "Guardian modules"), on: tab === "g" },
        { id: "w", name: tr("js.t_weapons", "Guardian weapons"), on: tab === "w" },
        { id: "t", name: "★ " + tr("js.t_tracked", "Tracked · {0}", tracked.length), on: tab === "t" },
    ]);
    set("status", !matsKnown ? tr("js.no_mats", "Waiting for your materials: the game lists them when you load into the game.") : "");

    const list = BROKER.filter(b => tab === "t" ? tracked.includes(b[0]) : b[1] === tab);
    const rows = list.map(b => {
        const p = progressOf(b[3]);
        const done = isUnlocked(b);
        return {
            id: b[0], name: b[0], on: b[0] === selName, done, ready: !done && p >= 1, star: tracked.includes(b[0]),
            pct: done ? "✓" : Math.floor(p * 100) + "%", p: done ? 1 : p,
        };
    });
    rows.sort((a, b) => (a.done - b.done) || (b.star - a.star) || (b.p - a.p) || a.name.localeCompare(b.name));
    set("rows", rows);
    set("empty", rows.length ? "" : tab === "t" ? tr("js.none_tracked", "Nothing tracked yet: pick an unlock and press ★ Track.") : "");
    set("summary", tab === "t" ? "" : tr("js.unlocked_n", "{0} of {1} unlocked", counts[tab] || 0, list.length) + " · " + brokerName(tab));

    // the one picked
    const b = BROKER.find(x => x[0] === selName && (tab === "t" || x[1] === tab)) || BROKER.find(x => list.includes(x));
    if (b) {
        if (b[0] !== selName) { selName = b[0]; store.set("selName", selName); }
        const done = isUnlocked(b);
        set("selTitle", b[0]);
        set("selSub", brokerName(b[1]) + (done ? " · " + tr("js.is_unlocked", "unlocked") : ""));
        set("selMats", b[3].map(([id, n]) => {
            const h = countOf(id);
            return { text: `${n} ${itemName(id)}`, kind: isComm(id) ? tr("js.k_comm", "commodity") : "", have: tr("js.have_n", "have {0}", fmt(h)), short: !done && h < n };
        }));
        const shortList = b[3].filter(([id, n]) => countOf(id) < n);
        set("selState", done ? "" : shortList.length === 0 ? tr("js.ready", "✓ You have everything for it: visit a broker") : tr("js.short_n", "{0} still short", shortList.length));
        set("trackText", tracked.includes(b[0]) ? "★ " + tr("js.untrack", "Tracked") : "☆ " + tr("js.track", "Track"));
        set("unlockText", done ? tr("js.mark_locked", "Not unlocked") : tr("js.mark_unlocked", "Mark unlocked"));
        set("hasSel", true);
    } else { set("hasSel", false); set("selTitle", ""); set("selSub", ""); set("selMats", []); set("selState", ""); }

    // shopping list for everything tracked (not yet unlocked)
    const total = {};
    for (const n of tracked) {
        const t = BROKER.find(x => x[0] === n);
        if (!t || isUnlocked(t)) continue;
        for (const [id, c] of t[3]) total[id] = (total[id] || 0) + c;
    }
    const shop = Object.keys(total).map(id => ({ id, need: total[id], h: countOf(id) })).filter(x => x.h < x.need)
        .sort((a, b) => (isComm(a.id) - isComm(b.id)) || (b.need - b.h) - (a.need - a.h))
        .map(x => ({ text: `${itemName(x.id)}`, short: tr("js.short_by", "{0} more ({1}/{2})", fmt(x.need - x.h), fmt(x.h), fmt(x.need)) }));
    set("shop", shop);
    set("shopHead", tracked.length ? tr("js.shop", "STILL NEEDED FOR WHAT YOU TRACK") : "");
    set("shopDone", tracked.length && shop.length === 0 ? tr("js.shop_done", "✓ You have everything for what you track.") : "");
}

matListeners.push(show);
on("language", show);
let lastHold = "";
on("tick", () => {   // (the hold changes without a journal event: buying, selling, scooping…)
    const sig = JSON.stringify(liveHold() || cargo);
    if (sig !== lastHold) { lastHold = sig; show(); }
});

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
// [name, broker (h human · g Guardian modules · w Guardian weapons), journal id or "", [[ingredient, count]…]]
const BROKER = [
    ["Sirius AX Missile Rack Fixed Large", "h", "", [["mechanicalequipment", 20], ["heatdispersionplate", 9], ["vanadium", 13], ["highdensitycomposites", 10], ["militarysupercapacitors", 10], ["technetium", 3]]],
    ["Sirius AX Missile Rack Fixed Medium", "h", "", [["mechanicalequipment", 12], ["heatdispersionplate", 6], ["vanadium", 8], ["highdensitycomposites", 5], ["militarysupercapacitors", 5]]],
    ["Azimuth Enhanced AX Multi Cannon Gimballed Large", "h", "", [["iron", 11], ["zirconium", 16], ["tg_biomechanicalconduits", 9], ["tg_wreckagecomponents", 12], ["tg_weaponparts", 17], ["tg_shipsystemsdata", 6]]],
    ["Azimuth Enhanced AX Multi Cannon Gimballed Medium", "h", "", [["iron", 9], ["zirconium", 11], ["tg_biomechanicalconduits", 6], ["tg_wreckagecomponents", 7], ["tg_weaponparts", 14]]],
    ["Bobblehead", "h", "", [["metaalloys", 10], ["thargoidheart", 1]]],
    ["Corrosion Resistant Cargo Rack Size 4 Class 1", "h", "int_corrosionproofcargorack_size4_class1", [["metaalloys", 16], ["iron", 26], ["chemicalmanipulators", 18], ["radiationbaffle", 22], ["neofabricinsulation", 12]]],
    ["Detailed Surface Scanner (Engineered V1)", "h", "int_detailedsurfacescanner_tiny", [["germanium", 22], ["niobium", 24], ["mechanicalcomponents", 28], ["mechanicalscrap", 26]]],
    ["Enzyme Missile Rack Fixed Medium", "h", "hpt_causticmissile_fixed_medium", [["unknownenergycell", 16], ["unknownorganiccircuitry", 18], ["molybdenum", 16], ["tungsten", 15], ["radiationbaffle", 6]]],
    ["Engineered FSD V1 (Class 5)", "h", "int_hyperdrive_size5_class5", [["dataminedwake", 18], ["tellurium", 26], ["electrochemicalarrays", 26], ["chemicalprocessors", 28]]],
    ["Sirius Heat Sink Launcher", "h", "", [["mechanicalscrap", 8], ["niobium", 6], ["vanadium", 6], ["mechanicalcomponents", 5]]],
    ["Meta Alloy Hull Reinforcement Size 1 Class 1", "h", "int_metaalloyhullreinforcement_size1_class1", [["metaalloys", 16], ["focuscrystals", 15], ["shieldpatternanalysis", 22], ["configurablecomponents", 20], ["reinforcedmountingplate", 12]]],
    ["Engineered Mining Laser (Fixed, Small)", "h", "", [["osmium", 16], ["arsenic", 20], ["rhenium", 24], ["phosphorus", 28]]],
    ["Flechette Launcher Fixed Medium", "h", "hpt_flechettelauncher_fixed_medium", [["iron", 30], ["molybdenum", 24], ["rhenium", 22], ["germanium", 26], ["cmmcomposite", 8]]],
    ["Flechette Launcher Turret Medium", "h", "hpt_flechettelauncher_turret_medium", [["iron", 28], ["molybdenum", 28], ["rhenium", 20], ["germanium", 24], ["articulationmotors", 10]]],
    ["Engineered Seeker Missile Rack V1 (Fixed, Class 2)", "h", "", [["osmium", 10], ["protoradiolicalloys", 16], ["conductiveceramics", 24], ["hybridcapacitors", 26], ["phosphorus", 28]]],
    ["Plasma Shock Cannon Fixed Large", "h", "hpt_plasmashockcannon_fixed_large", [["vanadium", 28], ["tungsten", 26], ["rhenium", 24], ["technetium", 26], ["powerconverter", 8]]],
    ["Plasma Shock Cannon Fixed Medium", "h", "hpt_plasmashockcannon_fixed_medium", [["vanadium", 24], ["tungsten", 26], ["rhenium", 20], ["technetium", 28], ["iondistributor", 6]]],
    ["Plasma Shock Cannon Fixed Small", "h", "hpt_plasmashockcannon_fixed_small", [["vanadium", 8], ["tungsten", 10], ["rhenium", 8], ["technetium", 12], ["powerconverter", 4]]],
    ["Plasma Shock Cannon Turret Large", "h", "hpt_plasmashockcannon_turret_large", [["vanadium", 26], ["tungsten", 28], ["rhenium", 22], ["technetium", 24], ["iondistributor", 10]]],
    ["Plasma Shock Cannon Turret Medium", "h", "hpt_plasmashockcannon_turret_medium", [["vanadium", 24], ["tungsten", 22], ["rhenium", 20], ["technetium", 28], ["powertransferconduits", 8]]],
    ["Plasma Shock Cannon Turret Small", "h", "hpt_plasmashockcannon_turret_small", [["vanadium", 8], ["tungsten", 12], ["rhenium", 10], ["technetium", 10], ["iondistributor", 4]]],
    ["Plasma Shock Cannon Gimbal Large", "h", "hpt_plasmashockcannon_gimbal_large", [["vanadium", 28], ["tungsten", 24], ["rhenium", 24], ["technetium", 22], ["powertransferconduits", 12]]],
    ["Plasma Shock Cannon Gimbal Medium", "h", "hpt_plasmashockcannon_gimbal_medium", [["vanadium", 24], ["tungsten", 22], ["rhenium", 20], ["technetium", 28], ["powerconverter", 10]]],
    ["Plasma Shock Cannon Gimbal Small", "h", "hpt_plasmashockcannon_gimbal_small", [["vanadium", 10], ["tungsten", 11], ["rhenium", 8], ["technetium", 10], ["powertransferconduits", 4]]],
    ["TG Pulse Neutraliser", "h", "hpt_antiunknownshutdown_tiny_v2", [["tg_shutdowndata", 5], ["tg_propulsionelement", 5], ["unknownenergysource", 5], ["ancientrelictg", 1]]],
    ["Guardian FSD Booster Size 1", "g", "int_guardianfsdbooster_size1", [["guardian_moduleblueprint", 1], ["guardian_powercell", 21], ["guardian_techcomponent", 21], ["focuscrystals", 24], ["hnshockmount", 8]]],
    ["Guardian Hull Reinforcement Size 1 Class 1", "g", "int_guardianhullreinforcement_size1_class1", [["guardian_moduleblueprint", 1], ["guardian_sentinel_wreckagecomponents", 21], ["ancientculturaldata", 16], ["ancienthistoricaldata", 16], ["reinforcedmountingplate", 12]]],
    ["Guardian Hybrid Fighter: XG7 Trident", "g", "gdn_hybrid_fighter_v1", [["guardian_vesselblueprint", 1], ["guardian_powercell", 25], ["ancienttechnologicaldata", 26], ["ancientculturaldata", 18], ["guardian_techcomponent", 25]]],
    ["Guardian Hybrid Fighter: XG8 Javelin", "g", "gdn_hybrid_fighter_v2", [["guardian_vesselblueprint", 1], ["guardian_powercell", 25], ["ancienttechnologicaldata", 26], ["guardian_sentinel_wreckagecomponents", 18], ["guardian_techcomponent", 25]]],
    ["Guardian Hybrid Fighter: XG9 Lance", "g", "gdn_hybrid_fighter_v3", [["guardian_vesselblueprint", 1], ["guardian_powercell", 25], ["ancienttechnologicaldata", 26], ["guardian_sentinel_weaponparts", 18], ["guardian_techcomponent", 25]]],
    ["Guardian Module Reinforcement Size 1 Class 1", "g", "int_guardianmodulereinforcement_size1_class1", [["guardian_moduleblueprint", 1], ["guardian_sentinel_wreckagecomponents", 18], ["ancienttechnologicaldata", 15], ["guardian_powerconduit", 20], ["reinforcedmountingplate", 9]]],
    ["Guardian Power Distributor Size 1", "g", "int_guardianpowerdistributor_size1", [["guardian_moduleblueprint", 1], ["ancientbiologicaldata", 20], ["guardian_powercell", 24], ["phasealloys", 18], ["heatsinkinterlink", 6]]],
    ["Guardian Power Plant Size 2", "g", "int_guardianpowerplant_size2", [["guardian_moduleblueprint", 1], ["guardian_powerconduit", 18], ["ancienttechnologicaldata", 21], ["heatresistantceramics", 15], ["powergridassembly", 10]]],
    ["Guardian Shield Reinforcement Size 1 Class 1", "g", "int_guardianshieldreinforcement_size1_class1", [["guardian_moduleblueprint", 1], ["guardian_powercell", 17], ["guardian_techcomponent", 20], ["ancientlanguagedata", 24], ["diagnosticsensor", 8]]],
    ["Guardian Gauss Cannon Fixed Medium", "w", "hpt_guardian_gausscannon_fixed_medium", [["guardian_weaponblueprint", 1], ["guardian_powercell", 18], ["guardian_techcomponent", 20], ["manganese", 15], ["magneticemittercoil", 6]]],
    ["Guardian Gauss Cannon Fixed Medium Modified", "w", "", [["thermalcoolingunits", 6], ["guardian_powercell", 18], ["guardian_techcomponent", 20], ["niobium", 15], ["guardian_weaponblueprint", 1]]],
    ["Guardian Gauss Cannon Fixed Small", "w", "hpt_guardian_gausscannon_fixed_small", [["guardian_weaponblueprint", 1], ["guardian_powerconduit", 12], ["guardian_sentinel_wreckagecomponents", 12], ["guardian_sentinel_weaponparts", 15]]],
    ["Guardian Gauss Cannon Fixed Small Modified", "w", "", [["guardian_powerconduit", 12], ["guardian_sentinel_wreckagecomponents", 12], ["guardian_sentinel_weaponparts", 15], ["niobium", 9], ["guardian_weaponblueprint", 1]]],
    ["Guardian Plasma Launcher Fixed Large", "w", "hpt_guardian_plasmalauncher_fixed_large", [["guardian_weaponblueprint", 1], ["guardian_powerconduit", 28], ["guardian_sentinel_weaponparts", 20], ["chromium", 28], ["coolinghoses", 10]]],
    ["Guardian Plasma Launcher Fixed Medium", "w", "hpt_guardian_plasmalauncher_fixed_medium", [["guardian_weaponblueprint", 1], ["guardian_powerconduit", 18], ["guardian_sentinel_weaponparts", 16], ["chromium", 14], ["coolinghoses", 8]]],
    ["Guardian Plasma Launcher Fixed Small", "w", "hpt_guardian_plasmalauncher_fixed_small", [["guardian_weaponblueprint", 1], ["guardian_powercell", 12], ["guardian_sentinel_weaponparts", 12], ["guardian_techcomponent", 15]]],
    ["Guardian Plasma Launcher Turret Large", "w", "hpt_guardian_plasmalauncher_turret_large", [["guardian_weaponblueprint", 2], ["guardian_powerconduit", 20], ["guardian_sentinel_weaponparts", 24], ["chromium", 26], ["articulationmotors", 10]]],
    ["Guardian Plasma Launcher Turret Medium", "w", "hpt_guardian_plasmalauncher_turret_medium", [["guardian_weaponblueprint", 2], ["guardian_powerconduit", 21], ["guardian_sentinel_weaponparts", 20], ["chromium", 16], ["articulationmotors", 8]]],
    ["Guardian Plasma Launcher Turret Small", "w", "hpt_guardian_plasmalauncher_turret_small", [["guardian_weaponblueprint", 1], ["guardian_powercell", 12], ["guardian_techcomponent", 12], ["guardian_sentinel_weaponparts", 15]]],
    ["Guardian Shard Cannon Fixed Large", "w", "hpt_guardian_shardcannon_fixed_large", [["guardian_weaponblueprint", 1], ["guardian_sentinel_wreckagecomponents", 20], ["guardian_techcomponent", 28], ["carbon", 20], ["microcontrollers", 18]]],
    ["Guardian Shard Cannon Fixed Medium Modified", "w", "", [["powerconverter", 12], ["guardian_sentinel_wreckagecomponents", 20], ["guardian_techcomponent", 18], ["germanium", 14], ["guardian_weaponblueprint", 1]]],
    ["Guardian Shard Cannon Fixed Medium", "w", "hpt_guardian_shardcannon_fixed_medium", [["guardian_weaponblueprint", 1], ["guardian_sentinel_wreckagecomponents", 20], ["guardian_techcomponent", 18], ["carbon", 14], ["powertransferconduits", 12]]],
    ["Guardian Shard Cannon Fixed Small Modified", "w", "", [["guardian_powerconduit", 12], ["guardian_sentinel_wreckagecomponents", 12], ["guardian_sentinel_weaponparts", 15], ["germanium", 6], ["guardian_weaponblueprint", 1]]],
    ["Guardian Shard Cannon Fixed Small", "w", "hpt_guardian_shardcannon_fixed_small", [["guardian_weaponblueprint", 1], ["guardian_powerconduit", 12], ["guardian_techcomponent", 12], ["guardian_sentinel_weaponparts", 15]]],
    ["Guardian Shard Cannon Turret Large", "w", "hpt_guardian_shardcannon_turret_large", [["guardian_weaponblueprint", 2], ["guardian_sentinel_wreckagecomponents", 20], ["guardian_techcomponent", 26], ["carbon", 28], ["microcontrollers", 12]]],
    ["Guardian Shard Cannon Turret Medium", "w", "hpt_guardian_shardcannon_turret_medium", [["guardian_weaponblueprint", 2], ["guardian_sentinel_wreckagecomponents", 16], ["guardian_techcomponent", 20], ["carbon", 15], ["microcontrollers", 12]]],
    ["Guardian Shard Cannon Turret Small", "w", "hpt_guardian_shardcannon_turret_small", [["guardian_weaponblueprint", 1], ["guardian_powerconduit", 12], ["guardian_techcomponent", 15], ["guardian_sentinel_weaponparts", 12]]],
    ["Engineered FSD (SCO) V1 (Class 2)", "h", "int_hyperdrive_overcharge_size2_class5", [["dataminedwake", 10], ["tellurium", 14], ["electrochemicalarrays", 6], ["chemicalprocessors", 9], ["tg_propulsionelement", 4], ["thargoidtitandrivecomponent", 1]]],
    ["Engineered FSD (SCO) V1 (Class 3)", "h", "int_hyperdrive_overcharge_size3_class5", [["dataminedwake", 12], ["tellurium", 16], ["electrochemicalarrays", 9], ["chemicalprocessors", 11], ["tg_propulsionelement", 5], ["thargoidtitandrivecomponent", 1]]],
    ["Engineered FSD (SCO) V1 (Class 4)", "h", "int_hyperdrive_overcharge_size4_class5", [["dataminedwake", 13], ["tellurium", 20], ["electrochemicalarrays", 9], ["chemicalprocessors", 13], ["tg_propulsionelement", 6], ["thargoidtitandrivecomponent", 1]]],
    ["Engineered FSD (SCO) V1 (Class 5)", "h", "int_hyperdrive_overcharge_size5_class5", [["dataminedwake", 15], ["tellurium", 24], ["electrochemicalarrays", 12], ["chemicalprocessors", 14], ["tg_propulsionelement", 7], ["thargoidtitandrivecomponent", 1]]],
    ["Engineered FSD (SCO) V1 (Class 6)", "h", "int_hyperdrive_overcharge_size6_class5", [["dataminedwake", 15], ["tellurium", 28], ["electrochemicalarrays", 12], ["chemicalprocessors", 16], ["tg_propulsionelement", 8], ["thargoidtitandrivecomponent", 1]]],
    ["Engineered FSD (SCO) V1 (Class 7)", "h", "int_hyperdrive_overcharge_size7_class5", [["dataminedwake", 16], ["tellurium", 28], ["electrochemicalarrays", 14], ["chemicalprocessors", 18], ["tg_propulsionelement", 12], ["thargoidtitandrivecomponent", 1]]],
];
const COMMODITIES = {
    "ancientrelictg": "Unclassified Relic",
    "articulationmotors": "Articulation Motors",
    "cmmcomposite": "CMM Composite",
    "coolinghoses": "Micro-Weave Cooling Hoses",
    "diagnosticsensor": "Hardware Diagnostic Sensor",
    "heatsinkinterlink": "Heatsink Interlink",
    "hnshockmount": "HN Shock Mount",
    "iondistributor": "Ion Distributor",
    "magneticemittercoil": "Magnetic Emitter Coil",
    "metaalloys": "Meta-Alloys",
    "microcontrollers": "Micro Controllers",
    "neofabricinsulation": "Neofabric Insulation",
    "osmium": "Osmium",
    "powerconverter": "Power Converter",
    "powergridassembly": "Energy Grid Assembly",
    "powertransferconduits": "Power Transfer Bus",
    "radiationbaffle": "Radiation Baffle",
    "reinforcedmountingplate": "Reinforced Mounting Plate",
    "thargoidheart": "Thargoid Heart",
    "thargoidtitandrivecomponent": "Titan Drive Component",
    "thermalcoolingunits": "Thermal Cooling Units",
};

show();
