// Carrier Finance.
//
// CarrierStats.Finance (carrier management) has the full picture; CarrierFinance (tax / reserve changes) and
// CarrierBankTransfer (deposits and withdrawals) keep it up to date in between. Weekly upkeep isn't in the journal.
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
