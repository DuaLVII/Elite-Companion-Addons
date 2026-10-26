// Bounty Board: example addon script for Elite Companion.
//
// on("EventName", (event, replay) => …)  runs for every journal event with that name ("*" = all events,
//                                          "Status" = Status.json updates, "tick" = once a second).
//                                          replay is true while the app reads back earlier events at startup.
// wantHistory()                           also get the last few weeks of journals at startup (for "yesterday" etc.)
// set("name", value)                      shows a value in module.xml as {Binding V[name]}
// store.get(key, fallback) / store.set(key, value)   saved between sessions (per module)
// metric("name", number, "Label", "unit") records a point for <controls:TimeSeriesChart Series="addon.name"/>
// notify(text, "info" | "warning" | "danger", seconds)   pops a notification on the top bar
// fmt(n), short(n, "cr"), game.Credits, game.StarSystem …   see Addons\README.md
//
// Bounty kills only (the Bounty event: wanted ships, skimmers, wanted people on foot). Combat bonds, commander kills
// and other kills are in the app's Combat module.

wantHistory();

let st = store.get("bounty3", {
    days: {},              // "2026-10-12" → { kills, credits }
    allKills: 0, allCredits: 0, biggest: 0,
    unclaimedBounties: 0,
    recent: [],            // newest first: { at, ship, faction, reward }
    mark: { ts: "", keys: [] },
});
const save = () => store.set("bounty3", st);

// This game session (since the latest LoadGame): not saved
let sessionStart = null, sessionKills = 0, sessionCredits = 0;

/** Each event once: history, today's replay and live events overlap. */
function fresh(e) {
    const ts = e.timestamp || "", key = e.event + ":" + JSON.stringify(e).length;
    if (ts < st.mark.ts) return false;
    if (ts === st.mark.ts) { if (st.mark.keys.includes(key)) return false; st.mark.keys.push(key); }
    else st.mark = { ts, keys: [key] };
    return true;
}

const localDay = iso => {
    const d = new Date(Date.parse(iso));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "$faction_Thargoid;" → "Thargoid"
const faction = e => String(e.VictimFaction_Localised || e.VictimFaction || "").replace(/^\$faction_|;$/g, "");

function prettyShip(e) {
    if (e.Target_Localised) return e.Target_Localised;
    return String(e.Target || "Ship").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Session tracking must see every LoadGame (even ones replayed), so it doesn't go through fresh()
on("LoadGame", e => {
    sessionStart = Date.parse(e.timestamp) || Date.now();
    sessionKills = 0; sessionCredits = 0;
    show();
});

function kill(e, replay, reward, ship, faction) {
    const inSession = sessionStart != null && Date.parse(e.timestamp) >= sessionStart;
    if (inSession) { sessionKills++; sessionCredits += reward; }
    if (!fresh(e)) { show(); return; }            // already counted in an earlier run

    const day = localDay(e.timestamp);
    const d = st.days[day] || (st.days[day] = { kills: 0, credits: 0 });
    d.kills++; d.credits += reward;
    st.allKills++; st.allCredits += reward;
    if (reward > st.biggest) st.biggest = reward;
    st.unclaimedBounties += reward;
    st.recent.unshift({ at: e.timestamp, ship, faction, reward });
    if (st.recent.length > 10) st.recent.length = 10;
    // keep 60 days of daily totals
    const keys = Object.keys(st.days).sort();
    while (keys.length > 60) delete st.days[keys.shift()];
    save();

    if (inSession) metric("bounty.earned", sessionCredits, tr("js.earned_this_session", "Earned this session"), "cr");
    if (!replay && reward >= 1000000) notify(tr("js.big_bounty_0_1_cr", "★ BIG BOUNTY · {0} · {1} CR", ship.toUpperCase(), fmt(reward)), "warning", 8);
    show();
}

on("Bounty", (e, replay) => {
    const reward = e.TotalReward || (e.Rewards || []).reduce((sum, r) => sum + (r.Reward || 0), 0) || e.Reward || 0;
    kill(e, replay, reward, prettyShip(e), faction(e));
});

on("RedeemVoucher", (e, replay) => {
    if (!fresh(e)) return;
    const broker = e.BrokerPercentage > 0 && e.BrokerPercentage < 100 ? 1 - e.BrokerPercentage / 100 : 1;
    const handedIn = Math.round((e.Amount || 0) / broker);
    if (e.Type !== "bounty") return;
    st.unclaimedBounties = Math.max(0, st.unclaimedBounties - handedIn);
    save(); show();
    if (!replay) notify(tr("js.bounties_cashed_in_0_cr", "Bounties cashed in: {0} cr", fmt(e.Amount)), "info", 6);
});

// Unclaimed vouchers are lost when you're destroyed
on("Died", e => {
    if (!fresh(e)) return;
    st.unclaimedBounties = 0;
    save(); show();
});

function show() {
    const today = localDay(new Date().toISOString());
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = localDay(y.toISOString());
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
    const from = localDay(weekAgo.toISOString());
    const day = k => st.days[k] || { kills: 0, credits: 0 };
    const week = Object.entries(st.days).filter(([k]) => k >= from)
        .reduce((t, [, d]) => ({ kills: t.kills + d.kills, credits: t.credits + d.credits }), { kills: 0, credits: 0 });

    set("kills", sessionKills);
    set("earned", short(sessionCredits, "cr"));
    if (sessionStart && sessionKills) {
        const hours = Math.max((Date.now() - sessionStart) / 3600000, 0.05);
        set("rate", short(sessionCredits / hours, "cr"));
    } else set("rate", "—");

    set("today", `${day(today).kills}`);
    set("todayCr", short(day(today).credits, "cr"));
    set("yesterday", `${day(yesterday).kills}`);
    set("yesterdayCr", short(day(yesterday).credits, "cr"));
    set("week", `${week.kills}`);
    set("weekCr", short(week.credits, "cr"));
    set("allTime", tr("js.0_kills_1", "{0} kills · {1}", fmt(st.allKills), short(st.allCredits, "cr")));
    set("biggest", st.biggest > 0 ? fmt(st.biggest) + tr("js.cr", " cr") : "—");

    set("unclaimed", st.unclaimedBounties ? tr("js.unclaimed_bounties", "UNCLAIMED BOUNTIES · {0}", short(st.unclaimedBounties, "cr")) : "");

    set("recent", st.recent.slice(0, 8).map(r => {
        const at = new Date(Date.parse(r.at));
        const sameDay = localDay(r.at) === today;
        const time = String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
        return {
            time: sameDay ? time : `${at.getDate()}/${at.getMonth() + 1} ${time}`,
            ship: r.ship, faction: r.faction ? "· " + r.faction : "",
            reward: fmt(r.reward) + tr("js.cr", " cr"), big: r.reward >= 1000000,
        };
    }));
    set("empty", st.recent.length ? "" : tr("js.no_bounty_kills_in_the_last", "No bounty kills in the last few weeks of journals yet. Good hunting, Commander."));
}

// Keep "per hour" (and today / yesterday at midnight) up to date
let ticks = 0;
on("tick", () => { if (++ticks % 30 === 0) show(); });

show();
