// On-Foot Engineering: suit and weapon grade upgrades and engineer modifications, against what's in your ship locker.
//
// YOUR LOADOUT shows the suit and weapons you have on (from SuitLoadout) with what the next grade takes; UPGRADES and
// MODS list everything, with what you have of each resource; ENGINEERS shows the on-foot engineers, your progress
// with each, how far away they are and how to unlock them. ★ Track any upgrade or mod for one combined shopping list.
// Resources are counted from the ship locker and backpack (ShipLocker.json / Backpack.json). Everything it needs is
// in this file (the data is at the end, from EDDiscovery's EliteDangerousCore, Apache 2.0).

let tab = store.get("tab", "loadout");       // loadout · up · mods · eng · track
let kind = store.get("kind", "s");           // s suits · w weapons (UPGRADES and MODS)
let sel = store.get("sel", "");              // the picked upgrade or mod's id
let tracked = store.get("tracked", []);      // ids
let locker = store.get("locker", {});        // resource → count in the ship locker
let pack = store.get("pack", {});            // resource → count in the backpack
let lockerKnown = store.get("lockerKnown", false);
let names = store.get("names", {});          // resource → the game's name for it (in its language)
let loadout = store.get("loadout", null);    // { suit, suitName, suitClass, suitMods, weapons: [{ name, item, cls, mods }] }
let progress = store.get("progress", {});    // engineer → status
let here = store.get("here", null);          // { system, pos }

function rkey(s) { return String(s || "").toLowerCase().replace(/^\$/, "").replace(/_name;?$/, "").replace(/[^a-z0-9]/g, ""); }
function resName(id) { return names[id] || tr("of." + id, (OF_ITEMS[id] || [id])[0]); }
function countOf(id) { return (locker[id] || 0) + (pack[id] || 0); }
function catName(c) { return c === "g" ? tr("js.goods", "goods") : c === "a" ? tr("js.assets", "assets") : c === "d" ? tr("js.data", "data") : ""; }

// ---- resources: the side files list everything; read them whole each time they change
function readList(target, lists) {
    const out = {};
    for (const list of lists) for (const it of list || []) {
        const id = rkey(it.Name);
        if (!id) continue;
        out[id] = (out[id] || 0) + (it.Count || 0);
        if (it.Name_Localised) names[id] = it.Name_Localised;
    }
    return out;
}
on("ShipLocker", s => {
    if (!s || !(Array.isArray(s.Items) || Array.isArray(s.Components) || Array.isArray(s.Data))) return;   // (the journal event can come without the lists)
    locker = readList(locker, [s.Items, s.Components, s.Consumables, s.Data]);
    lockerKnown = true;
    store.set("locker", locker); store.set("lockerKnown", true); store.set("names", names);
    show();
});
on("Backpack", s => {
    if (!s || !(Array.isArray(s.Items) || Array.isArray(s.Components) || Array.isArray(s.Data))) return;
    pack = readList(pack, [s.Items, s.Components, s.Consumables, s.Data]);
    store.set("pack", pack); store.set("names", names);
    show();
});

// ---- what you have on
function suitMaker(item) {
    const s = String(item || "").toLowerCase();
    return /utilitysuit/.test(s) ? "Remlok" : /tacticalsuit/.test(s) ? "Manticore" : /explorationsuit/.test(s) ? "Supratech" : "";
}
function weaponMaker(item) {
    const s = String(item || "").toLowerCase();
    return /_kinetic_/.test(s) ? "Kinematic Armaments" : /_plasma_/.test(s) ? "Manticore" : /_laser_/.test(s) ? "Takada" : "";
}
function classOf(item, cls) {
    if (cls) return Number(cls) || 1;
    const m = /_class(\d)/.exec(String(item || "").toLowerCase());
    return m ? Number(m[1]) : 1;
}
on("SuitLoadout", e => {
    loadout = {
        suit: String(e.SuitName || "").toLowerCase(), suitName: e.SuitName_Localised || e.SuitName || "",
        suitClass: classOf(e.SuitName, e.Class), suitMods: (e.SuitMods || []).map(m => String(m).toLowerCase()),
        loadoutName: e.LoadoutName || "",
        weapons: (e.Modules || []).map(m => ({
            item: String(m.ModuleName || "").toLowerCase(), name: m.ModuleName_Localised || m.ModuleName || "",
            cls: classOf(m.ModuleName, m.Class), mods: (m.WeaponMods || []).map(x => String(x).toLowerCase()), id: m.SuitModuleID,
        })),
    };
    store.set("loadout", loadout);
    show();
});
on("UpgradeSuit", e => {
    if (loadout && String(e.Name || "").toLowerCase().replace(/_class\d/, "") === loadout.suit.replace(/_class\d/, "")) { loadout.suitClass = Number(e.Class) || loadout.suitClass; store.set("loadout", loadout); show(); }
});
on("UpgradeWeapon", e => {
    if (!loadout) return;
    const w = loadout.weapons.find(x => (e.SuitModuleID && x.id === e.SuitModuleID) || x.item === String(e.Name || "").toLowerCase());
    if (w) { w.cls = Number(e.Class) || w.cls; store.set("loadout", loadout); show(); }
});

