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


// Material Sources: where to find each material, starting with what you're running low on.
//
// Pick raw, manufactured, encoded, Guardian or Thargoid; the list shows how full you are of each (lowest first) and
// RUNNING LOW collects everything under the share you choose. Click a material for where it comes from and, for the
// ones a material trader takes, what to trade for it. Sources are general: what drops where changes with game
// updates and system states. Your materials are kept from the journal. Everything it needs is in this file.

let cat = store.get("cat", "m");            // r · m · e · g (Guardian) · t (Thargoid)
let selId = store.get("selId", "");
let lowPct = store.get("lowPct", 25);       // running low under this share of the cap
const TABS = ["r", "m", "e", "g", "t"];

function special(m) { return /Guardian/.test(m.group) ? "g" : /Thargoid/.test(m.group) ? "t" : ""; }
function tabOf(m) { return special(m) || m.cat; }
function tabName(t) {
    return t === "g" ? tr("js.guardian", "Guardian") : t === "t" ? tr("js.thargoid", "Thargoid") : catName(t);
}
function fill(m) { return m.cap ? (have[m.id] || 0) / m.cap : 0; }

/// Where a material comes from: a few sources, most useful first (keys of SOURCES).
function sourcesOf(m) {
    const out = [].concat(SPECIAL[m.id] || []);
    const g = m.group;
    if (/Guardian/.test(g)) {
        if (/Obelisk/.test(g)) out.push("obelisk");
        else if (m.cat === "e") out.push("gterminal");
        else if (/sentinel/.test(m.id)) out.push("sentinel");
        else out.push("gsite");
        return uniq(out);
    }
    if (/Thargoid/.test(g)) {
        out.push(m.cat === "e" ? "tscan" : "tships", m.cat === "e" ? "tsite" : "tsite");
        return uniq(out);
    }
    if (m.cat === "r") {
        out.push("surface");
        if (m.grade >= 3) out.push("brain", "shards");
        out.push("mining");
        if (m.grade <= 2) out.push("geo");
    } else if (m.cat === "m") {
        if (m.grade >= 4) out.push("hge");
        if (m.grade <= 3) out.push("ships", "uss");
        out.push("salvage");
        if (m.grade >= 4) out.push("ships");
    } else {
        if (g === "EncodedWakeScans") out.push("wake");
        if (g === "EncodedEmissionData" || g === "EncodedShieldData") out.push("scan");
        if (g === "EncodedDataArchives") out.push("beacon");
        if (g === "EncodedEncryptionFiles" || g === "EncodedFirmware" || g === "EncodedDataArchives") out.push("datapoint");
        out.push("encodeduss");
        if (g === "EncodedShieldData" || g === "EncodedEmissionData") out.push("scan_low");
    }
    out.push("missions");
    if (tradable(m)) out.push("trader");
    return uniq(out);
}
function uniq(a) { return a.filter((v, i) => a.indexOf(v) === i); }
function sourceText(k) { const s = SOURCES[k]; return s ? tr("src." + k, s) : k; }

/// The cheapest trade into `want` from what you hold, keeping half of each material's cap back (a hint, not a plan).
function tradeHint(want) {
    if (!tradable(want)) return "";
    const need = Math.max(1, Math.min(want.cap - (have[want.id] || 0), Math.ceil(want.cap * 0.25)));
    const spare = {};
    for (const id of Object.keys(have)) {
        const m = mat(id);
        if (!tradable(m) || id === want.id) continue;
        const n = have[id] - Math.ceil(m.cap * 0.5);
        if (n > 0) spare[id] = n;
    }
    const best = tradeOptions(want, need, spare)[0];
    return best ? tr("js.trade_hint", "{0}: give {1} {2} → get {3}", traderName(want.cat), fmt(best.give), matName(best.from.id), fmt(best.get)) : "";
}

on("click:cat", c => { if (TABS.includes(c)) { cat = c; store.set("cat", cat); show(); } });
on("click:pick", id => { selId = id; store.set("selId", selId); show(); });
on("change:lowPct", v => { lowPct = Math.max(1, Math.min(90, parseInt(v, 10) || 25)); store.set("lowPct", lowPct); show(); });

