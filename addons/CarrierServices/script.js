// Carrier Services: capacity, crew/services and packs.
//
// CarrierStats has it all (SpaceUsage, Crew, ShipPacks, ModulePacks); CarrierCrewServices and the pack events keep
// it current between visits to carrier management.
// ---------------------------------------------------------------- carrier.js (built in, so the addon stands alone)
// Shared helpers for the Fleet Carrier addons. Each of them starts with:
//
//
// Folders starting with "_" aren't modules themselves; editing this file reloads every addon.
//
// How the carrier addons stay up to date:
//   - wantHistory() asks the app for the last ~5 weeks of carrier events at startup (not just today's)
//   - each module saves what it knows with store.set(), so it's still filled in after weeks without carrier events
//   - FC.on() only passes on events for YOUR carrier, and each event only once (by its timestamp), so
//     history + today's replay + live events never count twice.

wantHistory();

const FC = (() => {
    // Events the game only writes for the carrier you own
    const OWNER_EVENTS = [
        "CarrierStats", "CarrierBuy", "CarrierJumpRequest", "CarrierJumpCancelled", "CarrierDecommission",
        "CarrierCancelDecommission", "CarrierBankTransfer", "CarrierCrewServices", "CarrierFinance", "CarrierShipPack",
        "CarrierModulePack", "CarrierTradeOrder", "CarrierDockingPermission", "CarrierNameChanged",
    ];

    let mark = store.get("fc.mark", { ts: "", keys: [] });   // newest event handled (and which ones at that second)
    let myId = store.get("fc.id", null);

    function isFleetCarrier(e) {
        return !e.CarrierType || e.CarrierType === "FleetCarrier";      // ignore squadron carriers
    }

    /** Is this event about your carrier? (Learns your carrier's ID from owner-only events.) */
    function mine(e) {
        if (!isFleetCarrier(e)) return false;
        if (OWNER_EVENTS.includes(e.event)) {
            if (e.CarrierID && e.CarrierID !== myId) { myId = e.CarrierID; store.set("fc.id", myId); }
            return true;
        }
        if (myId == null) return false;
        // CarrierDepositFuel is also written when you donate to someone else's carrier; Docked / CarrierJump use MarketID
        return e.CarrierID === myId || e.MarketID === myId;
    }

    /** True the first time an event is seen (history, today's replay and live events overlap). */
    function fresh(e) {
        const ts = e.timestamp || "";
        const key = e.event + ":" + JSON.stringify(e).length;
        if (ts < mark.ts) return false;
        if (ts === mark.ts) {
            if (mark.keys.includes(key)) return false;
            mark.keys.push(key);
        } else {
            mark = { ts: ts, keys: [key] };
        }
        store.set("fc.mark", mark);
        return true;
    }

    /** FC.on(["CarrierStats", "CarrierFinance"], (e, live) => …): your carrier's events, each once. live = not a replay. */
    // Several handlers can share one event (the app passes them all the same object), so check each event once
    let lastEvent = null, lastOk = false;
    function wanted(e) {
        if (e !== lastEvent) { lastEvent = e; lastOk = mine(e) && fresh(e); }
        return lastOk;
    }

    function onCarrier(names, fn) {
        for (const name of [].concat(names)) {
            on(name, (e, replay) => {
                if (!wanted(e)) return;
                fn(e, !replay);
            });
        }
    }

    // ---- formatting ----

    function ms(iso) { const t = Date.parse(iso); return isNaN(t) ? 0 : t; }

    /** 754000 → "12:34", 4000000 → "1h 06m" */
    function duration(msLeft) {
        const s = Math.max(0, Math.round(msLeft / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`;
    }

    /** "3 min ago", "2 h ago", "5 days ago" */
    function ago(iso) {
        const d = Date.now() - ms(iso);
        if (!iso || d < 0) return "";
        if (d < 90000) return "just now";
        if (d < 3600000) return `${Math.round(d / 60000)} min ago`;
        if (d < 172800000) return `${Math.round(d / 3600000)} h ago`;
        return `${Math.round(d / 86400000)} days ago`;
    }

    /** "12 Oct 17:05" (local time) */
    function when(iso) {
        if (!iso) return "";
        const d = new Date(ms(iso));
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${d.getDate()} ${months[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    // ---- carrier vocabulary ----

    const SERVICES = {
        Captain: "Captain", Refuel: "Refuel", Repair: "Repair", Rearm: "Rearm", Commodities: "Commodity Market",
        BlackMarket: "Secure Warehouse", VoucherRedemption: "Redemption Office", Exploration: "Universal Cartographics",
        Shipyard: "Shipyard", Outfitting: "Outfitting", CarrierFuel: "Tritium Depot", VistaGenomics: "Vista Genomics",
        PioneerSupplies: "Pioneer Supplies", Bartender: "Bar", Rearmament: "Rearm",
    };
    const ACCESS = { all: "Everyone", none: "Nobody", friends: "Friends", squadron: "Squadron", squadronfriends: "Squadron & friends" };

    function serviceName(role) {
        const key = Object.keys(SERVICES).find(k => k.toLowerCase() === String(role).toLowerCase());
        return key ? SERVICES[key] : String(role).replace(/([a-z])([A-Z])/g, "$1 $2");
    }
    function accessName(a) { return ACCESS[String(a).toLowerCase()] || a; }

    // Roughly how carrier jumps go (the journal only gives the departure time)
    const LOCKDOWN_BEFORE_MS = 200000;   // pads lock about 3 min 20 s before departure
    const ARRIVE_AFTER_MS = 60000;       // about a minute in hyperspace
    const COOLDOWN_MS = 300000;          // about 5 min before it can jump again

    return { on: onCarrier, mine, fresh, ms, duration, ago, when, serviceName, accessName,
             LOCKDOWN_BEFORE_MS, ARRIVE_AFTER_MS, COOLDOWN_MS,
             get id() { return myId; } };
})();
// ---------------------------------------------------------------- end of carrier.js

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
