// Carrier Jumps: countdown, alerts and history.
//
// The journal writes CarrierJumpRequest (with the departure time) when you book a jump, and CarrierJumpCancelled if
// you cancel. It only confirms the arrival (CarrierJump) if you're aboard, so after the departure time this assumes
// the jump happened.
include("_shared/carrier.js");

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
