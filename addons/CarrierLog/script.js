// Carrier Log: one line per carrier event, newest first, kept between sessions (last 80).
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

let lines = store.get("lines", []);      // { at, icon, text, kind }
const MAX = 80;

function add(e, icon, text, kind) {
    lines.unshift({ at: e.timestamp, icon: icon, text: text, kind: kind || "" });
    if (lines.length > MAX) lines.length = MAX;
    store.set("lines", lines);
    show();
}

const cr = n => short(n || 0, "cr");

const packName = e => String(e.PackTheme).replace(/([a-z])([A-Z])/g, "$1 $2");

FC.on("CarrierBuy", e => add(e, "★", tr("js.bought_carrier_in_for", "Bought carrier {0} in {1} for {2}", e.Callsign, e.Location, cr(e.Price)), "good"));
FC.on("CarrierStats", e => add(e, "▤", tr("js.carrier_management_t_tritium_t_free", "Carrier management: {0} t tritium · {1} · {2} t free", fmt(e.FuelLevel), cr(e.Finance && e.Finance.CarrierBalance), fmt(e.SpaceUsage && e.SpaceUsage.FreeSpace)), "dim"));
FC.on("CarrierJumpRequest", e => add(e, "»", tr("js.jump_booked_to", "Jump booked to {0}{1}{2}", e.SystemName, e.Body ? " (" + e.Body + ")" : "", e.DepartureTime ? tr("js.departs", " · departs {0}", FC.when(e.DepartureTime)) : ""), "jump"));
FC.on("CarrierJumpCancelled", e => add(e, "✕", tr("js.jump_cancelled", "Jump cancelled"), "warn"));
FC.on("CarrierJump", e => add(e, "◎", tr("js.arrived_in", "Arrived in {0}{1}", e.StarSystem, e.Body ? " · " + e.Body : ""), "jump"));
FC.on("CarrierDepositFuel", e => add(e, "⛽", tr("js.tritium_t_t", "Tritium +{0} t → {1} t", fmt(e.Amount), fmt(e.Total)), "good"));
FC.on("CarrierBankTransfer", e => add(e, "¢",
    e.Deposit ? tr("js.deposited", "Deposited {0} → {1}", cr(e.Deposit), cr(e.CarrierBalance)) : tr("js.withdrew", "Withdrew {0} → {1}", cr(e.Withdraw), cr(e.CarrierBalance)),
    e.Deposit ? "good" : "warn"));
FC.on("CarrierFinance", e => add(e, "%", tr("js.finance_tax_reserve_available", "Finance: tax {0}% · reserve {1}% · available {2}", e.TaxRate, e.ReservePercent, cr(e.AvailableBalance)), ""));
FC.on("CarrierCrewServices", e => add(e, "⚙", `${FC.serviceName(e.CrewRole)}: ${String(e.Operation).toLowerCase()}d${e.CrewName ? " (" + e.CrewName + ")" : ""}`, ""));
FC.on(["CarrierShipPack", "CarrierModulePack"], e => add(e, "▣",
    (e.event === "CarrierShipPack" ? tr("js.ship_pack", "Ship pack {0} {1}: ", packName(e), e.PackTier) : tr("js.module_pack", "Module pack {0} {1}: ", packName(e), e.PackTier)) +
    `${String(e.Operation).replace(/Pack$/i, "").toLowerCase()}${e.Cost ? " · " + cr(e.Cost) : e.Refund ? tr("js.refund", " · refund {0}", cr(e.Refund)) : ""}`, ""));
FC.on("CarrierTradeOrder", e => {
    const name = e.Commodity_Localised || e.Commodity;
    if (e.CancelTrade) add(e, "⇄", tr("js.order_cancelled", "Order cancelled: {0}", name), "dim");
    else if (e.PurchaseOrder !== undefined) add(e, "⇄", tr("js.buy_order_t_cr", "Buy order: {0} t {1} @ {2} cr", fmt(e.PurchaseOrder), name, fmt(e.Price)), "");
    else add(e, "⇄", tr("js.sell_order_t_cr", "Sell order: {0} t {1} @ {2} cr", fmt(e.SaleOrder), name, fmt(e.Price)), "");
});
FC.on("CarrierDockingPermission", e => add(e, "⚓", tr("js.docking", "Docking: {0}{1}", FC.accessName(e.DockingAccess), e.AllowNotorious ? tr("js.notorious_allowed", " · notorious allowed") : ""), ""));
FC.on("CarrierNameChanged", e => add(e, "✎", tr("js.renamed_to", "Renamed to {0} ({1})", e.Name, e.Callsign), ""));
FC.on("CarrierDecommission", e => add(e, "⚠", tr("js.decommission_requested_refund", "Decommission requested · refund {0}", cr(e.ScrapRefund)), "bad"));
FC.on("CarrierCancelDecommission", e => add(e, "✓", tr("js.decommission_cancelled", "Decommission cancelled"), "good"));

function show() {
    set("lines", lines.map(l => ({ when: FC.when(l.at), icon: l.icon, text: l.text, kind: l.kind })));
    set("empty", lines.length ? "" : tr("js.nothing_yet_carrier_events_from_the", "Nothing yet. Carrier events from the last few weeks of journals appear here, and new ones as they happen."));
    set("count", lines.length ? tr("js.events", "{0} events", lines.length) : "");
}

show();
