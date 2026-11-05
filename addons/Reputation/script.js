// Reputation: where you stand with the superpowers, your navy ranks and what they unlock, and your promotions.
//
// The game writes, when you log in: Reputation (Federation, Empire, Alliance, Independent: -100 … +100), Rank
// (Federation and Empire: 0 … 14) and Progress (percent to the next rank). A Promotion event comes each time you
// rank up. The reputation bands are the journal manual's: hostile below -90, unfriendly below -35, neutral below +4,
// cordial below +35, friendly below +90, allied from +90. The last few weeks of journals are read at the start so
// the promotion history fills in; everything is kept between sessions.

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

// ---- the game's ranks and what they unlock (ships, and permits for restricted systems)
const NAVY = {
    Federation: {
        ranks: ["None", "Recruit", "Cadet", "Midshipman", "Petty Officer", "Chief Petty Officer", "Warrant Officer", "Ensign",
                "Lieutenant", "Lieutenant Commander", "Post Commander", "Post Captain", "Rear Admiral", "Vice Admiral", "Admiral"],
        unlocks: {
            3: [["ship", "Federal Dropship"]],
            4: [["permit", "Sol"]],
            5: [["ship", "Federal Assault Ship"], ["permit", "Vega"], ["permit", "Beta Hydri"]],
            6: [["permit", "PLX 695"]],
            7: [["ship", "Federal Gunship"], ["permit", "Ross 128"]],
            8: [["permit", "Exbeur"]],
            10: [["permit", "Hors"]],
            12: [["ship", "Federal Corvette"]],
        },
    },
    Empire: {
        ranks: ["None", "Outsider", "Serf", "Master", "Squire", "Knight", "Lord", "Baron", "Viscount", "Count", "Earl",
                "Marquis", "Duke", "Prince", "King"],
        unlocks: {
            3: [["ship", "Imperial Courier"]],
            4: [["permit", "Achenar"]],
            7: [["ship", "Imperial Clipper"], ["permit", "Summerland"]],
            10: [["permit", "Facece"]],
            12: [["ship", "Imperial Cutter"]],
        },
    },
};
const POWERS = ["Federation", "Empire", "Alliance", "Independent"];
const BANDS = [   // [below, id, English]
    [-90, "hostile", "Hostile"], [-35, "unfriendly", "Unfriendly"], [4, "neutral", "Neutral"],
    [35, "cordial", "Cordial"], [90, "friendly", "Friendly"], [Infinity, "allied", "Allied"],
];

function powerName(p) { return tr("js.p_" + p.toLowerCase(), p); }
function rankName(side, r) { const n = NAVY[side].ranks[r]; return n === undefined ? tr("js.rank_n", "rank {0}", r) : tr("js.r_" + side.toLowerCase() + "_" + r, n); }
function unlockText(u) { return u[0] === "permit" ? tr("js.permit", "{0} permit", u[1]) : u[1]; }
function unlocksAt(side, r) { return (NAVY[side].unlocks[r] || []).map(unlockText).join(" · "); }
function band(v) {
    for (let i = 0; i < BANDS.length; i++) if (v < BANDS[i][0]) return i;
    return BANDS.length - 1;
}

// ---- what's known
let st = store.get("st", { rep: {}, repAt: "", rank: {}, rankAt: "", prog: {}, progAt: "", prev: {} });
let hist = store.get("hist", []);   // [{ t, side, rank }] newest first
const seen = makeSeen("seen");
function save() { store.set("st", st); store.set("hist", hist); }
wantHistory();

