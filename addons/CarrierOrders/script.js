// Carrier Orders: your carrier's market orders.
//
// CarrierTradeOrder is written when you set, change or cancel an order: PurchaseOrder (tons to buy) or SaleOrder
// (tons to sell) with a Price, or CancelTrade. The journal doesn't say when other players fill an order, so on its
// own that only gives the orders as you placed them. But when you open the Commodity Market on your own carrier the
// game writes Market.json with what's left of each order (Demand for buy orders, Stock for sell orders): that brings
// the amounts up to date, drops orders that have been filled, and adds any set elsewhere.
// (Secure warehouse / black market orders aren't in Market.json, so those stay as you set them.)
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

// commodity names: "$painite_name;" (Market.json) and "painite" (CarrierTradeOrder) are the same thing
const norm = x => String(x || "").toLowerCase().replace(/^\$/, "").replace(/_name;$/, "");
const keyOf = (commodity, blackMarket) => norm(commodity) + "|" + (blackMarket ? "bm" : "");

// "Commodity|bm" → { commodity, kind: "buy"|"sell", amount, price, blackMarket, at }
let orders = store.get("orders", {});
let checked = store.get("checked", "");   // when the carrier's market was last read
{
    // older versions: keys as the journal wrote them, and "buy" / "sell" in the language of the time
    const fixed = {};
    for (const [k, o] of Object.entries(orders)) {
        const [name, bm] = k.split("|");
        if (o.kind !== "buy" && o.kind !== "sell") o.kind = o.kind === tr("js.sell", "sell") || /verk|vend|prod/i.test(o.kind) ? "sell" : "buy";
        fixed[keyOf(name, bm === "bm")] = o;
    }
    orders = fixed;
}
const save = () => { store.set("orders", orders); store.set("checked", checked); };

FC.on("CarrierTradeOrder", (e, live) => {
    const key = keyOf(e.Commodity, e.BlackMarket);
    const name = e.Commodity_Localised || e.Commodity;
    if (e.CancelTrade) {
        delete orders[key];
        if (live) notify(tr("js.carrier_order_cancelled_0", "Carrier order cancelled: {0}", name), "info", 5);
    } else {
        const buy = e.PurchaseOrder !== undefined;
        orders[key] = {
            commodity: name, kind: buy ? "buy" : "sell", amount: buy ? e.PurchaseOrder : (e.SaleOrder || 0),
            price: e.Price || 0, blackMarket: !!e.BlackMarket, at: e.timestamp,
        };
        if (live) notify(tr("js.carrier_0_order_1_t_2", "Carrier {0} order: {1} t {2} @ {3} cr", buy ? tr("js.buy", "buy") : tr("js.sell", "sell"), fmt(orders[key].amount), name, fmt(e.Price)), "info", 6);
    }
    save();
    show();
});

// Market.json at your own carrier: what's actually left of each order
FC.on("Market", (e, live) => {
    if (e.StationType && e.StationType !== "FleetCarrier") return;
    if (!Array.isArray(e.Items)) return;                       // the market screen wasn't opened: nothing to go on
    const seen = new Set();
    let filled = 0;
    for (const it of e.Items) {
        const demand = Number(it.Demand) || 0, stock = Number(it.Stock) || 0;
        if (demand <= 0 && stock <= 0) continue;
        const buy = demand > 0;
        const key = keyOf(it.Name, false);
        seen.add(key);
        const was = orders[key];
        const amount = buy ? demand : stock;
        if (was && was.kind === (buy ? "buy" : "sell") && amount < was.amount) filled++;
        orders[key] = {
            commodity: it.Name_Localised || (was && was.commodity) || norm(it.Name),
            kind: buy ? "buy" : "sell", amount,
            price: (buy ? it.SellPrice : it.BuyPrice) || (was && was.price) || 0,
            blackMarket: false, at: (was && was.at) || e.timestamp,
        };
    }
    // ordinary orders the market no longer shows have been filled (or cancelled elsewhere)
    for (const key of Object.keys(orders))
        if (!orders[key].blackMarket && !seen.has(key)) { delete orders[key]; filled++; }
    checked = e.timestamp || checked;
    if (live && filled > 0) notify(tr("js.orders_updated_0", "Carrier orders updated from its market: {0} changed", filled), "info", 5);
    save();
    show();
});

function rows(kind) {
    return Object.values(orders)
        .filter(o => o.kind === kind)
        .sort((a, b) => b.amount * b.price - a.amount * a.price)
        .map(o => ({
            commodity: (o.blackMarket ? "⚑ " : "") + o.commodity,
            amount: `${fmt(o.amount)} t`,
            price: tr("js.cr", "{0} cr", fmt(o.price)),
            total: short(o.amount * o.price, "cr"),
            set: FC.when(o.at),
            blackMarket: o.blackMarket,
        }));
}

function show() {
    const buy = rows("buy"), sell = rows("sell");
    set("buy", buy);
    set("sell", sell);
    const sum = kind => Object.values(orders).filter(o => o.kind === kind).reduce((t, o) => t + o.amount * o.price, 0);
    set("buyHeader", tr("js.buying_0", "BUYING · {0}", buy.length) + (buy.length ? tr("js.up_to", " · up to {0}", short(sum("buy"), "cr")) : ""));
    set("sellHeader", tr("js.selling_0", "SELLING · {0}", sell.length) + (sell.length ? tr("js.worth", " · worth {0}", short(sum("sell"), "cr")) : ""));
    set("empty", buy.length + sell.length ? "" : tr("js.no_market_orders_yet_set_some", "No market orders yet. Set some in carrier management (Commodity Market)."));
    set("checked", checked
        ? tr("js.checked_0", "Amounts from your carrier's market, {0}. Open its Commodity Market to refresh.", FC.when(checked))
        : tr("js.not_checked", "Open the Commodity Market on your carrier once to bring the amounts up to date."));
}

show();
