// On Foot.
//
// Live:     Status.json (Oxygen, Health, Temperature, Gravity, SelectedWeapon, and the Flags2 on-foot bits)
// Loadout:  SuitLoadout / SwitchSuitLoadout / CreateSuitLoadout events
// Contents: Backpack.json and ShipLocker.json (the app passes them on as on("Backpack") / on("ShipLocker"))
include("_shared/surface.js");

let st = store.get("onfoot", { loadout: null, backpack: null, locker: null });
const save = () => store.set("onfoot", st);
let status = null;
let warnedMedkits = false;

// Flags2 bits
const F2 = {
    OnFoot: 0, InTaxi: 1, InMulticrew: 2, InStation: 3, OnPlanet: 4, AimDownSight: 5, LowOxygen: 6, LowHealth: 7,
    Cold: 8, Hot: 9, VeryCold: 10, VeryHot: 11, Glide: 12, InHangar: 13, SocialSpace: 14, Exterior: 15, Breathable: 16,
};

const MODS = {
    suit_backpackcapacity: "Extra Backpack Capacity", suit_increasedammoreserves: "Extra Ammo Capacity",
    suit_improvedbatterycapacity: "Improved Battery Capacity", suit_improvedjumpassist: "Improved Jump Assist",
    suit_improvedradar: "Enhanced Tracking", suit_increasedo2capacity: "Increased Air Reserves",
    suit_increasedshieldregen: "Faster Shield Regen", suit_increasedsprintduration: "Increased Sprint Duration",
    suit_nightvision: "Night Vision", suit_quieterfootsteps: "Quieter Footsteps",
    suit_reducedtoolbatteryconsumption: "Reduced Tool Battery Consumption", suit_damageresistance: "Damage Resistance",
    suit_increasedmeleedamage: "Added Melee Damage", suit_improvedarmourrating: "Improved Armour",
    weapon_handling: "Faster Handling", weapon_stability: "Stability", weapon_accuracy: "Greater Range",
    weapon_range: "Greater Range", weapon_reloadspeed: "Reload Speed", weapon_clipsize: "Magazine Size",
    weapon_scope: "Scope", weapon_suppression_unpressurised: "Noise Suppressor", weapon_headshotdamage: "Headshot Damage",
    weapon_backpackreloading: "Stowed Reloading", weapon_silencer: "Noise Suppressor", weapon_audioMasking: "Audio Masking",
};
const modName = m => MODS[m] || Surface.titleCase(String(m).replace(/^(suit|weapon)_/, ""));
const gradeOf = s => { const m = String(s || "").match(/class(\d)/); return m ? `G${m[1]}` : ""; };

function loadout(e) {
    st.loadout = {
        suit: e.SuitName_Localised || Surface.titleCase(String(e.SuitName || "").replace(/_class\d.*/, "")),
        grade: gradeOf(e.SuitName),
        name: e.LoadoutName || "",
        mods: (e.SuitMods || []).map(modName),
        weapons: (e.Modules || []).map(m => ({
            name: m.ModuleName_Localised || Surface.titleCase(m.ModuleName),
            grade: m.Class ? `G${m.Class}` : "",
            mods: (m.WeaponMods || []).map(modName).join(", "),
            slot: m.SlotName || "",
        })),
    };
    save(); show();
}
on("SuitLoadout", loadout);
on("SwitchSuitLoadout", loadout);
on("CreateSuitLoadout", loadout);

const lists = f => ["Items", "Components", "Consumables", "Data"].some(k => Array.isArray(f[k]));
const pack = f => ({
    items: (f.Items || []).map(x => ({ name: x.Name_Localised || Surface.titleCase(x.Name), count: x.Count || 0 })),
    components: (f.Components || []).map(x => ({ name: x.Name_Localised || Surface.titleCase(x.Name), count: x.Count || 0 })),
    consumables: (f.Consumables || []).map(x => ({ name: x.Name_Localised || Surface.titleCase(x.Name), count: x.Count || 0 })),
    data: (f.Data || []).map(x => ({ name: x.Name_Localised || Surface.titleCase(x.Name), count: x.Count || 0 })),
});

on("Backpack", (f, replay) => {
    if (!lists(f)) return;                         // the journal's own "Backpack" line has no lists
    st.backpack = pack(f);
    save(); show();
    const medkits = st.backpack.consumables.find(c => /medkit|healthpack/i.test(c.name));
    const onFoot = status && Surface.flag2(status, F2.OnFoot);
    if (onFoot && !replay && (!medkits || medkits.count === 0)) {
        if (!warnedMedkits) notify(tr("js.out_of_medkits", "⚠ OUT OF MEDKITS"), "warning", 8);
        warnedMedkits = true;
    } else warnedMedkits = false;
});

