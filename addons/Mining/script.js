// Mining: this mining session, the rocks, the hold, limpets, core mining, and where to sell.
//
// From the journal: MiningRefined (each ton), ProspectedAsteroid (what a prospector limpet found), LaunchDrone
// (prospectors and collectors), AsteroidCracked (a motherlode split by a charge), MarketSell (what you sold), and
// LoadGame (a new game session: the counts start again). From Market.json, each time you open a market: the galactic
// average price of every mineral and metal (for the haul's value) and what that station pays (for where to sell).
// Prices, the best places to sell and the motherlodes cracked are kept between sessions.
//
// The app's own alerts for a motherlode or a rock with 30%+ of a material still come as before; this module can also
// tell you about rocks worth mining for the materials you pick (its ⚙ settings).

// ---- little helpers (kept in this file so the addon stands alone)
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
/// "$painite_name;" / "Painite" / "LowTemperatureDiamond" → "painite" / "lowtemperaturediamond"
function keyOf(name) {
    let s = String(name || "").trim();
    if (s.startsWith("$")) { s = s.replace(/^\$|;$/g, ""); s = s.replace(/_name$/i, ""); }
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function ms(t) { const v = Date.parse(t || ""); return isNaN(v) ? Date.now() : v; }
function credits(n) { return n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : fmt(Math.round(n)); }
function ago(t) {
    const m = Math.floor((Date.now() - ms(t)) / 60000);
    return m < 60 ? tr("js.min_ago", "{0} min ago", Math.max(0, m)) : m < 48 * 60 ? tr("js.h_ago", "{0} h ago", Math.floor(m / 60)) : tr("js.d_ago", "{0} d ago", Math.floor(m / 1440));
}

// ---- kept between sessions: prices, where to sell, motherlodes cracked, names
let prices = store.get("prices", {});   // key → galactic average (cr/t)
let sells = store.get("sells", {});     // key → [{ station, system, price, demand, t }] best first
let cracks = store.get("cracks", []);   // [{ t, material, where }] newest first
let names = store.get("names", {});     // key → the name to show; and the shown names' keys
const seenCrack = makeSeen("seenCrack");
function saveKept() { store.set("prices", prices); store.set("sells", sells); store.set("cracks", cracks); store.set("names", names); }
function nameOf(k) { return names[k] || k; }
function learnName(raw, shown) { const k = keyOf(raw); if (k && shown) { names[k] = shown; names["~" + keyOf(shown)] = k; } return k; }
/// A name the app shows (Cargo, "Low Temperature Diamonds") → the journal's key ("lowtemperaturediamond")
function keyForShown(shown) { const k = keyOf(shown); return names["~" + k] || k; }

// ---- this session (rebuilt from today's journal when the app starts, so not kept)
let s;
function newSession(t) {
    s = { start: "", last: "", refined: {}, rocks: [], prospectors: 0, collectors: 0, found: 0, cracked: 0, lastMotherlode: "",
          sold: 0, soldTons: 0 };
}
newSession();

on("LoadGame", () => { newSession(); show(); });
on("click:reset", () => { newSession(); show(); });

on("MiningRefined", e => {
    const k = learnName(e.Type, e.Type_Localised || e.Type);
    s.refined[k] = (s.refined[k] || 0) + 1;
    s.start = s.start || e.timestamp || "";
    s.last = e.timestamp || s.last;
    show();
});
on("LaunchDrone", e => {
    if (e.Type === "Prospector") s.prospectors++;
    else if (e.Type === "Collection") s.collectors++;
    else return;
    s.start = s.start || e.timestamp || "";
    show();
});
on("ProspectedAsteroid", (e, replay) => {
    const mats = (e.Materials || []).map(m => ({ k: learnName(m.Name, m.Name_Localised || m.Name), p: Number(m.Proportion) || 0 }))
                                    .sort((a, b) => b.p - a.p);
    const ml = e.MotherlodeMaterial ? learnName(e.MotherlodeMaterial, e.MotherlodeMaterial_Localised || e.MotherlodeMaterial) : "";
    const content = String(e.Content_Localised || e.Content || "").replace(/^.*:\s*/, "").trim();
    const rock = { t: e.timestamp || "", mats, ml, content, left: Number(e.Remaining) };
    s.rocks.unshift(rock);
    s.rocks = s.rocks.slice(0, 200);
    s.start = s.start || e.timestamp || "";
    if (ml) { s.found++; s.lastMotherlode = ml; }
    if (!replay && setting("alert", false) && !ml) {
        const why = worth(rock);
        if (why) notify(tr("js.n_worth", "⛏ Worth mining: {0}", why), "info", 8);
    }
    show();
});
on("AsteroidCracked", e => {
    s.cracked++;
    if (seenCrack(e)) {
        cracks.unshift({ t: e.timestamp || "", material: s.lastMotherlode, where: game.Body || game.StarSystem || "" });
        cracks = cracks.slice(0, 20);
        saveKept();
    }
    show();
});
on("MarketSell", e => {
    const k = learnName(e.Type, e.Type_Localised || e.Type);
    if (!prices[k] && !s.refined[k]) return;   // (only what's mined counts: minerals and metals seen in markets, or refined)
    s.sold += Number(e.TotalSale) || 0;
    s.soldTons += Number(e.Count) || 0;
    show();
});
on("Market", e => {
    // Market.json: every commodity this station trades; minerals and metals are kept
    const where = { station: e.StationName || "", system: e.StarSystem || "", t: e.timestamp || new Date().toISOString() };
    if (!where.station) return;
    for (const it of e.Items || []) {
        const cat = String(it.Category || "").toLowerCase();
        if (!cat.includes("mineral") && !cat.includes("metal")) continue;
        const k = learnName(it.Name, it.Name_Localised || it.Name);
        if (Number(it.MeanPrice) > 0) prices[k] = Number(it.MeanPrice);
        const list = (sells[k] || []).filter(x => !(x.station === where.station && x.system === where.system)
                                               && Date.now() - ms(x.t) < 30 * 86400000);   // (a month at most: prices move)
        if (Number(it.SellPrice) > 0 && Number(it.Demand) > 0)
            list.push({ station: where.station, system: where.system, price: Number(it.SellPrice), demand: Number(it.Demand), t: where.t });
        list.sort((a, b) => b.price - a.price);
        if (list.length) sells[k] = list.slice(0, 3); else delete sells[k];
    }
    saveKept();
    show();
});
on("setting", () => show());

// ---- what to look for
function watchList() { return String(setting("watch", "") || "").split(",").map(x => keyForShown(x)).filter(x => x); }
function minPct() { const v = Number(setting("minPct", 25)); return isFinite(v) && v > 0 ? v : 25; }
/// Why a rock is worth mining ("Platinum 31%"), or "" if it isn't: a material you look for (or any, with none
/// picked) at the % you set or more. Motherlodes always are.
function worth(rock) {
    if (rock.ml) return "★ " + nameOf(rock.ml);
    const want = watchList(), at = minPct();
    const hit = rock.mats.find(m => m.p >= at && (want.length === 0 || want.includes(m.k)));
    return hit ? nameOf(hit.k) + " " + Math.round(hit.p) + "%" : "";
}

// ---- the view
function show() {
    const tons = Object.values(s.refined).reduce((a, b) => a + b, 0);
    const hours = s.start && s.last ? (ms(s.last) - ms(s.start)) / 3600000 : 0;
    const rated = hours >= 0.05;   // (three minutes or more: before that a rate means little)
    const valueOf = k => prices[k] || (sells[k] && sells[k][0] ? sells[k][0].price : 0);
    const value = Object.entries(s.refined).reduce((sum, [k, n]) => sum + n * valueOf(k), 0);
    const priced = Object.keys(s.refined).every(k => valueOf(k) > 0);

    set("hasMining", tons > 0 || s.rocks.length > 0 || s.prospectors + s.collectors > 0);
    set("rate", tons === 0 ? "" : tr("js.t_refined", "{0} t refined", tons) + (rated ? " · " + tr("js.t_hr", "{0} t/hr", Math.round(tons / hours)) : ""));

    // tiles: limpets, hold, haul value, limpets per ton
    const limpets = game.Limpets || 0;
    set("limpets", String(limpets));
    set("limpetsLow", limpets < 5);
    const cap = game.CargoCapacity || 0, free = Math.max(0, cap - (game.Cargo || 0));
    set("holdFree", cap > 0 ? free + " t" : "—");
    let fullIn = "";
    if (cap > 0 && free === 0) fullIn = tr("js.hold_full", "hold full");
    else if (cap > 0 && rated && tons > 0) {
        const mins = free / (tons / hours) * 60;
        fullIn = mins < 90 ? tr("js.full_in_min", "full in ≈ {0} min", Math.max(1, Math.round(mins))) : tr("js.full_in_h", "full in ≈ {0} h", (mins / 60).toFixed(1));
    }
    set("fullIn", fullIn);
    set("value", value > 0 ? (priced ? "" : "≥ ") + credits(value) : "—");
    set("valueRate", value > 0 && rated ? tr("js.cr_hr", "{0} cr/hr", credits(value / hours)) : value > 0 ? "" : tr("js.no_prices", "open a market to learn prices"));
    set("perTon", tons > 0 && s.collectors > 0 ? (s.collectors / tons).toFixed(2) : "—");
    set("limpetsUsed", tr("js.limpets_used", "{0} collectors · {1} prospectors", s.collectors, s.prospectors));

    // the last prospector, and how the rocks have been
    const r = s.rocks[0];
    set("hasRock", !!r);
    set("rockContent", r ? (r.content ? tr("js.content", "{0} content", r.content) : "") + (r.left < 100 ? " · " + tr("js.left", "{0}% left", Math.round(r.left)) : "") : "");
    set("motherlode", r && r.ml ? tr("js.motherlode", "★ MOTHERLODE: {0}", nameOf(r.ml).toUpperCase()) : "");
    const want = watchList();
    set("rockMats", r ? r.mats.map(m => ({ name: nameOf(m.k), pct: m.p, text: m.p.toFixed(1) + "%", want: want.includes(m.k) || (want.length === 0 && m.p >= minPct()) })) : []);
    const worthCount = s.rocks.filter(x => worth(x)).length;
    set("rocksHead", s.rocks.length ? tr("js.rocks_head", "ROCKS PROSPECTED") : "");
    set("rocksLine", s.rocks.length ? tr("js.rocks_line", "{0} rocks · {1} worth mining ({2}%)", s.rocks.length, worthCount, Math.round(worthCount * 100 / s.rocks.length))
                                        + " · " + (want.length ? tr("js.looking_for", "looking for {0} at {1}%+", want.map(nameOf).join(", "), minPct()) : tr("js.any_at", "anything at {0}%+", minPct())) : "");
    set("rocks", s.rocks.slice(0, 6).map(x => {
        const w = worth(x), best = x.mats[0];
        return { text: w || (best ? nameOf(best.k) + " " + Math.round(best.p) + "%" : "—"), when: x.t ? new Date(ms(x.t)).toTimeString().slice(0, 5) : "", worth: !!w, ml: !!x.ml };
    }));
    // average share per material over the rocks (the ones that had it), best first
    const sum = {}, count = {};
    for (const x of s.rocks) for (const m of x.mats) { sum[m.k] = (sum[m.k] || 0) + m.p; count[m.k] = (count[m.k] || 0) + 1; }
    set("averages", Object.keys(sum).map(k => ({ k, avg: sum[k] / count[k], n: count[k] })).sort((a, b) => b.avg - a.avg).slice(0, 4)
        .map(a => ({ name: nameOf(a.k), text: tr("js.avg", "{0}% avg in {1}", a.avg.toFixed(1), a.n) })));

    // refined, with value
    set("refinedHead", tons > 0 ? tr("js.refined_head", "REFINED THIS SESSION") : "");
    set("refined", Object.entries(s.refined).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({
        name: nameOf(k), tons: n + " t",
        rate: rated ? tr("js.t_hr", "{0} t/hr", Math.round(n / hours)) : "",
        value: valueOf(k) > 0 ? "≈ " + credits(n * valueOf(k)) + " cr" : "",
    })));
    set("sold", s.sold > 0 ? tr("js.sold", "Sold this session: {0} t for {1} cr", fmt(s.soldTons), credits(s.sold)) : "");

    // where to sell: what's refined this session and what's in the hold
    const keys = Object.keys(s.refined);
    try {
        const hold = game.CargoItems, n = hold ? hold.Count : 0;
        for (let i = 0; i < n; i++) { const k = keyForShown(hold[i].Name); if ((prices[k] || sells[k]) && !keys.includes(k)) keys.push(k); }
    } catch (_) { /* (no hold list: what's refined is enough) */ }
    const where = keys.filter(k => sells[k] && sells[k][0]).map(k => ({ k, best: sells[k][0] })).sort((a, b) => b.best.price - a.best.price).slice(0, 5)
        .map(x => ({ name: nameOf(x.k), price: fmt(x.best.price) + " cr", at: x.best.station + " · " + x.best.system, age: ago(x.best.t) }));
    set("sellHead", where.length ? tr("js.sell_head", "BEST PLACES TO SELL (MARKETS YOU'VE OPENED)") : "");
    set("sell", where);

    // core mining
    set("coreHead", s.found || s.cracked || cracks.length ? tr("js.core_head", "CORE MINING") : "");
    set("coreLine", s.found || s.cracked ? tr("js.core_line", "{0} motherlodes found · {1} cracked this session", s.found, s.cracked) : "");
    set("cracks", cracks.slice(0, 4).map(c => ({ text: (c.material ? nameOf(c.material) : tr("js.motherlode_word", "motherlode")) + (c.where ? " · " + c.where : ""), when: ago(c.t) })));

    set("empty", tons === 0 && !s.rocks.length && !(s.prospectors + s.collectors) ? tr("js.none", "No mining yet this session: launch a prospector limpet to start.") : "");
}
let ticks = 0;
on("tick", () => { if (++ticks % 30 === 0 && (s.last || cracks.length)) show(); });   // (every half minute: keeps "full in…" and the ages fresh)
on("language", show);
show();
