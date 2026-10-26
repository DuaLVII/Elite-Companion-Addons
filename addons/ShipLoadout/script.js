// Ship Loadout: example addon.
//
// The game writes a "Loadout" event whenever you launch, swap ships or change modules. It lists every module by its
// internal name (e.g. "int_hyperdrive_size5_class5"), so most of this script turns those into readable names
// ("5A Frame Shift Drive") and engineering into "G5 Increased Range".

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

let rebuy = 0;
let warned = false;

on("Loadout", (e, replay) => {
    set("ident", e.ShipIdent ? "[" + e.ShipIdent + "]" : "");
    const value = (e.HullValue || 0) + (e.ModulesValue || 0);
    set("value", value > 0 ? short(value, "cr") : "—");
    rebuy = e.Rebuy || 0;
    set("rebuy", rebuy > 0 ? short(rebuy, "cr") : "—");
    warned = false;
    lastNote = null;
    checkRebuy(replay);

    const groups = { HARDPOINTS: [], UTILITY: [], CORE: [], OPTIONAL: [] };
    for (const mod of e.Modules || []) {
        if (!mod.Slot || COSMETIC.test(mod.Slot)) continue;
        const eng = mod.Engineering;
        groups[section(mod.Slot)].push({
            name: moduleName(mod.Slot, mod.Item),
            eng: eng ? `G${eng.Level} ${blueprint(eng.BlueprintName)}` +
                       (eng.ExperimentalEffect_Localised ? " · " + eng.ExperimentalEffect_Localised : "") : "",
            off: mod.On === false,
            damaged: mod.Health !== undefined && mod.Health < 0.8,
            slot: mod.Slot,
        });
    }
    // Optional slots in slot order (Slot01_Size6, Slot02_Size5…)
    groups.OPTIONAL.sort((a, b) => a.slot.localeCompare(b.slot));

    const sections = Object.keys(groups)
        .filter(k => groups[k].length > 0)
        .map(k => ({ title: `${tr("js.section_" + k.toLowerCase(), k)} · ${groups[k].length}`, modules: groups[k] }));
    set("sections", sections);
    set("waiting", sections.length ? "" : tr("js.no_modules_listed_in_the_last", "No modules listed in the last loadout."));
});

// Can you afford to lose this ship? Checked every second against your credits.
let lastNote = null;
function checkRebuy(replay) {
    const cant = rebuy > 0 && game.Credits < rebuy;
    const note = cant ? tr("js.you_can_t_cover_the_rebuy", "⚠ You can't cover the rebuy: {0} short", short(rebuy - game.Credits, "cr")) : "";
    if (note !== lastNote) {                 // only update the view when something changed
        set("cantAffordRebuy", cant);
        set("rebuyNote", note);
        lastNote = note;
    }
    if (cant && !warned && !replay) {
        notify(tr("js.insufficient_rebuy_need_0_you_have", "⚠ INSUFFICIENT REBUY · need {0}, you have {1}", short(rebuy, "cr"), short(game.Credits, "cr")), "danger", 12);
        warned = true;
    }
    if (!cant) warned = false;
}

on("tick", () => checkRebuy(false));

set("waiting", tr("js.waiting_for_your_loadout_it_s", "Waiting for your loadout (it's written when you load the game, launch, or change ships or modules)."));
