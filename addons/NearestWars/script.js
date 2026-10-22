// Nearest Wars: where the fighting is.
//
// Two sources:
//   EDSM (through the app):  api-v1/sphere-systems with showInformation lists the systems around you with their
//       controlling faction's state; the ones at war / in civil war (/ elections) are kept, nearest first. Then, for
//       the nearest few, api-system-v1/factions says which factions are in the conflict and how fresh that is.
//       It only knows what players have uploaded, and only the controlling faction's state from the first call,
//       so a war between two smaller factions may only show up in your journals.
//   Your journals:  FSDJump / Location list every conflict in the system you arrive in, exactly: war type, the two
//       sides, what's at stake and days won. Kept for 7 days as "seen by you".

wantHistory();

const RADII = [20, 40, 60, 100];
let opts = store.get("opts", { radius: 40, elections: false, auto: false });
let seen = store.get("seen", {});            // system → { at, pos, conflicts: [...] }
let results = store.get("results", null);    // the last EDSM search: { from, at, radius, systems: [...] }
let here = { system: "", pos: null, conflicts: [] };
let busy = false, status = "";
const save = () => { store.set("opts", opts); store.set("seen", seen); store.set("results", results); };

const WAR = s => /civil\s*war/i.test(s) ? "civil" : /war/i.test(s) ? "war" : /election/i.test(s) ? "election" : "";
const wanted = kind => kind === "war" || kind === "civil" || (kind === "election" && opts.elections);
const dist = (a, b) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null;

function ago(ms) {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return m < 60 ? tr("js.m_ago", "{0}m ago", m) : m < 1440 ? tr("js.h_ago", "{0}h ago", Math.round(m / 60)) : tr("js.d_ago", "{0}d ago", Math.round(m / 1440));
}

// ---- your journals: exact conflicts where you've been ----

function arrived(e, replay) {
    const pos = Array.isArray(e.StarPos) ? e.StarPos : null;
    const conflicts = (e.Conflicts || []).map(c => ({
        kind: WAR(c.WarType || ""),
        status: c.Status || "",
        a: (c.Faction1 || {}).Name || "?", aStake: (c.Faction1 || {}).Stake || "", aWon: (c.Faction1 || {}).WonDays || 0,
        b: (c.Faction2 || {}).Name || "?", bStake: (c.Faction2 || {}).Stake || "", bWon: (c.Faction2 || {}).WonDays || 0,
    })).filter(c => c.kind);
    here = { system: e.StarSystem || "", pos, conflicts };
    if (conflicts.length) seen[here.system] = { at: Date.parse(e.timestamp) || Date.now(), pos, conflicts };
    else delete seen[here.system];   // over (or never was)
    const week = Date.now() - 7 * 86400000;
    for (const s of Object.keys(seen)) if (seen[s].at < week) delete seen[s];
    save();
    if (!replay && opts.auto && results && results.from !== here.system) search();
    show();
}
on("FSDJump", arrived);
on("Location", arrived);
on("CarrierJump", arrived);

// ---- EDSM: the nearest ones ----

// EDSM's big "systems within N ly" answers can make it give up (503 Service Unavailable), so the search goes out in
// shells: 0–15 ly, 15–25, 25–35… Each answer is small, results show as they come, and it stops once it has plenty.
// A shell that fails is tried again after a pause, then split in two; if EDSM is still busy, what's found so far stays.
const ENOUGH = 12;
let job = null;       // { from, shells: [[min, max]], found: [], checked, tries, retryAt }

function search() {
    const from = here.system || game.StarSystem;
    if (!from || from === "—") { status = tr("js.where_unknown", "Your location isn't known yet: jump or log in first."); show(); return; }
    if (busy) return;
    const shells = [];
    for (let r = 0; r < opts.radius; ) { const next = Math.min(opts.radius, r === 0 ? 15 : r + 10); shells.push([r, next]); r = next; }
    job = { from, shells, found: [], checked: 0, tries: 0, retryAt: 0 };
    results = { from, at: Date.now(), radius: opts.radius, checked: 0, systems: [] };
    busy = true;
    nextShell();
}

