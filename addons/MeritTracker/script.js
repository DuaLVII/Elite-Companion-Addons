// Merits: how many, how fast, and from what.
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

let st = store.get("merits", {
    power: "",
    cycles: {},        // "2026-10-08" → merits that cycle
    days: {},          // local "2026-10-15" → merits that day
    acts: {},          // cycle key → { "Bounty hunting": 1200, … }
    recent: [],        // newest first: { at, n, what, system }
});
const save = () => store.set("merits", st);

const localDay = t => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// This game session (since the latest LoadGame): not saved
let sessionStart = null, sessionMerits = 0;
on("LoadGame", e => { sessionStart = Date.parse(e.timestamp) || Date.now(); sessionMerits = 0; show(); });

PP.on("Powerplay", e => { if (e.Power) st.power = e.Power; save(); });
PP.on(["PowerplayJoin", "PowerplayDefect"], e => { st.power = e.Power || e.ToPower || ""; save(); show(); });
PP.on("PowerplayLeave", e => { st.power = ""; save(); show(); });

PP.on("PowerplayMerits", (e, live) => {
    if (st.power && e.Power && e.Power !== st.power) return;
    if (e.Power) st.power = e.Power;
    const n = e.MeritsGained || 0;
    const t = PP.ms(e.timestamp);
    const cycle = PP.cycleKey(t), day = localDay(t);
    const what = PP.activityFor(e);

    st.cycles[cycle] = (st.cycles[cycle] || 0) + n;
    st.days[day] = (st.days[day] || 0) + n;
    (st.acts[cycle] = st.acts[cycle] || {})[what] = (st.acts[cycle][what] || 0) + n;
    st.recent.unshift({ at: e.timestamp, n, what, system: PP.system });
    if (st.recent.length > 60) st.recent.length = 60;
    if (sessionStart != null && t >= sessionStart) sessionMerits += n;

    // Keep the saved history tidy: ~6 months of cycles, 60 days
    for (const k of Object.keys(st.cycles).sort().slice(0, -26)) { delete st.cycles[k]; delete st.acts[k]; }
    for (const k of Object.keys(st.days).sort().slice(0, -60)) delete st.days[k];

    save();
    if (live) metric("pp.cycle", st.cycles[cycle], tr("js.merits_this_cycle", "Merits this cycle"), "");
    show();
});

function show() {
    const now = Date.now();
    const cycle = PP.cycleKey(now);
    const cycleMerits = st.cycles[cycle] || 0;
    const today = st.days[localDay(now)] || 0;

    set("power", st.power ? st.power.toUpperCase() : tr("js.not_pledged", "Not pledged"));
    set("cycle", fmt(cycleMerits));
    set("today", fmt(today));
    set("session", sessionStart != null ? fmt(sessionMerits) : "—");

    const hours = sessionStart != null ? (now - sessionStart) / 3600000 : 0;
    set("rate", hours > 0.05 && sessionMerits > 0 ? `${fmt(Math.round(sessionMerits / hours))} / h` : "—");
    set("tick", tr("js.cycle_ends_in", "Cycle ends in ") + PP.duration(PP.cycleEnd(now) - now));

    // What earned them this cycle, biggest first
    const acts = Object.entries(st.acts[cycle] || {}).sort((a, b) => b[1] - a[1]);
    const top = acts.length ? acts[0][1] : 1;
    set("acts", acts.map(([name, n]) => ({
        name, text: fmt(n), pct: cycleMerits ? Math.round(n * 100 / cycleMerits) + "%" : "",
        fill: (n / top) + "*", rest: (1 - n / top + 0.0001) + "*",
    })));
    set("hasActs", acts.length > 0);

    set("recent", st.recent.slice(0, 25).map(r => ({
        when: PP.when(r.at), n: "+" + fmt(r.n), what: r.what, system: r.system || "",
    })));
    set("empty", st.recent.length ? "" : tr("js.no_merits_yet_they_re_picked", "No merits yet. They're picked up from the last few weeks of journals at startup, and live as you earn them."));
}

// Start the graph from where the cycle is now
metric("pp.cycle", st.cycles[PP.cycleKey(Date.now())] || 0, tr("js.merits_this_cycle", "Merits this cycle"), "");
let ticks = 0;
on("tick", () => { if (++ticks % 30 === 0) show(); });
show();
