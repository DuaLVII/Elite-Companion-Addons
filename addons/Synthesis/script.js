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


// Synthesis: what you can synthesise right now, and what's short for the rest.
//
// Every synthesis recipe (ammo, FSD injections, limpets, AFM refills, SRV supplies, heat sinks…) at each level,
// with how many times you could make it from what you hold. "For your ship" keeps to what your fitted modules can
// use (from the game's Loadout event); click a recipe for its materials, what you have of each and what's missing.
// Your materials are kept from the journal. Everything it needs is in this file (the data is at the end).

let view = store.get("view", "ship");     // ship · all
let selName = store.get("selName", "FSD");
let fitted = store.get("fitted", []);     // the ship's module items (lower case), from Loadout
let shipName = store.get("shipName", "");
let made = store.get("made", []);         // [{ t, name, level }] the last few syntheses
const LEVELS = { B: 0, S: 1, P: 2 };

// what the fitted modules can use (module item names from the journal)
const FITS = {
    "Small Calibre Munitions": /hpt_multicannon/,
    "Large Calibre Munitions": /hpt_cannon/,
    "Plasma Munitions": /hpt_plasmaaccelerator/,
    "High Velocity Munitions": /hpt_railgun/,
    "Explosive Munitions": /hpt_(basic|dumbfire|drunk)missilerack/,
    "Flechette Launcher Munitions": /hpt_flechettelauncher/,
    "Shock Cannon Munitions": /hpt_plasmashockcannon/,
    "AX Small Calibre Munitions": /hpt_atmulticannon/,
    "AX Explosive Munitions": /hpt_atdumbfiremissile/,
    "AX Remote Flak Munitions": /hpt_flakmortar/,
    "Enzyme Missile Launcher Munitions": /hpt_causticmissile/,
    "Guardian Gauss Cannon Munitions": /hpt_guardian_gausscannon/,
    "Guardian Plasma Charger Munitions": /hpt_guardian_plasmalauncher/,
    "Guardian Shard Cannon Munitions": /hpt_guardian_shardcannon/,
    "Nanite Munitions": /hpt_atventdisruptorpylon/,
    "Heat Sinks": /hpt_heatsinklauncher/,
    "Chaff": /hpt_chafflauncher/,
    "Caustic Sinks": /hpt_causticsinklauncher/,
    "Limpets": /int_(multi)?dronecontrol/,
    "AFM Refill": /int_repairer/,
    "SRV Ammo": /int_buggybay/,
    "SRV Refuel": /int_buggybay/,
    "SRV Repair": /int_buggybay/,
    "Seismic Charge Munitions": /hpt_mining_seismchrgwarhd/,
    "Sub-Surface Displacement Munitions": /hpt_mining_subsurfdispmisle/,
};
const ALWAYS = ["FSD", "Life Support"];

