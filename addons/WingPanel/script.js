// Wing Panel: who's in your wing, since when, invites, and the wing's chat.
//
// The game writes WingJoin (with the commanders already in it) when you join, WingAdd for each one who joins after,
// WingLeave when you leave, and WingInvite when someone invites you. Wing chat comes as ReceiveText on the "wing"
// channel. Logging out ends the wing. Click ⧉ to copy a name (to find them in the galaxy map or the comms panel).

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


let wing = store.get("wing", { on: false, since: "", members: [] });   // members: [{ name, joined }]
let invites = store.get("invites", []);                               // [{ name, t }]
let chat = store.get("chat", []);                                     // [{ t, from, text, mine }]
let history = store.get("history", []);                               // [{ t, text }] joins and leaves
const seen = makeSeen("seen");

function save() { store.set("wing", wing); store.set("invites", invites); store.set("chat", chat); store.set("history", history); }
function note(t, text) { history.unshift({ t, text }); history = history.slice(0, 30); }
function addMember(name, t) {
    name = cmdrName(name);
    if (!name || wing.members.some(m => m.name.toLowerCase() === name.toLowerCase())) return false;
    wing.members.push({ name, joined: t });
    return true;
}

on("WingJoin", (e, replay) => {
    if (!seen(e)) return;
    wing = { on: true, since: e.timestamp || "", members: [] };
    for (const n of e.Others || []) addMember(n, e.timestamp);
    invites = [];
    note(e.timestamp, tr("js.joined_wing", "You joined a wing ({0} others)", wing.members.length));
    save(); show();
    if (!replay) notify(tr("js.n_joined", "Wing joined: {0}", wing.members.map(m => m.name).join(", ") || "—"), "info", 5);
});
on("WingAdd", (e, replay) => {
    if (!seen(e)) return;
    if (!wing.on) wing = { on: true, since: e.timestamp || "", members: [] };   // (you made the wing: the first to join starts it)
    if (addMember(e.Name, e.timestamp)) note(e.timestamp, tr("js.member_joined", "{0} joined the wing", cmdrName(e.Name)));
    save(); show();
    if (!replay && setting("notifyJoins", true)) notify(tr("js.n_added", "{0} joined your wing", cmdrName(e.Name)), "info", 5);
});
function endWing(e, why) {
    if (!wing.on && wing.members.length === 0) return;
    note(e.timestamp, why);
    wing = { on: false, since: "", members: [] };
    save(); show();
}
on("WingLeave", e => { if (seen(e)) endWing(e, tr("js.left_wing", "You left the wing")); });
on("LoadGame", e => { if (seen(e)) endWing(e, tr("js.wing_ended", "Wing ended (you logged in again)")); });
on("Shutdown", e => { if (seen(e)) endWing(e, tr("js.wing_ended_quit", "Wing ended (the game closed)")); });
on("WingInvite", (e, replay) => {
    if (!seen(e)) return;
    const name = cmdrName(e.Name);
    invites = invites.filter(i => i.name !== name);
    invites.unshift({ name, t: e.timestamp || "" });
    invites = invites.slice(0, 5);
    save(); show();
    if (!replay) notify(tr("js.n_invite", "{0} invited you to a wing", name), "info", 6);
});
on("ReceiveText", (e, replay) => {
    if (String(e.Channel || "").toLowerCase() !== "wing" || !seen(e)) return;
    chat.unshift({ t: e.timestamp || "", from: e.From_Localised || cmdrName(e.From), text: e.Message_Localised || e.Message || "", mine: false });
    chat = chat.slice(0, 40);
    save(); show();
});
on("SendText", e => {
    if (String(e.To || "").toLowerCase() !== "wing" || e.Sent === false || !seen(e)) return;
    chat.unshift({ t: e.timestamp || "", from: tr("js.you", "You"), text: e.Message || "", mine: true });
    chat = chat.slice(0, 40);
    save(); show();
});
on("Status", s => {
    // Status.json says whether you're in a wing: if it says not, any wing shown is stale (a missed WingLeave)
    if (s && typeof s.Flags === "number" && !(s.Flags & 0x80) && wing.on && wing.members.length === 0) { wing.on = false; save(); show(); }
});
on("click:copy", name => { copy(name); notify(tr("js.copied", "{0} copied", name), "info", 3); });
on("click:clearChat", () => { chat = []; save(); show(); });
on("tick", () => { if (wing.on && (Date.now() / 1000 | 0) % 30 === 0) show(); });

function show() {
    set("inWing", wing.on);
    set("title", wing.on ? tr("js.in_wing", "IN A WING · {0}", wing.members.length + 1) : tr("js.no_wing", "NOT IN A WING"));
    set("since", wing.on && wing.since ? tr("js.since", "for {0} (since {1})", since(wing.since), clock(wing.since)) : "");
    set("members", wing.members.map(m => ({ name: m.name, joined: tr("js.joined_at", "joined {0}", clock(m.joined)) })));
    set("empty", wing.on && wing.members.length === 0 ? tr("js.waiting", "Waiting for wingmates to join…") : "");
    set("invites", invites.map(i => ({ name: i.name, when: clock(i.t) })));
    set("invitesHead", invites.length && !wing.on ? tr("js.invites", "INVITES") : "");
    set("chat", chat.slice(0, 12).map(c => ({ when: clock(c.t), from: c.from, text: c.text, mine: c.mine })));
    set("chatHead", chat.length ? tr("js.chat", "WING CHAT") : "");
    set("history", history.slice(0, 6).map(h => ({ when: clock(h.t), text: h.text })));
    set("historyHead", history.length ? tr("js.history", "RECENTLY") : "");
}
on("language", show);
show();