function nextShell() {
    if (!job) return;
    if (job.shells.length === 0 || job.found.length >= ENOUGH) { finish(""); return; }
    const [min, max] = job.shells[0];
    status = tr("js.asking_shell", "Asking EDSM: {0}–{1} ly from {2}…", min, max, job.from);
    show();
    const mine = job;
    web.edsm("api-v1/sphere-systems", { systemName: job.from, minRadius: min, radius: max, showInformation: 1 }, (data, error) => {
        if (mine !== job) return;   // a newer search started
        if (error || !Array.isArray(data)) {
            if (!error && job.checked === 0 && min === 0) { finish(tr("js.edsm_unknown", "EDSM doesn't know {0} yet.", job.from)); return; }
            job.tries++;
            if (job.tries === 1) { job.retryAt = Date.now() + 6000; status = tr("js.edsm_busy_retry", "EDSM is busy ({0}); trying again in a moment…", error || "?"); show(); return; }
            if (job.tries === 2 && max - min > 5) {
                const mid = Math.round((min + max) / 2);
                job.shells.splice(0, 1, [min, mid], [mid, max]);
                job.retryAt = Date.now() + 6000; show(); return;
            }
            finish(tr("js.edsm_busy", "EDSM is busy or down ({0}). Showing what was found so far; try again in a minute.", error || "?"));
            return;
        }
        job.tries = 0;
        job.shells.shift();
        job.checked += data.length;
        for (const s of data) {
            const kind = WAR((s.information || {}).factionState || "");
            if (kind) job.found.push({ name: s.name, ly: typeof s.distance === "number" ? s.distance : null, kind,
                                       controller: (s.information || {}).faction || "", sides: [], updated: 0 });
        }
        job.found.sort((a, b) => (a.ly ?? 1e9) - (b.ly ?? 1e9));
        results = { from: job.from, at: Date.now(), radius: max, checked: job.checked, systems: job.found.slice(0, 25) };
        save();
        show();
        nextShell();
    });
}

function finish(message) {
    busy = false;
    status = message;
    if (job) results = { from: job.from, at: Date.now(), radius: results ? results.radius : opts.radius, checked: job.checked, systems: job.found.slice(0, 25) };
    job = null;
    save();
    show();
    if (results && results.systems.length) details(results, 0);
}

// retries wait a few seconds (scripts have no timers, so the tick checks)
on("tick", () => { if (job && job.retryAt && Date.now() >= job.retryAt) { job.retryAt = 0; nextShell(); } });

// Who's fighting: the factions in that state, for the nearest 8 (one request each, the app spaces them out)
function details(res, i) {
    if (res !== results || i >= Math.min(8, res.systems.length)) return;
    const sys = res.systems[i];
    web.edsm("api-system-v1/factions", { systemName: sys.name }, (data, error) => {
        if (res !== results) return;
        if (!error && data && Array.isArray(data.factions)) {
            const states = f => [f.state || ""].concat((f.activeStates || []).map(x => x.state || ""), (f.pendingStates || []).map(x => x.state || ""));
            sys.sides = data.factions
                .filter(f => states(f).some(st => wanted(WAR(st)) && WAR(st) === sys.kind))
                .sort((a, b) => (b.influence || 0) - (a.influence || 0))
                .map(f => ({ name: f.name, inf: Math.round((f.influence || 0) * 1000) / 10 }));
            sys.updated = Math.max(0, ...data.factions.map(f => (f.lastUpdate || 0) * 1000));
            save();
            show();
        }
        details(res, i + 1);
    });
}

// ---- buttons ----

