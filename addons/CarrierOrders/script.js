// Carrier Orders: market orders as you set them.
//
// CarrierTradeOrder is written when you set, change or cancel an order: PurchaseOrder (tons to buy) or SaleOrder
// (tons to sell) with a Price, or CancelTrade. The journal doesn't say when other players fill an order, so these are
// the orders as you placed them, not live stock.
include("_shared/carrier.js");

let orders = store.get("orders", {});     // "Commodity|bm" → { commodity, kind: "buy"|"sell", amount, price, blackMarket, at }
const save = () => store.set("orders", orders);

FC.on("CarrierTradeOrder", (e, live) => {
    const key = e.Commodity + "|" + (e.BlackMarket ? "bm" : "");
    const name = e.Commodity_Localised || e.Commodity;
    if (e.CancelTrade) {
        delete orders[key];
        if (live) notify(tr("js.carrier_order_cancelled_0", "Carrier order cancelled: {0}", name), "info", 5);
    } else {
        const buy = e.PurchaseOrder !== undefined;
        orders[key] = {
            commodity: name, kind: buy ? tr("js.buy", "buy") : tr("js.sell", "sell"), amount: buy ? e.PurchaseOrder : (e.SaleOrder || 0),
            price: e.Price || 0, blackMarket: !!e.BlackMarket, at: e.timestamp,
        };
        if (live) notify(tr("js.carrier_0_order_1_t_2", "Carrier {0} order: {1} t {2} @ {3} cr", buy ? tr("js.buy", "buy") : tr("js.sell", "sell"), fmt(orders[key].amount), name, fmt(e.Price)), "info", 6);
    }
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
}

show();
