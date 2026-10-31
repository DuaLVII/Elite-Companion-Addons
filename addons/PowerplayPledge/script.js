// Powerplay Pledge: your power, rank, merits and the weekly cycle.
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

let st = store.get("pledge", {
    power: "", rank: 0, merits: 0, pledgedSecs: 0, pledgedAt: "",   // from the login snapshot
    cycle: "", cycleMerits: 0,                                       // this cycle (from each MeritsGained)
    lastGain: null,                                                  // { at, n }
    rankUpAt: "", salary: 0,
});
const save = () => store.set("pledge", st);

function inCycle(e) {
    const key = PP.cycleKey(PP.ms(e.timestamp));
    if (st.cycle !== key) { st.cycle = key; st.cycleMerits = 0; }
}

PP.on("Powerplay", e => {
    st.power = e.Power || st.power;
    if (e.Rank != null) st.rank = e.Rank;
    if (e.Merits != null) st.merits = e.Merits;
    if (e.TimePledged != null) { st.pledgedSecs = e.TimePledged; st.pledgedAt = e.timestamp; }
    save(); show();
});

PP.on("PowerplayMerits", e => {
    if (st.power && e.Power && e.Power !== st.power) return;   // not your current power
    if (e.Power) st.power = e.Power;
    inCycle(e);
    st.cycleMerits += e.MeritsGained || 0;
    if (e.TotalMerits != null) st.merits = e.TotalMerits;
    st.lastGain = { at: e.timestamp, n: e.MeritsGained || 0 };
    save(); show();
});

PP.on("PowerplayRank", (e, live) => {
    if (e.Power) st.power = e.Power;
    const up = (e.Rank || 0) > st.rank;
    st.rank = e.Rank || st.rank;
    st.rankUpAt = e.timestamp;
    save(); show();
    if (live && up) notify(tr("js.powerplay_rank_0_1", "★ POWERPLAY RANK {0} · {1}", st.rank, st.power.toUpperCase()), "info", 8);
});

PP.on("PowerplayJoin", e => {
    st = { power: e.Power || "", rank: 1, merits: 0, pledgedSecs: 0, pledgedAt: e.timestamp,
           cycle: PP.cycleKey(PP.ms(e.timestamp)), cycleMerits: 0, lastGain: null, rankUpAt: "", salary: 0 };
    save(); show();
});
PP.on("PowerplayDefect", e => {
    st = { power: e.ToPower || "", rank: 1, merits: 0, pledgedSecs: 0, pledgedAt: e.timestamp,
           cycle: PP.cycleKey(PP.ms(e.timestamp)), cycleMerits: 0, lastGain: null, rankUpAt: "", salary: 0 };
    save(); show();
});
PP.on("PowerplayLeave", e => {
    st.power = ""; st.rank = 0; st.merits = 0; st.cycleMerits = 0; st.pledgedSecs = 0; st.pledgedAt = "";
    save(); show();
});
PP.on("PowerplaySalary", e => { st.salary = e.Amount || 0; save(); show(); });

function pledgedFor() {
    if (!st.pledgedAt) return "";
    const secs = st.pledgedSecs + Math.max(0, (Date.now() - PP.ms(st.pledgedAt)) / 1000);
    const days = Math.floor(secs / 86400);
    return days >= 1 ? (days === 1 ? tr("js.one_day", "1 day") : tr("js.days", "{0} days", fmt(days))) : `${Math.floor(secs / 3600)} h`;
}

function show() {
    const now = Date.now();
    // A new cycle may have started since the last merit
    if (st.cycle && st.cycle !== PP.cycleKey(now)) { st.cycle = PP.cycleKey(now); st.cycleMerits = 0; save(); }

    set("pledged", !!st.power);
    set("power", st.power ? st.power.toUpperCase() : tr("js.not_pledged", "NOT PLEDGED"));
    set("hint", st.power ? "" : tr("js.pledge_to_a_power_in_the", "Pledge to a power in the game (Powerplay screen). Your rank and merits show up here at your next login, or when you first earn merits."));
    set("rank", st.power ? String(st.rank || "—") : "—");
    set("merits", st.power ? fmt(st.merits) : "—");
    set("cycle", st.power ? fmt(st.cycleMerits) : "—");
    set("pledgedFor", pledgedFor());
    set("tick", PP.duration(PP.cycleEnd(now) - now));
    set("lastGain", st.lastGain ? tr("js.last_merits", "Last: +{0} merits {1}", fmt(st.lastGain.n), PP.ago(st.lastGain.at)) : "");
    set("rankUp", st.rankUpAt ? tr("js.rank_reached", "Rank {0} reached {1}", st.rank, PP.ago(st.rankUpAt)) : "");
    set("salary", st.salary ? tr("js.last_salary", "Last salary {0}", short(st.salary, "cr")) : "");
}

on("tick", () => show());
show();
