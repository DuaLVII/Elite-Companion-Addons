// Friends Online: which of your friends are in the game, and an alert when ones you star log on.
//
// The game writes a Friends event for each friend whose status changes (Online, Offline, Requested, Added, Lost,
// Declined), including the ones already online when you log in. ★ a friend to be told when they come online.
// Click ⧉ to copy a name.

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


let friends = store.get("friends", {});   // name → { status, t }
let stars = store.get("stars", []);        // names to be told about
let feed = store.get("log", []);            // [{ t, text }]
let sessionStart = "";
const seen = makeSeen("seen");
function save() { store.set("friends", friends); store.set("stars", stars); store.set("log", feed); }

on("LoadGame", e => {
    if (!seen(e)) return;
    // a new session: nobody is known to be online until the game says so again
    sessionStart = e.timestamp || "";
    for (const f of Object.values(friends)) if (f.status === "Online") f.status = "Offline";
    save(); show();
});
on("Friends", (e, replay) => {
    if (!e.Name || !seen(e)) return;
    const name = cmdrName(e.Name), st = e.Status || "";
    const was = (friends[name] || {}).status;
    if (st === "Lost" || st === "Declined") delete friends[name];
    else friends[name] = { status: st, t: e.timestamp || "" };
    if (st !== was && (st === "Online" || st === "Offline" || st === "Added" || st === "Lost")) {
        feed.unshift({ t: e.timestamp || "", text: statusLine(name, st) });
        feed = feed.slice(0, 25);
    }
    save(); show();
    if (!replay && st === "Online" && was !== "Online" && (stars.includes(name) || setting("notifyAll", false)))
        notify(tr("js.n_online", "{0} is online", name), "info", 6);
    if (!replay && st === "Requested") notify(tr("js.n_request", "Friend request from {0}", name), "info", 6);
});
on("click:star", name => { stars = stars.includes(name) ? stars.filter(n => n !== name) : stars.concat([name]); save(); show(); });
on("click:copy", name => { copy(name); notify(tr("js.copied", "{0} copied", name), "info", 3); });
on("click:forget", name => { delete friends[name]; stars = stars.filter(n => n !== name); save(); show(); });

function statusText(s) {
    return { Online: tr("js.s_online", "online"), Offline: tr("js.s_offline", "offline"), Requested: tr("js.s_requested", "asked to be friends"),
             Added: tr("js.s_added", "friend"), Lost: tr("js.s_lost", "no longer a friend") }[s] || s;
}
function statusLine(name, s) {
    return s === "Online" ? tr("js.l_online", "{0} came online", name) : s === "Offline" ? tr("js.l_offline", "{0} went offline", name)
         : s === "Added" ? tr("js.l_added", "{0} is now a friend", name) : tr("js.l_lost", "{0} is no longer a friend", name);
}
function show() {
    const all = Object.entries(friends).map(([name, f]) => ({
        name, online: f.status === "Online", request: f.status === "Requested", star: stars.includes(name),
        starText: stars.includes(name) ? "★" : "☆", status: statusText(f.status),
        when: f.status === "Online" && f.t ? tr("js.for", "for {0}", since(f.t)) : f.t ? clock(f.t) : "",
    }));
    all.sort((a, b) => (b.online - a.online) || (b.request - a.request) || (b.star - a.star) || a.name.localeCompare(b.name));
    const onlineOnly = setting("onlineOnly", false);
    set("rows", onlineOnly ? all.filter(r => r.online || r.request) : all);
    const n = all.filter(r => r.online).length;
    set("title", tr("js.online_n", "{0} ONLINE", n) + (all.length ? " · " + tr("js.of", "of {0} known", all.length) : ""));
    set("empty", all.length ? (onlineOnly && n === 0 ? tr("js.none_online", "None of your friends are online.") : "")
                            : tr("js.none", "No friends seen yet: the game lists the ones online when you log in, and each change after that."));
    set("log", feed.slice(0, 6).map(l => ({ when: clock(l.t), text: l.text })));
    set("logHead", feed.length ? tr("js.recent", "RECENTLY") : "");
}
on("setting", show);
on("language", show);
show();
