// Mining Hotspots: the nearest ring hotspots for a commodity.
//
// Two sources:
//   Spansh (through the app):  a body search for rings with hotspots of the commodity, nearest first from your system
//       (or one you type). It only knows what players have uploaded, so a ring nobody has mapped won't show.
//   Your journals:  every ring you map with probes writes SAASignalsFound with its hotspots, exactly. Kept, so the
//       module remembers every hotspot you've ever found.

wantHistory();

// The hotspot commodities (as Spansh and the game's English names spell them).
const KINDS = [
    "Platinum", "Painite", "Low Temperature Diamonds", "Void Opals", "Osmium", "Tritium",
    "Alexandrite", "Benitoite", "Bromellite", "Grandidierite", "Monazite", "Musgravite", "Rhodplumsite", "Serendibite",
    "Gold", "Silver", "Palladium", "Samarium", "Praseodymium", "Bertrandite", "Indite", "Gallite", "Coltan",
    "Uraninite", "Lepidolite", "Rutile", "Bauxite",
];
const RADII = [25, 50, 100, 200, 500];

let opts = store.get("opts", { commodity: "Platinum", radius: 100, min: 1, pristine: false, auto: false });
let results = store.get("results", null);   // the last search: { commodity, from, at, radius, min, pristine, hits: [...] }
let mapped = store.get("mapped", {});       // ring name → { system, at, signals: { Platinum: 2, … } }
let rings = store.get("rings", {});         // ring name → { type, reserve }  (from Scan)
let places = store.get("places", {});       // system → [x, y, z]  (for distances to what you mapped)
let here = { system: "", pos: null };
let busy = false, status = "", picking = false, searchedFor = "";
const save = () => { store.set("opts", opts); store.set("results", results); store.set("mapped", mapped); store.set("rings", rings); store.set("places", places); };

// ---- names: the journal says "LowTemperatureDiamond" / "Opal", Spansh may say either ----

const norm = s => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const ALIASES = {
    lowtemperaturediamond: "Low Temperature Diamonds", lowtemperaturediamonds: "Low Temperature Diamonds", ltd: "Low Temperature Diamonds",
    opal: "Void Opals", opals: "Void Opals", voidopal: "Void Opals", voidopals: "Void Opals",
};
function nice(name, localised) {
    for (const n of [name, localised]) {
        const k = norm(n);
        if (!k) continue;
        if (ALIASES[k]) return ALIASES[k];
        const known = KINDS.find(x => norm(x) === k);
        if (known) return known;
    }
    const t = String(localised || name || "");
    return t.charAt(0).toUpperCase() + t.slice(1);
}
const same = (a, b) => nice(a) === nice(b);

const RING_TYPES = { icy: "Icy", rocky: "Rocky", metalrich: "Metal Rich", metallic: "Metallic" };
const ringType = t => RING_TYPES[norm(String(t || "").replace(/^eRingClass_/i, ""))] || String(t || "");
const reserveName = r => {
    const k = norm(r).replace(/resources$/, "");
    return k === "pristine" ? tr("js.pristine", "Pristine") : k === "major" ? tr("js.major", "Major") : k === "common" ? tr("js.common", "Common")
         : k === "low" ? tr("js.low", "Low") : k === "depleted" ? tr("js.depleted", "Depleted") : String(r || "");
};

const dist = (a, b) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null;
function ago(ms) {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return m < 60 ? tr("js.m_ago", "{0}m ago", m) : m < 1440 ? tr("js.h_ago", "{0}h ago", Math.round(m / 60)) : tr("js.d_ago", "{0}d ago", Math.round(m / 1440));
}

// ---- your journals ----

function arrived(e, replay) {
    here = { system: e.StarSystem || "", pos: Array.isArray(e.StarPos) ? e.StarPos : null };
    if (here.system && here.pos) places[here.system] = here.pos;
    if (!replay) {
        save();
        if (opts.auto && !typed()) search();
    }
    show();
}
on("FSDJump", arrived);
on("Location", arrived);
on("CarrierJump", arrived);

// Ring type and reserve, from the scan of the body the rings belong to
on("Scan", (e, replay) => {
    if (!Array.isArray(e.Rings)) return;
    for (const r of e.Rings) {
        if (!r || !/ring$/i.test(r.Name || "")) continue;   // belts aren't mined for hotspots
        rings[r.Name] = { type: ringType(r.RingClass), reserve: e.ReserveLevel || "" };
    }
    if (!replay) save();
});

// The hotspots of a ring you mapped
on("SAASignalsFound", (e, replay) => {
    const name = e.BodyName || "";
    if (!/ring$/i.test(name) || !Array.isArray(e.Signals)) return;
    const signals = {};
    for (const s of e.Signals) {
        if (!s || /^\$SAA_SignalType/i.test(s.Type || "")) continue;
        signals[nice(s.Type, s.Type_Localised)] = Number(s.Count) || 1;
    }
    if (!Object.keys(signals).length) return;
    const system = here.system && name.startsWith(here.system) ? here.system : (e.StarSystem || here.system || name.replace(/\s+[A-Z]\s+Ring$/i, ""));
    mapped[name] = { system, at: Date.parse(e.timestamp) || Date.now(), signals };
    if (!replay) { save(); show(); }
});

