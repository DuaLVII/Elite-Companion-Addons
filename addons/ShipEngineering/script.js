// Ship Engineering: the engineering on every module of the ship you're flying.
//
// The game's "Loadout" event (written when you load the game, launch, or change ships or modules) lists each module's
// engineering: engineer, blueprint, grade, quality (0–1), experimental effect and every changed stat. "Done" means the
// top grade of that blueprint at 100% quality. For what's left, it says which engineers can do the next grade, the
// ones you've unlocked first (from the game's "EngineerProgress").


let loadout = null;
let filter = store.get("filter", "all");   // all · todo · plain
let open = {};                              // module slot → showing its stats
let progress = store.shared.get("progress", {});   // engineer → { status, rank } (shared by every copy)

on("EngineerProgress", e => {
    const list = e.Engineers || (e.Engineer ? [e] : []);
    for (const x of list)
        if (x.Engineer) progress[x.Engineer] = { status: x.Progress || (progress[x.Engineer] || {}).status || "", rank: x.Rank || 0 };
    store.shared.set("progress", progress);
    show();
});

on("Loadout", e => {
    loadout = e;
    store.set("loadout", e);
    show();
});

on("click:filter", v => { filter = v; store.set("filter", filter); show(); });
on("click:open", slot => { open[slot] = !open[slot]; show(); });

function pct(q) { return Math.round((q || 0) * 100); }

function num(v) {
    if (typeof v !== "number") return String(v);
    const a = Math.abs(v);
    return a >= 100 ? fmt(v, 0) : a >= 10 ? fmt(v, 1) : fmt(v, 2);
}

// What a roll changed: "Optimal mass  1,050 → 1,733  (+65%)", good changes marked ▲, bad ones ▼
function changes(eng) {
    return (eng.Modifiers || []).filter(m => typeof m.Value === "number").map(m => {
        const before = m.OriginalValue, after = m.Value;
        const diff = before ? (after - before) / Math.abs(before) * 100 : 0;
        const better = m.LessIsGood ? after < before : after > before;
        return {
            label: m.Label_Localised || String(m.Label || "").replace(/([a-z])([A-Z])/g, "$1 $2"),
            text: `${num(before)} → ${num(after)}`,
            diff: diff ? (diff > 0 ? "+" : "") + Math.round(diff) + "%" : "",
            good: better,
        };
    });
}

// Who can do grade g of this kind of module: unlocked first, then by name
function whoCan(type, g) {
    const able = Engineers.all.filter(x => (x.mods[type] || 0) >= g);
    const unlocked = able.filter(x => (progress[x.name] || {}).status === "Unlocked");
    const names = (unlocked.length ? unlocked : able).map(x => x.name);
    if (!names.length) return "";
    return (unlocked.length ? "✓ " : "") + names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
}

