// Materials: every ship material against its cap.
//
// The game writes a "Materials" event with everything you hold each time you load the game, then an event for every
// change: collected, discarded, traded, used by an engineer or synthesis, given to a technology broker or a research
// drive, or rewarded by a mission. Counts are kept with `store` so the module is filled in before the game is running;
// each event is counted once (by its time), so the app reading today's journal again at start-up doesn't add twice.


let have = store.get("have", {});          // material id → count
let names = store.get("names", {});        // material id → the game's own (translated) name, when it gave one
let last = store.get("last", "");          // timestamp of the newest event counted
let at = store.get("at", "");              // when the last full list came in
const warnedFull = {};

let tab = store.get("tab", "r");           // r · m · e
let filter = store.get("filter", "have");  // have · all · near
let sortBy = store.get("sort", "group");   // group · fill

function save() {
    store.set("have", have); store.set("names", names); store.set("last", last); store.set("at", at);
}

// Each event once: newer than the newest already counted (the start-up replay of today's journal comes again).
// Events in the same second as the newest are told apart by their contents.
let lastKeys = store.get("lastKeys", []);
function fresh(e) {
    const t = e.timestamp || "";
    if (!t) return true;
    const sig = JSON.stringify(e);
    if (last && t < last) return false;
    if (t === last) {
        if (lastKeys.includes(sig)) return false;
    } else { last = t; lastKeys = []; }
    lastKeys.push(sig);
    store.set("lastKeys", lastKeys);
    return true;
}

function remember(name, localised) {
    const m = Mats.info(name);
    if (m && localised && localised !== m.name) names[m.id] = localised;
    return m;
}

function add(name, count, localised, replay) {
    const m = remember(name, localised);
    if (!m) return;
    const before = have[m.id] || 0;
    const now = Math.max(0, Math.min(m.cap || 9999, before + count));
    have[m.id] = now;
    // full now? say so once (until it drops again)
    if (count > 0 && m.cap && now >= m.cap && !warnedFull[m.id]) {
        warnedFull[m.id] = true;
        if (!replay) notify(tr("js.full", "{0} is full ({1}): trade or use some, or more pick-ups go to waste", display(m), m.cap), "warning", 8);
    }
    if (now < m.cap) warnedFull[m.id] = false;
}

function display(m) { return names[m.id] || tr("mat." + m.id, m.name); }

on("Materials", (e, replay) => {
    if (!fresh(e)) return;
    have = {};
    for (const list of [e.Raw, e.Manufactured, e.Encoded])
        for (const it of list || []) {
            const m = remember(it.Name, it.Name_Localised);
            if (m) have[m.id] = it.Count || 0;
        }
    for (const id of Object.keys(have)) { const m = Mats.info(id); warnedFull[id] = m && have[id] >= m.cap; }
    at = e.timestamp || "";
    save(); show();
});

on("MaterialCollected", (e, replay) => { if (fresh(e)) { add(e.Name, e.Count || 1, e.Name_Localised, replay); save(); show(); } });
on("MaterialDiscarded", (e) => { if (fresh(e)) { add(e.Name, -(e.Count || 1), e.Name_Localised); save(); show(); } });
on("MaterialTrade", (e) => {
    if (!fresh(e)) return;
    if (e.Paid) add(e.Paid.Material, -(e.Paid.Quantity || 0), e.Paid.Material_Localised);
    if (e.Received) add(e.Received.Material, e.Received.Quantity || 0, e.Received.Material_Localised);
    save(); show();
});
function spend(list) { for (const it of list || []) add(it.Name, -(it.Count || 0), it.Name_Localised); }
on("EngineerCraft", (e) => { if (fresh(e)) { spend(e.Ingredients); save(); show(); } });
on("Synthesis", (e) => { if (fresh(e)) { spend(e.Materials); save(); show(); } });
on("TechnologyBroker", (e) => { if (fresh(e)) { spend(e.Materials); save(); show(); } });
on("ScientificResearch", (e) => { if (fresh(e)) { add(e.Name, -(e.Count || 0), e.Name_Localised); save(); show(); } });
on("EngineerContribution", (e) => {
    if (!fresh(e) || e.Type !== "Materials") return;
    add(e.Material, -(e.Quantity || 0), e.Material_Localised); save(); show();
});
on("MissionCompleted", (e, replay) => {
    if (!fresh(e) || !e.MaterialsReward) return;
    for (const it of e.MaterialsReward) add(it.Name, it.Count || 0, it.Name_Localised, replay);
    save(); show();
});

// ------------------------------------------------------------------ the view

