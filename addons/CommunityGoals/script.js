// Community Goals: the goals you've signed up for, from your journal.
//
// The game writes "CommunityGoal" every few minutes while you play (and when you look at the board), listing each
// goal you're part of: where it is, when it ends, the total so far, the tier reached and the top tier, your
// contribution and percentile band, and the reward if it ended now. We keep a short history of each, so the module
// can say how fast it's moving, and the rewards you've collected (CommunityGoalReward).

wantHistory();

let goals = store.get("goals", {});       // CGID → what we know (see update())
let rewards = store.get("rewards", []);   // newest first: { at, name, system, reward }
let lastUpdate = store.get("lastUpdate", 0);
let opts = store.get("opts", { showDone: true });
const save = () => { store.set("goals", goals); store.set("rewards", rewards); store.set("lastUpdate", lastUpdate); store.set("opts", opts); };

const HOUR = 3600000, DAY = 24 * HOUR;
const tierNum = s => { const m = /(\d+)/.exec(String(s || "")); return m ? Number(m[1]) : 0; };
const at = e => Date.parse(e.timestamp || "") || Date.now();

function ago(ms) {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return m < 60 ? tr("js.m_ago", "{0}m ago", m) : m < 1440 ? tr("js.h_ago", "{0}h ago", Math.round(m / 60)) : tr("js.d_ago", "{0}d ago", Math.round(m / 1440));
}
function span(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return tr("js.span_m", "{0}m", m);
    const h = Math.floor(m / 60);
    if (h < 48) return tr("js.span_hm", "{0}h {1}m", h, m % 60);
    return tr("js.span_dh", "{0}d {1}h", Math.floor(h / 24), h % 24);
}
const bandText = b => b > 0 ? tr("js.top_band", "TOP {0}%", b) : "";

// ---- the journal ----

on("CommunityGoal", (e, replay) => {
    const when = at(e);
    if (when < lastUpdate) return;           // read back again at start: already have it (or newer)
    const listed = new Set();
    for (const g of e.CurrentGoals || []) {
        const id = String(g.CGID);
        listed.add(id);
        const old = goals[id] || {};
        const now = {
            id, title: g.Title || old.title || "?", system: g.SystemName || old.system || "", market: g.MarketName || old.market || "",
            expiry: Date.parse(g.Expiry || "") || old.expiry || 0,
            complete: !!g.IsComplete,
            total: Number(g.CurrentTotal) || 0, mine: Number(g.PlayerContribution) || 0, contributors: Number(g.NumContributors) || 0,
            topSize: Number(g.TopRankSize) || 0, inTop: !!g.PlayerInTopRank,
            tier: g.TierReached || "", topTier: (g.TopTier && g.TopTier.Name) || old.topTier || "",
            band: Number(g.PlayerPercentileBand) || 0, bonus: Number(g.Bonus) || 0,
            joined: true, listed: true, rewarded: old.rewarded || 0,
            warned: old.warned || false, updated: when,
            history: (old.history || []).slice(),
        };
        // a point for "how fast it's moving" (only when something changed)
        const last = now.history[now.history.length - 1];
        if (!last || last.total !== now.total || last.mine !== now.mine) now.history.push({ at: when, total: now.total, mine: now.mine });
        now.history = now.history.filter(p => p.at > when - 3 * DAY).slice(-60);

        if (!replay && old.updated) {
            if (tierNum(now.tier) > tierNum(old.tier))
                notify(tr("js.n_tier", "COMMUNITY GOAL · {0} REACHED · {1}", now.tier.toUpperCase(), now.title.toUpperCase()), "info", 10);
            if (now.band > 0 && old.band > 0 && now.band < old.band)
                notify(tr("js.n_band", "COMMUNITY GOAL · YOU'RE IN THE TOP {0}% · {1}", now.band, now.title.toUpperCase()), "info", 10);
            if (now.inTop && !old.inTop)
                notify(tr("js.n_top", "COMMUNITY GOAL · YOU'RE IN THE TOP {0} COMMANDERS · {1}", now.topSize, now.title.toUpperCase()), "info", 12);
            if (now.complete && !old.complete)
                notify(tr("js.n_complete", "COMMUNITY GOAL COMPLETE · {0} · HAND IN AT {1}", now.title.toUpperCase(), (now.market || now.system).toUpperCase()), "info", 14);
        }
        goals[id] = now;
    }
    // Goals the game no longer lists have finished (or you left them): kept until a week after they end
    for (const id of Object.keys(goals)) if (!listed.has(id)) goals[id].listed = false;
    lastUpdate = when;
    tidy();
    if (replay) { pending = true; return; }   // reading back old journals at start: show once at the end
    save();
    show();
});

