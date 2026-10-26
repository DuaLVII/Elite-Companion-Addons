// Powerplay Pledge: your power, rank, merits and the weekly cycle.
include("_shared/powerplay.js");

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