on("ShipLocker", f => { if (!lists(f)) return; st.locker = pack(f); save(); show(); });

on("Status", s => { status = s; showVitals(); });   // several times a second: only the live part

// ---- view ----

function context(s) {
    if (!s || !Surface.flag2(s, F2.OnFoot)) {
        if (s && Surface.flag2(s, F2.InTaxi)) return tr("js.in_a_taxi_dropship", "In a taxi / dropship");
        return tr("js.not_on_foot", "Not on foot");
    }
    const where = Surface.flag2(s, F2.InHangar) ? tr("js.in_the_hangar", "In the hangar")
        : Surface.flag2(s, F2.SocialSpace) ? "Concourse"
        : Surface.flag2(s, F2.InStation) ? tr("js.in_a_station", "In a station")
        : Surface.flag2(s, F2.Exterior) ? "Outside"
        : Surface.flag2(s, F2.OnPlanet) ? tr("js.on_foot_on_a_planet", "On foot on a planet") : tr("js.on_foot", "On foot");
    const body = s.BodyName ? " · " + s.BodyName : "";
    const air = Surface.flag2(s, F2.Breathable) ? tr("js.breathable_air", " · breathable air") : "";
    const glide = Surface.flag2(s, F2.Glide) ? tr("js.gliding", " · gliding") : "";
    return where + body + air + glide;
}

function show() { showVitals(); showLists(); }

function showVitals() {
    const s = status;
    const onFoot = !!(s && Surface.flag2(s, F2.OnFoot));
    set("context", context(s));
    set("onFoot", onFoot);

    if (onFoot) {
        set("oxygen", Math.round((s.Oxygen ?? 1) * 100));
        set("health", Math.round((s.Health ?? 1) * 100));
        const k = s.Temperature;
        set("temp", k ? `${Math.round(k - 273.15)} °C` : "—");
        set("gravity", s.Gravity !== undefined ? `${s.Gravity.toFixed(2)} g` : "—");
        set("weapon", s.SelectedWeapon_Localised || s.SelectedWeapon || "—");
        const w = [];
        if (Surface.flag2(s, F2.LowOxygen)) w.push(tr("js.low_oxygen", "LOW OXYGEN"));
        if (Surface.flag2(s, F2.LowHealth)) w.push(tr("js.low_health", "LOW HEALTH"));
        if (Surface.flag2(s, F2.VeryCold)) w.push(tr("js.very_cold", "VERY COLD")); else if (Surface.flag2(s, F2.Cold)) w.push(tr("js.cold", "COLD"));
        if (Surface.flag2(s, F2.VeryHot)) w.push(tr("js.very_hot", "VERY HOT")); else if (Surface.flag2(s, F2.Hot)) w.push(tr("js.hot", "HOT"));
        set("warnings", w.length ? "⚠ " + w.join(" · ") : "");
    } else {
        set("oxygen", 0); set("health", 0); set("temp", "—"); set("gravity", "—"); set("weapon", "—"); set("warnings", "");
    }
}

function showLists() {
    const l = st.loadout;
    set("suit", l ? `${l.suit} ${l.grade}`.trim() : tr("js.suit_loadout_appears_when_you_next", "Suit loadout appears when you next switch or load one"));
    set("loadoutName", l && l.name ? `“${l.name}”` : "");
    set("suitMods", l && l.mods.length ? l.mods.join(" · ") : "");
    set("weapons", l ? l.weapons.map(w => ({ name: `${w.name} ${w.grade}`.trim(), mods: w.mods })) : []);

    const b = st.backpack;
    set("consumables", b ? b.consumables.map(c => ({ name: c.name, count: "×" + c.count, out: c.count === 0 })) : []);
    const stuff = b ? [].concat(
        b.items.map(x => ({ ...x, kind: "item" })),
        b.components.map(x => ({ ...x, kind: "component" })),
        b.data.map(x => ({ ...x, kind: "data" }))).sort((x, y) => y.count - x.count) : [];
    set("backpack", stuff.map(x => ({ name: x.name, count: "×" + x.count, kind: x.kind })));
    const sum = list => list.reduce((t, x) => t + x.count, 0);
    set("backpackText", b ? tr("js.backpack_items_components_data", "BACKPACK · {0} items · {1} components · {2} data", sum(b.items), sum(b.components), sum(b.data)) : tr("js.backpack", "BACKPACK"));
    set("backpackEmpty", b && !stuff.length ? "Empty" : b ? "" : tr("js.shows_once_the_game_writes_your", "Shows once the game writes your backpack"));

    const k = st.locker;
    set("locker", k ? tr("js.ship_locker_items_components_consumables_data", "SHIP LOCKER · {0} items · {1} components · {2} consumables · {3} data", sum(k.items), sum(k.components), sum(k.consumables), sum(k.data)) : "");
}

show();
