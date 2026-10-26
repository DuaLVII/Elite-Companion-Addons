// Powerplay Cycles: merits per weekly cycle.
include("_shared/powerplay.js");

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
