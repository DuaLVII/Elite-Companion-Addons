// Carrier Tritium.
//
// The tank level comes from CarrierStats (when you open carrier management) and CarrierDepositFuel (whenever anyone,
// you included, puts tritium in). The game doesn't say what a jump costs, so this works it out: the drop in the tank
// between two readings with a jump in between (and no deposits) is that jump's cost.
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

const TANK = 1000;

let st = store.get("tritium", {
    level: null, levelTs: "", rangeNow: null, rangeMax: null,
    jumpsSinceReading: 0,     // jumps booked since the last tank reading
    costs: [],                // recent jump costs (t), newest first
    deposits: [],             // { at, amount, total }, newest first
});
const save = () => store.set("tritium", st);

function reading(level, ts) {
    // A drop across exactly one jump (no deposits since) is that jump's cost
    if (st.level != null && st.jumpsSinceReading === 1 && level < st.level) {
        st.costs.unshift(st.level - level);
        if (st.costs.length > 10) st.costs.length = 10;
    }
    st.level = level;
    st.levelTs = ts;
    st.jumpsSinceReading = 0;
}

FC.on("CarrierStats", e => {
    reading(e.FuelLevel || 0, e.timestamp);
    st.rangeNow = e.JumpRangeCurr;
    st.rangeMax = e.JumpRangeMax;
    save(); show();
});

FC.on("CarrierDepositFuel", (e, live) => {
    st.deposits.unshift({ at: e.timestamp, amount: e.Amount || 0, total: e.Total || 0 });
    if (st.deposits.length > 30) st.deposits.length = 30;
    // a deposit tells us the new total, but the jump cost can't be separated out, so don't count this one
    st.jumpsSinceReading = 0;
    st.level = e.Total;
    st.levelTs = e.timestamp;
    save(); show();
    if (live) notify(tr("js.carrier_tritium_0_t_1_t", "Carrier tritium +{0} t → {1} t", fmt(e.Amount), fmt(e.Total)), "info", 5);
});

FC.on("CarrierJumpRequest", () => { st.jumpsSinceReading++; save(); });
FC.on("CarrierJumpCancelled", () => { st.jumpsSinceReading = Math.max(0, st.jumpsSinceReading - 1); save(); });

function show() {
    const known = st.level != null;
    set("empty", known ? "" : tr("js.open_carrier_management_in_game_once", "Open carrier management in game once to read the tank."));
    set("percent", known ? Math.min(100, 100 * st.level / TANK) : 0);
    set("level", known ? `${fmt(st.level)} t` : "—");
    set("ofTank", known ? tr("js.of_t", "of {0} t", fmt(TANK)) : "");
    set("range", st.rangeMax ? tr("js.ly", "{0} / {1} ly", fmt(st.rangeNow || 0), fmt(st.rangeMax)) : "—");
    set("stale", st.jumpsSinceReading > 0
        ? (st.jumpsSinceReading > 1 ? tr("js.jumps_since_this_reading", "{0} jumps since this reading; open carrier management to update", st.jumpsSinceReading) : tr("js.one_jump_since_this_reading", "1 jump since this reading; open carrier management to update"))
        : st.levelTs ? tr("js.read", "Read {0}", FC.ago(st.levelTs)) : "");

    if (st.costs.length) {
        const avg = st.costs.reduce((a, b) => a + b, 0) / st.costs.length;
        set("cost", `${fmt(avg)} t`);
        set("jumpsLeft", known ? `≈ ${Math.floor(st.level / avg)}` : "—");
        set("costNote", (st.costs.length > 1 ? tr("js.average_of_the_last_0_measured", "average of the last {0} measured jumps", st.costs.length) : tr("js.the_one_measured_jump", "the one measured jump")));
    } else {
        set("cost", "—");
        set("jumpsLeft", "—");
        set("costNote", tr("js.measured_after_a_jump_open_carrier", "measured after a jump: open carrier management before and after one"));
    }
    set("low", known && st.level < 150 ? tr("js.low_tritium_may_not_cover_a", "⚠ Low tritium: may not cover a long jump") : "");

    set("deposits", st.deposits.slice(0, 10).map(d => ({ when: FC.when(d.at), amount: `+${fmt(d.amount)} t`, total: `→ ${fmt(d.total)} t` })));
}

show();
