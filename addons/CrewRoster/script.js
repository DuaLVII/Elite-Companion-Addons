// Crew Roster: your hired NPC pilots: who's on active duty, their combat rank, what they've cost and what they're paid.
//
// From CrewHire (name, faction, combat rank, hiring cost), CrewAssign (active or on standby), CrewFire, NpcCrewRank
// (a rank-up) and NpcCrewPaidWage (their share each time you earn credits). Kept between sessions, each event counted
// once.

// ---- little helpers (kept in this file so the addon stands alone)
function cmdrName(s) {
    // "$cmdr_decorate:#name=Jameson;" → "Jameson"; plain names as they are
    const m = /#name=([^;]+);?/.exec(String(s || ""));
    return m ? m[1] : String(s || "").replace(/^\$/, "");
}
function clock(t) {
    const d = new Date(t);
    if (isNaN(d)) return "";
    const p = n => (n < 10 ? "0" : "") + n;
    return p(d.getHours()) + ":" + p(d.getMinutes());
}
function since(t) {
    const ms = Date.now() - Date.parse(t);
    if (!(ms >= 0)) return "";
    const m = Math.floor(ms / 60000);
    return m < 1 ? tr("js.just_now", "just now") : m < 60 ? tr("js.min", "{0} min", m) : m < 48 * 60 ? tr("js.h_min", "{0} h {1} min", Math.floor(m / 60), m % 60) : tr("js.days", "{0} days", Math.floor(m / 1440));
}
function left(t) {
    const ms = Date.parse(t) - Date.now();
    if (isNaN(ms)) return "";
    if (ms <= 0) return tr("js.expired", "expired");
    const m = Math.floor(ms / 60000);
    return m < 60 ? tr("js.min", "{0} min", m) : m < 48 * 60 ? tr("js.h_min", "{0} h {1} min", Math.floor(m / 60), m % 60) : tr("js.days", "{0} days", Math.floor(m / 1440));
}
/// Each event once: the same event can come again (today's journal read back at start-up, a reload).
function makeSeen(key) {
    let mark = store.get(key, { t: "", sigs: [] });
    return e => {
        const t = e.timestamp || "";
        if (!t) return true;
        const sig = JSON.stringify(e).length + ":" + (e.event || "");
        if (t < mark.t) return false;
        if (t === mark.t) { if (mark.sigs.includes(sig)) return false; mark.sigs.push(sig); }
        else mark = { t, sigs: [sig] };
        store.set(key, mark);
        return true;
    };
}


let crew = store.get("crew", {});    // id → { id, name, faction, rank, cost, hired, role, paid, paidToday, day, last }
let fired = store.get("fired", []);  // [{ name, t, paid }]
let session = 0;                      // wages this session
const seen = makeSeen("seen");
const RANKS = ["Harmless", "Mostly Harmless", "Novice", "Competent", "Expert", "Master", "Dangerous", "Deadly", "Elite"];
function rankName(r) { return typeof r === "number" ? tr("rank." + r, RANKS[r] || String(r)) : ""; }
function save() { store.set("crew", crew); store.set("fired", fired); }
function today() { return new Date().toISOString().slice(0, 10); }
function find(id, name) {
    if (id && crew[id]) return crew[id];
    return Object.values(crew).find(c => c.name === name) || null;
}

