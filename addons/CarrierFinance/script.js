// Carrier Finance.
//
// CarrierStats.Finance (carrier management) has the full picture; CarrierFinance (tax / reserve changes) and
// CarrierBankTransfer (deposits and withdrawals) keep it up to date in between. Weekly upkeep isn't in the journal.
include("_shared/carrier.js");

let st = store.get("finance", {
    balance: null, reserve: null, available: null, reservePercent: null,
    taxes: {},              // service → %
    transfers: [],          // { at, amount (+ in / - out), balance }, newest first
    updated: "",
});
const save = () => store.set("finance", st);

// Alert threshold: typed into the box in the module (two-way bound to V[threshold]), remembered per module
set("threshold", store.get("threshold", "50000000"));
let warnedBelow = false;

FC.on("CarrierStats", e => {
    const f = e.Finance || {};
    const keep = (v, old) => v === undefined || v === null ? old : v;
    st.balance = keep(f.CarrierBalance, st.balance); st.reserve = keep(f.ReserveBalance, st.reserve);
    st.available = keep(f.AvailableBalance, st.available); st.reservePercent = keep(f.ReservePercent, st.reservePercent);
    const taxes = Object.keys(f).filter(k => k.startsWith("TaxRate_"));
    if (taxes.length) { st.taxes = {}; for (const k of taxes) st.taxes[k.slice(8)] = f[k]; }
    st.updated = e.timestamp;
    done();
});

FC.on("CarrierFinance", e => {
    st.balance = e.CarrierBalance; st.reserve = e.ReserveBalance;
    st.available = e.AvailableBalance; st.reservePercent = e.ReservePercent;
    st.updated = e.timestamp;
    done();
});

FC.on("CarrierBankTransfer", (e, live) => {
    const amount = e.Deposit ? e.Deposit : -(e.Withdraw || 0);
    st.transfers.unshift({ at: e.timestamp, amount: amount, balance: e.CarrierBalance });
    if (st.transfers.length > 30) st.transfers.length = 30;
    st.balance = e.CarrierBalance;
    st.updated = e.timestamp;
    done();
    if (live) notify(tr("js.carrier_0_1_balance_2", "Carrier {0}: {1} · balance {2}", amount >= 0 ? tr("js.deposit", "deposit") : tr("js.withdrawal", "withdrawal"), short(Math.abs(amount), "cr"), short(e.CarrierBalance, "cr")), "info", 6);
});

function done() { save(); show(); }

function threshold() {
    const n = Number(String(get("threshold") || "").replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 0 : n;
}

function show() {
    const known = st.balance != null;
    set("empty", known ? "" : tr("js.open_carrier_management_in_game_once", "Open carrier management in game once to read the carrier's finances."));
    set("balance", known ? fmt(st.balance) + tr("js.cr", " cr") : "—");
    set("reserve", st.reserve == null ? "—" : short(st.reserve, "cr") + (st.reservePercent ? ` (${st.reservePercent}%)` : ""));
    set("available", st.available == null ? "—" : short(st.available, "cr"));
    set("updated", st.updated ? tr("js.updated", "Updated {0}", FC.ago(st.updated)) : "");

    const limit = threshold();
    const low = known && limit > 0 && st.balance < limit;
    set("low", low);
    set("lowText", low ? tr("js.below_your_alert_level_of_top", "⚠ Below your alert level of {0}: top it up to cover upkeep", short(limit, "cr")) : "");
    if (low && !warnedBelow) { notify(tr("js.carrier_balance_low_0", "⚠ CARRIER BALANCE LOW · {0}", short(st.balance, "cr")), "warning", 10); warnedBelow = true; }
    if (!low) warnedBelow = false;

    set("taxes", Object.keys(st.taxes).sort().map(k => ({
        service: FC.serviceName(k.charAt(0).toUpperCase() + k.slice(1)),
        rate: `${st.taxes[k]}%`,
    })));
    set("transfers", st.transfers.slice(0, 12).map(t => ({
        when: FC.when(t.at),
        amount: (t.amount >= 0 ? "+" : "−") + short(Math.abs(t.amount), "cr"),
        incoming: t.amount >= 0,
        balance: "→ " + short(t.balance, "cr"),
    })));
}

// Typing in the alert box: remember it and redraw straight away
on("change:threshold", value => { store.set("threshold", value); show(); });

show();
