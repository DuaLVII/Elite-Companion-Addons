// Powerplay Log: one line per Powerplay event, newest first, kept between sessions (last 120).
include("_shared/powerplay.js");

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