on("CrewHire", (e, replay) => {
    if (!seen(e)) return;
    const id = String(e.CrewID || e.Name);
    crew[id] = { id, name: e.Name || "", faction: e.Faction || "", rank: e.CombatRank, cost: e.Cost || 0, hired: e.timestamp || "", role: "Idle", paid: 0, paidToday: 0, day: "", last: "" };
    save(); show();
    if (!replay) notify(tr("js.n_hired", "Hired {0} ({1})", e.Name, rankName(e.CombatRank)), "info", 5);
});
on("CrewAssign", e => {
    if (!seen(e)) return;
    const c = find(String(e.CrewID || ""), e.Name);
    if (!c) { const id = String(e.CrewID || e.Name); crew[id] = { id, name: e.Name || "", faction: "", rank: null, cost: 0, hired: "", role: e.Role || "", paid: 0, paidToday: 0, day: "", last: "" }; }
    else c.role = e.Role || c.role;
    if (e.Role === "Active") for (const o of Object.values(crew)) if (o.name !== e.Name && o.role === "Active") o.role = "Idle";   // (one on duty at a time)
    save(); show();
});
on("CrewFire", e => {
    if (!seen(e)) return;
    const c = find(String(e.CrewID || ""), e.Name);
    if (c) { fired.unshift({ name: c.name, t: e.timestamp || "", paid: c.paid }); fired = fired.slice(0, 10); delete crew[c.id]; }
    save(); show();
});
on("NpcCrewRank", (e, replay) => {
    if (!seen(e)) return;
    const c = find(String(e.NpcCrewId || ""), e.NpcCrewName);
    if (c) c.rank = e.RankCombat;
    save(); show();
    if (!replay && c) notify(tr("js.n_rank", "{0} ranked up: {1}", c.name, rankName(e.RankCombat)), "info", 6);
});
on("NpcCrewPaidWage", (e, replay) => {
    if (!seen(e)) return;
    let c = find(String(e.NpcCrewId || ""), e.NpcCrewName);
    if (!c) { const id = String(e.NpcCrewId || e.NpcCrewName); c = crew[id] = { id, name: e.NpcCrewName || "", faction: "", rank: null, cost: 0, hired: "", role: "Active", paid: 0, paidToday: 0, day: "", last: "" }; }
    const amount = e.Amount || 0;
    if (amount <= 0) return;   // (the game writes 0 now and then)
    const d = (e.timestamp || "").slice(0, 10);
    if (c.day !== d) { c.day = d; c.paidToday = 0; }
    c.paid += amount; c.paidToday += amount; c.last = e.timestamp || "";
    if (!replay) session += amount;
    save(); show();
});
on("LoadGame", () => { session = 0; show(); });

function show() {
    const list = Object.values(crew).sort((a, b) => ((b.role === "Active") - (a.role === "Active")) || (b.rank || 0) - (a.rank || 0) || a.name.localeCompare(b.name));
    set("rows", list.map(c => ({
        name: c.name, active: c.role === "Active",
        role: c.role === "Active" ? tr("js.active", "ACTIVE") : tr("js.standby", "standby"),
        rank: rankName(c.rank), faction: c.faction,
        info: [c.hired ? tr("js.hired", "hired {0}", new Date(c.hired).toLocaleDateString()) : "", c.cost ? tr("js.cost", "cost {0} cr", fmt(c.cost)) : ""].filter(s => s).join(" · "),
        paid: c.paid ? tr("js.paid", "paid {0} cr", fmt(c.paid)) : tr("js.paid_none", "nothing paid yet"),
        today: c.day === today() && c.paidToday ? tr("js.today", "today {0} cr", fmt(c.paidToday)) : "",
    })));
    const total = list.reduce((s, c) => s + c.paid, 0);
    set("summary", list.length ? tr("js.summary", "{0} crew · {1} cr paid in wages", list.length, fmt(total)) + (session ? " · " + tr("js.session", "{0} cr this session", fmt(session)) : "") : "");
    set("empty", list.length ? "" : tr("js.none", "No crew yet. Hire a pilot at a station's Crew Lounge (you need a fighter hangar): they show here."));
    set("fired", fired.slice(0, 4).map(f => ({ text: tr("js.fired", "{0}: let go {1}, paid {2} cr", f.name, new Date(f.t).toLocaleDateString(), fmt(f.paid)) })));
    set("firedHead", fired.length ? tr("js.past", "FORMER CREW") : "");
}
on("language", show);
show();
