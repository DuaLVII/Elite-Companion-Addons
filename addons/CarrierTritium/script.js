// Carrier Tritium.
//
// The tank level comes from CarrierStats (when you open carrier management) and CarrierDepositFuel (whenever anyone,
// you included, puts tritium in). The game doesn't say what a jump costs, so this works it out: the drop in the tank
// between two readings with a jump in between (and no deposits) is that jump's cost.
include("_shared/carrier.js");

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