function show() {
    set("cats", TABS.map(t => ({ id: t, name: tabName(t), on: t === cat })));
    set("lowPct", String(lowPct));
    set("status", !matsKnown ? tr("js.no_mats", "Waiting for your materials: the game lists them when you load into the game.") : "");

    const all = Object.keys(MATERIALS).map(mat).filter(m => m && tabOf(m) === cat);
    all.sort((a, b) => fill(a) - fill(b) || a.grade - b.grade || matName(a.id).localeCompare(matName(b.id)));
    const row = m => {
        const f = fill(m);
        return { id: m.id, name: matName(m.id), on: m.id === selId, info: `G${m.grade} · ${fmt(have[m.id] || 0)}/${m.cap}`,
                 p: f, low: matsKnown && f * 100 < lowPct, pct: Math.round(f * 100) + "%" };
    };
    set("rows", all.map(row));

    // running low, across every category, lowest first (grade 5 first among equals: hardest to come by)
    const low = Object.keys(MATERIALS).map(mat).filter(m => m && matsKnown && fill(m) * 100 < lowPct && tradable(m))
        .sort((a, b) => fill(a) - fill(b) || b.grade - a.grade).slice(0, 8);
    set("low", low.map(m => ({ id: m.id, text: `${matName(m.id)} · G${m.grade}`, pct: Math.round(fill(m) * 100) + "%" })));
    set("lowHead", matsKnown ? tr("js.low", "RUNNING LOW (UNDER {0}%)", lowPct) : "");
    set("lowNone", matsKnown && low.length === 0 ? tr("js.low_none", "Nothing under {0}%.", lowPct) : "");

    // the one picked
    let m = mat(selId);
    if (!m || (tabOf(m) !== cat && !low.some(x => x.id === m.id))) m = all[0];
    if (m) {
        set("selTitle", matName(m.id));
        set("selSub", `${tabName(tabOf(m))} · ${tr("js.grade", "grade {0}", m.grade)} · ${groupName(m.group)} · ${tr("js.have", "you have {0} of {1}", fmt(have[m.id] || 0), m.cap)}`);
        set("sources", sourcesOf(m).map(k => ({ text: sourceText(k) })));
        set("trade", tradeHint(m));
    } else { set("selTitle", ""); set("selSub", ""); set("sources", []); set("trade", ""); }
}

matListeners.push(show);
on("language", show);

// ---- where things come from (general guidance: drops change with updates and system states)
const SOURCES = {
    surface: "Surface prospecting in an SRV: shoot mineral outcrops and pick up the fragments. The system map shows how much of each element a body has: pick bodies rich in it",
    brain: "Brain trees (found near Guardian sites): shooting them drops high-grade raw materials",
    shards: "Crystalline shard fields on some planets (e.g. HIP 36601, Outotz LS-K d8-3): shoot shards in an SRV for high-grade raw materials",
    mining: "Laser mining in asteroid rings: raw materials come with the fragments",
    geo: "Geological sites (volcanism signals) on planets",
    hge: "High Grade Emissions signal sources: high-grade manufactured salvage. Which one depends on the system: its state (boom, war, outbreak…) and allegiance",
    ships: "Destroyed ships drop manufactured materials: bigger and harder targets drop better ones",
    uss: "Degraded Emissions and combat aftermath signal sources",
    salvage: "Crashed ships and wreckage on planet surfaces",
    wake: "Scan high-energy wakes (ships jumping out of a system) with an FSD Wake Scanner",
    scan: "Scan ships with a ship scanner, especially big and well-shielded ones",
    scan_low: "Shoot down ships' shields and scan them as they cycle",
    beacon: "Scan nav beacons and data beacons in systems",
    datapoint: "Data points and terminals at surface settlements and installations",
    encodeduss: "Encoded Emissions signal sources (and Degraded Emissions for lower grades)",
    missions: "Mission rewards: many missions let you pick materials as the reward",
    trader: "A material trader: trade other materials of the same category for it",
    gsite: "Guardian structures: power up the pylons and pick up the technology parts around the site",
    sentinel: "Guardian Sentinels: destroy them at Guardian structures and collect what they drop",
    gterminal: "Data terminals at Guardian structures (Guardian blueprint fragments)",
    obelisk: "Obelisks at Guardian ruins: scan them with the right relic or casket in your SRV",
    tships: "Thargoid ships and their wrecks: destroyed Scouts and Interceptors, and Thargoid surface sites",
    tscan: "Scan Thargoid ships and objects with a composition or xeno scanner",
    tsite: "Thargoid surface sites and the wreckage in Thargoid systems",
    hge_outbreak: "High Grade Emissions in systems in an Outbreak",
    hge_war: "High Grade Emissions in systems at War or in Civil War",
    hge_unrest: "High Grade Emissions in systems in Civil Unrest",
    hge_empire: "High Grade Emissions in Empire systems",
    hge_federation: "High Grade Emissions in Federation systems",
    hge_boom: "High Grade Emissions in systems in a Boom",
};
// the best-known places for particular materials
const SPECIAL = {
    pharmaceuticalisolators: ["hge_outbreak"],
    militarygradealloys: ["hge_war"],
    militarysupercapacitors: ["hge_war"],
    improvisedcomponents: ["hge_unrest"],
    imperialshielding: ["hge_empire"],
    fedcorecomposites: ["hge_federation"],
    fedproprietarycomposites: ["hge_federation"],
    protolightalloys: ["hge_boom"],
    protoradiolicalloys: ["hge_boom"],
    protoheatradiators: ["hge_boom"],
};

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

show();