on("CommunityGoalJoin", (e, replay) => {
    const id = String(e.CGID);
    if (!goals[id] && at(e) < lastUpdate) return;   // an old one, finished and tidied away since
    if (!goals[id]) goals[id] = { id, title: e.Name || "?", system: e.System || "", market: "", expiry: 0, history: [], tier: "", topTier: "", updated: 0 };
    goals[id].joined = true;
    goals[id].listed = true;
    if (!replay) { save(); show(); }
});

on("CommunityGoalDiscard", (e, replay) => {
    delete goals[String(e.CGID)];
    if (!replay) { save(); show(); }
});

on("CommunityGoalReward", (e, replay) => {
    const when = at(e);
    if (rewards.some(r => r.at === when && r.name === (e.Name || ""))) return;   // read back again
    rewards.unshift({ at: when, name: e.Name || "?", system: e.System || "", reward: Number(e.Reward) || 0 });
    rewards = rewards.slice(0, 25);
    const g = goals[String(e.CGID)];
    if (g) g.rewarded = Number(e.Reward) || 0;
    if (!replay) notify(tr("js.n_reward", "COMMUNITY GOAL REWARD · {0} CR · {1}", fmt(Number(e.Reward) || 0), (e.Name || "").toUpperCase()), "info", 10);
    save();
    show();
});

function tidy() {
    const cut = Date.now() - 7 * DAY;
    for (const id of Object.keys(goals)) {
        const g = goals[id];
        if (g.expiry && g.expiry < cut) delete goals[id];
        else if (!g.expiry && (g.updated || 0) < cut - 30 * DAY) delete goals[id];
    }
}

// Once a minute: the time left moves on; a warning a day before a goal you've contributed to ends
let lastMinute = 0, pending = false;
on("tick", () => {
    if (pending) { pending = false; save(); show(); }
    const now = Date.now();
    if (now - lastMinute < 60000) return;
    lastMinute = now;
    let changed = false;
    for (const g of Object.values(goals)) {
        const left = g.expiry - now;
        if (g.listed && !g.complete && !g.warned && g.expiry && left > 0 && left < DAY && (g.mine || 0) > 0) {
            g.warned = true; changed = true;
            notify(tr("js.n_ending", "COMMUNITY GOAL ENDS IN {0} · {1}", span(left), (g.title || "").toUpperCase()), "warning", 12);
        }
    }
    if (changed) save();
    show();
});

on("click:done", () => { opts.showDone = !opts.showDone; save(); show(); });

// ---- the view ----

