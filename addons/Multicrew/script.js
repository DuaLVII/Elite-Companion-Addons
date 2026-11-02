// Multicrew: who's aboard your ship (or whose ship you're on), their roles, and what's happened in the session.
//
// From CrewMemberJoins / CrewMemberQuits / CrewMemberRoleChange (on your ship), JoinACrew / QuitACrew /
// ChangeCrewRole (on someone else's), KickCrewMember and EndCrewSession. Roles are helm, gunner and fighter con.

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


let s = store.get("session", { mode: "", captain: "", role: "", since: "", crew: [] });   // mode: "" · host · guest; crew: [{ name, role, joined, tele }]
let feed = store.get("log", []);   // [{ t, text, bad }]
const seen = makeSeen("seen");
function save() { store.set("session", s); store.set("log", feed); }
function add(t, text, bad) { feed.unshift({ t, text, bad: !!bad }); feed = feed.slice(0, 30); }
function roleName(r) {
    const k = String(r || "").toLowerCase();
    return k === "helm" ? tr("js.helm", "Helm") : k === "firecon" || k === "fireman" || k === "gunner" ? tr("js.gunner", "Gunner")
         : k === "fightercon" ? tr("js.fighter", "Fighter con") : k === "idle" ? tr("js.idle", "Idle") : String(r || "");
}
function end(t, text) {
    if (s.mode) add(t, text);
    s = { mode: "", captain: "", role: "", since: "", crew: [] };
}

on("CrewMemberJoins", (e, replay) => {
    if (!seen(e)) return;
    if (s.mode !== "host") s = { mode: "host", captain: "", role: "", since: e.timestamp || "", crew: [] };
    const name = cmdrName(e.Crew);
    s.crew = s.crew.filter(c => c.name !== name).concat([{ name, role: "", joined: e.timestamp || "", tele: !!e.Telepresence }]);
    add(e.timestamp, tr("js.joins", "{0} joined your crew", name) + (e.Telepresence ? " " + tr("js.tele", "(telepresence)") : ""));
    save(); show();
    if (!replay) notify(tr("js.joins", "{0} joined your crew", name), "info", 5);
});
on("CrewMemberQuits", e => {
    if (!seen(e)) return;
    const name = cmdrName(e.Crew);
    s.crew = s.crew.filter(c => c.name !== name);
    add(e.timestamp, tr("js.quits", "{0} left your crew", name));
    if (s.mode === "host" && s.crew.length === 0) end(e.timestamp, tr("js.empty", "Session over: everyone's left"));
    save(); show();
});
on("CrewMemberRoleChange", e => {
    if (!seen(e)) return;
    const name = cmdrName(e.Crew);
    const c = s.crew.find(x => x.name === name);
    if (c) c.role = e.Role || "";
    add(e.timestamp, tr("js.role_change", "{0} is now {1}", name, roleName(e.Role)));
    save(); show();
});
on("KickCrewMember", e => {
    if (!seen(e)) return;
    const name = cmdrName(e.Crew);
    s.crew = s.crew.filter(c => c.name !== name);
    add(e.timestamp, tr("js.kicked", "You removed {0} from your crew", name) + (e.OnCrime ? " " + tr("js.crime", "(for a crime)") : ""), true);
    save(); show();
});
on("JoinACrew", (e, replay) => {
    if (!seen(e)) return;
    s = { mode: "guest", captain: cmdrName(e.Captain), role: "Idle", since: e.timestamp || "", crew: [] };
    add(e.timestamp, tr("js.joined", "You joined {0}'s crew", s.captain) + (e.Telepresence ? " " + tr("js.tele", "(telepresence)") : ""));
    save(); show();
});
on("ChangeCrewRole", e => {
    if (!seen(e)) return;
    s.role = e.Role || "";
    add(e.timestamp, tr("js.your_role", "Your role: {0}", roleName(e.Role)));
    save(); show();
});
on("QuitACrew", e => { if (seen(e)) { end(e.timestamp, tr("js.quit", "You left {0}'s crew", cmdrName(e.Captain) || s.captain)); save(); show(); } });
on("EndCrewSession", e => { if (seen(e)) { end(e.timestamp, tr("js.ended", "You ended the crew session") + (e.OnCrime ? " " + tr("js.crime", "(for a crime)") : "")); save(); show(); } });
on("LoadGame", e => { if (seen(e)) { end(e.timestamp, tr("js.relog", "Session over (you logged in again)")); save(); show(); } });
on("click:copy", name => { copy(name); notify(tr("js.copied", "{0} copied", name), "info", 3); });
on("tick", () => { if (s.mode && (Date.now() / 1000 | 0) % 30 === 0) show(); });

function show() {
    set("mode", s.mode);
    set("title", s.mode === "host" ? tr("js.t_host", "YOUR SHIP · {0} ABOARD", s.crew.length) : s.mode === "guest" ? tr("js.t_guest", "ON {0}'S SHIP", s.captain.toUpperCase()) : tr("js.t_none", "NO CREW SESSION"));
    set("since", s.mode && s.since ? tr("js.since", "for {0}", since(s.since)) : "");
    set("you", s.mode === "guest" ? tr("js.you_are", "You're: {0}", roleName(s.role) || "—") : "");
    set("crew", s.crew.map(c => ({ name: c.name, role: roleName(c.role) || tr("js.idle", "Idle"), joined: tr("js.aboard", "aboard {0}", since(c.joined)), tele: c.tele ? "📡" : "" })));
    set("log", feed.slice(0, 8).map(l => ({ when: clock(l.t), text: l.text, bad: l.bad })));
    set("logHead", feed.length ? tr("js.recent", "RECENTLY") : "");
    set("empty", s.mode ? "" : tr("js.none", "Invite commanders to your ship (or join theirs) from the comms panel: who's aboard and their roles show here."));
}
on("language", show);
show();