on("Reputation", e => {
    if ((e.timestamp || "") < st.repAt) return;   // (an older one, read back from the history)
    st.repAt = e.timestamp || st.repAt;
    for (const p of POWERS) if (num(e[p]) !== null) st.rep[p] = e[p];
    save(); show();
});
on("Rank", e => {
    if ((e.timestamp || "") < st.rankAt) return;
    st.rankAt = e.timestamp || st.rankAt;
    for (const side of ["Federation", "Empire"]) if (num(e[side]) !== null) st.rank[side] = e[side];
    save(); show();
});
on("Progress", e => {
    if ((e.timestamp || "") < st.progAt) return;
    st.progAt = e.timestamp || st.progAt;
    for (const side of ["Federation", "Empire"]) {
        const p = num(e[side]);
        if (p === null) continue;
        // how far it moved since the last time the game said (only within the same rank)
        const old = st.prog[side];
        if (typeof old === "number" && p !== old) st.prev[side] = { from: old, rank: st.rank[side] };
        st.prog[side] = p;
    }
    save(); show();
});
on("Promotion", (e, replay) => {
    for (const side of ["Federation", "Empire"]) {
        const r = num(e[side]);
        if (r === null) continue;
        if (!seen(e)) return;
        hist.unshift({ t: e.timestamp || "", side, rank: r });
        hist.sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
        hist = hist.slice(0, 30);
        if ((e.timestamp || "") >= st.rankAt) { st.rank[side] = r; st.prog[side] = 0; delete st.prev[side]; }
        if (!replay) {
            const what = unlocksAt(side, r);
            notify(tr("js.n_promoted", "Promoted to {0} ({1})", rankName(side, r), powerName(side)) + (what ? " · " + tr("js.unlocked", "unlocked: {0}", what) : ""), "info", 8);
        }
    }
    save(); show();
});

function show() {
    const powers = POWERS.filter(p => typeof st.rep[p] === "number").map(p => {
        const v = st.rep[p], b = band(v);
        const next = b < BANDS.length - 1 ? BANDS[b][0] : null;
        return {
            name: powerName(p),
            value: (Math.round(v * 10) / 10).toFixed(1),
            band: tr("js.b_" + BANDS[b][1], BANDS[b][2]),
            tone: BANDS[b][1],
            bar: v + 100,   // (the bar runs from -100 to +100)
            next: next === null ? tr("js.top_band", "as high as it goes") : tr("js.next_band", "{0} at {1} ({2} to go)", tr("js.b_" + BANDS[b + 1][1], BANDS[b + 1][2]), next, (Math.round((next - v) * 10) / 10).toFixed(1)),
        };
    });
    const navy = ["Federation", "Empire"].filter(side => typeof st.rank[side] === "number").map(side => {
        const r = st.rank[side], top = r >= NAVY[side].ranks.length - 1;
        const p = typeof st.prog[side] === "number" ? st.prog[side] : null;
        const prev = st.prev[side];
        const moved = prev && prev.rank === r && p !== null && p > prev.from ? " " + tr("js.moved", "(+{0}% since last time)", Math.round(p - prev.from)) : "";
        let nextUnlock = "";
        for (let k = r + 1; k < NAVY[side].ranks.length; k++)
            if (NAVY[side].unlocks[k]) {
                nextUnlock = tr("js.next_unlock", "Next: {0} at {1}", unlocksAt(side, k), rankName(side, k))
                           + (k > r + 1 ? " " + tr("js.ranks_away", "({0} ranks away)", k - r) : "");
                break;
            }
        const unlocked = [];
        for (let k = 1; k <= r; k++) for (const u of NAVY[side].unlocks[k] || []) unlocked.push({ text: "✓ " + unlockText(u), ship: u[0] === "ship" });
        return {
            side: powerName(side),
            rank: rankName(side, r),
            pct: p === null ? 0 : p,
            pctText: top ? "" : p === null ? "" : Math.round(p) + "%",
            hasBar: !top && p !== null,
            toNext: top ? tr("js.top_rank", "The highest rank") : tr("js.to_next", "towards {0}", rankName(side, r + 1)) + moved,
            nextUnlock: top ? "" : nextUnlock,
            unlocked,
        };
    });
    set("powersHead", powers.length ? tr("js.powers", "SUPERPOWERS") : "");
    set("powers", powers);
    set("navyHead", navy.length ? tr("js.navy", "NAVY RANKS") : "");
    set("navy", navy);
    set("histHead", hist.length ? tr("js.history", "PROMOTIONS") : "");
    set("hist", hist.slice(0, 10).map(h => ({
        when: day(h.t),
        text: tr("js.h_promoted", "{0}: promoted to {1}", powerName(h.side), rankName(h.side, h.rank)),
        unlocks: unlocksAt(h.side, h.rank),
    })));
    set("empty", !powers.length && !navy.length && !hist.length ? tr("js.none", "The game sends your reputation and ranks when you log in.") : "");
}
on("language", show);
show();
