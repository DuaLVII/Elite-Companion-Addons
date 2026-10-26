// Body Scanner: example addon.
//
// Builds its own list of bodies from the journal:
//   Scan               a body was scanned (FSS, nav beacon or auto-scan)
//   FSSDiscoveryScan   honk: how many bodies the system has
//   FSSAllBodiesFound  every body found
//   SAAScanComplete    a body was mapped with probes
//   FSSBodySignals / SAASignalsFound   biological, geological… signals on a body
//   FSDJump / CarrierJump / Location   a different system: start a new list
//
// Each system's list is kept while the app runs, so jumping back shows what you already scanned.

const systems = {};        // system name → { bodies: { name → body }, count, allFound }
let current = "";
let lastFilters = "";      // which filter boxes were ticked last time the list was drawn

// Rough Cartographics values (credits) for a scanned body, before mapping and bonuses
const BASE = {
    "Earthlike body": 270000, "Water world": 100000, "Ammonia world": 140000,
    "High metal content body": 15000, "Metal rich body": 30000, "Rocky body": 500,
    "Sudarsky class I gas giant": 3800, "Sudarsky class II gas giant": 28000,
    "Gas giant with water based life": 900, "Gas giant with ammonia based life": 900,
};
const TERRA_BONUS = { "Water world": 170000, "High metal content body": 150000, "Rocky body": 130000 };
const MAP_MULTIPLIER = 3.3;      // mapping with probes (efficiently) is worth about 3–4× the scan
const FIRST_BONUS = 2.6;         // first to discover (scan) and first to map pay roughly this much extra

function sys(name) {
    if (!systems[name]) systems[name] = { bodies: {}, count: 0, allFound: false };
    return systems[name];
}

function shortName(body) {
    return current && body.startsWith(current + " ") ? body.slice(current.length + 1) : body;
}

function bodyFor(fullName) {
    const s = sys(current);
    const key = shortName(fullName);
    if (!s.bodies[key]) s.bodies[key] = { name: key, signals: {} };
    return s.bodies[key];
}

function estimate(b) {
    if (b.isStar) return 1200;
    let v = (BASE[b.planetClass] || 500) + (b.terraformable ? (TERRA_BONUS[b.planetClass] || 100000) : 0);
    if (b.mapped) v *= MAP_MULTIPLIER * (b.wasMapped ? 1 : 1.3);
    if (b.wasDiscovered === false) v *= FIRST_BONUS;
    return Math.round(v);
}

// Value if you also map it (to show what's worth flying to)
function potential(b) {
    if (b.isStar) return 1200;
    return estimate({ ...b, mapped: true });
}

function newSystem(name) {
    if (!name) return;
    current = name;
    show();
}

on("FSDJump", e => newSystem(e.StarSystem));
on("CarrierJump", e => newSystem(e.StarSystem));
on("Location", e => newSystem(e.StarSystem));

on("FSSDiscoveryScan", e => {
    if (e.SystemName && e.SystemName !== current) newSystem(e.SystemName);
    sys(current).count = e.BodyCount || 0;
    show();
});

on("FSSAllBodiesFound", e => { sys(current).allFound = true; show(); });

on("Scan", e => {
    if (e.StarSystem && e.StarSystem !== current) newSystem(e.StarSystem);
    if (!e.StarType && !e.PlanetClass) return;            // belt clusters, rings…
    const b = bodyFor(e.BodyName);
    b.isStar = !!e.StarType;
    b.planetClass = e.PlanetClass || "";
    b.type = e.StarType ? e.StarType + "-class star" : e.PlanetClass;
    b.scoopable = !!e.StarType && "KGBFOAM".includes(String(e.StarType).charAt(0));
    b.terraformable = e.TerraformState === "Terraformable";
    b.landable = !!e.Landable;
    b.gravity = e.SurfaceGravity ? e.SurfaceGravity / 9.81 : 0;
    b.distance = e.DistanceFromArrivalLS || 0;
    b.wasDiscovered = e.WasDiscovered;
    b.wasMapped = e.WasMapped;
    show();
});

