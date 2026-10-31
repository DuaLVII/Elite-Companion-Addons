// Carrier Jumps: countdown, alerts and history.
//
// The journal writes CarrierJumpRequest (with the departure time) when you book a jump, and CarrierJumpCancelled if
// you cancel. It only confirms the arrival (CarrierJump) if you're aboard, so after the departure time this assumes
// the jump happened.
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

let st = store.get("jumps", { location: "", booked: null, history: [] });   // history: newest first
const save = () => store.set("jumps", st);
const alerted = {};                                                         // which alerts went off for this booking

FC.on(["Docked", "Location", "CarrierLocation"], e => { if (!st.booked) st.location = e.StarSystem || st.location; save(); show(); });
FC.on("CarrierBuy", e => { st.location = e.Location || st.location; save(); show(); });

FC.on("CarrierJumpRequest", (e, live) => {
    const depart = e.DepartureTime || new Date(FC.ms(e.timestamp) + 15 * 60000).toISOString();
    st.booked = { from: st.location, to: e.SystemName, body: e.Body || "", depart: depart, at: e.timestamp };
    for (const k in alerted) delete alerted[k];
    save();
    if (live) notify(tr("js.carrier_jump_booked_0_departs_1", "CARRIER JUMP BOOKED · {0} · departs {1}", e.SystemName.toUpperCase(), FC.when(depart)), "info", 8);
    show();
});

FC.on("CarrierJumpCancelled", (e, live) => {
    if (st.booked) addHistory({ from: st.booked.from, to: st.booked.to, at: e.timestamp, cancelled: true });
    st.booked = null;
    save();
    if (live) notify(tr("js.carrier_jump_cancelled", "CARRIER JUMP CANCELLED"), "warning", 8);
    show();
});

FC.on("CarrierJump", e => {                                   // you were aboard: a confirmed arrival
    const from = st.booked ? st.booked.from : st.location;
    addHistory({ from: from, to: e.StarSystem, at: e.timestamp, confirmed: true });
    st.location = e.StarSystem;
    st.booked = null;
    save();
    show();
});

function addHistory(item) {
    st.history.unshift(item);
    if (st.history.length > 25) st.history.length = 25;
}

/** After departure (+ about a minute) assume it arrived. */
function settle() {
    if (!st.booked) return;
    const arrive = FC.ms(st.booked.depart) + FC.ARRIVE_AFTER_MS;
    if (Date.now() < arrive) return;
    addHistory({ from: st.booked.from, to: st.booked.to, at: new Date(arrive).toISOString(), assumed: true });
    st.location = st.booked.to;
    st.booked = null;
    save();
}

function alerts(left) {
    if (!st.booked) return;
    const to = st.booked.to.toUpperCase();
    const once = (key, cond, text, level) => {
        if (cond && !alerted[key]) { alerted[key] = true; notify(text, level, 10); }
    };
    once("10", left <= 600000 && left > 300000, tr("js.carrier_jumps_to_in", "CARRIER JUMPS TO {0} IN {1}", to, FC.duration(left)), "info");
    once("5", left <= 300000 && left > FC.LOCKDOWN_BEFORE_MS, tr("js.carrier_jumps_to_in", "CARRIER JUMPS TO {0} IN {1}", to, FC.duration(left)), "warning");
    once("lock", left <= FC.LOCKDOWN_BEFORE_MS && left > 60000, tr("js.carrier_lockdown_jumping_to_in_launch", "⚠ CARRIER LOCKDOWN · jumping to {0} in {1} · launch or stay docked", to, FC.duration(left)), "danger");
    once("1", left <= 60000 && left > 0, tr("js.carrier_jumps_in", "CARRIER JUMPS IN {0}", FC.duration(left)), "danger");
    once("go", left <= 0 && left > -30000, tr("js.carrier_jumping", "CARRIER JUMPING · {0}", to), "info");
}

function show(fromTick) {
    settle();
    const now = Date.now();
    if (st.booked) {
        const left = FC.ms(st.booked.depart) - now;
        if (fromTick) alerts(left);
        const phase = left > FC.LOCKDOWN_BEFORE_MS ? "booked" : left > 0 ? "lockdown" : "transit";
        set("phase", phase);
        set("countdown", left > 0 ? FC.duration(left) : tr("js.jumping", "JUMPING"));
        set("headline", `${st.booked.from || "?"}  →  ${st.booked.to}`);
        set("detail", (st.booked.body ? st.booked.body + " · " : "") + tr("js.departs", "departs {0}", FC.when(st.booked.depart)) +
            (phase === "lockdown" ? tr("js.lockdown", " · LOCKDOWN") : ""));
        // progress from booking to departure (0…100)
        const total = FC.ms(st.booked.depart) - FC.ms(st.booked.at);
        set("progress", total > 0 ? Math.min(100, Math.max(0, 100 * (now - FC.ms(st.booked.at)) / total)) : 100);
    } else {
        set("phase", "idle");
        set("countdown", "");
        set("headline", st.location ? tr("js.at", "At {0}", st.location) : "");
        set("detail", tr("js.no_jump_booked", "No jump booked"));
        set("progress", 0);
    }
    set("history", st.history.slice(0, 12).map(h => ({
        when: FC.when(h.at),
        route: `${h.from || "?"} → ${h.to}`,
        note: h.cancelled ? "cancelled" : h.confirmed ? "✓" : "assumed",
        cancelled: !!h.cancelled,
    })));
    set("empty", st.history.length || st.booked ? "" : tr("js.no_carrier_jumps_yet_book_one", "No carrier jumps yet. Book one in carrier management and it'll count down here."));
}

on("tick", () => { if (st.booked) show(true); });

show();
