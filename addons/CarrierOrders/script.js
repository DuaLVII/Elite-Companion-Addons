// Carrier Orders: your carrier's market orders.
//
// CarrierTradeOrder is written when you set, change or cancel an order: PurchaseOrder (tons to buy) or SaleOrder
// (tons to sell) with a Price, or CancelTrade. The journal doesn't say when other players fill an order, so on its
// own that only gives the orders as you placed them. But when you open the Commodity Market on your own carrier the
// game writes Market.json with what's left of each order (Demand for buy orders, Stock for sell orders): that brings
// the amounts up to date, drops orders that have been filled, and adds any set elsewhere.
// (Secure warehouse / black market orders aren't in Market.json, so those stay as you set them.)
include("_shared/carrier.js");

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
