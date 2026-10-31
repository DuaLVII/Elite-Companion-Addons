// Powerplay Log: one line per Powerplay event, newest first, kept between sessions (last 120).
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

let lines = store.get("lines", []);      // { at, icon, text, kind }
let lastCycle = store.get("lastCycle", "");
const MAX = 120;

function add(e, icon, text, kind) {
    // A line for each weekly tick between events
    const cycle = PP.cycleKey(PP.ms(e.timestamp));
    if (lastCycle && cycle > lastCycle)
        lines.unshift({ at: new Date(PP.cycleStart(PP.ms(e.timestamp))).toISOString(), icon: "⟳", text: tr("js.new_cycle_week_of", "New cycle (week of {0})", PP.cycleLabel(cycle)), kind: "tick" });
    lastCycle = cycle;
    store.set("lastCycle", lastCycle);

    lines.unshift({ at: e.timestamp, icon, text, kind: kind || "" });
    if (lines.length > MAX) lines.length = MAX;
    store.set("lines", lines);
    show();
}

const goods = e => e.Type_Localised || String(e.Type || "").replace(/^\$|_name;$/gi, "").replace(/_/g, " ");

PP.on("Powerplay", e => add(e, "▤", tr("js.logged_in_rank_merits", "Logged in: {0} · rank {1} · {2} merits", e.Power, e.Rank, fmt(e.Merits)), "dim"));
PP.on("PowerplayMerits", e => add(e, "+", tr("js.merits", "{0} merits · {1}{2} → {3}", fmt(e.MeritsGained), PP.activityFor(e), PP.system ? tr("js.in", " in {0}", PP.system) : "", fmt(e.TotalMerits)), "good"));
PP.on("PowerplayRank", (e, live) => add(e, "★", tr("js.rank_with", "Rank {0} with {1}", e.Rank, e.Power), "rank"));
PP.on("PowerplayJoin", e => add(e, "⚑", tr("js.pledged_to", "Pledged to {0}", e.Power), "rank"));
PP.on("PowerplayLeave", e => add(e, "✕", tr("js.left", "Left {0}", e.Power), "bad"));
PP.on("PowerplayDefect", e => add(e, "⇄", tr("js.defected_from_to", "Defected from {0} to {1}", e.FromPower, e.ToPower), "warn"));
PP.on("PowerplayCollect", e => add(e, "▲", tr("js.collected", "Collected {0} × {1}", fmt(e.Count), goods(e)), ""));
PP.on("PowerplayDeliver", e => add(e, "▼", tr("js.delivered", "Delivered {0} × {1}{2}", fmt(e.Count), goods(e), PP.system ? tr("js.in", " in {0}", PP.system) : ""), "good"));
PP.on("PowerplaySalary", e => add(e, "¢", tr("js.salary", "Salary {0}", short(e.Amount, "cr")), "good"));
PP.on("PowerplayVoucher", e => add(e, "¢", tr("js.vouchers_redeemed", "Vouchers redeemed{0}", e.Systems ? tr("js.for", " for {0}", [].concat(e.Systems).join(", ")) : ""), ""));
PP.on("PowerplayFastTrack", e => add(e, "»", tr("js.fast_tracked_for", "Fast-tracked for {0}", short(e.Cost, "cr")), "warn"));
PP.on("PowerplayVote", e => add(e, "✓", (e.Votes === 1 ? tr("js.one_vote", "1 vote") : tr("js.votes", "{0} votes", fmt(e.Votes))) + (e.System ? tr("js.for", " for {0}", e.System) : ""), ""));

function show() {
    set("lines", lines.map(l => ({ when: PP.when(l.at), icon: l.icon, text: l.text, kind: l.kind })));
    set("empty", lines.length ? "" : tr("js.nothing_yet_powerplay_events_from_the", "Nothing yet. Powerplay events from the last few weeks of journals appear here, and new ones as they happen."));
    set("count", lines.length ? tr("js.events", "{0} events", lines.length) : "");
}

show();