function recipeKey(name) { return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function recipeName(name) { return tr("syn." + recipeKey(name), name === "FSD" ? "FSD Injection" : name); }
function levelName(l) { return l === "B" ? tr("js.basic", "Basic") : l === "S" ? tr("js.standard", "Standard") : tr("js.premium", "Premium"); }
function forShip(name) {
    if (ALWAYS.includes(name)) return true;
    const re = FITS[name];
    return !!re && fitted.some(m => re.test(m));
}
/// How many times you could make it now.
function canMake(ing) {
    let n = Infinity;
    for (const [id, need] of ing) n = Math.min(n, Math.floor((have[id] || 0) / need));
    return n === Infinity ? 0 : n;
}

on("Loadout", e => {
    if (!Array.isArray(e.Modules)) return;
    fitted = e.Modules.map(m => String(m.Item || "").toLowerCase()).filter(x => x);
    shipName = e.ShipName || e.Ship_Localised || e.Ship || "";
    store.set("fitted", fitted); store.set("shipName", shipName);
    show();
});

on("Synthesis", (e, replay) => {
    // (the materials are taken off above: this keeps the last few for the list)
    const t = e.timestamp || "";
    if (made.some(m => m.t === t && m.name === e.Name)) return;
    made.unshift({ t, name: e.Name || "" });
    made = made.slice(0, 8);
    store.set("made", made);
    show();
});

on("click:view", v => { if (v === "ship" || v === "all") { view = v; store.set("view", view); show(); } });
on("click:pick", name => { selName = name; store.set("selName", selName); show(); });

/// The journal names syntheses like "FSD Basic", "Ammo Premium", "Limpet Basic".
function madeText(m) {
    const lvl = /premium/i.test(m.name) ? "P" : /standard/i.test(m.name) ? "S" : "B";
    const base = m.name.replace(/\s*(basic|standard|premium)\s*$/i, "");
    const r = SYNTHESIS.find(([n, levels]) => recipeName(n).toLowerCase() === base.toLowerCase() || n.toLowerCase() === base.toLowerCase());
    return (r ? recipeName(r[0]) : base) + " · " + levelName(lvl);
}
function ago(t) {
    const ms = Date.now() - Date.parse(t);
    if (!(ms >= 0)) return "";
    const m = Math.round(ms / 60000);
    return m < 60 ? tr("js.min_ago", "{0} min ago", m) : m < 48 * 60 ? tr("js.h_ago", "{0} h ago", Math.round(m / 60)) : tr("js.d_ago", "{0} d ago", Math.round(m / 1440));
}

function show() {
    set("views", [
        { id: "ship", name: tr("js.v_ship", "For your ship"), on: view === "ship" },
        { id: "all", name: tr("js.v_all", "All"), on: view === "all" },
    ]);
    set("status", !matsKnown ? tr("js.no_mats", "Waiting for your materials: the game lists them when you load into the game.")
        : view === "ship" && fitted.length === 0 ? tr("js.no_loadout", "Waiting for your ship's modules (the game lists them at login and when you change ship): showing everything for now.") : "");

    let list = SYNTHESIS.filter(([n]) => view === "all" || fitted.length === 0 || forShip(n));
    const rows = list.map(([n, levels]) => {
        const counts = levels.map(([l, ing]) => ({ l, n: canMake(ing) }));
        const best = counts.slice().reverse().find(c => c.n > 0);
        return {
            id: n, name: recipeName(n), on: n === selName,
            levels: counts.map(c => ({ text: levelName(c.l)[0] + (c.n > 0 ? " ×" + (c.n > 99 ? "99+" : c.n) : " ✗"), ok: c.n > 0 })),
            ready: !!best,
            sort: (best ? 0 : 1),
        };
    });
    rows.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    set("rows", rows);
    set("count", tr("js.count", "{0} of {1} you can make now", rows.filter(r => r.ready).length, rows.length));

    // the one picked: each level's materials
    let r = SYNTHESIS.find(([n]) => n === selName) || SYNTHESIS.find(([n]) => list.some(x => x[0] === n)) || SYNTHESIS[0];
    if (r) {
        set("selTitle", recipeName(r[0]) + (r[0] === "FSD" ? "  ·  " + tr("js.fsd_note", "jump range +25% / +50% / +100% for one jump") : ""));
        set("detail", r[1].map(([l, ing]) => {
            const n = canMake(ing);
            return {
                level: levelName(l), can: n > 0 ? tr("js.can_n", "can make {0}", fmt(n)) : tr("js.cant", "short"),
                ok: n > 0,
                mats: ing.map(([id, need]) => {
                    const h = have[id] || 0;
                    return { text: `${need} ${matName(id)}`, have: tr("js.have_n", "have {0}", fmt(h)), short: h < need };
                }),
            };
        }));
    } else { set("selTitle", ""); set("detail", []); }

    set("ship", fitted.length && shipName ? tr("js.ship", "Ship: {0}", shipName) : "");
    set("made", made.slice(0, 4).map(m => ({ text: madeText(m), when: ago(m.t) })));
    set("madeHead", made.length ? tr("js.made", "LAST SYNTHESISED") : "");
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
const SYNTHESIS = [
    ["AFM Refill", [["B", [["vanadium", 3], ["nickel", 2], ["chromium", 2], ["zinc", 2]]], ["S", [["vanadium", 6], ["manganese", 2], ["molybdenum", 1], ["zirconium", 1], ["tin", 1]]], ["P", [["vanadium", 6], ["chromium", 4], ["zinc", 2], ["zirconium", 2], ["tellurium", 1], ["ruthenium", 1]]]]],
    ["AX Explosive Munitions", [["B", [["iron", 3], ["nickel", 3], ["carbon", 4], ["tg_propulsionelement", 3]]], ["S", [["sulphur", 6], ["phosphorus", 6], ["mercury", 2], ["unknownorganiccircuitry", 4], ["tg_propulsionelement", 4]]], ["P", [["tungsten", 5], ["mercury", 4], ["polonium", 2], ["tg_biomechanicalconduits", 5], ["tg_propulsionelement", 5], ["tg_shipflightdata", 6]]]]],
    ["AX Remote Flak Munitions", [["B", [["nickel", 4], ["carbon", 3], ["sulphur", 2]]], ["S", [["tin", 2], ["zinc", 3], ["arsenic", 1], ["unknowntechnologycomponents", 3], ["tg_wreckagecomponents", 2]]], ["P", [["zinc", 8], ["tungsten", 2], ["arsenic", 1], ["unknownenergysource", 3], ["unknowntechnologycomponents", 4], ["tg_weaponparts", 1]]]]],
    ["AX Small Calibre Munitions", [["B", [["iron", 2], ["nickel", 1], ["sulphur", 2], ["tg_weaponparts", 2]]], ["S", [["iron", 2], ["phosphorus", 2], ["zirconium", 2], ["unknownenergysource", 3], ["tg_weaponparts", 4]]], ["P", [["iron", 3], ["phosphorus", 2], ["zirconium", 2], ["unknownenergysource", 4], ["unknowncarapace", 2], ["tg_weaponparts", 6]]]]],
    ["Caustic Sinks", [["S", [["chemicalstorageunits", 1], ["galvanisingalloys", 1], ["tg_causticshard", 4], ["tg_causticgeneratorparts", 2]]]]],
    ["Chaff", [["B", [["compactcomposites", 1], ["filamentcomposites", 1]]], ["S", [["compactcomposites", 1], ["filamentcomposites", 2], ["thermicalloys", 1]]], ["P", [["compactcomposites", 1], ["filamentcomposites", 2], ["thermicalloys", 1], ["protoradiolicalloys", 1]]]]],
    ["Configurable Explosive Munitions", [["B", [["iron", 3], ["nickel", 3], ["carbon", 4], ["sulphur", 4]]], ["S", [["phosphorus", 6], ["arsenic", 4], ["mercury", 2], ["guardian_powercell", 1], ["guardian_powerconduit", 1], ["guardian_techcomponent", 1]]]]],
    ["Configurable Small Calibre Munitions", [["B", [["iron", 2], ["nickel", 1], ["sulphur", 2]]], ["S", [["tin", 2], ["zinc", 3], ["phosphorus", 3], ["guardian_powercell", 1], ["guardian_powerconduit", 1], ["guardian_techcomponent", 1]]]]],
    ["Enzyme Missile Launcher Munitions", [["B", [["iron", 3], ["sulphur", 3], ["tg_biomechanicalconduits", 4], ["tg_propulsionelement", 3], ["tg_weaponparts", 3], ["lead", 2]]], ["S", [["sulphur", 6], ["tungsten", 4], ["tg_biomechanicalconduits", 5], ["tg_propulsionelement", 6], ["tg_weaponparts", 4], ["lead", 4]]], ["P", [["phosphorus", 5], ["tungsten", 4], ["tg_biomechanicalconduits", 6], ["tg_propulsionelement", 5], ["tg_weaponparts", 4], ["lead", 6]]]]],
    ["Explosive Munitions", [["B", [["sulphur", 4], ["iron", 3], ["nickel", 3], ["carbon", 4]]], ["S", [["phosphorus", 6], ["sulphur", 6], ["arsenic", 4], ["mercury", 2]]], ["P", [["phosphorus", 5], ["arsenic", 4], ["mercury", 5], ["niobium", 5], ["polonium", 5]]]]],
    ["Flechette Launcher Munitions", [["B", [["tungsten", 1], ["electrochemicalarrays", 3], ["mechanicalcomponents", 2], ["boron", 2]]], ["S", [["tungsten", 4], ["electrochemicalarrays", 6], ["mechanicalcomponents", 4], ["boron", 4]]], ["P", [["tungsten", 6], ["electrochemicalarrays", 5], ["mechanicalcomponents", 9], ["boron", 6]]]]],
    ["FSD", [["B", [["carbon", 1], ["vanadium", 1], ["germanium", 1]]], ["S", [["carbon", 1], ["vanadium", 1], ["germanium", 1], ["cadmium", 1], ["niobium", 1]]], ["P", [["carbon", 1], ["germanium", 1], ["niobium", 1], ["arsenic", 1], ["polonium", 1], ["yttrium", 1]]]]],
    ["Guardian Gauss Cannon Munitions", [["B", [["manganese", 3], ["focuscrystals", 2], ["guardian_powerconduit", 2], ["guardian_sentinel_wreckagecomponents", 4]]], ["S", [["manganese", 5], ["heatresistantceramics", 3], ["focuscrystals", 5], ["guardian_powerconduit", 4], ["guardian_sentinel_weaponparts", 3]]], ["P", [["manganese", 8], ["guardian_techcomponent", 6], ["filamentcomposites", 6], ["focuscrystals", 10]]]]],
    ["Guardian Plasma Charger Munitions", [["B", [["chromium", 3], ["heatdispersionplate", 2], ["guardian_powerconduit", 3], ["guardian_sentinel_wreckagecomponents", 4]]], ["S", [["chromium", 4], ["heatexchangers", 2], ["phasealloys", 2], ["guardian_powercell", 2], ["guardian_techcomponent", 2]]], ["P", [["chromium", 6], ["zirconium", 2], ["heatexchangers", 4], ["phasealloys", 6], ["guardian_powercell", 4], ["guardian_sentinel_weaponparts", 3]]]]],
    ["Guardian Shard Cannon Munitions", [["B", [["carbon", 3], ["vanadium", 2], ["crystalshards", 3], ["guardian_powercell", 3], ["guardian_sentinel_wreckagecomponents", 5]]], ["S", [["crystalshards", 4], ["guardian_powercell", 2], ["guardian_sentinel_weaponparts", 2]]], ["P", [["carbon", 8], ["guardian_powercell", 6], ["vanadium", 4], ["crystalshards", 8]]]]],
    ["Heat Sinks", [["B", [["basicconductors", 2], ["heatconductionwiring", 2]]], ["S", [["basicconductors", 2], ["heatconductionwiring", 2], ["heatexchangers", 2]]], ["P", [["basicconductors", 2], ["heatconductionwiring", 2], ["heatexchangers", 2], ["protoheatradiators", 1]]]]],
    ["High Velocity Munitions", [["B", [["iron", 2], ["vanadium", 1]]], ["S", [["iron", 4], ["vanadium", 3], ["zirconium", 2], ["tungsten", 2]]], ["P", [["vanadium", 4], ["zirconium", 2], ["tungsten", 4], ["yttrium", 2]]]]],
    ["Large Calibre Munitions", [["B", [["sulphur", 2], ["nickel", 4], ["carbon", 3]]], ["S", [["phosphorus", 3], ["zirconium", 2], ["zinc", 3], ["arsenic", 1], ["tin", 2]]], ["P", [["zinc", 8], ["arsenic", 1], ["mercury", 1], ["tungsten", 2], ["antimony", 2]]]]],
    ["Life Support", [["B", [["iron", 2], ["nickel", 1]]]]],
    ["Limpets", [["B", [["iron", 10], ["nickel", 10]]]]],
    ["Mining Rig", [["B", [["iron", 3], ["nickel", 2], ["mechanicalequipment", 1]]]]],
    ["Nanite Munitions", [["B", [["guardian_powercell", 2], ["tg_abrasion01", 5], ["tg_abrasion02", 5]]]]],
    ["Plasma Munitions", [["B", [["phosphorus", 4], ["sulphur", 3], ["manganese", 1]]], ["S", [["phosphorus", 5], ["selenium", 1], ["manganese", 3], ["molybdenum", 4]]], ["P", [["selenium", 5], ["molybdenum", 4], ["cadmium", 4], ["technetium", 2]]]]],
    ["Seismic Charge Munitions", [["B", [["iron", 2], ["nickel", 2], ["sulphur", 2], ["phosphorus", 3], ["mercury", 1]]]]],
    ["Shock Cannon Munitions", [["B", [["gridresistors", 3], ["heatdispersionplate", 2], ["focuscrystals", 2], ["phasealloys", 2], ["lead", 2]]], ["S", [["gridresistors", 5], ["heatdispersionplate", 3], ["focuscrystals", 4], ["phasealloys", 5], ["lead", 3]]], ["P", [["gridresistors", 7], ["heatdispersionplate", 4], ["focuscrystals", 6], ["phasealloys", 8], ["lead", 5]]]]],
    ["Small Calibre Munitions", [["B", [["sulphur", 2], ["iron", 2], ["nickel", 1]]], ["S", [["phosphorus", 2], ["iron", 2], ["zirconium", 2], ["zinc", 2], ["selenium", 2]]], ["P", [["phosphorus", 2], ["sulphur", 2], ["zirconium", 2], ["mercury", 2], ["tungsten", 2], ["antimony", 1]]]]],
    ["SRV Ammo", [["B", [["phosphorus", 1], ["sulphur", 2]]], ["S", [["phosphorus", 1], ["selenium", 1], ["manganese", 1], ["molybdenum", 1]]], ["P", [["phosphorus", 2], ["selenium", 2], ["molybdenum", 1], ["technetium", 1]]]]],
    ["SRV Refuel", [["B", [["phosphorus", 1], ["sulphur", 1]]], ["S", [["phosphorus", 1], ["sulphur", 1], ["arsenic", 1], ["mercury", 1]]], ["P", [["sulphur", 1], ["arsenic", 1], ["mercury", 1], ["technetium", 1]]]]],
    ["SRV Repair", [["B", [["iron", 2], ["nickel", 1]]], ["S", [["nickel", 3], ["vanadium", 2], ["manganese", 1], ["molybdenum", 1]]], ["P", [["vanadium", 2], ["zinc", 1], ["chromium", 2], ["tungsten", 1], ["tellurium", 1]]]]],
    ["Sub-Surface Displacement Munitions", [["B", [["nickel", 3], ["carbon", 3], ["sulphur", 3], ["tungsten", 2]]]]],
];

show();