function show() {
    if (!loadout) loadout = store.get("loadout", null);
    if (!loadout) {
        set("rows", []); set("summary", ""); set("filters", []);
        set("empty", tr("js.waiting", "Waiting for your loadout (it's written when you load the game, launch, or change ships or modules)."));
        return;
    }
    const ship = (loadout.ShipName ? loadout.ShipName + " · " : "") + (loadout.Ship_Localised || loadout.Ship || "");
    set("ship", ship.toUpperCase());

    const all = [];
    for (const mod of loadout.Modules || []) {
        if (!mod.Slot || ShipModules.cosmetic(mod.Slot)) continue;
        const type = ShipModules.type(mod.Slot, mod.Item);
        const eng = mod.Engineering;
        if (!eng && !type) continue;                         // can't be engineered: not listed
        const row = { slot: mod.Slot, name: ShipModules.name(mod.Slot, mod.Item), section: ShipModules.section(mod.Slot), open: !!open[mod.Slot] };
        if (eng) {
            const max = ShipModules.maxGrade(eng.BlueprintName, type);
            const q = pct(eng.Quality);
            row.state = eng.Level >= max && q >= 100 ? "done" : "todo";
            row.bp = `G${eng.Level} ${eng.BlueprintName_Localised || ShipModules.blueprint(eng.BlueprintName)}`;
            row.quality = q;
            row.qualityText = `${q}%`;
            row.exp = eng.ExperimentalEffect_Localised || (eng.ExperimentalEffect ? ShipModules.blueprint(eng.ExperimentalEffect) : "");
            row.engineer = eng.Engineer || "";
            row.changes = changes(eng);
            row.next = "";
            if (row.state === "todo") {
                const next = eng.Level < max ? eng.Level + 1 : eng.Level;
                const who = whoCan(type, next);
                row.next = eng.Level < max
                    ? tr("js.next_grade", "Next: G{0}{1}", next, who ? " · " + who : "")
                    : tr("js.next_quality", "G{0} at {1}%: roll again for 100%{2}", eng.Level, q, who ? " · " + who : "");
            }
        } else {
            row.state = "plain";
            row.bp = tr("js.not_engineered", "Not engineered");
            row.quality = 0; row.qualityText = ""; row.exp = ""; row.engineer = "";
            const who = whoCan(type, 5) || whoCan(type, 1);
            row.next = who ? tr("js.who", "Who: {0}", who) : "";
            row.changes = [];
        }
        all.push(row);
    }

    const done = all.filter(r => r.state === "done").length, todo = all.filter(r => r.state === "todo").length, plain = all.filter(r => r.state === "plain").length;
    set("summary", tr("js.summary", "{0} done · {1} to finish · {2} not engineered", done, todo, plain));
    set("filters", [
        { id: "all", name: tr("js.f_all", "All · {0}", all.length), on: filter === "all" },
        { id: "todo", name: tr("js.f_todo", "To finish · {0}", todo), on: filter === "todo" },
        { id: "plain", name: tr("js.f_plain", "Not engineered · {0}", plain), on: filter === "plain" },
    ]);

    const order = { CORE: 0, HARDPOINTS: 1, UTILITY: 2, OPTIONAL: 3 };
    const rows = all.filter(r => filter === "all" || r.state === filter)
        .sort((a, b) => order[a.section] - order[b.section] || a.slot.localeCompare(b.slot));
    set("rows", rows);
    set("empty", rows.length ? "" : filter === "todo" ? tr("js.all_done", "Everything engineered is finished. ✓") : tr("js.nothing", "Nothing here."));
}

on("language", show);

