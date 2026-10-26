// Exobiology: sampling tracker.
//
// ScanOrganic is written for each use of the genetic sampler: "Log" (first sample), "Sample" (second) and "Analyse"
// (third, species complete). Samples of the same species must be far enough apart: the "colony range" below depends on
// the genus. Positions come from Status.json while you're on foot or in the SRV.
//
// Values are learnt from your own sales at Vista Genomics (SellOrganicData), so once you've sold a species once,
// its value shows next time.
include("_shared/surface.js");
wantHistory();

// Minimum distance between samples of one species (metres)
const COLONY_RANGE = {
    "Aleoida": 150, "Amphora Plant": 100, "Anemone": 100, "Bacterium": 500, "Bark Mound": 100, "Brain Tree": 100,
    "Cactoida": 300, "Clypeus": 150, "Concha": 150, "Crystalline Shards": 100, "Electricae": 1000, "Fonticulua": 500,
    "Frutexa": 150, "Fumerola": 100, "Fungoida": 300, "Osseus": 800, "Recepta": 150, "Sinuous Tubers": 100,
    "Stratum": 500, "Tubus": 800, "Tussock": 200,
};

let st = store.get("exo", {
    current: null,      // { genus, species, variant, body, samples: [{ lat, lon }], radius }
    unsold: [],         // { genus, species, variant, body, at }
    values: {},         // species → credits (from your sales)
    bodies: {},         // body → { signals, genera: [] }
    earned: 0,
    mark: { ts: "", keys: [] },
});
const save = () => store.set("exo", st);
let wasFarEnough = true;

// Each event once (history, today's replay and live overlap; several events can share one second)
function fresh(e) {
    const ts = e.timestamp || "", key = e.event + ":" + JSON.stringify(e).length;
    if (ts < st.mark.ts) return false;
    if (ts === st.mark.ts) { if (st.mark.keys.includes(key)) return false; st.mark.keys.push(key); }
    else st.mark = { ts, keys: [key] };
    return true;
}

const name = (e, key) => e[key + "_Localised"] || String(e[key] || "").replace(/^\$Codex_Ent_|_Name;$|;$/g, "").replace(/_/g, " ");

on("ScanOrganic", (e, replay) => {
    if (!fresh(e)) return;
    const genus = name(e, "Genus"), species = name(e, "Species"), variant = name(e, "Variant");
    const p = Surface.pos;
    const here = p ? { lat: p.lat, lon: p.lon } : null;
    const body = (p && p.body) || game.Body || "";

    const same = st.current && st.current.species === species && st.current.body === body;
    if (e.ScanType === "Log" || !same) {
        if (!replay && st.current && !same && st.current.samples.length < 3)
            notify(tr("js.0_unfinished_sample_discarded", "{0}: unfinished sample discarded", st.current.species), "warning", 6);
        st.current = { genus, species, variant, body, samples: [], radius: p ? p.radius : 0 };
    }
    if (here) st.current.samples.push(here);
    st.current.samplesTaken = e.ScanType === "Log" ? 1 : e.ScanType === "Sample" ? 2 : 3;

    if (e.ScanType === "Analyse") {
        st.unsold.push({ genus, species, variant, body, at: e.timestamp });
        if (!replay) notify(tr("js.0_analysed_1", "✓ {0} analysed{1}", species, st.values[species] ? " · " + short(st.values[species], "cr") : ""), "info", 8);
        st.current = null;
    }
    wasFarEnough = false;
    save();
    show();
});

on("SellOrganicData", (e, replay) => {
    if (!fresh(e)) return;
    let total = 0;
    for (const b of e.BioData || []) {
        const species = name(b, "Species");
        if (b.Value) st.values[species] = b.Value;
        total += (b.Value || 0) + (b.Bonus || 0);
        const i = st.unsold.findIndex(u => u.species === species);
        if (i >= 0) st.unsold.splice(i, 1);
    }
    st.earned += total;
    save();
    if (!replay) notify(tr("js.exobiology_data_sold_0", "Exobiology data sold: {0}", short(total, "cr")), "info", 8);
    show();
});

// Dying loses unsold exobiology data
on("Died", e => { if (!fresh(e)) return; st.unsold = []; st.current = null; save(); show(); });