function row(g) {
    const now = Date.now();
    const left = g.expiry ? g.expiry - now : NaN;
    const ended = !!g.expiry && left <= 0;
    const t = tierNum(g.tier), top = tierNum(g.topTier);

    // how fast it's moving: the change over the history we have (up to a day)
    let trend = "";
    const h = (g.history || []).filter(p => p.at > (g.updated || now) - DAY);
    if (h.length >= 2) {
        const first = h[0], last = h[h.length - 1], hours = (last.at - first.at) / HOUR;
        const grew = last.total - first.total;
        if (hours >= .25 && grew > 0)
            trend = tr("js.trend", "+{0} in the last {1} (≈ {2} an hour)", fmt(grew), span(last.at - first.at), fmt(Math.round(grew / hours)));
    }

    let mine;
    if ((g.mine || 0) > 0) mine = tr("js.mine", "You: {0} ({1} of the total)", fmt(g.mine), g.total > 0 ? (g.mine / g.total * 100).toFixed(g.mine / g.total < .01 ? 2 : 1) + "%" : "—");
    else mine = g.updated ? tr("js.mine_none", "You haven't contributed yet") : tr("js.waiting", "Signed up: waiting for the game's first report");

    return {
        id: g.id,
        title: g.title || "?",
        place: [g.system, g.market].filter(Boolean).join("  ·  "),
        left: g.rewarded ? tr("js.collected", "COLLECTED") : g.complete ? tr("js.complete", "COMPLETE") : ended ? tr("js.ended", "ENDED")
            : isNaN(left) ? "" : tr("js.left", "{0} LEFT", span(left).toUpperCase()),
        soon: !g.complete && !ended && left < DAY, urgent: !g.complete && !ended && left < 6 * HOUR,
        complete: !!g.complete || !!g.rewarded, ended: ended && !g.complete && !g.rewarded,
        tierText: t > 0 ? (top > 0 ? tr("js.tier_of", "{0} of {1}", g.tier, top) : g.tier) : (g.updated ? tr("js.no_tier", "No tier reached yet") : ""),
        tierNext: top > 0 && t < top ? tr("js.tiers_to_go", "{0} to the top tier", top - t) : top > 0 && t >= top ? tr("js.top_tier", "top tier reached") : "",
        tierPct: top > 0 ? Math.min(100, t / top * 100) : 0,
        totalText: g.updated ? tr("js.total", "Total {0} · {1} commanders taking part", fmt(g.total || 0), fmt(g.contributors || 0)) : "",
        trend,
        mine,
        band: (g.mine || 0) > 0 ? bandText(g.band) : "",
        bandTop: g.band > 0 && g.band <= 10, bandMid: g.band > 10 && g.band <= 50,
        top: g.inTop ? tr("js.in_top", "★ In the top {0} commanders", g.topSize) : "",
        reward: g.rewarded ? tr("js.rewarded", "Reward collected: {0} cr", fmt(g.rewarded))
              : (g.bonus || 0) > 0 ? tr(g.complete || ended ? "js.reward_due" : "js.reward_now", g.complete || ended ? "Reward to collect: about {0} cr" : "Reward if it ended now: {0} cr", fmt(g.bonus)) : "",
        order: (g.complete || ended || g.rewarded ? 1e15 : 0) + (g.expiry || 9e14),
    };
}

function show() {
    const all = Object.values(goals);
    const active = all.filter(g => !g.complete && !g.rewarded && !(g.expiry && g.expiry <= Date.now()) && g.listed !== false);
    const done = all.length - active.length;
    const rows = all.filter(g => opts.showDone || active.includes(g)).map(row).sort((a, b) => a.order - b.order);
    set("goals", rows);
    set("summary", all.length === 0 ? "" : tr("js.summary", "{0} active · {1} finished{2}", active.length, done,
        lastUpdate ? tr("js.updated", " · updated {0}", ago(lastUpdate)) : ""));
    set("doneText", opts.showDone ? tr("js.hide_done", "Hide finished") : tr("js.show_done", "Show finished"));
    set("empty", all.length > 0 ? (rows.length === 0 ? tr("js.all_hidden", "Only finished goals: press Show finished to see them.") : "")
        : tr("js.empty", "No community goals yet. Sign up for one on a station's Community Goals board; the game then reports its progress here every few minutes while you play."));
    set("rewards", rewards.slice(0, 8).map(r => ({ name: r.name, when: ago(r.at), reward: tr("js.cr", "{0} cr", fmt(r.reward)) })));
    set("rewardsNone", rewards.length ? "" : tr("js.rewards_none", "None collected yet."));
}

tidy();
show();
