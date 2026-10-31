// Engineers: every ship engineer, your progress with each, where they are and what they do.
//
// The game writes "EngineerProgress" at login (every engineer you know of, with Known / Invited / Acquainted /
// Unlocked / Barred and your rank) and again whenever that changes. Where they are, what they do and how to unlock
// them comes with the addon (_shared/engineers.js). Distances are from where you are (your last jump).


let progress = store.get("progress", {});     // engineer → { status, rank, rankProgress }
let here = store.get("here", null);           // { system, pos: [x, y, z] }
let filter = store.get("filter", "all");      // all · unlocked · locked
let open = {};

on("EngineerProgress", e => {
    const list = e.Engineers || (e.Engineer ? [e] : []);
    for (const x of list) {
        if (!x.Engineer) continue;
        const was = progress[x.Engineer] || {};
        progress[x.Engineer] = { status: x.Progress || was.status || "", rank: x.Rank !== undefined ? x.Rank : (was.rank || 0), rankProgress: x.RankProgress !== undefined ? x.RankProgress : (was.rankProgress || 0) };
    }
    store.set("progress", progress);
    show();
});

function moved(e) {
    if (Array.isArray(e.StarPos) && e.StarPos.length === 3) {
        here = { system: e.StarSystem || "", pos: e.StarPos };
        store.set("here", here);
        show();
    }
}
on("FSDJump", moved);
on("Location", moved);
on("CarrierJump", moved);

on("click:filter", v => { filter = v; store.set("filter", filter); show(); });
on("click:open", name => { open[name] = !open[name]; show(); });
on("click:copy", system => { copy(system); notify(tr("js.copied", "{0} copied: paste it in the galaxy map", system), "info", 4); });
on("change:mod", () => { store.set("mod", get("mod")); show(); });

