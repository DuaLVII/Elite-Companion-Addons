// Carrier Services: capacity, crew/services and packs.
//
// CarrierStats has it all (SpaceUsage, Crew, ShipPacks, ModulePacks); CarrierCrewServices and the pack events keep
// it current between visits to carrier management.
include("_shared/carrier.js");

let st = store.get("services", { space: null, crew: [], shipPacks: [], modulePacks: [], updated: "" });
const save = () => store.set("services", st);

FC.on("CarrierStats", e => {
    if (e.SpaceUsage) st.space = e.SpaceUsage;
    if ((e.Crew || []).length) st.crew = e.Crew.map(c => ({ role: c.CrewRole, installed: !!c.Activated, running: c.Enabled !== false, name: c.CrewName || "" }));
    if (e.ShipPacks) st.shipPacks = e.ShipPacks.map(p => ({ theme: p.PackTheme, tier: p.PackTier }));
    if (e.ModulePacks) st.modulePacks = e.ModulePacks.map(p => ({ theme: p.PackTheme, tier: p.PackTier }));
    st.updated = e.timestamp;
    done();
});

FC.on("CarrierCrewServices", (e, live) => {
    let c = st.crew.find(x => x.role === e.CrewRole);
    if (!c) { c = { role: e.CrewRole, installed: false, running: false, name: "" }; st.crew.push(c); }
    switch (e.Operation) {
        case "Activate": c.installed = true; c.running = true; break;
        case "Deactivate": c.installed = false; c.running = false; break;
        case "Pause": c.running = false; break;
        case "Resume": c.running = true; break;
        case "Replace": break;
    }
    if (e.CrewName) c.name = e.CrewName;
    done();
    if (live) notify(tr("js.carrier_0_1_d", "Carrier {0}: {1}d", FC.serviceName(e.CrewRole), String(e.Operation).toLowerCase()), "info", 5);
});

function packEvent(list, e) {
    const op = String(e.Operation || "").toLowerCase();
    const i = list.findIndex(p => p.theme === e.PackTheme && p.tier === e.PackTier);
    if (op === "buypack" && i < 0) list.push({ theme: e.PackTheme, tier: e.PackTier });
    if (op === "sellpack" && i >= 0) list.splice(i, 1);
}
FC.on("CarrierShipPack", e => { packEvent(st.shipPacks, e); done(); });
FC.on("CarrierModulePack", e => { packEvent(st.modulePacks, e); done(); });

function done() { save(); show(); }

const pretty = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");

function show() {
    const sp = st.space;
    set("empty", sp ? "" : tr("js.open_carrier_management_in_game_once", "Open carrier management in game once to read the carrier's layout."));
    const total = sp ? sp.TotalCapacity || 25000 : 25000;
    set("total", total);
    const rows = sp ? [
        { label: tr("js.services_crew", "Services & crew"), value: sp.Crew || 0, color: "Ok" },
        { label: "Cargo", value: sp.Cargo || 0, color: "Hud" },
        { label: tr("js.reserved_for_buy_orders", "Reserved for buy orders"), value: sp.CargoSpaceReserved || 0, color: "Warn" },
        { label: tr("js.ship_packs", "Ship packs"), value: sp.ShipPacks || 0, color: "Purple" },
        { label: tr("js.module_packs", "Module packs"), value: sp.ModulePacks || 0, color: "Purple" },
        { label: "Free", value: sp.FreeSpace || 0, color: "Good" },
    ] : [];
    set("space", rows.map(r => ({ label: r.label, value: r.value, text: `${fmt(r.value)} t`, percent: 100 * r.value / total, color: r.color })));
    set("usedText", sp ? tr("js.t_used", "{0} / {1} t used", fmt(total - (sp.FreeSpace || 0)), fmt(total)) : "");

    const order = c => (c.installed ? (c.running ? 0 : 1) : 2);
    set("crew", st.crew
        .filter(c => c.role !== "Captain")
        .sort((a, b) => order(a) - order(b) || FC.serviceName(a.role).localeCompare(FC.serviceName(b.role)))
        .map(c => ({
            service: FC.serviceName(c.role),
            name: c.name,
            state: !c.installed ? tr("js.not_installed", "not installed") : c.running ? "running" : "paused",
            running: c.installed && c.running,
            paused: c.installed && !c.running,
        })));
    const captain = st.crew.find(c => c.role === "Captain");
    set("captain", captain && captain.name ? tr("js.captain", "Captain {0}", captain.name) : "");

    const packs = st.shipPacks.map(p => tr("js.ship_pack", "Ship pack: {0} {1}", pretty(p.theme), p.tier))
        .concat(st.modulePacks.map(p => tr("js.module_pack", "Module pack: {0} {1}", pretty(p.theme), p.tier)));
    set("packs", packs.length ? packs.join("\n") : tr("js.no_ship_or_module_packs", "No ship or module packs"));
    set("updated", st.updated ? tr("js.carrier_management_last_opened", "Carrier management last opened {0}", FC.ago(st.updated)) : "");
}

show();
