// Merits: how many, how fast, and from what.
include("_shared/powerplay.js");

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