on("SAAScanComplete", e => { bodyFor(e.BodyName).mapped = true; show(); });

function addSignals(e) {
    const b = bodyFor(e.BodyName);
    for (const s of e.Signals || []) {
        const kind = (s.Type_Localised || s.Type || "").replace(/^\$SAA_SignalType_|;$/g, "");
        b.signals[kind] = s.Count || 0;
    }
    show();
}
on("FSSBodySignals", addSignals);
on("SAASignalsFound", addSignals);

// ---- the view ----

const JACKPOT = ["Earthlike body", "Water world", "Ammonia world"];

function show() {
    const s = systems[current];
    const all = s ? Object.values(s.bodies).filter(b => b.type) : [];

    const filters = {
        landable: !!get("onlyLandable"), signals: !!get("onlySignals"),
        valuable: !!get("onlyValuable"), stars: get("showStars") !== false,
    };
    lastFilters = JSON.stringify(filters);

    const rows = all
        .filter(b => filters.stars || !b.isStar)
        .filter(b => !filters.landable || b.landable)
        .filter(b => !filters.signals || Object.keys(b.signals).length > 0)
        .filter(b => !filters.valuable || potential(b) >= 100000)
        .sort((a, b) => potential(b) - potential(a))
        .map(b => {
            const signalText = Object.entries(b.signals)
                .map(([k, n]) => `${n} ${k.toLowerCase().slice(0, 3)}`).join(" ");
            const jackpot = JACKPOT.includes(b.planetClass) || b.terraformable;
            return {
                star: jackpot ? "★" : "",
                name: b.name,
                type: (b.terraformable ? tr("js.terraformable", "Terraformable ") : "") + (b.type || "") + (b.scoopable ? tr("js.scoopable", " · scoopable") : ""),
                value: b.isStar ? "" : (b.mapped ? "" : "≈ ") + short(b.mapped ? estimate(b) : potential(b), "cr"),
                valuable: !b.isStar && potential(b) >= 100000,
                firstText: b.wasDiscovered === false ? tr("js.new", "NEW") : "",
                mappedText: b.mapped ? tr("js.mapped", "mapped ✓") : "",
                landText: b.landable ? tr("js.landable_g", "landable {0} g", b.gravity.toFixed(2)) : "",
                signalText: signalText,
                distance: fmt(b.distance) + tr("js.ls", " Ls"),
            };
        });

    set("bodies", rows);
    const planets = all.filter(b => !b.isStar);
    set("progress", s && s.count ? tr("js.bodies", "{0} / {1} bodies{2}", all.length, s.count, s.allFound ? " ✓" : "") : tr("js.bodies_2", "{0} bodies", all.length));
    set("total", planets.length ? "≈ " + short(planets.reduce((t, b) => t + estimate(b), 0), "cr") + tr("js.so_far", " so far") : "");
    set("summary", planets.length
        ? tr("js.landable_with_signals_mapped", "{0} landable · {1} with signals · {2} mapped", planets.filter(b => b.landable).length, planets.filter(b => Object.keys(b.signals).length).length, planets.filter(b => b.mapped).length)
        : "");
    set("empty", !current ? tr("js.waiting_for_your_location", "Waiting for your location…")
        : all.length === 0 ? tr("js.nothing_scanned_here_yet_honk_open", "Nothing scanned here yet. Honk, open the FSS, or fly near a body.")
        : rows.length === 0 ? tr("js.no_bodies_match_the_filters", "No bodies match the filters.") : "");
}

// The check boxes write their values straight into V[…]; redraw as soon as one is ticked
for (const box of ["onlyLandable", "onlySignals", "onlyValuable", "showStars"]) on("change:" + box, () => show());

set("onlyLandable", false);
set("onlySignals", false);
set("onlyValuable", false);
set("showStars", true);
if (game.StarSystem && game.StarSystem !== "—") current = game.StarSystem;
show();
