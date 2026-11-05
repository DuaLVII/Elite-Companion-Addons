// Ranks: your Pilots' Federation ranks with progress to the next, and your rank-ups.
//
// The game writes Rank (each rank as a number) and Progress (percent to the next) when you log in, and a Promotion
// event each time you rank up. After Elite (8) come Elite I to Elite V (9 to 13). CQC only shows once you have a CQC
// rank. The last few weeks of journals are read at the start so the history fills in; everything is kept.

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
function day(t) { const d = new Date(t); return isNaN(d) ? "" : d.toLocaleDateString(); }
function num(x) { return typeof x === "number" && isFinite(x) ? x : null; }

// ---- the ranks: the journal's key, its name, and the rank names 0 … 8 (then Elite I … V)
const KINDS = [
    ["Combat", "Combat", ["Harmless", "Mostly Harmless", "Novice", "Competent", "Expert", "Master", "Dangerous", "Deadly", "Elite"]],
    ["Trade", "Trade", ["Penniless", "Mostly Penniless", "Peddler", "Dealer", "Merchant", "Broker", "Entrepreneur", "Tycoon", "Elite"]],
    ["Explore", "Exploration", ["Aimless", "Mostly Aimless", "Scout", "Surveyor", "Trailblazer", "Pathfinder", "Ranger", "Pioneer", "Elite"]],
    ["Soldier", "Mercenary", ["Defenceless", "Mostly Defenceless", "Rookie", "Soldier", "Gunslinger", "Warrior", "Gladiator", "Deadeye", "Elite"]],
    ["Exobiologist", "Exobiology", ["Directionless", "Mostly Directionless", "Compiler", "Collector", "Cataloguer", "Taxonomist", "Ecologist", "Geneticist", "Elite"]],
    ["CQC", "CQC", ["Helpless", "Mostly Helpless", "Amateur", "Semi Professional", "Professional", "Champion", "Hero", "Legend", "Elite"]],
];
const TOP = 13;   // Elite V
const ROMAN = ["", "I", "II", "III", "IV", "V"];

function kindName(k) { const info = KINDS.find(x => x[0] === k); return tr("js.k_" + k.toLowerCase(), info ? info[1] : k); }
function rankName(k, r) {
    const info = KINDS.find(x => x[0] === k);
    if (!info || r < 0) return tr("js.rank_n", "rank {0}", r);
    if (r <= 8) return tr("js.r_" + k.toLowerCase() + "_" + r, info[2][r]);
    return tr("js.elite_n", "Elite {0}", ROMAN[Math.min(5, r - 8)]);
}

// ---- what's known
let st = store.get("st", { rank: {}, rankAt: "", prog: {}, progAt: "", prev: {} });
let hist = store.get("hist", []);   // [{ t, kind, rank }] newest first
const seen = makeSeen("seen");
function save() { store.set("st", st); store.set("hist", hist); }
wantHistory();

on("Rank", e => {
    if ((e.timestamp || "") < st.rankAt) return;   // (an older one, read back from the history)
    st.rankAt = e.timestamp || st.rankAt;
    for (const [k] of KINDS) if (num(e[k]) !== null) st.rank[k] = e[k];
    save(); show();
});
on("Progress", e => {
    if ((e.timestamp || "") < st.progAt) return;
    st.progAt = e.timestamp || st.progAt;
    for (const [k] of KINDS) {
        const p = num(e[k]);
        if (p === null) continue;
        const old = st.prog[k];
        if (typeof old === "number" && p !== old) st.prev[k] = { from: old, rank: st.rank[k] };
        st.prog[k] = p;
    }
    save(); show();
});
on("Promotion", (e, replay) => {
    let any = false;
    for (const [k] of KINDS) {
        const r = num(e[k]);
        if (r === null) continue;
        if (!any && !seen(e)) return;
        any = true;
        hist.unshift({ t: e.timestamp || "", kind: k, rank: r });
        if ((e.timestamp || "") >= st.rankAt) { st.rank[k] = r; st.prog[k] = 0; delete st.prev[k]; }
        if (!replay) notify(tr("js.n_promoted", "{0} rank up: {1}", kindName(k), rankName(k, r)), "info", 8);
    }
    if (!any) return;
    hist.sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
    hist = hist.slice(0, 30);
    save(); show();
});

function show() {
    const ranks = KINDS.filter(([k]) => typeof st.rank[k] === "number" && (k !== "CQC" || st.rank[k] > 0 || (st.prog[k] || 0) > 0)).map(([k]) => {
        const r = st.rank[k], top = r >= TOP;
        const p = typeof st.prog[k] === "number" ? st.prog[k] : null;
        const prev = st.prev[k];
        const moved = prev && prev.rank === r && p !== null && p > prev.from ? tr("js.moved", "+{0}% since last time", Math.round(p - prev.from)) : "";
        return {
            kind: kindName(k),
            rank: rankName(k, r),
            elite: r >= 8,
            pct: p === null ? 0 : p,
            pctText: top || p === null ? "" : Math.round(p) + "%",
            hasBar: !top && p !== null,
            next: top ? tr("js.top", "as high as it goes") : tr("js.next", "next: {0}", rankName(k, r + 1)),
            moved,
        };
    });
    set("ranksHead", ranks.length ? tr("js.ranks", "PILOTS' FEDERATION") : "");
    set("ranks", ranks);
    set("histHead", hist.length ? tr("js.history", "RANK-UPS") : "");
    set("hist", hist.slice(0, 10).map(h => ({ when: day(h.t), text: tr("js.h_up", "{0}: {1}", kindName(h.kind), rankName(h.kind, h.rank)), elite: h.rank >= 8 })));
    set("empty", !ranks.length && !hist.length ? tr("js.none", "The game sends your ranks when you log in.") : "");
}
on("language", show);
show();
