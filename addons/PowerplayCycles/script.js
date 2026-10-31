// Powerplay Cycles: merits per weekly cycle.
// ---------------------------------------------------------------- powerplay.js (built in, so the addon stands alone)
// Shared helpers for the Powerplay addons. Each of them starts with:
//
//
// Where the data comes from (Powerplay 2.0 journal events):
//   Powerplay          at every login: Power, Rank, Merits (total), TimePledged (seconds)
//   PowerplayMerits    each time merits are earned: Power, MeritsGained, TotalMerits
//   PowerplayRank      a new rank: Power, Rank
//   PowerplayJoin / PowerplayLeave / PowerplayDefect   pledge changes
//   PowerplayCollect / PowerplayDeliver / PowerplaySalary / PowerplayVoucher / PowerplayFastTrack   activities
//   FSDJump / Location / CarrierJump   the system's ControllingPower, Powers, PowerplayState and progress
//
// Like the carrier addons: wantHistory() asks for the last ~5 weeks of journals at startup, each module saves what it
// knows with store.set(), and PP.on() passes each event on once (history, today's replay and live events overlap).

wantHistory();

const PP = (() => {
    let mark = store.get("pp.mark", { ts: "", keys: [] });

    /** True the first time an event is seen. */
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
        store.set("pp.mark", mark);
        return true;
    }

    // Several handlers can share one event object: check it once
    let lastEvent = null, lastOk = false;
    function once(e) {
        if (e !== lastEvent) { lastEvent = e; lastOk = fresh(e); }
        return lastOk;
    }

    /** PP.on(["PowerplayMerits", …], (e, live) => …): each event once. live = happening now (not read back). */
    function onPP(names, fn) {
        for (const name of [].concat(names)) on(name, (e, replay) => { if (once(e)) fn(e, !replay); });
    }

    // ---- where you are, and what you were just doing (to say what the merits were for) ----

    let system = "";
    let lastActivity = null;   // { what, at, system }

    for (const name of ["FSDJump", "Location", "CarrierJump"])
        on(name, e => { if (e.StarSystem) system = e.StarSystem; });

    // Events that earn merits (roughly), and what to call them
    const ACTIVITIES = {
        Bounty: "Bounty hunting", FactionKillBond: "Combat zone", CapShipBond: "Combat zone", PVPKill: "Commander kill",
        PowerplayDeliver: "Delivery", PowerplayCollect: "Collection", MarketSell: "Trade", MarketBuy: "Trade",
        SellExplorationData: "Exploration data", MultiSellExplorationData: "Exploration data",
        SellOrganicData: "Exobiology", MissionCompleted: "Mission", MiningRefined: "Mining",
        DataScanned: "Data scan", DatalinkScan: "Data scan", ShipTargeted: "Combat",
        CollectItems: "On foot", SellMicroResources: "On foot",
        RedeemVoucher: "Redeeming vouchers", PowerplayVoucher: "Redeeming vouchers", HoloscreenHacked: "Holoscreen hack",
        SearchAndRescue: "Search & rescue", EjectCargo: "Cargo", CommitCrime: "Crime",
    };
    for (const name of Object.keys(ACTIVITIES))
        on(name, e => {
            // Targeting a ship happens all the time: only count it when it's a scanned power ship
            if (name === "ShipTargeted" && !e.Power) return;
            lastActivity = { what: ACTIVITIES[name], at: Date.parse(e.timestamp) || 0, system };
        });

    /** What the merits in this PowerplayMerits event were probably for. */
    function activityFor(e) {
        const t = Date.parse(e.timestamp) || 0;
        if (lastActivity && t - lastActivity.at >= 0 && t - lastActivity.at < 180000) return lastActivity.what;
        return "Other";
    }

    // ---- the weekly cycle: Thursday 07:00 UTC ----

    const WEEK = 7 * 86400000;
    /** Start (ms) of the cycle containing time t (ms). */
    function cycleStart(t) {
        const d = new Date(t);
        // Thursday = 4
        const back = (d.getUTCDay() - 4 + 7) % 7;
        let start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, 7, 0, 0);
        if (start > t) start -= WEEK;
        return start;
    }
    const cycleEnd = t => cycleStart(t) + WEEK;
    /** "2026-10-08" (the UTC date the cycle started): a key for saving per-cycle totals. */
    const cycleKey = t => new Date(cycleStart(t)).toISOString().slice(0, 10);

    // ---- formatting ----

    function ms(iso) { const t = Date.parse(iso); return isNaN(t) ? 0 : t; }

    /** 3d 4h · 4h 12m · 12:34 */
    function duration(msLeft) {
        const s = Math.max(0, Math.round(msLeft / 1000));
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
        return `${m}:${String(s % 60).padStart(2, "0")}`;
    }

    function ago(iso) {
        const d = Date.now() - ms(iso);
        if (!iso || d < 0) return "";
        if (d < 90000) return "just now";
        if (d < 3600000) return `${Math.round(d / 60000)} min ago`;
        if (d < 172800000) return `${Math.round(d / 3600000)} h ago`;
        return `${Math.round(d / 86400000)} days ago`;
    }

    function when(iso) {
        if (!iso) return "";
        const d = new Date(ms(iso));
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${d.getDate()} ${months[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    /** "8 Oct" for a cycle key */
    function cycleLabel(key) {
        const d = new Date(Date.parse(key + "T07:00:00Z"));
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
    }

    /** "Exploited" / "Fortified" / "Stronghold" … as words (the journal sometimes runs them together) */
    const words = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");

    return {
        on: onPP, fresh, activityFor, cycleStart, cycleEnd, cycleKey, cycleLabel, duration, ago, when, ms, words,
        get system() { return system; },
    };
})();
// ---------------------------------------------------------------- end of powerplay.js

let st = store.get("cycles", {
    power: "",
    cycles: {},     // "2026-10-08" → { merits, power, rank }
    rank: 0,
});
const save = () => store.set("cycles", st);

function cycleOf(t) {
    const key = PP.cycleKey(t);
    return st.cycles[key] = st.cycles[key] || { merits: 0, power: st.power, rank: st.rank };
}

PP.on("Powerplay", e => {
    if (e.Power) st.power = e.Power;
    if (e.Rank != null) st.rank = e.Rank;
    const c = cycleOf(PP.ms(e.timestamp));
    c.power = st.power; c.rank = st.rank;
    save(); show();
});
PP.on("PowerplayRank", e => { st.rank = e.Rank || st.rank; cycleOf(PP.ms(e.timestamp)).rank = st.rank; save(); show(); });
PP.on(["PowerplayJoin", "PowerplayDefect"], e => { st.power = e.Power || e.ToPower || ""; st.rank = 1; save(); show(); });
PP.on("PowerplayLeave", e => { st.power = ""; save(); show(); });

PP.on("PowerplayMerits", e => {
    if (st.power && e.Power && e.Power !== st.power) return;
    if (e.Power) st.power = e.Power;
    const c = cycleOf(PP.ms(e.timestamp));
    c.merits += e.MeritsGained || 0;
    c.power = st.power; c.rank = st.rank;
    for (const k of Object.keys(st.cycles).sort().slice(0, -52)) delete st.cycles[k];   // keep a year
    save(); show();
});

function show() {
    const now = Date.now();
    const thisKey = PP.cycleKey(now);
    const current = (st.cycles[thisKey] || {}).merits || 0;

    // Finished cycles (with any merits) for the averages
    const done = Object.entries(st.cycles).filter(([k, c]) => k < thisKey && c.merits > 0);
    const avg = done.length ? Math.round(done.reduce((a, [, c]) => a + c.merits, 0) / done.length) : 0;
    const best = done.reduce((b, [k, c]) => c.merits > b.merits ? { key: k, merits: c.merits } : b, { key: "", merits: 0 });

    // Pace: if you keep going like this until the tick
    const start = PP.cycleStart(now), elapsed = (now - start) / (PP.cycleEnd(now) - start);
    const pace = elapsed > 0.02 && current > 0 ? Math.round(current / elapsed) : 0;

    set("current", fmt(current));
    set("avg", done.length ? fmt(avg) : "—");
    set("best", best.merits ? fmt(best.merits) : "—");
    set("bestWhen", best.key ? tr("js.week_of", "week of ") + PP.cycleLabel(best.key) : "");
    set("pace", pace ? tr("js.on_pace_for_about_this_cycle", "On pace for about {0} this cycle", fmt(pace)) : "");
    set("vsAvg", avg && current
        ? (current >= avg ? tr("js.above_your_average_already", "▲ {0} above your average already", fmt(current - avg)) : tr("js.to_go_to_reach_your_average", "{0} to go to reach your average", fmt(avg - current)))
        : "");
    set("tick", tr("js.tick_in", "Tick in ") + PP.duration(PP.cycleEnd(now) - now));
    set("progress", Math.round(elapsed * 1000) / 10);

    // Last 12 cycles, newest first (including empty weeks in between)
    const rows = [];
    for (let i = 0; i < 12; i++) {
        const key = PP.cycleKey(now - i * 7 * 86400000);
        const c = st.cycles[key];
        rows.push({ key, merits: c ? c.merits : 0, rank: c && c.rank ? tr("js.rank", "rank ") + c.rank : "", now: i === 0 });
    }
    const top = Math.max(1, ...rows.map(r => r.merits));
    set("rows", rows.map(r => ({
        label: (r.now ? "▶ " : "") + PP.cycleLabel(r.key),
        text: r.merits ? fmt(r.merits) : "—",
        rank: r.rank,
        fill: (r.merits / top) + "*", rest: (1 - r.merits / top + 0.0001) + "*",
        current: r.now,
    })));
    set("power", st.power ? st.power.toUpperCase() : tr("js.not_pledged", "Not pledged"));
}

let ticks = 0;
on("tick", () => { if (++ticks % 30 === 0) show(); });
show();