on("click:search", () => search());
on("click:radius", () => { opts.radius = RADII[(RADII.indexOf(opts.radius) + 1) % RADII.length]; save(); show(); });
on("click:elections", () => { opts.elections = !opts.elections; save(); show(); });
on("click:auto", () => { opts.auto = !opts.auto; save(); show(); });

on("tick", () => { if (Date.now() % 60000 < 1000) show(); });   // keep "x min ago" fresh

// ---- the view ----

function kindText(k) {
    return k === "civil" ? tr("js.civil_war", "CIVIL WAR") : k === "election" ? tr("js.election", "ELECTION") : tr("js.war", "WAR");
}

function show() {
    set("from", here.system || game.StarSystem || "—");
    set("radiusText", tr("js.within", "Within {0} ly", opts.radius));
    set("electionsText", opts.elections ? tr("js.elections_on", "✓ Elections") : tr("js.elections_off", "Elections"));
    set("autoText", opts.auto ? tr("js.auto_on", "✓ After each jump") : tr("js.auto_off", "After each jump"));
    set("busy", busy);
    set("status", status);

    // Here (exact, from the journal)
    set("hereRows", here.conflicts.filter(c => wanted(c.kind)).map(c => row(c)));
    set("hereNone", here.system && !here.conflicts.some(c => wanted(c.kind)) ? tr("js.here_none", "No conflicts in {0}.", here.system) : "");

    // Nearest (EDSM)
    const list = results ? results.systems.filter(s => wanted(s.kind)) : [];
    set("nearRows", list.map(s => ({
        system: s.name,
        ly: s.ly != null ? tr("js.ly", "{0} ly", s.ly.toFixed(1)) : "",
        kind: kindText(s.kind), war: s.kind === "war", civil: s.kind === "civil", election: s.kind === "election",
        sides: s.sides.length >= 2 ? `${s.sides[0].name} (${s.sides[0].inf}%)  vs  ${s.sides[1].name} (${s.sides[1].inf}%)`
             : s.sides.length === 1 ? `${s.sides[0].name} (${s.sides[0].inf}%)`
             : s.controller ? tr("js.controller", "{0} (controlling faction)", s.controller) : "",
        updated: s.updated ? tr("js.edsm_updated", "EDSM: updated {0}", ago(s.updated)) : "",
    })));
    set("nearNote", !results ? tr("js.press_search", "Press Search to find the nearest wars around you.")
        : list.length === 0 ? tr("js.none_found", "No wars found within {0} ly of {1} (EDSM checked {2} systems). Try a bigger radius.", results.radius, results.from, fmt(results.checked || 0))
        : tr("js.searched", "Around {0}, {1} · EDSM knows what players have uploaded, so states can be a few days old.", results.from, ago(results.at)));

    // Seen by you (exact, last 7 days), nearest first when positions are known
    const seenRows = Object.keys(seen).filter(s => s !== here.system).flatMap(s => {
        const d = dist(seen[s].pos, here.pos);
        return seen[s].conflicts.filter(c => wanted(c.kind)).map(c => ({ ...row(c), system: s, ly: d != null ? tr("js.ly", "{0} ly", d.toFixed(1)) : "", when: ago(seen[s].at), order: d ?? 1e9 }));
    }).sort((a, b) => a.order - b.order).slice(0, 12);
    set("seenRows", seenRows);
}

function row(c) {
    return {
        kind: kindText(c.kind), war: c.kind === "war", civil: c.kind === "civil", election: c.kind === "election",
        status: c.status === "active" ? tr("js.active", "active") : c.status === "pending" ? tr("js.pending", "pending") : c.status,
        a: c.a, b: c.b,
        score: `${c.aWon} – ${c.bWon}`,
        stakes: [c.aStake && tr("js.stake", "{0} stakes {1}", c.a, c.aStake), c.bStake && tr("js.stake", "{0} stakes {1}", c.b, c.bStake)].filter(Boolean).join(" · "),
    };
}

show();