// ---- Spansh: the nearest ones ----
//
// A body search: bodies with a ring that has at least `min` hotspots of the commodity, nearest first. The filter's
// exact shape is Spansh's to decide; if it's ignored Spansh answers with any bodies, which we notice (none of them has
// the hotspots) and then try the other spelling of the filter.

function typed() { return String(get("ref") || "").trim(); }
function reference() { return typed() || here.system || game.StarSystem || ""; }

function request(from, shape) {
    const want = { comparison: "<=>", count: [opts.min, 999] };
    const filters = {
        distance: { min: "0", max: String(opts.radius) },
        ring_signals: [shape === 0 ? { name: [opts.commodity], ...want } : { name: opts.commodity, comparison: "<=>", value: [opts.min, 999] }],
    };
    if (opts.pristine) filters.reserve_level = { value: ["Pristine"] };
    return { filters, sort: [{ distance: { direction: "asc" } }], size: 100, page: 0, reference_system: from };
}

// The hotspots of a ring in Spansh's answer, as { Platinum: 2, … } (taking any of the shapes it might come in)
function signalsOf(ring) {
    let s = ring && (ring.signals ?? ring.ring_signals ?? ring.hotspots);
    if (s && !Array.isArray(s) && typeof s === "object" && s.signals && typeof s.signals === "object") s = s.signals;
    const out = {};
    if (Array.isArray(s)) {
        for (const x of s) {
            if (!x) continue;
            const n = nice(x.name || x.type || x.Type, x.Type_Localised);
            if (/^\$SAA_/i.test(n)) continue;
            out[n] = (out[n] || 0) + (Number(x.count ?? x.Count ?? x.value) || 1);
        }
    } else if (s && typeof s === "object") {
        for (const k of Object.keys(s)) if (!/^\$SAA_/i.test(k) && typeof s[k] !== "object") out[nice(k)] = Number(s[k]) || 1;
    }
    return out;
}

function hitsIn(data) {
    const hits = [];
    for (const b of data.results) {
        for (const ring of b.rings || []) {
            const signals = signalsOf(ring);
            const key = Object.keys(signals).find(k => same(k, opts.commodity));
            if (!key || signals[key] < opts.min) continue;
            if (opts.pristine && b.reserve_level && norm(b.reserve_level).indexOf("pristine") < 0) continue;
            hits.push({
                system: b.system_name || String(b.name || "").replace(/\s+\S+$/, ""),
                ring: ring.name || b.name || "",
                type: ringType(ring.type),
                reserve: b.reserve_level || "",
                count: signals[key],
                others: Object.keys(signals).filter(k => k !== key).map(k => signals[k] > 1 ? `${k} ×${signals[k]}` : k),
                ly: typeof b.distance === "number" ? b.distance : null,
                arrival: typeof b.distance_to_arrival === "number" ? b.distance_to_arrival : null,
                updated: Date.parse(ring.signals_updated_at || b.updated_at || "") || 0,
            });
        }
    }
    hits.sort((x, y) => (x.ly ?? 1e9) - (y.ly ?? 1e9) || y.count - x.count);
    return hits;
}

function search(shape = 0) {
    const from = reference();
    if (!from || from === "—") { status = tr("js.where_unknown", "Your location isn't known yet: jump or log in first, or type a system."); show(); return; }
    if (typeof web.spanshSearch !== "function") { status = tr("js.needs_app", "This needs a newer Elite Companion (one with Spansh searches). Update the app, then try again."); show(); return; }
    if (busy && shape === 0) return;
    busy = true;
    searchedFor = from;
    status = tr("js.asking_spansh", "Asking Spansh for {0} hotspots within {1} ly of {2}…", opts.commodity, opts.radius, from);
    show();
    const asked = { commodity: opts.commodity, radius: opts.radius, min: opts.min, pristine: opts.pristine };
    web.spanshSearch("bodies", request(from, shape), (data, error) => {
        if (error || !data || !Array.isArray(data.results)) {
            busy = false;
            status = error ? tr("js.spansh_error", "Couldn't search Spansh: {0}", error) : tr("js.spansh_odd", "Spansh's answer wasn't what was expected; try again in a minute.");
            show(); return;
        }
        const hits = hitsIn(data);
        if (!hits.length && data.results.length) {
            // Bodies came back, but none with these hotspots: the filter wasn't understood
            if (shape === 0) { search(1); return; }
            busy = false;
            const first = data.results[0] || {}, ring = (first.rings || [])[0];
            status = tr("js.filter_ignored", "Spansh answered, but not with hotspot rings, so its search may have changed. (First answer: {0}; ring fields: {1})",
                first.name || "?", ring ? Object.keys(ring).join(", ") : tr("js.no_rings", "no rings"));
            results = null;
            show(); return;
        }
        busy = false;
        results = { ...asked, from, at: Date.now(), checked: data.count || data.results.length, hits: hits.slice(0, 40) };
        status = "";
        save();
        show();
    });
}