function signals(e) {
    if (!fresh(e)) return;
    const b = st.bodies[e.BodyName] || (st.bodies[e.BodyName] = { signals: 0, genera: [] });
    for (const s of e.Signals || [])
        if (/Biological/i.test(s.Type || "")) b.signals = s.Count || 0;
    if (e.Genuses) b.genera = e.Genuses.map(g => name(g, "Genus"));
    save();
    show();
}
on("FSSBodySignals", signals);
on("SAASignalsFound", signals);

// ---- view ----

function show() {
    const p = Surface.pos;
    const c = st.current;

    if (c) {
        const need = COLONY_RANGE[c.genus] || 0;
        set("species", c.species);
        set("variant", c.variant && c.variant.startsWith(c.species) ? c.variant.slice(c.species.length).replace(/^\s*-\s*/, "") : c.variant);
        set("progress", c.samplesTaken || c.samples.length);
        set("dots", [1, 2, 3].map(i => ({ done: i <= (c.samplesTaken || c.samples.length) })));
        set("sampleText", tr("js.sample_0_of_3", "Sample {0} of 3", c.samplesTaken || c.samples.length));
        const onBody = p && (!c.body || p.body === c.body);
        if (onBody && c.samples.length) {
            const nearest = Math.min(...c.samples.map(s => Surface.distance({ lat: p.lat, lon: p.lon }, s, p.radius || c.radius)));
            const far = nearest >= need;
            set("distance", Surface.metres(nearest));
            set("need", need ? tr("js.needs", "needs {0}", Surface.metres(need)) : tr("js.range_unknown_for_this_genus", "range unknown for this genus"));
            set("farEnough", far);
            set("advice", far ? tr("js.far_enough_take_the_next_sample", "✓ Far enough: take the next sample") : tr("js.keep_going_more", "Keep going: {0} more", Surface.metres(need - nearest)));
            if (far && !wasFarEnough) notify(tr("js.far_enough_for_the_next_0", "✓ Far enough for the next {0} sample", c.genus), "info", 5);
            wasFarEnough = far;
        } else {
            set("distance", "—");
            set("need", need ? tr("js.needs_between_samples", "needs {0} between samples", Surface.metres(need)) : "");
            set("farEnough", false);
            set("advice", p ? tr("js.you_re_on_a_different_body", "You're on a different body") : tr("js.distance_shows_when_you_re_on", "Distance shows when you're on the surface"));
        }
        set("hasCurrent", true);
    } else {
        set("hasCurrent", false);
        set("species", tr("js.no_species_in_progress", "No species in progress"));
        set("variant", "");
        set("dots", [1, 2, 3].map(() => ({ done: false })));
        set("sampleText", tr("js.use_the_genetic_sampler_on_a", "Use the genetic sampler on a plant to start"));
        set("distance", ""); set("need", ""); set("advice", ""); set("farEnough", false);
    }

    // This body's biology
    const bodyName = (p && p.body) || game.Body || "";
    const b = st.bodies[bodyName];
    const doneHere = st.unsold.filter(u => u.body === bodyName).map(u => u.genus);
    set("bodyName", bodyName || "—");
    set("bodySignals", b && b.signals ? (b.signals > 1 ? tr("js.biological_signals", "{0} biological signals", b.signals) : tr("js.one_biological_signal", "1 biological signal")) : tr("js.no_biological_signals_known", "no biological signals known"));
    set("genera", b ? b.genera.map(g => ({ genus: g, done: doneHere.includes(g), range: COLONY_RANGE[g] ? Surface.metres(COLONY_RANGE[g]) : "" })) : []);

    // Unsold
    const known = st.unsold.filter(u => st.values[u.species]);
    const value = known.reduce((t, u) => t + st.values[u.species], 0);
    set("unsoldText", st.unsold.length
        ? tr("js.unsold", "{0} unsold · {1}{2}", st.unsold.length, known.length ? "≈ " + short(value, "cr") : tr("js.value_unknown", "value unknown"), known.length < st.unsold.length && known.length ? tr("js.not_yet_priced", " + {0} not yet priced", st.unsold.length - known.length) : "")
        : tr("js.nothing_unsold", "Nothing unsold"));
    set("unsold", st.unsold.slice().reverse().slice(0, 12).map(u => ({
        species: u.species, body: u.body, value: st.values[u.species] ? short(st.values[u.species], "cr") : "?",
    })));
    set("earned", st.earned ? tr("js.sold_so_far", "Sold so far: {0}", short(st.earned, "cr")) : "");
}

Surface.onMove(() => { if (st.current) show(); });
show();
