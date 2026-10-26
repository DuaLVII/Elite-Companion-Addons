// Back to Ship: where you left the ship and the SRV, and a marker of your own.
//
// Ship:   Touchdown (lat/long where it landed, also when it lands after being recalled); Liftoff clears it.
//         Also: whenever you're sitting in your landed ship, it's where you are (covers logging in on the surface).
// SRV:    where you were when you got out of it (Disembark with SRV); getting back in or docking it clears it.
// Marker: tick "Mark this spot" in the module.
// Arrows point relative to the way you're facing (Status.json Heading), so ▲ = straight ahead.
include("_shared/surface.js");

let t = store.get("targets", { ship: null, srv: null, mark: null });   // each { lat, lon, body }
const save = () => store.set("targets", t);

const at = (lat, lon, body) => ({ lat, lon, body: body || (Surface.pos && Surface.pos.body) || game.Body || "" });

on("Touchdown", e => { if (e.Latitude !== undefined) { t.ship = at(e.Latitude, e.Longitude, e.Body); save(); show(); } });
on("Liftoff", () => { t.ship = null; save(); show(); });
// Sitting in your ship while it's landed: the ship is right here (covers logging in on the surface)
const LANDED = 1, IN_SHIP = 24;

on("Disembark", e => {
    if (e.SRV && Surface.pos) { t.srv = at(Surface.pos.lat, Surface.pos.lon, e.Body); save(); show(); }
});
on("Embark", e => { if (e.SRV) { t.srv = null; save(); show(); } });
on("DockSRV", () => { t.srv = null; save(); show(); });
on("SRVDestroyed", () => { t.srv = null; save(); show(); });

// The check boxes in the module write V[markNow] / V[clearMark]: act on them straight away (then untick them)
set("markNow", false);
set("clearMark", false);
on("change:markNow", on => {
    if (!on) return;
    set("markNow", false);
    if (Surface.pos) { t.mark = at(Surface.pos.lat, Surface.pos.lon); save(); notify(tr("js.marker_set", "Marker set"), "info", 3); }
    show();
});
on("change:clearMark", on => {
    if (!on) return;
    set("clearMark", false);
    t.mark = null; save(); show();
});
// The time to reach each point counts down while you're moving
on("tick", () => show());

Surface.onMove((p, s) => {
    if (p && Surface.flag(s, LANDED) && Surface.flag(s, IN_SHIP)) {
        const moved = !t.ship || t.ship.body !== p.body || Surface.distance(t.ship, p) > 5;
        if (moved) { t.ship = at(p.lat, p.lon, p.body); save(); }
    }
    show();
});

function target(key, label) {
    const p = Surface.pos, x = t[key];
    const hide = text => {
        set(key + "Visible", false); set(key + "Text", text);
        set(key + "Distance", ""); set(key + "Detail", "");
    };
    if (!x) return hide(tr("js.not_set", "{0}: not set", label));
    if (!p || (x.body && p.body && x.body !== p.body)) return hide(tr("js.on", "{0}: on {1}", label, x.body || tr("js.another_body", "another body")));
    const here = { lat: p.lat, lon: p.lon };
    const d = Surface.distance(here, x, p.radius);
    const b = Surface.bearing(here, x);
    const rel = (b - (p.heading || 0) + 360) % 360;
    set(key + "Visible", true);
    set(key + "Angle", Math.round(rel));
    set(key + "Distance", Surface.metres(d));
    const speed = game.GroundSpeed || 0;
    set(key + "Detail", tr("js.bearing", "bearing {0}°", Math.round(b)) + (speed > 1 && d > 20 ? tr("js.at_this_speed", " · {0} at this speed", eta(d / speed)) : ""));
    set(key + "Text", label);
}

function eta(seconds) {
    const s = Math.round(seconds);
    return s < 60 ? `${s} s` : s < 3600 ? tr("js.min_s", "{0} min {1} s", Math.floor(s / 60), s % 60) : tr("js.h_min", "{0} h {1} min", Math.floor(s / 3600), Math.floor(s / 60) % 60);
}

function show() {
    const p = Surface.pos;
    set("where", p ? tr("js.heading", "{0} · heading {1}°", p.body || tr("js.surface", "Surface"), Math.round(p.heading || 0)) : tr("js.not_on_a_planet_surface", "Not on a planet surface"));
    target("ship", tr("js.ship", "SHIP"));
    target("srv", tr("js.srv", "SRV"));
    target("mark", tr("js.marker", "MARKER"));
}

show();
