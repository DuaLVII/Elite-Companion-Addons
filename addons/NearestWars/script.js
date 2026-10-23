// Nearest Wars: where the fighting is.
//
// Two sources:
//   Spansh (through the app):  a system search for any faction at war / in civil war / in an election, nearest first,
//       with the factions involved. It only knows what players have uploaded, so states can be a day or two old.
//   Your journals:  FSDJump / Location list every conflict in the system you arrive in, exactly: war type, the two
//       sides, what's at stake and days won. Kept for 7 days as "seen by you".

wantHistory();

const RADII = [20, 40, 60, 100];
let opts = store.get("opts", { radius: 40, elections: false, auto: false });
let seen = store.get("seen", {});            // system → { at, pos, conflicts: [...] }
let results = store.get("results2", null);   // the last Spansh search: { from, at, radius, systems: [...] }
let here = { system: "", pos: null, conflicts: [] };
let busy = false, status = "";
const save = () => { store.set("opts", opts); store.set("seen", seen); store.set("results2", results); };

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

// ---- Spansh: the nearest ones ----
//
// Spansh's system search can filter on the state of *any* faction in a system (not just the controlling one), sorted
// by distance from you, and its answer already says who's in what state. It needs a POST, which addons can make with
// web.spanshSearch (Elite Companion 1.1 and newer).

function search() {
    const from = here.system || game.StarSystem;
    if (!from || from === "—") { status = tr("js.where_unknown", "Your location isn't known yet: jump or log in first."); show(); return; }
    if (typeof web.spanshSearch !== "function") { status = tr("js.needs_app", "This needs a newer Elite Companion (one with Spansh searches). Update the app, then try again."); show(); return; }
    if (busy) return;
    busy = true;
    status = tr("js.asking_spansh", "Asking Spansh for wars within {0} ly of {1}…", opts.radius, from);
    show();
    const radius = opts.radius;
    web.spanshSearch("systems", {
        filters: {
            minor_faction_presences: [{ state: { value: ["War", "Civil War", "Election"] } }],
            distance: { min: "0", max: String(radius) },
        },
        sort: [{ distance: { direction: "asc" } }],
        size: 50,
        page: 0,
        reference_system: from,
    }, (data, error) => {
        busy = false;
        if (error || !data || !Array.isArray(data.results)) {
            status = error ? tr("js.spansh_error", "Couldn't search Spansh: {0}", error) : tr("js.spansh_odd", "Spansh's answer wasn't what was expected; try again in a minute.");
            show(); return;
        }
        const systems = [];
        for (const r of data.results) {
            const sides = { war: [], civil: [], election: [] };
            for (const f of r.minor_faction_presences || []) {
                const states = [f.state].concat((f.active_states || []).map(x => typeof x === "string" ? x : (x && (x.name || x.state)) || ""));
                const kinds = new Set(states.map(st => WAR(st || "")).filter(Boolean));
                let inf = Number(f.influence) || 0;
                if (inf <= 1) inf *= 100;
                for (const k of kinds) sides[k].push({ name: f.name || "?", inf: Math.round(inf * 10) / 10 });
            }
            const kind = sides.war.length ? "war" : sides.civil.length ? "civil" : sides.election.length ? "election" : "";
            if (!kind) continue;
            const updated = Date.parse(r.updated_at || "") || 0;
            systems.push({
                name: r.name, kind,
                ly: typeof r.distance === "number" ? r.distance : null,
                controller: typeof r.controlling_minor_faction === "string" ? r.controlling_minor_faction : "",
                sides: sides[kind].sort((x, y) => y.inf - x.inf), updated,
            });
        }
        systems.sort((x, y) => (x.ly ?? 1e9) - (y.ly ?? 1e9));
        results = { from, at: Date.now(), radius, checked: data.count || data.results.length, systems: systems.slice(0, 25) };
        status = "";
        save();
        show();
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

    // Nearest (Spansh)
    const list = results ? results.systems.filter(s => wanted(s.kind)) : [];
    set("nearRows", list.map(s => ({
        system: s.name,
        ly: s.ly != null ? tr("js.ly", "{0} ly", s.ly.toFixed(1)) : "",
        kind: kindText(s.kind), war: s.kind === "war", civil: s.kind === "civil", election: s.kind === "election",
        sides: s.sides.length >= 2 ? `${s.sides[0].name} (${s.sides[0].inf}%)  vs  ${s.sides[1].name} (${s.sides[1].inf}%)`
             : s.sides.length === 1 ? `${s.sides[0].name} (${s.sides[0].inf}%)`
             : s.controller ? tr("js.controller", "{0} (controlling faction)", s.controller) : "",
        updated: s.updated ? tr("js.spansh_updated", "Spansh: updated {0}", ago(s.updated)) : "",
    })));
    set("nearNote", !results ? tr("js.press_search", "Press Search to find the nearest wars around you.")
        : list.length === 0 ? tr("js.none_found2", "No wars found within {0} ly of {1}. Try a bigger radius.", results.radius, results.from)
        : tr("js.searched2", "Around {0}, {1} · from Spansh, which knows what players have uploaded, so states can be a day or two old.", results.from, ago(results.at)));

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
