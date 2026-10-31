// Powerplay System: the state of the system you're in, from what the game writes when you arrive.
//   FSDJump / Location / CarrierJump: ControllingPower, Powers, PowerplayState, PowerplayStateControlProgress,
//   PowerplayStateReinforcement, PowerplayStateUndermining, PowerplayConflictProgress [{ Power, ConflictProgress }]
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

let st = store.get("ppsys", { power: "", current: null, visited: [] });
const save = () => store.set("ppsys", st);

PP.on("Powerplay", e => { if (e.Power) { st.power = e.Power; save(); show(); } });
PP.on(["PowerplayJoin", "PowerplayDefect"], e => { st.power = e.Power || e.ToPower || ""; save(); show(); });
PP.on("PowerplayLeave", e => { st.power = ""; save(); show(); });
PP.on("PowerplayMerits", e => { if (e.Power && !st.power) { st.power = e.Power; save(); show(); } });

PP.on(["FSDJump", "Location", "CarrierJump"], e => {
    const sys = {
        name: e.StarSystem || "",
        at: e.timestamp,
        controller: e.ControllingPower || "",
        powers: Array.isArray(e.Powers) ? e.Powers : [],
        state: e.PowerplayState || "",
        control: typeof e.PowerplayStateControlProgress === "number" ? e.PowerplayStateControlProgress : null,
        reinforce: e.PowerplayStateReinforcement || 0,
        undermine: e.PowerplayStateUndermining || 0,
        conflict: Array.isArray(e.PowerplayConflictProgress)
            ? e.PowerplayConflictProgress.map(c => ({ power: c.Power, progress: c.ConflictProgress || 0 })) : [],
    };
    st.current = sys;
    if (sys.state || sys.controller || sys.powers.length) {
        st.visited = [sys].concat(st.visited.filter(v => v.name !== sys.name)).slice(0, 15);
    }
    save(); show();
});

const pct = x => Math.round(x * 1000) / 10;

/** What this system means for your power, in a few words. */
function verdict(s) {
    const me = st.power;
    if (!s.state && !s.controller && !s.powers.length) return { text: tr("js.no_powerplay_activity_here", "No Powerplay activity here."), kind: "dim" };
    if (!me) return { text: tr("js.pledge_to_a_power_to_see", "Pledge to a power to see what this system means for you."), kind: "dim" };
    if (s.controller === me) {
        if (s.undermine > s.reinforce) return { text: tr("js.your_power_s_system_and_it", "Your power's system, and it's being undermined harder than it's reinforced: reinforce it."), kind: "bad" };
        return { text: tr("js.your_power_s_system_reinforce_it", "Your power's system: reinforce it to strengthen the hold."), kind: "good" };
    }
    if (s.controller) return { text: tr("js.held_by_undermine_it_to_weaken", "Held by {0}: undermine it to weaken their hold.", s.controller), kind: "warn" };
    if (s.conflict.length) {
        const mine = s.conflict.find(c => c.power === me);
        const lead = s.conflict.slice().sort((a, b) => b.progress - a.progress)[0];
        if (mine) return lead.power === me
            ? { text: tr("js.contested_and_your_power_leads_keep", "Contested, and your power leads: keep acquiring."), kind: "good" }
            : { text: tr("js.contested_leads_your_power_acquire_to", "Contested: {0} leads your power. Acquire to catch up.", lead.power), kind: "warn" };
        return { text: tr("js.being_fought_over_by", "Being fought over by {0}.", s.conflict.map(c => c.power).join(", ")), kind: "" };
    }
    if (s.powers.includes(me)) return { text: tr("js.your_power_has_a_presence_here", "Your power has a presence here."), kind: "" };
    return { text: PP.words(s.state) || "Unoccupied.", kind: "dim" };
}

function show() {
    const s = st.current;
    set("power", st.power ? tr("js.pledged", "Pledged: ") + st.power : tr("js.not_pledged", "Not pledged"));
    if (!s) {
        set("system", "—"); set("controller", ""); set("state", ""); set("verdict", tr("js.waiting_for_your_location", "Waiting for your location…")); set("kind", "dim");
        set("hasControl", false); set("hasFight", false); set("conflict", []); set("others", "");
    } else {
        set("system", s.name || "—");
        set("controller", s.controller ? s.controller.toUpperCase() : (s.state ? "" : tr("js.no_controlling_power", "NO CONTROLLING POWER")));
        set("mine", !!st.power && s.controller === st.power);
        set("state", PP.words(s.state));
        const v = verdict(s);
        set("verdict", v.text); set("kind", v.kind);

        set("hasControl", s.control != null);
        set("control", s.control != null ? Math.min(100, Math.max(0, pct(s.control))) : 0);
        set("controlText", s.control != null ? `${pct(s.control)}%` : "");

        const fight = s.reinforce + s.undermine;
        set("hasFight", fight > 0);
        set("reinforce", fmt(s.reinforce));
        set("undermine", fmt(s.undermine));
        set("rFill", (fight ? s.reinforce / fight : 0.5) + "*");
        set("uFill", (fight ? s.undermine / fight : 0.5) + "*");

        const lead = Math.max(0.0001, ...s.conflict.map(c => c.progress));
        set("conflict", s.conflict.slice().sort((a, b) => b.progress - a.progress).map(c => ({
            power: c.power, text: `${pct(c.progress)}%`, mine: c.power === st.power,
            fill: Math.min(1, c.progress) + "*", rest: Math.max(0.0001, 1 - Math.min(1, c.progress)) + "*",
        })));
        const others = s.powers.filter(p => p !== s.controller);
        set("others", others.length ? tr("js.also_present", "Also present: ") + others.join(", ") : "");
    }
    set("visited", st.visited.slice(s ? 1 : 0, 12).map(v => ({
        name: v.name, when: PP.ago(v.at),
        what: v.controller ? `${v.controller} · ${PP.words(v.state)}` : v.conflict.length ? "Contested" : PP.words(v.state) || "—",
        mine: !!st.power && v.controller === st.power,
    })));
}

show();