// ---- engineers and where you are
on("EngineerProgress", e => {
    const list = e.Engineers || (e.Engineer ? [e] : []);
    for (const x of list) if (x.Engineer) progress[x.Engineer] = x.Progress || progress[x.Engineer] || "";
    store.set("progress", progress);
    show();
});
function moved(e) {
    if (Array.isArray(e.StarPos) && e.StarPos.length === 3) { here = { system: e.StarSystem || "", pos: e.StarPos }; store.set("here", here); show(); }
}
on("FSDJump", moved); on("Location", moved); on("CarrierJump", moved);
function engDist(pos) {
    if (!here || !here.pos) return null;
    const dx = pos[0] - here.pos[0], dy = pos[1] - here.pos[1], dz = pos[2] - here.pos[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function distText(d) { return d === null ? "" : d < 10 ? `${d.toFixed(1)} ly` : `${fmt(Math.round(d))} ly`; }
function statusText(s) {
    return { Unlocked: tr("js.s_unlocked", "Unlocked"), Invited: tr("js.s_invited", "Invited"), Acquainted: tr("js.s_acquainted", "Met"),
             Known: tr("js.s_known", "Known"), Barred: tr("js.s_barred", "Barred") }[s] || tr("js.s_none", "Not met");
}

// ---- upgrades and mods as one list of things to make: id → { title, sub, ing, credits, engineers }
function makerName(m) { return m === "All" ? tr("js.any_maker", "any maker") : m; }
function suitOf(m) { return m === "Remlok" ? "Maverick" : m === "Manticore" ? "Dominator" : m === "Supratech" ? "Artemis" : m; }
function weaponsOf(m) { return m === "Kinematic Armaments" ? tr("js.kinetic", "kinetic") : m === "Manticore" ? tr("js.plasma", "plasma") : m === "Takada" ? tr("js.laser", "laser") : ""; }
function modName(fd, fallback) { return tr("mod." + fd, fallback); }
function job(id) {
    let m = /^up:(s|w):(.+):(\d)$/.exec(id);
    if (m) {
        const u = UPGRADES.find(x => x[0] === m[1] && x[1] === m[2] && x[2] === Number(m[3]));
        if (!u) return null;
        return { id, title: (u[0] === "s" ? tr("js.up_suit", "{0} suit → grade {1}", suitOf(u[1]), u[2]) : tr("js.up_weapon", "{0} weapons ({1}) → grade {2}", u[1], weaponsOf(u[1]), u[2])),
                 sub: tr("js.at_pioneer", "Upgrade at Pioneer Supplies (credits too)"), ing: u[3], engineers: [] };
    }
    m = /^mod:(\d+)$/.exec(id);
    if (m) {
        const x = MODS[Number(m[1])];
        if (!x) return null;
        return { id, title: modName(x[1], x[3]) + (x[2] !== "All" ? " · " + x[2] : ""), sub: (x[0] === "s" ? tr("js.suit_mod", "Suit modification") : tr("js.weapon_mod", "Weapon modification"))
                 + " · " + fmt(x[4]) + " cr", ing: x[5], engineers: x[6], fd: x[1] };
    }
    return null;
}
function readyOf(ing) { return ing.every(([id, n]) => countOf(id) >= n); }
function progressOf(ing) { let need = 0, got = 0; for (const [id, n] of ing) { need += n; got += Math.min(n, countOf(id)); } return need ? got / need : 0; }
function jobRow(j) {
    const p = progressOf(j.ing);
    return { id: j.id, name: j.title, on: j.id === sel, star: tracked.includes(j.id), ready: p >= 1, pct: Math.floor(p * 100) + "%", p };
}

on("click:tab", t => { tab = t; store.set("tab", tab); show(); });
on("click:kind", k => { if (k === "s" || k === "w") { kind = k; store.set("kind", kind); show(); } });
on("click:pick", id => { sel = id; store.set("sel", sel); show(); });
on("click:track", id => {
    const t = id || sel;
    if (!t) return;
    tracked = tracked.includes(t) ? tracked.filter(x => x !== t) : tracked.concat([t]);
    store.set("tracked", tracked);
    show();
});
on("click:copy", system => { copy(system); notify(tr("js.copied", "{0} copied: paste it in the galaxy map", system), "info", 4); });

function show() {
    set("tabs", [
        { id: "loadout", name: tr("js.t_loadout", "Your loadout"), on: tab === "loadout" },
        { id: "up", name: tr("js.t_up", "Upgrades"), on: tab === "up" },
        { id: "mods", name: tr("js.t_mods", "Mods"), on: tab === "mods" },
        { id: "eng", name: tr("js.t_eng", "Engineers"), on: tab === "eng" },
        { id: "track", name: "★ " + tr("js.t_track", "Tracked · {0}", tracked.length), on: tab === "track" },
    ]);
    set("kinds", [{ id: "s", name: tr("js.suits", "Suits"), on: kind === "s" }, { id: "w", name: tr("js.weapons", "Weapons"), on: kind === "w" }]);
    set("showKinds", tab === "up" || tab === "mods");
    set("status", lockerKnown ? "" : tr("js.no_locker", "Waiting for your ship locker: the game writes it when you board, disembark or open it."));

    // the list for the tab
    let jobs = [];
    if (tab === "up") jobs = UPGRADES.filter(u => u[0] === kind).map(u => job(`up:${u[0]}:${u[1]}:${u[2]}`));
    if (tab === "mods") jobs = MODS.map((x, i) => x[0] === kind ? job("mod:" + i) : null).filter(x => x);
    if (tab === "track") jobs = tracked.map(job).filter(x => x);
    if (tab === "loadout") jobs = loadoutJobs();
    set("rows", jobs.map(jobRow));
    set("showRows", tab !== "eng");
    set("empty", tab === "track" && jobs.length === 0 ? tr("js.none_tracked", "Nothing tracked yet: pick an upgrade or mod and press ★ Track.")
        : tab === "loadout" && !loadout ? tr("js.no_loadout", "Waiting for your loadout: the game lists it when you pick or change one.")
        : tab === "loadout" && jobs.length === 0 ? tr("js.all_g5", "Everything you have on is grade 5.") : "");
    set("loadoutText", tab === "loadout" && loadout ? loadoutSummary() : []);

    // the one picked
    let j = job(sel);
    if ((!j || !jobs.some(x => x.id === j.id)) && jobs.length && tab !== "eng") { j = jobs[0]; sel = j.id; store.set("sel", sel); }
    if (j && tab !== "eng") {
        set("selTitle", j.title);
        set("selSub", j.sub);
        set("selMats", j.ing.map(([id, n]) => {
            const h = countOf(id);
            return { text: `${n} ${resName(id)}`, kind: catName((OF_ITEMS[id] || [])[1]), have: tr("js.have_n", "have {0}", fmt(h)), short: h < n };
        }));
        set("selEng", j.engineers.length ? tr("js.who", "Engineers: {0}", j.engineers.map(n => n + (progress[n] === "Unlocked" ? " ✓" : "")).join(", ")) : "");
        set("selState", readyOf(j.ing) ? tr("js.ready", "✓ You have everything for it") : tr("js.short_n", "{0} still short", j.ing.filter(([id, n]) => countOf(id) < n).length));
        set("trackText", tracked.includes(j.id) ? "★ " + tr("js.tracked", "Tracked") : "☆ " + tr("js.track", "Track"));
        set("hasSel", true);
    } else { set("hasSel", false); set("selTitle", ""); set("selSub", ""); set("selMats", []); set("selEng", ""); set("selState", ""); }

    // engineers
    if (tab === "eng") {
        const rows = OF_ENGINEERS.map(e => {
            const st = progress[e[0]] || "";
            const d = engDist(e[4]);
            return {
                name: e[0], status: statusText(st), unlocked: st === "Unlocked", system: e[1],
                where: `${e[1]} · ${e[3]} · ${e[2]}`, dist: d, distText: distText(d),
                needs: st === "Unlocked" ? "" : st === "Invited" || st === "Acquainted" ? tr("js.to_unlock", "To unlock: {0}", e[7])
                     : st === "Known" ? tr("js.to_meet", "To be invited: {0}", e[6]) : tr("js.to_find", "To hear of them: {0}", e[5]),
                does: MODS.filter(x => x[6].includes(e[0])).map(x => modName(x[1], x[3])).filter((v, i, a) => a.indexOf(v) === i).join(" · "),
            };
        });
        rows.sort((a, b) => (b.unlocked - a.unlocked) || ((a.dist === null ? 1e9 : a.dist) - (b.dist === null ? 1e9 : b.dist)) || a.name.localeCompare(b.name));
        set("engineers", rows);
        set("engSummary", tr("js.eng_summary", "{0} of {1} unlocked", rows.filter(r => r.unlocked).length, rows.length) + (here ? " · " + tr("js.from", "distances from {0}", here.system) : ""));
    } else { set("engineers", []); set("engSummary", ""); }

    // shopping list for what's tracked
    const total = {};
    for (const id of tracked) { const t = job(id); if (t) for (const [r, n] of t.ing) total[r] = (total[r] || 0) + n; }
    const shop = Object.keys(total).map(id => ({ id, need: total[id], h: countOf(id) })).filter(x => x.h < x.need)
        .sort((a, b) => (b.need - b.h) - (a.need - a.h))
        .map(x => ({ text: resName(x.id), kind: catName((OF_ITEMS[x.id] || [])[1]), short: tr("js.short_by", "{0} more ({1}/{2})", fmt(x.need - x.h), fmt(x.h), fmt(x.need)) }));
    set("shop", tab === "eng" ? [] : shop);
    set("shopHead", tracked.length && tab !== "eng" ? tr("js.shop", "STILL NEEDED FOR WHAT YOU TRACK") : "");
    set("shopDone", tracked.length && tab !== "eng" && shop.length === 0 ? tr("js.shop_done", "✓ You have everything for what you track.") : "");
}

/// The next grade of each thing you have on (suits and weapons below grade 5).
function loadoutJobs() {
    if (!loadout) return [];
    const out = [];
    const sm = suitMaker(loadout.suit);
    if (sm && loadout.suitClass < 5) { const j = job(`up:s:${sm}:${loadout.suitClass + 1}`); if (j) out.push(j); }
    for (const w of loadout.weapons) {
        const wm = weaponMaker(w.item);
        if (wm && w.cls < 5) { const j = job(`up:w:${wm}:${w.cls + 1}`); if (j && !out.some(x => x.id === j.id)) out.push(j); }
    }
    return out;
}
function loadoutSummary() {
    const lines = [];
    const modTxt = list => list.length ? list.map(fd => { const x = MODS.find(m => m[1] === fd); return x ? modName(x[1], x[3]) : fd; }).join(", ") : tr("js.no_mods", "no mods");
    lines.push({ name: `${loadout.suitName} · G${loadout.suitClass}`, mods: modTxt(loadout.suitMods) });
    for (const w of loadout.weapons) lines.push({ name: `${w.name} · G${w.cls}`, mods: modTxt(w.mods) });
    return lines;
}

on("language", show);

// ================================================================== data (from EDDiscovery's EliteDangerousCore, Apache 2.0)
// on-foot resources the upgrades and modifications use: id → [name, g goods · a assets · d data]
const OF_ITEMS = {
    "aerogel": ["Aerogel", "a"],
    "carbonfibreplating": ["Carbon Fibre Plating", "a"],
    "chemicalcatalyst": ["Chemical Catalyst", "a"],
    "chemicalsuperbase": ["Chemical Superbase", "a"],
    "circuitboard": ["Circuit Board", "a"],
    "circuitswitch": ["Circuit Switch", "a"],
    "electricalfuse": ["Electrical Fuse", "a"],
    "electricalwiring": ["Electrical Wiring", "a"],
    "electromagnet": ["Electromagnet", "a"],
    "encryptedmemorychip": ["Encrypted Memory Chip", "a"],
    "epinephrine": ["Epinephrine", "a"],
    "epoxyadhesive": ["Epoxy Adhesive", "a"],
    "graphene": ["Graphene", "a"],
    "ionbattery": ["Ion Battery", "a"],
    "memorychip": ["Memory Chip", "a"],
    "metalcoil": ["Metal Coil", "a"],
    "microhydraulics": ["Micro Hydraulics", "a"],
    "microsupercapacitor": ["Micro Supercapacitor", "a"],
    "microthrusters": ["Micro Thrusters", "a"],
    "microtransformer": ["Micro Transformer", "a"],
    "microelectrode": ["Microelectrode", "a"],
    "motor": ["Motor", "a"],
    "opticalfibre": ["Optical Fibre", "a"],
    "opticallens": ["Optical Lens", "a"],
    "oxygenicbacteria": ["Oxygenic Bacteria", "a"],
    "rdx": ["RDX", "a"],
    "scrambler": ["Scrambler", "a"],
    "titaniumplating": ["Titanium Plating", "a"],
    "transmitter": ["Transmitter", "a"],
    "tungstencarbide": ["Tungsten Carbide", "a"],
    "viscoelasticpolymer": ["Viscoelastic Polymer", "a"],
    "weaponcomponent": ["Weapon Component", "a"],
    "phneutraliser": ["pH Neutraliser", "a"],
    "airqualityreports": ["Air Quality Reports", "d"],
    "atmosphericdata": ["Atmospheric Data", "d"],
    "audiologs": ["Audio Logs", "d"],
    "ballisticsdata": ["Ballistics Data", "d"],
    "biometricdata": ["Biometric Data", "d"],
    "bloodtestresults": ["Blood Test Results", "d"],
    "chemicalexperimentdata": ["Chemical Experiment Data", "d"],
    "chemicalformulae": ["Chemical Formulae", "d"],
    "chemicalinventory": ["Chemical Inventory", "d"],
    "chemicalpatents": ["Chemical Patents", "d"],
    "medicaltrialrecords": ["Clinical Trial Records", "d"],
    "combattrainingmaterial": ["Combat Training Material", "d"],
    "combatantperformance": ["Combatant Performance", "d"],
    "digitaldesigns": ["Digital Designs", "d"],
    "evacuationprotocols": ["Evacuation Protocols", "d"],
    "extractionyielddata": ["Extraction Yield Data", "d"],
    "genesequencingdata": ["Gene Sequencing Data", "d"],
    "geneticresearch": ["Genetic Research", "d"],
    "maintenancelogs": ["Maintenance Logs", "d"],
    "manufacturinginstructions": ["Manufacturing Instructions", "d"],
    "medicalrecords": ["Medical Records", "d"],
    "mineralsurvey": ["Mineral Survey", "d"],
    "mininganalytics": ["Mining Analytics", "d"],
    "nocdata": ["NOC Data", "d"],
    "operationalmanual": ["Operational Manual", "d"],
    "patrolroutes": ["Patrol Routes", "d"],
    "pharmaceuticalpatents": ["Pharmaceutical Patents", "d"],
    "productionreports": ["Production Reports", "d"],
    "productionschedule": ["Production Schedule", "d"],
    "radioactivitydata": ["Radioactivity Data", "d"],
    "reactoroutputreview": ["Reactor Output Review", "d"],
    "recyclinglogs": ["Recycling Logs", "d"],
    "riskassessments": ["Risk Assessments", "d"],
    "securityexpenses": ["Security Expenses", "d"],
    "settlementassaultplans": ["Settlement Assault Plans", "d"],
    "spectralanalysisdata": ["Spectral Analysis Data", "d"],
    "stellaractivitylogs": ["Stellar Activity Logs", "d"],
    "surveilleancelogs": ["Surveillance Logs", "d"],
    "tacticalplans": ["Tactical Plans", "d"],
    "topographicalsurveys": ["Topographical Surveys", "d"],
    "troopdeploymentrecords": ["Troop Deployment Records", "d"],
    "weaponinventory": ["Weapon Inventory", "d"],
    "weapontestdata": ["Weapon Test Data", "d"],
    "compressionliquefiedgas": ["Compression-Liquefied Gas", "g"],
    "gmeds": ["G-Meds", "g"],
    "healthmonitor": ["Health Monitor", "g"],
    "ionisedgas": ["Ionised Gas", "g"],
    "suitschematic": ["Suit Schematic", "g"],
    "surveillanceequipment": ["Surveillance Equipment", "g"],
    "weaponschematic": ["Weapon Schematic", "g"],
};
// grade upgrades (at Pioneer Supplies): kind (s suit · w weapon), maker, grade, [[resource, count]…]
const UPGRADES = [
    ["s", "Remlok", 2, [["suitschematic", 1], ["healthmonitor", 1], ["manufacturinginstructions", 1], ["carbonfibreplating", 2], ["graphene", 2]]],
    ["s", "Remlok", 3, [["suitschematic", 2], ["healthmonitor", 2], ["manufacturinginstructions", 2], ["carbonfibreplating", 5], ["graphene", 5]]],
    ["s", "Remlok", 4, [["suitschematic", 4], ["healthmonitor", 4], ["manufacturinginstructions", 4], ["carbonfibreplating", 9], ["graphene", 9]]],
    ["s", "Remlok", 5, [["suitschematic", 5], ["healthmonitor", 5], ["manufacturinginstructions", 5], ["carbonfibreplating", 12], ["graphene", 12]]],
    ["s", "Supratech", 2, [["suitschematic", 1], ["healthmonitor", 1], ["manufacturinginstructions", 1], ["aerogel", 2], ["graphene", 2]]],
    ["s", "Supratech", 3, [["suitschematic", 2], ["healthmonitor", 2], ["manufacturinginstructions", 2], ["aerogel", 5], ["graphene", 5]]],
    ["s", "Supratech", 4, [["suitschematic", 4], ["healthmonitor", 4], ["manufacturinginstructions", 4], ["aerogel", 9], ["graphene", 9]]],
    ["s", "Supratech", 5, [["suitschematic", 5], ["healthmonitor", 5], ["manufacturinginstructions", 5], ["aerogel", 12], ["graphene", 12]]],
    ["s", "Manticore", 2, [["suitschematic", 1], ["healthmonitor", 1], ["manufacturinginstructions", 1], ["titaniumplating", 2], ["graphene", 2]]],
    ["s", "Manticore", 3, [["suitschematic", 2], ["healthmonitor", 2], ["manufacturinginstructions", 2], ["titaniumplating", 5], ["graphene", 5]]],
    ["s", "Manticore", 4, [["suitschematic", 4], ["healthmonitor", 4], ["manufacturinginstructions", 4], ["titaniumplating", 9], ["graphene", 9]]],
    ["s", "Manticore", 5, [["suitschematic", 5], ["healthmonitor", 5], ["manufacturinginstructions", 5], ["titaniumplating", 12], ["graphene", 12]]],
    ["w", "Kinematic Armaments", 2, [["weaponschematic", 1], ["compressionliquefiedgas", 1], ["manufacturinginstructions", 1], ["tungstencarbide", 2], ["weaponcomponent", 2]]],
    ["w", "Kinematic Armaments", 3, [["weaponschematic", 2], ["compressionliquefiedgas", 2], ["manufacturinginstructions", 2], ["tungstencarbide", 5], ["weaponcomponent", 5]]],
    ["w", "Kinematic Armaments", 4, [["weaponschematic", 4], ["compressionliquefiedgas", 4], ["manufacturinginstructions", 4], ["tungstencarbide", 9], ["weaponcomponent", 9]]],
    ["w", "Kinematic Armaments", 5, [["weaponschematic", 5], ["compressionliquefiedgas", 5], ["manufacturinginstructions", 5], ["tungstencarbide", 12], ["weaponcomponent", 12]]],
    ["w", "Manticore", 2, [["weaponschematic", 1], ["ionisedgas", 1], ["manufacturinginstructions", 1], ["chemicalsuperbase", 2], ["microelectrode", 2]]],
    ["w", "Manticore", 3, [["weaponschematic", 2], ["ionisedgas", 2], ["manufacturinginstructions", 2], ["chemicalsuperbase", 5], ["microelectrode", 5]]],
    ["w", "Manticore", 4, [["weaponschematic", 4], ["ionisedgas", 4], ["manufacturinginstructions", 4], ["chemicalsuperbase", 9], ["microelectrode", 9]]],
    ["w", "Manticore", 5, [["weaponschematic", 5], ["ionisedgas", 5], ["manufacturinginstructions", 5], ["chemicalsuperbase", 12], ["microelectrode", 12]]],
    ["w", "Takada", 2, [["weaponschematic", 1], ["ionisedgas", 1], ["manufacturinginstructions", 1], ["microelectrode", 2], ["opticalfibre", 2]]],
    ["w", "Takada", 3, [["weaponschematic", 2], ["ionisedgas", 2], ["manufacturinginstructions", 2], ["microelectrode", 5], ["opticalfibre", 5]]],
    ["w", "Takada", 4, [["weaponschematic", 4], ["ionisedgas", 4], ["manufacturinginstructions", 4], ["microelectrode", 9], ["opticalfibre", 9]]],
    ["w", "Takada", 5, [["weaponschematic", 5], ["ionisedgas", 5], ["manufacturinginstructions", 5], ["microelectrode", 12], ["opticalfibre", 12]]],
];
// engineer modifications: kind, journal id, maker ("All" or one), name, credits, [[resource, count]…], engineers
const MODS = [
    ["s", "suit_reducedtoolbatteryconsumption", "All", "Reduced Tool Battery Consumption", 500000, [["electricalfuse", 3], ["microtransformer", 5], ["electricalwiring", 8], ["reactoroutputreview", 5]], ["Domino Green", "Wellington Beck", "Rosa Dayette"]],
    ["s", "suit_increasedbatterycapacity", "All", "Improved Battery Capacity", 750000, [["ionbattery", 3], ["microsupercapacitor", 5], ["electricalwiring", 5], ["reactoroutputreview", 5], ["maintenancelogs", 8]], ["Wellington Beck", "Oden Geiger", "Rosa Dayette"]],
    ["s", "suit_increasedshieldregen", "All", "Faster Shield Regen", 750000, [["ionbattery", 3], ["microtransformer", 8], ["electricalwiring", 8], ["reactoroutputreview", 5]], ["Kit Fowler", "Uma Laszlo", "Eleanor Bresa"]],
    ["s", "suit_improvedarmourrating", "All", "Damage Resistance", 750000, [["titaniumplating", 3], ["carbonfibreplating", 3], ["epoxyadhesive", 8], ["weaponinventory", 5], ["ballisticsdata", 5]], ["Jude Navarro", "Uma Laszlo", "Eleanor Bresa"]],
    ["s", "suit_increasedo2capacity", "All", "Increased Air Reserves", 750000, [["oxygenicbacteria", 5], ["phneutraliser", 8], ["pharmaceuticalpatents", 3], ["airqualityreports", 8]], ["Terra Velasquez", "Hero Ferrari", "Baltanos"]],
    ["s", "suit_nightvision", "All", "Night Vision", 1000000, [["surveillanceequipment", 5], ["circuitswitch", 5], ["surveilleancelogs", 3], ["radioactivitydata", 3], ["nocdata", 3]], ["Oden Geiger", "Yi Shen"]],
    ["s", "suit_improvedradar", "All", "Enhanced Tracking", 750000, [["transmitter", 3], ["circuitboard", 3], ["topographicalsurveys", 5], ["stellaractivitylogs", 5], ["spectralanalysisdata", 5]], ["Domino Green", "Oden Geiger", "Rosa Dayette"]],
    ["s", "suit_backpackcapacity", "All", "Extra Backpack Capacity", 750000, [["epoxyadhesive", 5], ["memorychip", 3], ["weaponinventory", 5], ["chemicalinventory", 5], ["digitaldesigns", 5]], ["Domino Green", "Wellington Beck", "Rosa Dayette"]],
    ["s", "suit_increasedammoreserves", "All", "Extra Ammo Capacity", 750000, [["weaponcomponent", 3], ["recyclinglogs", 8], ["weapontestdata", 5], ["productionreports", 5]], ["Kit Fowler", "Jude Navarro", "Eleanor Bresa"]],
    ["s", "suit_improvedjumpassist", "All", "Improved Jump Assist", 750000, [["gmeds", 5], ["microthrusters", 3], ["motor", 5], ["topographicalsurveys", 5]], ["Yarden Bond", "Hero Ferrari", "Baltanos"]],
    ["s", "suit_increasedsprintduration", "All", "Increased Sprint Duration", 750000, [["oxygenicbacteria", 5], ["chemicalcatalyst", 8], ["troopdeploymentrecords", 3], ["genesequencingdata", 3], ["medicaltrialrecords", 3]], ["Terra Velasquez", "Hero Ferrari", "Baltanos"]],
    ["s", "suit_adsmovementspeed", "All", "Combat Movement Speed", 750000, [["epinephrine", 5], ["phneutraliser", 8], ["evacuationprotocols", 5], ["geneticresearch", 3]], ["Yarden Bond", "Terra Velasquez", "Baltanos"]],
    ["s", "suit_quieterfootsteps", "All", "Quieter Footsteps", 1000000, [["microhydraulics", 3], ["viscoelasticpolymer", 8], ["settlementassaultplans", 3], ["tacticalplans", 5], ["patrolroutes", 5]], ["Yarden Bond", "Yi Shen"]],
    ["s", "suit_increasedmeleedamage", "All", "Added Melee Damage", 500000, [["epinephrine", 5], ["microthrusters", 8], ["combattrainingmaterial", 5], ["combatantperformance", 5]], ["Kit Fowler", "Jude Navarro", "Eleanor Bresa"]],
    ["w", "weapon_suppression_pressurised", "All", "Noise Suppressor", 1000000, [["viscoelasticpolymer", 8], ["weaponcomponent", 3], ["atmosphericdata", 5], ["mininganalytics", 5]], ["Terra Velasquez", "Hero Ferrari", "Baltanos"]],
    ["w", "weapon_suppression_unpressurised", "All", "Audio Masking", 1000000, [["scrambler", 5], ["transmitter", 8], ["circuitboard", 3], ["audiologs", 3], ["patrolroutes", 5]], ["Yarden Bond", "Yi Shen"]],
    ["w", "weapon_stability", "All", "Stability", 500000, [["viscoelasticpolymer", 5], ["microhydraulics", 5], ["mininganalytics", 5], ["riskassessments", 8]], ["Domino Green", "Oden Geiger", "Rosa Dayette"]],
    ["w", "weapon_handling", "All", "Faster Handling", 500000, [["viscoelasticpolymer", 3], ["operationalmanual", 5], ["combatantperformance", 5], ["combattrainingmaterial", 5]], ["Yarden Bond", "Hero Ferrari", "Baltanos"]],
    ["w", "weapon_reloadspeed", "All", "Reload Speed", 500000, [["microhydraulics", 5], ["electromagnet", 5], ["operationalmanual", 5], ["productionreports", 5], ["combattrainingmaterial", 5]], ["Jude Navarro", "Uma Laszlo", "Eleanor Bresa"]],
    ["w", "weapon_clipsize", "All", "Magazine Size", 750000, [["weaponcomponent", 3], ["tungstencarbide", 3], ["metalcoil", 5], ["weapontestdata", 5], ["securityexpenses", 3]], ["Kit Fowler", "Jude Navarro", "Eleanor Bresa"]],
    ["w", "weapon_scope", "All", "Scope", 500000, [["opticallens", 5], ["opticalfibre", 3], ["spectralanalysisdata", 5], ["biometricdata", 3]], ["Wellington Beck", "Oden Geiger", "Rosa Dayette"]],
    ["w", "weapon_backpackreloading", "All", "Stowed reloading", 1000000, [["circuitboard", 3], ["encryptedmemorychip", 8], ["digitaldesigns", 5], ["operationalmanual", 5], ["productionschedule", 5]], ["Kit Fowler", "Uma Laszlo", "Eleanor Bresa"]],
    ["w", "weapon_accuracy", "Kinematic Armaments", "Higher Accuracy", 500000, [["viscoelasticpolymer", 5], ["rdx", 5], ["extractionyielddata", 5], ["biometricdata", 3], ["combatantperformance", 5]], ["Yarden Bond", "Terra Velasquez", "Baltanos"]],
    ["w", "weapon_range", "Kinematic Armaments", "Greater Range", 500000, [["metalcoil", 5], ["rdx", 5], ["weaponcomponent", 3], ["ballisticsdata", 5], ["topographicalsurveys", 5]], ["Domino Green", "Wellington Beck", "Rosa Dayette"]],
    ["w", "weapon_headshotdamage", "Kinematic Armaments", "Headshot Damage", 500000, [["chemicalcatalyst", 5], ["rdx", 8], ["weaponcomponent", 3], ["weapontestdata", 5], ["medicalrecords", 3]], ["Uma Laszlo", "Yi Shen"]],
    ["w", "weapon_accuracy", "Manticore", "Higher Accuracy", 500000, [["chemicalcatalyst", 5], ["electromagnet", 5], ["metalcoil", 5], ["chemicalpatents", 3], ["combatantperformance", 5]], ["Yarden Bond", "Terra Velasquez", "Baltanos"]],
    ["w", "weapon_range", "Manticore", "Greater Range", 500000, [["motor", 3], ["electromagnet", 5], ["electricalfuse", 3], ["chemicalformulae", 5], ["mineralsurvey", 8]], ["Domino Green", "Wellington Beck", "Rosa Dayette"]],
    ["w", "weapon_headshotdamage", "Manticore", "Headshot Damage", 500000, [["ionbattery", 5], ["electromagnet", 5], ["microsupercapacitor", 8], ["chemicalexperimentdata", 5], ["bloodtestresults", 3]], ["Uma Laszlo", "Yi Shen"]],
    ["w", "weapon_accuracy", "Takada", "Higher Accuracy", 500000, [["metalcoil", 5], ["opticallens", 3], ["electricalwiring", 8], ["radioactivitydata", 3], ["combatantperformance", 5]], ["Yarden Bond", "Terra Velasquez", "Baltanos"]],
    ["w", "weapon_range", "Takada", "Greater Range", 500000, [["microtransformer", 8], ["opticallens", 3], ["circuitboard", 3], ["stellaractivitylogs", 5], ["riskassessments", 8]], ["Domino Green", "Wellington Beck", "Rosa Dayette"]],
    ["w", "weapon_headshotdamage", "Takada", "Headshot Damage", 750000, [["ionbattery", 5], ["opticallens", 3], ["scrambler", 5], ["spectralanalysisdata", 5], ["biometricdata", 3]], ["Uma Laszlo", "Yi Shen"]],
];
// on-foot engineers: name, system, base, planet, [x, y, z], how to hear of them, to be invited, to unlock
const OF_ENGINEERS = [
    ["Baltanos", "DERISO", "The Divine Apparatus", "3 A", [-9520.3125, -909.5, 19808.75], "Common knowledge", "Reach Friendly reputation with the Colonia Council.", "Provide 10 Faction Associates data."],
    ["Domino Green", "Orishis", "The Jackrabbit", "4", [-31.0, 93.96875, -3.5625], "Common knowledge.", "Travel at least 100 light years in shuttles.", "Provide 5 doses of Push."],
    ["Eleanor Bresa", "Desy", "Bresa Modifications", "7 A", [-9534.21875, -912.21875, 19792.375], "Common knowledge.", "Visit 5 settlements in the Colonia system.", "Provide 10 Digital Designs."],
    ["Hero Ferrari", "Siris", "Nevermore Terrace", "5 C", [131.0625, -73.59375, -11.25], "Common knowledge.", "Complete 10 surface conflict zones.", "Provide 15 Settlement Defence Plans."],
    ["Jude Navarro", "Aurai", "Marshall's Drift", "1 A", [0.9375, -47.8125, 46.28125], "Common knowledge.", "Complete 10 Restore or Reactivation missions.", "Provide 5 units of Genetic Repair Meds."],
    ["Kit Fowler", "Capoya", "The Last Call", "2", [-60.65625, 82.4375, -45.0625], "From Domino Green", "Sell 10 Opinion polls to bartenders.", "Provide 5 units of Surveillance equipment."],
    ["Oden Geiger", "Candiaei", "Ankh's Promise", "9 C", [-113.5, -4.9375, 66.84375], "From Terra Velasquez", "Sell a total of 20 Biological sample, Employee genetic data and Genetic research to bartenders.", ""],
    ["Rosa Dayette", "Kojeara", "Rosa's Shop", "4 B", [-9513.09375, -908.84375, 19814.28125], "Common knowledge.", "Sell a total of 10 Culinary Recipes or Cocktail Recipes to stations in Colonia.", "Provide 10 units of Manufacturing Instructions data."],
    ["Terra Velasquez", "Shou Xing", "Rascal's Choice", "1", [-16.28125, -44.53125, 94.375], "From Jude Navarro", "Complete 6 Covert theft and Covert heist missions.", "Provide 15 Financial projections."],
    ["Uma Laszlo", "Xuane", "Laszlo's Resolve", "A 3", [93.875, -9.25, -32.53125], "From Wellington Beck", "Reach Unfriendly reputation or lower with Sirius Corporation.", ""],
    ["Wellington Beck", "Jolapa", "Beck Facility", "6 A", [100.1875, -41.34375, -78.0], "From Hero Ferrari", "Sell a total of 25 Multimedia Entertainment, Classic Entertainment and Cat media to bartenders.", "Provide 5 units of Insight Entertainment suites."],
    ["Yarden Bond", "Bayan", "Salamander Bank", "7 B", [-19.96875, 117.625, -90.46875], "From Kit Fowler", "Sell 8 Smear campaign plans to bartenders.", ""],
    ["Yi Shen", "Einheriar", "Eidolon Hold", "1 A", [-9557.8125, -880.1875, 19801.5625], "From Baltanos, Eleanor Bresa and Rosa Dayette", "Complete referral tasks for Baltanos, Eleanor Bresa and Rosa Dayette.", ""],
];

show();