on("click:tab", v => { tab = v; store.set("tab", tab); show(); });
on("click:filter", v => { filter = v; store.set("filter", filter); show(); });
on("click:sort", () => { sortBy = sortBy === "group" ? "fill" : "group"; store.set("sort", sortBy); show(); });

function level(count, cap) {
    if (!count) return "empty";
    if (count >= cap) return "full";
    if (count >= cap * 0.8) return "near";
    return "ok";
}

function show() {
    const all = Mats.all();
    const totals = { r: 0, m: 0, e: 0 };
    let full = 0, near = 0;
    for (const m of all) {
        const n = have[m.id] || 0;
        totals[m.cat] += n;
        const l = level(n, m.cap);
        if (l === "full") full++; else if (l === "near") near++;
    }

    set("tabs", ["r", "m", "e"].map(c => ({ id: c, name: `${Mats.catName(c)} · ${fmt(totals[c])}`, on: c === tab })));
    set("filters", [
        { id: "have", name: tr("js.f_have", "What I have"), on: filter === "have" },
        { id: "near", name: tr("js.f_near", "Nearly full"), on: filter === "near" },
        { id: "all", name: tr("js.f_all", "Everything"), on: filter === "all" },
    ]);
    set("sortText", sortBy === "group" ? tr("js.sort_group", "↕ by group") : tr("js.sort_fill", "↕ fullest first"));

    const rows = all.filter(m => m.cat === tab).map(m => {
        const n = have[m.id] || 0;
        return { m, n, l: level(n, m.cap), pct: m.cap ? Math.round(n * 100 / m.cap) : 0 };
    }).filter(x => filter === "all" || (filter === "have" ? x.n > 0 : x.l === "near" || x.l === "full"));

    const row = x => ({ name: display(x.m), grade: "G" + x.m.grade, count: `${fmt(x.n)} / ${x.m.cap}`, pct: x.pct, level: x.l,
                        tip: `${display(x.m)} · ${x.m.groupName} · ${tr("js.grade", "grade {0}", x.m.grade)} · ${x.pct}%` });
    let sections;
    if (sortBy === "fill") {
        rows.sort((a, b) => b.pct - a.pct || a.m.order - b.m.order);
        sections = rows.length ? [{ title: "", rows: rows.map(row) }] : [];
    } else {
        const byGroup = new Map();
        for (const x of rows) {
            if (!byGroup.has(x.m.group)) byGroup.set(x.m.group, { title: x.m.groupName.toUpperCase(), rows: [] });
            byGroup.get(x.m.group).rows.push(row(x));
        }
        sections = [...byGroup.values()];
    }
    set("sections", sections);

    const known = Object.keys(have).length > 0;
    set("empty", !known ? tr("js.waiting", "Waiting for your materials: the game lists them when you load into the game.")
               : sections.length ? "" : filter === "near" ? tr("js.none_near", "Nothing nearly full here.") : tr("js.none", "None of these yet."));
    set("warn", full + near > 0 ? tr("js.warn", "⚠ {0} full · {1} nearly full (80%+)", full, near) : "");
    set("warnLevel", full > 0 ? "full" : near > 0 ? "near" : "");
    set("when", at ? tr("js.listed", "Full list from the game: {0}", at.replace("T", " ").replace("Z", "").slice(0, 16)) : "");
}

on("language", show);

// ================================================================== data: materials (kept in this file so the addon
// stands alone; the same in every engineering addon)
// The list (names, grades and trader groups) is from EDDiscovery's EliteDangerousCore (Apache 2.0).
const Mats = (() => {
    const DATA = {
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
    const GROUPS = {
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
    const CAPS = [0, 300, 250, 200, 150, 100];
    const order = Object.keys(DATA);

    function key(name) {
        return String(name || "").toLowerCase().replace(/^\$/, "").replace(/_name;?$/, "").replace(/[^a-z0-9]/g, "");
    }
    const byKey = {};
    for (const id of order) { byKey[id] = id; byKey[key(id)] = id; byKey[key(DATA[id][0])] = id; }

    function make(id, i) {
        const d = DATA[id];
        return { id, name: d[0], cat: d[1], grade: d[2], group: d[3], groupName: tr("mat.g." + d[3], GROUPS[d[3]] || d[3]), cap: CAPS[d[2]] || 0, order: i };
    }

    return {
        info(name) { const id = byKey[key(name)]; return id ? make(id, order.indexOf(id)) : null; },
        cap(grade) { return CAPS[grade] || 0; },
        all() { return order.map((id, i) => make(id, i)); },
        catName(cat) { return cat === "r" ? tr("mat.raw", "Raw") : cat === "m" ? tr("mat.manufactured", "Manufactured") : tr("mat.encoded", "Encoded"); },
        groups: GROUPS,
    };
})();

show();
