// System Traffic: an example of an addon that uses the internet through the app.
//
//   web.edsm(path, query, (data, error) => …)     and     web.spansh(path, query, (data, error) => …)
//
// The app makes the request (only to EDSM / Spansh's public APIs, and only if addon.json lists them under "web"),
// then calls you back with the parsed answer. Answers are cached for 5 minutes, so asking again is cheap.

let shown = "";      // the system currently shown
let typedAt = 0;     // when the search box last changed (we wait until typing stops)

function lookup(system) {
    if (!system || system === "—" || system === shown) return;
    shown = system;
    set("system", system);
    set("status", tr("js.asking_edsm", "Asking EDSM…"));

    web.edsm("api-system-v1/traffic", { systemName: system }, (data, error) => {
        if (shown !== system) return;                       // the user moved on meanwhile
        if (error) { set("status", tr("js.couldn_t_reach_edsm", "Couldn't reach EDSM: ") + error); return; }
        if (!data || !data.traffic) {                        // EDSM answers {} for systems it doesn't know
            set("status", tr("js.edsm_doesn_t_know", "EDSM doesn't know ") + system + tr("js.yet", " yet."));
            ["day", "week", "total", "deaths", "discovered"].forEach(k => set(k, ""));
            set("ships", []);
            return;
        }
        set("system", data.name || system);
        set("day", fmt(data.traffic.day));
        set("week", fmt(data.traffic.week));
        set("total", fmt(data.traffic.total));
        set("status", tr("js.from_edsm", "From EDSM · ") + new Date().toLocaleTimeString().slice(0, 5));
        set("discovered", data.discovery && data.discovery.commander
            ? tr("js.first_reported_to_edsm_by_cmdr", "First reported to EDSM by CMDR ") + data.discovery.commander + " (" + String(data.discovery.date).slice(0, 10) + ")" : "");

        // Ships flown here in the last 24 hours, most common first, with a bar each
        const counts = Object.entries(data.breakdown || {}).sort((a, b) => b[1] - a[1]);
        const most = counts.length ? counts[0][1] : 1;
        set("ships", counts.slice(0, 12).map(([name, count]) => ({
            name, count,
            fill: (count / most) + "*", rest: (1 - count / most + 0.0001) + "*",
        })));
    });

    web.edsm("api-system-v1/deaths", { systemName: system }, (data, error) => {
        if (shown !== system || error || !data || !data.deaths) { if (!error) set("deaths", ""); return; }
        const d = data.deaths;
        set("deaths", d.total ? tr("js.today_this_week_ever", "☠ {0} today · {1} this week · {2} ever", fmt(d.day), fmt(d.week), fmt(d.total)) : tr("js.no_deaths_reported_here", "No deaths reported here"));
    });
}

function current() {
    const typed = String(get("query") || "").trim();
    return typed.length ? typed : game.StarSystem;
}

// Follow your jumps (when the search box is empty)
on("FSDJump", (e, replay) => { if (!replay) lookup(current()); });
on("Location", (e, replay) => { if (!replay) lookup(current()); });

// Typing in the search box: look it up a moment after typing stops
on("change:query", () => { typedAt = Date.now(); waiting = true; });
let waiting = true;   // also does the first lookup at start-up
on("tick", () => {
    if (!waiting || Date.now() - typedAt < 800) return;
    const sys = current();
    if (!sys || sys === "—") return;   // location not known yet (start-up): try again next second
    waiting = false;
    lookup(sys);
});
