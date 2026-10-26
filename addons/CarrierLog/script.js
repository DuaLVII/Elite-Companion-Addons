// Carrier Log: one line per carrier event, newest first, kept between sessions (last 80).
include("_shared/carrier.js");

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