function dist(pos) {
    if (!here || !here.pos) return null;
    const [x, y, z] = here.pos;
    const dx = pos[0] - x, dy = pos[1] - y, dz = pos[2] - z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function statusText(s) {
    return {
        Unlocked: tr("js.s_unlocked", "Unlocked"), Invited: tr("js.s_invited", "Invited"), Acquainted: tr("js.s_acquainted", "Met"),
        Known: tr("js.s_known", "Known"), Barred: tr("js.s_barred", "Barred"),
    }[s] || tr("js.s_none", "Not met");
}

function show() {
    const mod = get("mod") || "";
    // the module picker: anyone, or a kind of module
    set("mods", [{ id: "", name: tr("js.any_module", "Any module") }].concat(
        Engineers.modIds.map(id => ({ id, name: Engineers.modName(id) })).sort((a, b) => a.name.localeCompare(b.name))));

    let rows = Engineers.all.map(x => {
        const p = progress[x.name] || {};
        const d = dist(x.pos);
        const unlocked = p.status === "Unlocked";
        const mods = Object.entries(x.mods);
        const forMod = mod ? (x.mods[mod] || 0) : 0;
        return {
            name: x.name, status: p.status || "", statusText: statusText(p.status), unlocked,
            rank: unlocked && p.rank ? "★".repeat(p.rank) + "☆".repeat(Math.max(0, 5 - p.rank)) : "",
            where: `${x.system} · ${x.planet} · ${x.base}` + (x.permit ? " · " + tr("js.permit", "permit needed") : ""),
            system: x.system,
            dist: d, distText: d === null ? "" : d < 10 ? `${d.toFixed(1)} ly` : `${fmt(Math.round(d))} ly`,
            does: mod ? (forMod ? `${Engineers.modName(mod)}: G${forMod}` : "")
                      : mods.slice(0, 6).map(([id, g]) => `${Engineers.modName(id)} ${g}`).join(" · ") + (mods.length > 6 ? ` +${mods.length - 6}` : ""),
            grade: forMod,
            all: mods.map(([id, g]) => `${Engineers.modName(id)} G${g}`).join(" · "),
            open: !!open[x.name],
            discover: x.discover, meet: x.meet, unlock: x.unlock, rep: x.rep,
            needs: unlocked ? "" : p.status === "Invited" || p.status === "Acquainted" ? tr("js.to_unlock", "To unlock: {0}", x.unlock)
                 : p.status === "Known" ? tr("js.to_meet", "To be invited: {0}", x.meet) : tr("js.to_find", "To hear of them: {0}", x.discover),
        };
    });
    if (mod) rows = rows.filter(r => r.grade > 0);
    const unlockedCount = rows.filter(r => r.unlocked).length;
    if (filter === "unlocked") rows = rows.filter(r => r.unlocked);
    if (filter === "locked") rows = rows.filter(r => !r.unlocked);
    // best grade for the module first, then unlocked, then nearest
    rows.sort((a, b) => (b.grade - a.grade) || (b.unlocked - a.unlocked) || ((a.dist === null ? 1e9 : a.dist) - (b.dist === null ? 1e9 : b.dist)) || a.name.localeCompare(b.name));

    set("filters", [
        { id: "all", name: tr("js.f_all", "All"), on: filter === "all" },
        { id: "unlocked", name: tr("js.f_unlocked", "Unlocked · {0}", unlockedCount), on: filter === "unlocked" },
        { id: "locked", name: tr("js.f_locked", "Not yet"), on: filter === "locked" },
    ]);
    set("rows", rows);
    const total = Engineers.all.filter(x => (progress[x.name] || {}).status === "Unlocked").length;
    set("summary", tr("js.summary", "{0} of {1} unlocked", total, Engineers.all.length) + (here ? " · " + tr("js.from", "distances from {0}", here.system) : ""));
    set("empty", rows.length ? "" : tr("js.nothing", "No engineers here."));
}

on("language", show);

// ================================================================== data: engineers (kept in this file so the addon
// stands alone; the same in every engineering addon)
// From EDDiscovery's EliteDangerousCore (Apache 2.0): locations, how to find, meet and unlock each, and their blueprints.
const Engineers = (() => {
    const MODS = {
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
    const ALL = [
        {
                "name": "Bill Turner",
                "system": "Alioth",
                "base": "Turner Metallics Inc",
                "planet": "4 A",
                "pos": [
                        -33.65625,
                        72.46875,
                        -20.65625
                ],
                "discover": "Common knowledge",
                "meet": "Gain Friendly status with Alliance. You will also need Allied status with Alioth Independents to get a permit to access the Alioth starsystem.",
                "unlock": "Provide 50 units of Bromellite.",
                "rep": "Craft modules for a major increase. Sell commodities to Turner Metallics Inc.",
                "permit": true,
                "mods": {
                        "CargoRack": 5,
                        "PlasmaAccelerator": 5,
                        "Sensor": 5,
                        "SurfaceScanner": 5,
                        "AutoFieldMaintenanceUnit": 3,
                        "WakeScanner": 3,
                        "FuelScoop": 3,
                        "KillWarrantScanner": 3,
                        "LifeSupport": 3,
                        "CargoScanner": 3,
                        "Refinery": 3
                }
        },
        {
                "name": "Broo Tarquin",
                "system": "Muang",
                "base": "Broo's Legacy",
                "planet": "5 A",
                "pos": [
                        17.03125,
                        -172.78125,
                        -3.46875
                ],
                "discover": "From Hera Tani (grade 3-4).",
                "meet": "Gain combat rank Competent or higher.",
                "unlock": "Provide 50 units of Fujin Tea.",
                "rep": "Craft modules for a major increase. Hand in bounty vouchers to Broo's Legacy.",
                "permit": false,
                "mods": {
                        "BeamLaser": 5,
                        "BurstLaser": 5,
                        "PulseLaser": 5
                }
        },
        {
                "name": "Chloe Sedesi",
                "system": "Shenve",
                "base": "Cinder Dock",
                "planet": "A 6",
                "pos": [
                        351.96875,
                        -373.46875,
                        -711.09375
                ],
                "discover": "From Marco Qwent (grade 3-4).",
                "meet": "Attain a maximum distance from your career start location of at least 5,000 light years.",
                "unlock": "Provide 25 units of Sensor Fragments.",
                "rep": "Craft modules for a major increase. Sell exploration data to Cinder Dock.",
                "permit": false,
                "mods": {
                        "Thrusters": 5,
                        "FrameShiftDrive": 3
                }
        },
        {
                "name": "Colonel Bris Dekker",
                "system": "Sol",
                "base": "Dekker's Yard",
                "planet": "Iapetus",
                "pos": [
                        0.0,
                        0.0,
                        0.0
                ],
                "discover": "From Juri Ishmaak (grade 3-4).",
                "meet": "Friendly with the Federation.",
                "unlock": "Provide 1,000,000 or 10,000,000 credits worth of federal combat bonds.",
                "rep": "Craft modules for a major increase. Hand in bounty vouchers to Dekker's Yard.",
                "permit": true,
                "mods": {
                        "FrameShiftDriveInterdictor": 4,
                        "FrameShiftDrive": 3
                }
        },
        {
                "name": "Didi Vatermann",
                "system": "Leesti",
                "base": "Vatermann LLC",
                "planet": "1 A",
                "pos": [
                        72.75,
                        48.75,
                        68.25
                ],
                "discover": "From Selene Jean (grade 3-4).",
                "meet": "Gain trade rank Merchant or higher.",
                "unlock": "Provide 50 units of Lavian Brandy.",
                "rep": "Craft modules for a major increase.Sell commodities to Vatermann LLC.",
                "permit": false,
                "mods": {
                        "ShieldBooster": 5,
                        "PrismaticShieldGenerator": 3,
                        "ShieldGenerator": 3
                }
        },
        {
                "name": "Elvira Martuuk",
                "system": "Khun",
                "base": "Long Sight Base",
                "planet": "5",
                "pos": [
                        -171.59375,
                        19.96875,
                        -56.96875
                ],
                "discover": "Public knowledge",
                "meet": "Attain a maximum distance from your career start location of at least 300 light years.",
                "unlock": "Provide 3 units of Soontill Relics.",
                "rep": "Craft modules for a major increase. Sell exploration data at Long Sight Base.",
                "permit": false,
                "mods": {
                        "FrameShiftDrive": 5,
                        "PrismaticShieldGenerator": 3,
                        "ShieldGenerator": 3,
                        "Thrusters": 2,
                        "ShieldCellBank": 1
                }
        },
        {
                "name": "Etienne Dorn",
                "system": "Los",
                "base": "Kraken's Retreat",
                "planet": "A 2 B",
                "pos": [
                        -9509.34375,
                        -886.3125,
                        19820.125
                ],
                "discover": "From Liz Ryder (grade 3-4).",
                "meet": "Gain trade rank Dealer or higher.",
                "unlock": "Provide 25 units of Occupied Escape Pods.",
                "rep": "Craft modules for a major increase.",
                "permit": false,
                "mods": {
                        "DiscoveryScanner": 5,
                        "LifeSupport": 5,
                        "PowerDistributor": 5,
                        "PowerPlant": 5,
                        "RailGun": 5,
                        "Sensor": 5,
                        "SurfaceScanner": 5,
                        "WakeScanner": 4,
                        "KillWarrantScanner": 4,
                        "CargoScanner": 4,
                        "PlasmaAccelerator": 4
                }
        },
        {
                "name": "Felicity Farseer",
                "system": "Deciat",
                "base": "Farseer Inc",
                "planet": "6 A",
                "pos": [
                        122.625,
                        -0.8125,
                        -47.28125
                ],
                "discover": "Public data sources.",
                "meet": "Gain exploration rank Scout or higher.",
                "unlock": "Provide 1 unit of Meta Alloys.",
                "rep": "Craft modules for a major increase. Sell exploration data at Farseer Inc.",
                "permit": false,
                "mods": {
                        "FrameShiftDrive": 5,
                        "Sensor": 3,
                        "SurfaceScanner": 3,
                        "Thrusters": 3,
                        "FrameShiftDriveInterdictor": 1,
                        "PowerPlant": 1,
                        "ShieldBooster": 1
                }
        },
        {
                "name": "Hera Tani",
                "system": "Kuwemaki",
                "base": "The Jet's Hole",
                "planet": "A 3 A",
                "pos": [
                        134.65625,
                        -226.90625,
                        -7.8125
                ],
                "discover": "From Liz Ryder (grade 3-4).",
                "meet": "Gain rank Outsider or higher with the Empire.",
                "unlock": "Provide 50 units of Kamitra Cigars.",
                "rep": "Craft modules for a major increase. Sell commodities to The Jet's Hole.",
                "permit": false,
                "mods": {
                        "PowerPlant": 5,
                        "SurfaceScanner": 5,
                        "PowerDistributor": 3,
                        "Sensor": 3
                }
        },
        {
                "name": "Juri Ishmaak",
                "system": "Giryak",
                "base": "Pater's Memorial",
                "planet": "2 A",
                "pos": [
                        14.6875,
                        27.65625,
                        108.65625
                ],
                "discover": "From Felicity Farseer (grade 3-4).",
                "meet": "Earn more than 50 combat bonds.",
                "unlock": "Provide 100,000 or 1,000,000 credits worth of combat bonds.",
                "rep": "Craft modules for a major increase. Hand in bounty vouchers or combat bonds to Pater's Memorial.",
                "permit": false,
                "mods": {
                        "AbrasionBlaster": 5,
                        "EnzymeMissileRack": 5,
                        "LifeSupport": 5,
                        "MineLauncher": 5,
                        "MiningLaser": 5,
                        "SeekerMissileRack": 5,
                        "Sensor": 5,
                        "SurfaceScanner": 5,
                        "WakeScanner": 3,
                        "KillWarrantScanner": 3,
                        "CargoScanner": 3,
                        "MissileRack": 3,
                        "TorpedoPylon": 3
                }
        },
        {
                "name": "Lei Cheung",
                "system": "Laksak",
                "base": "Trader's Rest",
                "planet": "A 1",
                "pos": [
                        -21.53125,
                        -6.3125,
                        116.03125
                ],
                "discover": "From The Dweller (grade 3-4).",
                "meet": "You have traded in over 50 markets.",
                "unlock": "Provide 200 units of Gold.",
                "rep": "Craft modules for a major increase. Sell commodities to Trader's Rest.",
                "permit": false,
                "mods": {
                        "PrismaticShieldGenerator": 5,
                        "Sensor": 5,
                        "ShieldGenerator": 5,
                        "SurfaceScanner": 5,
                        "ShieldBooster": 3
                }
        },
        {
                "name": "Liz Ryder",
                "system": "Eurybia",
                "base": "Demolition Unlimited",
                "planet": "Makalu",
                "pos": [
                        51.40625,
                        -54.40625,
                        -30.5
                ],
                "discover": "Public sources.",
                "meet": "Gain Cordial or Friendly status with Eurybia Blue Mafia.",
                "unlock": "Provide 200 units of Landmines.",
                "rep": "Craft modules for a major increase. Sell commodities to Demolition Unlimited.",
                "permit": false,
                "mods": {
                        "MissileRack": 5,
                        "SeekerMissileRack": 5,
                        "TorpedoPylon": 5,
                        "AbrasionBlaster": 3,
                        "EnzymeMissileRack": 3,
                        "LifeSupport": 3,
                        "MineLauncher": 3,
                        "MiningLaser": 3,
                        "Armour": 1,
                        "HullReinforcementPackage": 1
                }
        },
        {
                "name": "Lori Jameson",
                "system": "Shinrarta Dezhra",
                "base": "Jameson Base",
                "planet": "A 1",
                "pos": [
                        55.71875,
                        17.59375,
                        27.15625
                ],
                "discover": "From Marco Qwent (grade 3-4).",
                "meet": "Gain combat rank Dangerous or higher.",
                "unlock": "Provide 25 units of Kongga Ale.",
                "rep": "Craft modules for a major increase. Sell exploration data to Jameson Base.",
                "permit": true,
                "mods": {
                        "Sensor": 5,
                        "SurfaceScanner": 5,
                        "AutoFieldMaintenanceUnit": 4,
                        "FuelScoop": 4,
                        "LifeSupport": 4,
                        "Refinery": 4,
                        "WakeScanner": 3,
                        "KillWarrantScanner": 3,
                        "CargoScanner": 3,
                        "ShieldCellBank": 3
                }
        },
        {
                "name": "Marco Qwent",
                "system": "Sirius",
                "base": "Qwent Research Base",
                "planet": "Lucifer",
                "pos": [
                        6.25,
                        -1.28125,
                        -5.75
                ],
                "discover": "From Elvira Martuuk (grade 3-4).",
                "meet": "Gain invitation from Sirius Corporation.",
                "unlock": "Provide 25 units of Modular Terminals.",
                "rep": "Craft modules for a major increase. Sell commodities to Qwent Research Base.",
                "permit": true,
                "mods": {
                        "PowerPlant": 4,
                        "PowerDistributor": 3
                }
        },
        {
                "name": "Marsha Hicks",
                "system": "Tir",
                "base": "The Watchtower",
                "planet": "A 2",
                "pos": [
                        -9532.9375,
                        -923.4375,
                        19799.125
                ],
                "discover": "From The Dweller (grade 3-4).",
                "meet": "Gain exploration rank Surveyor or higher.",
                "unlock": "Mine 10 units of Osmium.",
                "rep": "Craft modules for a major increase.",
                "permit": false,
                "mods": {
                        "Cannon": 5,
                        "CollectorLimpetController": 5,
                        "FragmentCannon": 5,
                        "FuelScoop": 5,
                        "Multi_Cannon": 5,
                        "ProspectorLimpetController": 5,
                        "Refinery": 5,
                        "FuelTransferLimpetController": 4,
                        "HatchBreakerLimpetController": 4
                }
        },
        {
                "name": "Mel Brandon",
                "system": "Luchtaine",
                "base": "The Brig",
                "planet": "A 1 C",
                "pos": [
                        -9523.3125,
                        -914.46875,
                        19825.90625
                ],
                "discover": "From Elvira Martuuk (grade 3-4).",
                "meet": "Gain invitation from Colonia Council.",
                "unlock": "Provide 100,000 credits worth of bounty vouchers.",
                "rep": "Craft modules for a major increase.",
                "permit": false,
                "mods": {
                        "BeamLaser": 5,
                        "BurstLaser": 5,
                        "FrameShiftDriveInterdictor": 5,
                        "FrameShiftDrive": 5,
                        "PrismaticShieldGenerator": 5,
                        "PulseLaser": 5,
                        "ShieldBooster": 5,
                        "ShieldGenerator": 5,
                        "Thrusters": 5,
                        "ShieldCellBank": 4
                }
        },
        {
                "name": "Petra Olmanova",
                "system": "Asura",
                "base": "Sanctuary",
                "planet": "1 A",
                "pos": [
                        -9550.28125,
                        -916.65625,
                        19816.1875
                ],
                "discover": "From Tod McQuinn (grade 3-4).",
                "meet": "Gain combat rank Expert or higher.",
                "unlock": "Provide 200 units of Progenitor Cells.",
                "rep": "Craft modules for a major increase.",
                "permit": false,
                "mods": {
                        "AutoFieldMaintenanceUnit": 5,
                        "Armour": 5,
                        "HeatSinkLauncher": 5,
                        "HullReinforcementPackage": 5,
                        "MineLauncher": 5,
                        "ModuleReinforcementPackage": 5,
                        "SeekerMissileRack": 5,
                        "ChaffLauncher": 4,
                        "ElectronicCountermeasure": 4,
                        "LifeSupport": 4,
                        "MissileRack": 4,
                        "PointDefence": 4,
                        "TorpedoPylon": 4
                }
        },
        {
                "name": "Professor Palin",
                "system": "Arque",
                "base": "Abel Laboratory",
                "planet": "4 E",
                "pos": [
                        66.5,
                        38.0625,
                        61.125
                ],
                "discover": "From Marco Qwent (grade 3-4).",
                "meet": "Attain a maximum distance from your career start location of at least 5,000 light years.",
                "unlock": "Provide 25 units of Sensor Fragments.",
                "rep": "Craft modules for a major increase. Sell exploration data to Abel Laboratory.",
                "permit": false,
                "mods": {
                        "Thrusters": 5,
                        "FrameShiftDrive": 3
                }
        },
        {
                "name": "Ram Tah",
                "system": "Meene",
                "base": "Phoenix Base",
                "planet": "AB 5 D",
                "pos": [
                        118.78125,
                        -56.4375,
                        -97.1875
                ],
                "discover": "From Lei Cheung (grade 3-4).",
                "meet": "Gain exploration rank Surveyor or higher.",
                "unlock": "Provide 50 units of Classified Scan Databanks.",
                "rep": "Craft modules for a major increase. Sell exploration data to Phoenix Base.",
                "permit": false,
                "mods": {
                        "CargoRack": 5,
                        "ChaffLauncher": 5,
                        "ElectronicCountermeasure": 5,
                        "HeatSinkLauncher": 5,
                        "PointDefence": 5,
                        "CollectorLimpetController": 4,
                        "FuelTransferLimpetController": 4,
                        "ProspectorLimpetController": 4,
                        "HatchBreakerLimpetController": 3,
                        "AXMissileRack": 1
                }
        },
        {
                "name": "Selene Jean",
                "system": "Kuk",
                "base": "Prospector's Rest",
                "planet": "B 3",
                "pos": [
                        -21.28125,
                        69.09375,
                        -16.3125
                ],
                "discover": "From Tod McQuinn (grade 3-4).",
                "meet": "Mine at least 500 tons of ore.",
                "unlock": "Provide 10 units of Painite.",
                "rep": "Craft modules for a major increase. Sell commodities and exploration data to Prospector's Rest.",
                "permit": false,
                "mods": {
                        "Armour": 5,
                        "HullReinforcementPackage": 5,
                        "ModuleReinforcementPackage": 5
                }
        },
        {
                "name": "The Dweller",
                "system": "Wyrd",
                "base": "Black Hide",
                "planet": "A 2",
                "pos": [
                        -11.625,
                        31.53125,
                        -3.9375
                ],
                "discover": "Common knowledge",
                "meet": "Deal with at least 5 black markets.",
                "unlock": "Pay 500,000 credits.",
                "rep": "Craft modules for a major increase. Sell commodities to Black Hide.",
                "permit": false,
                "mods": {
                        "PowerDistributor": 5,
                        "PulseLaser": 4,
                        "BeamLaser": 3,
                        "BurstLaser": 3
                }
        },
        {
                "name": "The Sarge",
                "system": "Beta-3 Tucani",
                "base": "The Beach",
                "planet": "2 B A",
                "pos": [
                        32.25,
                        -55.1875,
                        23.875
                ],
                "discover": "From Juri Ishmaak (grade 3-4).",
                "meet": "Gain rank Midshipman or higher with the Federal Navy.",
                "unlock": "Provide 50 units of Aberrant Shield Pattern Analysis.",
                "rep": "Craft modules for a major increase. Sell exploration data and hand in bounty vouchers to The Beach.",
                "permit": false,
                "mods": {
                        "Cannon": 5,
                        "CollectorLimpetController": 5,
                        "FuelTransferLimpetController": 5,
                        "HatchBreakerLimpetController": 5,
                        "ProspectorLimpetController": 5,
                        "RailGun": 3
                }
        },
        {
                "name": "Tiana Fortune",
                "system": "Achenar",
                "base": "Fortune's Loss",
                "planet": "4 A",
                "pos": [
                        67.5,
                        -119.46875,
                        24.84375
                ],
                "discover": "From Hera Tani (grade 3-4).",
                "meet": "Friendly with the Empire.",
                "unlock": "Provide 50 units of Decoded Emission Data.",
                "rep": "Craft modules for a major increase. Sell commodities to Fortune's Loss.",
                "permit": true,
                "mods": {
                        "CargoRack": 5,
                        "CollectorLimpetController": 5,
                        "WakeScanner": 5,
                        "FuelTransferLimpetController": 5,
                        "HatchBreakerLimpetController": 5,
                        "KillWarrantScanner": 5,
                        "CargoScanner": 5,
                        "ProspectorLimpetController": 5,
                        "Sensor": 5,
                        "FrameShiftDriveInterdictor": 3,
                        "SurfaceScanner": 3
                }
        },
        {
                "name": "Tod 'The Blaster' McQuinn",
                "system": "Wolf 397",
                "base": "Trophy Camp",
                "planet": "Trus Madi",
                "pos": [
                        40.0,
                        79.21875,
                        -10.40625
                ],
                "discover": "Common knowledge.",
                "meet": "Earn more than 15 bounty vouchers.",
                "unlock": "Provide 100,000 credits worth of bounty vouchers.",
                "rep": "Craft modules for a major increase. Hand in Alliance bounty vouchers to Trophy Camp.",
                "permit": false,
                "mods": {
                        "Multi_Cannon": 5,
                        "RailGun": 5,
                        "Cannon": 3,
                        "FragmentCannon": 3
                }
        },
        {
                "name": "Zacariah Nemo",
                "system": "Yoru",
                "base": "Nemo Cyber Party Base",
                "planet": "4",
                "pos": [
                        97.875,
                        -86.90625,
                        64.125
                ],
                "discover": "From Elvira Martuuk (grade 3-4).",
                "meet": "Gain invitation from Party of Yoru.",
                "unlock": "Provide 25 units of Xihe Companions.",
                "rep": "Craft modules for a major increase. Sell commodities to Nemo Cyber Party Base.",
                "permit": false,
                "mods": {
                        "FragmentCannon": 5,
                        "Multi_Cannon": 3,
                        "PlasmaAccelerator": 2
                }
        }
    ];
    return {
        all: ALL,
        modIds: Object.keys(MODS),
        modName(id) { return tr("eng.m." + id, MODS[id] || id); },
        byName(name) { const n = String(name || "").toLowerCase(); return ALL.find(e => e.name.toLowerCase() === n) || null; },
    };
})();

if (store.get("mod", "")) set("mod", store.get("mod", ""));
show();