// ---- buttons ----

on("click:search", () => search());
on("click:pick", () => { picking = !picking; show(); });
on("click:choose", item => {
    if (!item || !item.name) return;
    opts.commodity = item.name;
    picking = false;
    save();
    if (results) search(); else show();
});
on("click:radius", () => { opts.radius = RADII[(RADII.indexOf(opts.radius) + 1) % RADII.length]; save(); show(); });
on("click:min", () => { opts.min = opts.min >= 3 ? 1 : opts.min + 1; save(); show(); });
on("click:pristine", () => { opts.pristine = !opts.pristine; save(); show(); });
on("click:auto", () => { opts.auto = !opts.auto; save(); show(); });
on("change:ref", () => show());

on("tick", () => { if (Date.now() % 60000 < 1000) show(); });   // keep "x min ago" fresh

// ---- the view ----

function countText(n) { return n > 1 ? tr("js.overlap", "×{0}", n) : tr("js.one", "×1"); }
const ly = d => d != null ? tr("js.ly", "{0} ly", d < 10 ? d.toFixed(2) : d.toFixed(1)) : "";
const ls = d => d != null ? tr("js.ls", "{0} ls", Math.round(d).toLocaleString()) : "";

function show() {
    const from = reference();
    set("from", from || "—");
    set("pickText", (picking ? "▴ " : "▾ ") + opts.commodity);
    set("picking", picking);
    const extra = Object.values(mapped).flatMap(m => Object.keys(m.signals)).filter((k, i, a) => !KINDS.includes(k) && a.indexOf(k) === i);
    set("kinds", KINDS.concat(extra).map(name => ({ name, on: name === opts.commodity })));
    set("radiusText", tr("js.within", "Within {0} ly", opts.radius));
    set("minText", opts.min > 1 ? tr("js.min_on", "✓ {0}+ overlapping", opts.min) : tr("js.min_off", "Any count"));
    set("pristineText", opts.pristine ? tr("js.pristine_on", "✓ Pristine only") : tr("js.pristine_off", "Pristine only"));
    set("autoText", opts.auto ? tr("js.auto_on", "✓ After each jump") : tr("js.auto_off", "After each jump"));
    set("busy", busy);
    set("status", status);

    // Nearest (Spansh)
    const current = results && results.commodity === opts.commodity;
    const list = current ? results.hits.filter(h => h.count >= opts.min) : [];
    set("nearRows", list.map(h => ({
        system: h.system,
        ly: ly(h.ly),
        count: countText(h.count), overlap: h.count > 1,
        ring: h.ring,
        detail: [h.type, reserveName(h.reserve), ls(h.arrival)].filter(Boolean).map(x => "  ·  " + x).join(""),
        others: [h.others.length ? tr("js.also", "Also: {0}", h.others.join(", ")) : "", h.updated ? tr("js.spansh_updated", "Spansh: updated {0}", ago(h.updated)) : ""].filter(Boolean).join("   "),
    })));
    set("nearNote", !results ? tr("js.press_search", "Pick a commodity and press Search for the nearest hotspots.")
        : !current ? tr("js.search_again", "Press Search to look for {0}.", opts.commodity)
        : list.length === 0 ? tr("js.none_found", "No {0} hotspots known within {1} ly of {2}. Try a bigger radius.", results.commodity, results.radius, results.from)
        : tr("js.searched", "{0} around {1}, {2} · from Spansh, which knows the rings players have mapped.", results.commodity, results.from, ago(results.at)));

    // Mapped by you (exact), nearest to the reference first when positions are known
    const refPos = places[from] || (from === here.system ? here.pos : null);
    const mine = Object.keys(mapped).flatMap(name => {
        const m = mapped[name];
        const key = Object.keys(m.signals).find(k => same(k, opts.commodity));
        if (!key || m.signals[key] < opts.min) return [];
        const info = rings[name] || {};
        if (opts.pristine && info.reserve && norm(info.reserve).indexOf("pristine") < 0) return [];
        const d = dist(places[m.system], refPos);
        const others = Object.keys(m.signals).filter(k => k !== key).map(k => m.signals[k] > 1 ? `${k} ×${m.signals[k]}` : k);
        return [{
            system: m.system, ly: ly(d), order: d ?? 1e9,
            count: countText(m.signals[key]), overlap: m.signals[key] > 1,
            ring: name,
            detail: [info.type, reserveName(info.reserve)].filter(Boolean).map(x => "  ·  " + x).join(""),
            others: [others.length ? tr("js.also", "Also: {0}", others.join(", ")) : "", tr("js.mapped_when", "mapped {0}", ago(m.at))].filter(Boolean).join("   "),
        }];
    }).sort((a, b) => a.order - b.order).slice(0, 25);
    set("mineRows", mine);
    set("mineNote", mine.length ? "" : tr("js.mine_none", "None yet: map a ring with probes and its {0} hotspots appear here.", opts.commodity));
}

show();