// ================================================================== data: shipmodules (kept in this file so the addon
// stands alone; the same in every engineering addon)
// The names are the same as the Ship Loadout addon's.
const ShipModules = (() => {
    const GRADES = "EDCBA";                 // class 1…5 → E…A

    const INTERNAL = {
        powerplant: "Power Plant", engine: "Thrusters", hyperdrive: "Frame Shift Drive",
        hyperdrive_overcharge: "Frame Shift Drive (SCO)", lifesupport: "Life Support", powerdistributor: "Power Distributor",
        sensors: "Sensors", fueltank: "Fuel Tank", fuelscoop: "Fuel Scoop", cargorack: "Cargo Rack",
        shieldgenerator: "Shield Generator", shieldcellbank: "Shield Cell Bank", hullreinforcement: "Hull Reinforcement",
        modulereinforcement: "Module Reinforcement", detailedsurfacescanner: "Detailed Surface Scanner",
        dockingcomputer_advanced: "Advanced Docking Computer", dockingcomputer_standard: "Docking Computer",
        supercruiseassist: "Supercruise Assist", repairer: "AFM Unit", refinery: "Refinery",
        dronecontrol_collection: "Collector Limpet Controller", dronecontrol_prospector: "Prospector Limpet Controller",
        dronecontrol_fueltransfer: "Fuel Transfer Limpet Controller", dronecontrol_repair: "Repair Limpet Controller",
        dronecontrol_resourcesiphon: "Hatch Breaker Limpet Controller", multidronecontrol_mining: "Mining Multi Limpet Controller",
        buggybay: "Planetary Vehicle Hangar", fighterbay: "Fighter Hangar", passengercabin: "Passenger Cabin",
        fsdinterdictor: "FSD Interdictor", guardianfsdbooster: "Guardian FSD Booster",
        guardianshieldreinforcement: "Guardian Shield Reinforcement", guardianhullreinforcement: "Guardian Hull Reinforcement",
        guardianmodulereinforcement: "Guardian Module Reinforcement", guardianpowerplant: "Guardian Power Plant",
        guardianpowerdistributor: "Guardian Power Distributor", expmodulestabiliser: "Experimental Weapon Stabiliser",
        stellarbodydiscoveryscanner: "Discovery Scanner",
    };

    const WEAPONS = {
        pulselaser: "Pulse Laser", pulselaserburst: "Burst Laser", beamlaser: "Beam Laser", multicannon: "Multi-cannon",
        cannon: "Cannon", slugshot: "Fragment Cannon", plasmaaccelerator: "Plasma Accelerator", railgun: "Rail Gun",
        dumbfiremissilerack: "Missile Rack", basicmissilerack: "Seeker Missile Rack", minelauncher: "Mine Launcher",
        advancedtorppylon: "Torpedo Pylon", mininglaser: "Mining Laser", mining_abrblstr: "Abrasion Blaster",
        mining_seismchrgwarhd: "Seismic Charge Launcher", mining_subsurfdispmisle: "Sub-surface Displacement Missile",
        shieldbooster: "Shield Booster", chafflauncher: "Chaff Launcher", heatsinklauncher: "Heat Sink Launcher",
        plasmapointdefence: "Point Defence", electroniccountermeasure: "ECM", crimescanner: "Kill Warrant Scanner",
        cloudscanner: "Frame Shift Wake Scanner", cargoscanner: "Manifest Scanner", mrascanner: "Pulse Wave Analyser",
        shieldbooster_size0: "Shield Booster", causticsinklauncher: "Caustic Sink Launcher",
        guardian_gausscannon: "Guardian Gauss Cannon", guardian_plasmalauncher: "Guardian Plasma Charger",
        guardian_shardcannon: "Guardian Shard Cannon", flakmortar: "Remote Release Flak Launcher",
        flechettelauncher: "Remote Release Flechette Launcher", atdumbfiremissile: "AX Missile Rack",
        atmulticannon: "AX Multi-cannon",
    };

    const ARMOUR = { grade1: "Lightweight Alloy", grade2: "Reinforced Alloy", grade3: "Military Grade Composite",
                     mirrored: "Mirrored Surface Composite", reactive: "Reactive Surface Composite" };

    const CORE_SLOTS = ["Armour", "PowerPlant", "MainEngines", "FrameShiftDrive", "LifeSupport", "PowerDistributor", "Radar", "FuelTank"];
    const COSMETIC = /Decal|PaintJob|ShipName|ShipID|Bobble|VesselVoice|WeaponColour|EngineColour|ShipKit|StringLights|CargoHatch|PlanetaryApproachSuite|ShipCockpit|DataLinkScanner|CodexScanner|DiscoveryScanner/i;

    function titleCase(s) {
        return s.split(/[_ ]+/).filter(x => x).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }

    // "Weapon_Overcharged" → "Overcharged", "FSD_LongRange" → "Long Range"
    function blueprint(name) {
        const part = String(name || "").replace(/^[^_]*_/, "");
        return part.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
    }

    function moduleName(slot, item) {
        item = String(item || "").toLowerCase();

        if (slot === "Armour") {
            const kind = item.replace(/^.*_armour_/, "");
            return ARMOUR[kind] || titleCase(kind) + " Armour";
        }

        let m = item.match(/^hpt_(.+?)_(fixed|gimbal|turret)_(tiny|small|medium|large|huge)/);
        if (m) {
            const size = { tiny: "0", small: "1", medium: "2", large: "3", huge: "4" }[m[3]];
            const mount = m[2].charAt(0).toUpperCase() + m[2].slice(1);
            return `${size}${mount.charAt(0)} ${WEAPONS[m[1]] || titleCase(m[1])} (${mount})`;
        }

        m = item.match(/^hpt_(.+?)_size(\d+)_class(\d+)/);                       // utilities: shield boosters, scanners…
        if (m) return `${m[2]}${GRADES[m[3] - 1] || "?"} ${WEAPONS[m[1]] || titleCase(m[1])}`;

        m = item.match(/^int_(.+?)_size(\d+)_class(\d+)/);                       // core and optional internals
        if (m) return `${m[2]}${GRADES[m[3] - 1] || "?"} ${INTERNAL[m[1]] || titleCase(m[1])}`;

        return titleCase(item.replace(/^(int|hpt)_/, ""));
    }

    function section(slot) {
        if (CORE_SLOTS.includes(slot)) return "CORE";
        if (/^TinyHardpoint/i.test(slot)) return "UTILITY";
        if (/Hardpoint/i.test(slot)) return "HARDPOINTS";
        return "OPTIONAL";
    }

    // journal item → engineering type
    const TYPES = {
        hyperdrive: "FrameShiftDrive", hyperdrive_overcharge: "FrameShiftDrive", engine: "Thrusters", powerplant: "PowerPlant",
        powerdistributor: "PowerDistributor", sensors: "Sensor", lifesupport: "LifeSupport", shieldgenerator: "ShieldGenerator",
        fuelscoop: "FuelScoop", hullreinforcement: "HullReinforcementPackage", modulereinforcement: "ModuleReinforcementPackage",
        shieldcellbank: "ShieldCellBank", cargorack: "CargoRack", refinery: "Refinery", detailedsurfacescanner: "SurfaceScanner",
        fsdinterdictor: "FrameShiftDriveInterdictor", repairer: "AutoFieldMaintenanceUnit",
        dronecontrol_collection: "CollectorLimpetController", dronecontrol_prospector: "ProspectorLimpetController",
        dronecontrol_fueltransfer: "FuelTransferLimpetController", dronecontrol_resourcesiphon: "HatchBreakerLimpetController",
        pulselaser: "PulseLaser", pulselaserburst: "BurstLaser", beamlaser: "BeamLaser", multicannon: "Multi_Cannon", cannon: "Cannon",
        slugshot: "FragmentCannon", plasmaaccelerator: "PlasmaAccelerator", railgun: "RailGun", dumbfiremissilerack: "MissileRack",
        basicmissilerack: "SeekerMissileRack", minelauncher: "MineLauncher", advancedtorppylon: "TorpedoPylon", mininglaser: "MiningLaser",
        mining_abrblstr: "AbrasionBlaster", shieldbooster: "ShieldBooster", chafflauncher: "ChaffLauncher", heatsinklauncher: "HeatSinkLauncher",
        plasmapointdefence: "PointDefence", electroniccountermeasure: "ElectronicCountermeasure", crimescanner: "KillWarrantScanner",
        cloudscanner: "WakeScanner", cargoscanner: "CargoScanner", causticsinklauncher: "CausticSinkLauncher", atdumbfiremissile: "AXMissileRack",
    };
    // the few blueprints whose top grade isn't 5 ("blueprint|type" → grade), from EDDiscovery's recipes
    const MAX = {"weapon_longrange|AXMissileRack": 1, "weapon_overcharged|AXMissileRack": 1, "weapon_rapidfire|AXMissileRack": 1, "weapon_longrange|MiningLaser": 1, "weapon_highcapacity|AXMissileRack": 1, "weapon_longrange|AbrasionBlaster": 1, "guardianmodule_sturdy|AXMissileRack": 1, "misc_chaffcapacity|ChaffLauncher": 1, "misc_heatsinkcapacity|CausticSinkLauncher": 1, "misc_heatsinkcapacity|HeatSinkLauncher": 1, "misc_pointdefensecapacity|PointDefence": 1, "shieldcellbank_rapid|ShieldCellBank": 4, "shieldcellbank_specialised|ShieldCellBank": 4};

    // blueprint and experimental names (the journal only gives "FSD_LongRange"): from EDDiscovery's recipes
    const NAMES = {"abrasionblaster_farreaching": "Far-reaching", "weapon_longrange": "Long-Range Weapon", "weapon_overcharged": "Overcharged Weapon", "weapon_rapidfire": "Rapid Fire Modification", "weapon_highcapacity": "High Capacity Magazine", "guardianmodule_sturdy": "Anti-Guardian Zone Resistance", "misc_shielded": "Shielded", "armour_advanced": "Lightweight Armour", "armour_explosive": "Blast Resistant Armour", "armour_heavyduty": "Heavy Duty Armour", "armour_kinetic": "Kinetic Resistant Armour", "armour_thermic": "Thermal Resistant Armour", "weapon_efficient": "Efficient Weapon", "weapon_lightweight": "Light Weight Mount", "weapon_shortrange": "Short-Range Blaster", "weapon_sturdy": "Sturdy Mount", "beamlaser_thermalplasmaconversion": "Plasma conversion", "beamlaser_overloaded": "Overloaded", "weapon_focused": "Focused Weapon", "burstlaser_regenerative": "Regenerative", "burstlaser_thermalplasmaconversion": "Plasma conversion", "cannon_forceimpact": "Force impact", "sensor_fastscan": "Fast Scanner", "misc_lightweight": "Lightweight", "sensor_longrange": "Long-Range Scanner", "misc_reinforced": "Reinforced", "sensor_wideangle": "Wide Angle Scanner", "misc_chaffcapacity": "Chaff Ammo Capacity", "misc_heatsinkcapacity": "Ammo capacity", "detailedsurfacescanner_longrange": "Long range detailed", "enzymemissilerack_highyield": "High-yield", "engine_dirty": "Dirty Drive Tuning", "engine_reinforced": "Drive Strengthening", "engine_tuned": "Clean Drive Tuning", "weapon_doubleshot": "Double Shot", "fragmentcannonsmall_doublescreaming": "Double screaming", "fragmentcannonlarge_doublescreaming": "Double screaming", "fsd_fastboot": "Faster FSD Boot Sequence", "fsd_longrange": "Increased FSD Range", "fsd_shielded": "Shielded FSD", "fsdinterdictor_expanded": "Expanded FSD Interdictor Capture Arc", "fsdinterdictor_longrange": "Longer Range FSD Interdictor", "fuelscoop_efficiency": "Scoop rate enhanced", "hullreinforcement_advanced": "Lightweight Hull Reinforcement", "hullreinforcement_explosive": "Blast Resistant Hull Reinforcement", "hullreinforcement_heavyduty": "Heavy Duty Hull Reinforcement", "hullreinforcement_kinetic": "Kinetic Resistant Hull Reinforcement", "hullreinforcement_thermic": "Thermal Resistant Hull Reinforcement", "seekermissilerack_drag": "Drag", "seekermissilerack_lightweightthermal": "Lightweight thermal", "seekermissilerackmedium_lockdown": "Lockdown", "seekermissileracklarge_lockdown": "Lockdown", "seekermissileracklarge_exposingmissiles": "Exposing", "mininglaser_longrange": "Long range", "multicannon_rapid": "Rapid phase", "modulereinforcement_heavyduty": "Heavy duty", "misc_pointdefensecapacity": "Point Defence Ammo Capacity", "powerdistributor_highcapacity": "High Charge Capacity Power Distributor", "powerdistributor_highfrequency": "Charge Enhanced Power Distributor", "powerdistributor_priorityengines": "Engine Focused Power Distributor", "powerdistributor_prioritysystems": "System Focused Power Distributor", "powerdistributor_priorityweapons": "Weapon Focused Power Distributor", "powerdistributor_shielded": "Shielded Power Distributor", "powerdistributor_balanced": "Balanced", "powerdistributors3c2_supportfocused": "Support focused", "powerdistributors3c5_supportfocused": "Support focused", "powerdistributors4c2_supportfocused": "Support focused", "powerdistributors4c5_supportfocused": "Support focused", "powerdistributors6c5_supportfocused": "Support focused", "powerplant_armoured": "Armoured Power Plant", "powerplant_boosted": "Overcharged Power Plant", "powerplant_stealth": "Low Emissions Power Plant", "pulselaser_thermalplasmaconversion": "Plasma conversion", "railgun_longshot": "Enduring feedback", "sensor_lightweight": "Light Weight Scanner", "shieldbooster_explosive": "Blast Resistant Shield Booster", "shieldbooster_heavyduty": "Heavy Duty Shield Booster", "shieldbooster_kinetic": "Kinetic Resistant Shield Booster", "shieldbooster_resistive": "Resistance Augmented Shield Booster", "shieldbooster_thermic": "Thermal Resistant Shield Booster", "shieldcellbank_rapid": "Rapid Charge ShieldCellBank Bank", "shieldcellbank_specialised": "Specialised ShieldCellBank Bank", "shieldgenerator_kinetic": "Kinetic Resistant Shields", "shieldgenerator_optimised": "Enhanced, Low Power Shields", "shieldgenerator_reinforced": "Reinforced Shields", "shieldgenerator_thermic": "Thermal Resistant Shields", "sensor_expanded": "Expanded Probe Scanning Radius", "cargoracks5c1_extended": "Extended", "cargoracks6c1_extended": "Extended", "cargorack_increasedcapacity": "Increase Capcacity", "guardianweapon_sturdy": "Guardian Upgrade Obsolete"};

    function niceName(bp) {
        const k = String(bp || "").toLowerCase();
        return NAMES[k] ? tr("bp." + k, NAMES[k]) : blueprint(bp);
    }

    function type(slot, item) {
        item = String(item || "").toLowerCase();
        if (slot === "Armour" || /_armour_/.test(item)) return "Armour";
        let m = item.match(/^hpt_(.+?)_(fixed|gimbal|turret)_/) || item.match(/^hpt_(.+?)_size\d/) || item.match(/^int_(.+?)_size\d/);
        if (!m) return "";
        if (m[1] === "shieldgenerator" && /_strong/.test(item)) return "PrismaticShieldGenerator";
        return TYPES[m[1]] || "";
    }

    return {
        name: moduleName, section, blueprint: niceName, type,
        maxGrade(bp, t) { const k = String(bp || "").toLowerCase() + "|" + t; return MAX[k] || 5; },
        cosmetic(slot) { return COSMETIC.test(String(slot || "")); },
    };
})();

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

show();
