// Squadron: your squadron, your rank in it, what's happened, and the squadron chat.
//
// The game writes SquadronStartup at login (the squadron's name and your rank), and an event for creating, joining,
// leaving, being invited, kicked, promoted or demoted, sharing a bookmark and winning a trophy. Ranks are numbers in
// the journal (each squadron names its own), so they show as "rank 3". Squadron chat is ReceiveText on the
// "squadron" channel. Kept between sessions.

// ---- little helpers (kept in this file so the addon stands alone)
function cmdrName(s) {
    // "$cmdr_decorate:#name=Jameson;" → "Jameson"; plain names as they are
    const m = /#name=([^;]+);?/.exec(String(s || ""));
    return m ? m[1] : String(s || "").replace(/^\$/, "");
}
function clock(t) {
    const d = new Date(t);
    if (isNaN(d)) return "";
    const p = n => (n < 10 ? "0" : "") + n;
    return p(d.getHours()) + ":" + p(d.getMinutes());
}
function since(t) {
    const ms = Date.now() - Date.parse(t);
    if (!(ms >= 0)) return "";
    const m = Math.floor(ms / 60000);
    return m < 1 ? tr("js.just_now", "just now") : m < 60 ? tr("js.min", "{0} min", m) : m < 48 * 60 ? tr("js.h_min", "{0} h {1} min", Math.floor(m / 60), m % 60) : tr("js.days", "{0} days", Math.floor(m / 1440));
}
function left(t) {
    const ms = Date.parse(t) - Date.now();
    if (isNaN(ms)) return "";
    if (ms <= 0) return tr("js.expired", "expired");
    const m = Math.floor(ms / 60000);
    return m < 60 ? tr("js.min", "{0} min", m) : m < 48 * 60 ? tr("js.h_min", "{0} h {1} min", Math.floor(m / 60), m % 60) : tr("js.days", "{0} days", Math.floor(m / 1440));
}
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


let sq = store.get("sq", { name: "", rank: null, since: "" });
let feed = store.get("log", []);    // [{ t, text, kind }]
let chat = store.get("chat", []);  // [{ t, from, text }]
const seen = makeSeen("seen");
function save() { store.set("sq", sq); store.set("log", feed); store.set("chat", chat); }
function add(t, text, kind) { feed.unshift({ t, text, kind: kind || "" }); feed = feed.slice(0, 40); }
function rankText(r) { return r === null || r === undefined ? "" : tr("js.rank", "rank {0}", r); }

on("SquadronStartup", e => {
    if (!seen(e)) return;
    if (sq.name !== e.SquadronName) sq.since = sq.since || e.timestamp || "";
    sq.name = e.SquadronName || sq.name;
    if (typeof e.CurrentRank === "number") sq.rank = e.CurrentRank;
    save(); show();
});
function event(name, fn) { on(name, (e, replay) => { if (!seen(e)) return; fn(e, replay); save(); show(); }); }
event("SquadronCreated", e => { sq = { name: e.SquadronName || "", rank: null, since: e.timestamp || "" }; add(e.timestamp, tr("js.created", "You created {0}", e.SquadronName), "good"); });
event("JoinedSquadron", (e, replay) => {
    sq = { name: e.SquadronName || "", rank: 0, since: e.timestamp || "" };
    add(e.timestamp, tr("js.joined", "You joined {0}", e.SquadronName), "good");
    if (!replay) notify(tr("js.joined", "You joined {0}", e.SquadronName), "info", 6);
});
event("LeftSquadron", e => { add(e.timestamp, tr("js.left", "You left {0}", e.SquadronName || sq.name)); sq = { name: "", rank: null, since: "" }; });
event("KickedFromSquadron", e => { add(e.timestamp, tr("js.kicked", "You were removed from {0}", e.SquadronName || sq.name), "bad"); sq = { name: "", rank: null, since: "" }; });
event("DisbandedSquadron", e => { add(e.timestamp, tr("js.disbanded", "{0} was disbanded", e.SquadronName || sq.name), "bad"); sq = { name: "", rank: null, since: "" }; });
event("AppliedToSquadron", e => add(e.timestamp, tr("js.applied", "You applied to join {0}", e.SquadronName)));
event("InvitedToSquadron", (e, replay) => { add(e.timestamp, tr("js.invited", "You were invited to join {0}", e.SquadronName), "good"); if (!replay) notify(tr("js.invited", "You were invited to join {0}", e.SquadronName), "info", 6); });
event("SquadronPromotion", (e, replay) => {
    sq.rank = e.NewRank;
    add(e.timestamp, tr("js.promoted", "Promoted: {0} → {1}", rankText(e.OldRank), rankText(e.NewRank)), "good");
    if (!replay) notify(tr("js.n_promoted", "Squadron promotion: {0}", rankText(e.NewRank)), "info", 6);
});
event("SquadronDemotion", e => { sq.rank = e.NewRank; add(e.timestamp, tr("js.demoted", "Demoted: {0} → {1}", rankText(e.OldRank), rankText(e.NewRank)), "bad"); });
event("SharedBookmarkToSquadron", e => add(e.timestamp, tr("js.bookmark", "You shared a bookmark with {0}", e.SquadronName || sq.name)));
event("WonATrophyForSquadron", e => add(e.timestamp, tr("js.trophy", "You won a trophy for {0}", e.SquadronName || sq.name), "good"));
on("ReceiveText", e => {
    const ch = String(e.Channel || "").toLowerCase();
    if ((ch !== "squadron" && ch !== "squadleaders") || !seen(e)) return;
    chat.unshift({ t: e.timestamp || "", from: e.From_Localised || cmdrName(e.From), text: e.Message_Localised || e.Message || "", leaders: ch === "squadleaders" });
    chat = chat.slice(0, 40);
    save(); show();
});
on("SendText", e => {
    // your own messages to the squadron (or its leaders' channel)
    const to = String(e.To || "").toLowerCase();
    if ((to !== "squadron" && to !== "squadleaders") || e.Sent === false || !seen(e)) return;
    chat.unshift({ t: e.timestamp || "", from: tr("js.you", "You"), text: e.Message || "", leaders: to === "squadleaders", mine: true });
    chat = chat.slice(0, 40);
    save(); show();
});
on("click:clearChat", () => { chat = []; save(); show(); });

function show() {
    set("name", sq.name || tr("js.no_squadron", "Not in a squadron"));
    set("inSquadron", !!sq.name);
    set("rank", sq.name ? rankText(sq.rank) : "");
    set("since", sq.name && sq.since ? tr("js.since", "since {0}", new Date(sq.since).toLocaleDateString()) : "");
    set("log", feed.slice(0, 8).map(l => ({ when: new Date(l.t).toLocaleDateString(), text: l.text, good: l.kind === "good", bad: l.kind === "bad" })));
    set("logHead", feed.length ? tr("js.history", "HISTORY") : "");
    set("chat", chat.slice(0, 12).map(c => ({ when: clock(c.t), from: (c.leaders ? "◆ " : "") + c.from, text: c.text })));
    set("chatHead", chat.length ? tr("js.chat", "SQUADRON CHAT") : "");
    set("empty", !sq.name && !feed.length ? tr("js.none", "The game says which squadron you're in when you log in.") : "");
}
on("language", show);
show();
