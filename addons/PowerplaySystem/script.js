// Powerplay System: the state of the system you're in, from what the game writes when you arrive.
//   FSDJump / Location / CarrierJump: ControllingPower, Powers, PowerplayState, PowerplayStateControlProgress,
//   PowerplayStateReinforcement, PowerplayStateUndermining, PowerplayConflictProgress [{ Power, ConflictProgress }]
include("_shared/powerplay.js");

let st = store.get("ppsys", { power: "", current: null, visited: [] });
const save = () => store.set("ppsys", st);

PP.on("Powerplay", e => { if (e.Power) { st.power = e.Power; save(); show(); } });
PP.on(["PowerplayJoin", "PowerplayDefect"], e => { st.power = e.Power || e.ToPower || ""; save(); show(); });
PP.on("PowerplayLeave", e => { st.power = ""; save(); show(); });
PP.on("PowerplayMerits", e => { if (e.Power && !st.power) { st.power = e.Power; save(); show(); } });

PP.on(["FSDJump", "Location", "CarrierJump"], e => {
    const sys = {
        name: e.StarSystem || "",
        at: e.timestamp,
        controller: e.ControllingPower || "",
        powers: Array.isArray(e.Powers) ? e.Powers : [],
        state: e.PowerplayState || "",
        control: typeof e.PowerplayStateControlProgress === "number" ? e.PowerplayStateControlProgress : null,
        reinforce: e.PowerplayStateReinforcement || 0,
        undermine: e.PowerplayStateUndermining || 0,
        conflict: Array.isArray(e.PowerplayConflictProgress)
            ? e.PowerplayConflictProgress.map(c => ({ power: c.Power, progress: c.ConflictProgress || 0 })) : [],
    };
    st.current = sys;
    if (sys.state || sys.controller || sys.powers.length) {
        st.visited = [sys].concat(st.visited.filter(v => v.name !== sys.name)).slice(0, 15);
    }
    save(); show();
});

const pct = x => Math.round(x * 1000) / 10;

/** What this system means for your power, in a few words. */
function verdict(s) {
    const me = st.power;
    if (!s.state && !s.controller && !s.powers.length) return { text: tr("js.no_powerplay_activity_here", "No Powerplay activity here."), kind: "dim" };
    if (!me) return { text: tr("js.pledge_to_a_power_to_see", "Pledge to a power to see what this system means for you."), kind: "dim" };
    if (s.controller === me) {
        if (s.undermine > s.reinforce) return { text: tr("js.your_power_s_system_and_it", "Your power's system, and it's being undermined harder than it's reinforced: reinforce it."), kind: "bad" };
        return { text: tr("js.your_power_s_system_reinforce_it", "Your power's system: reinforce it to strengthen the hold."), kind: "good" };
    }
    if (s.controller) return { text: tr("js.held_by_undermine_it_to_weaken", "Held by {0}: undermine it to weaken their hold.", s.controller), kind: "warn" };
    if (s.conflict.length) {
        const mine = s.conflict.find(c => c.power === me);
        const lead = s.conflict.slice().sort((a, b) => b.progress - a.progress)[0];
        if (mine) return lead.power === me
            ? { text: tr("js.contested_and_your_power_leads_keep", "Contested, and your power leads: keep acquiring."), kind: "good" }
            : { text: tr("js.contested_leads_your_power_acquire_to", "Contested: {0} leads your power. Acquire to catch up.", lead.power), kind: "warn" };
        return { text: tr("js.being_fought_over_by", "Being fought over by {0}.", s.conflict.map(c => c.power).join(", ")), kind: "" };
    }
    if (s.powers.includes(me)) return { text: tr("js.your_power_has_a_presence_here", "Your power has a presence here."), kind: "" };
    return { text: PP.words(s.state) || "Unoccupied.", kind: "dim" };
}

function show() {
    const s = st.current;
    set("power", st.power ? tr("js.pledged", "Pledged: ") + st.power : tr("js.not_pledged", "Not pledged"));
    if (!s) {
        set("system", "—"); set("controller", ""); set("state", ""); set("verdict", tr("js.waiting_for_your_location", "Waiting for your location…")); set("kind", "dim");
        set("hasControl", false); set("hasFight", false); set("conflict", []); set("others", "");
    } else {
        set("system", s.name || "—");
        set("controller", s.controller ? s.controller.toUpperCase() : (s.state ? "" : tr("js.no_controlling_power", "NO CONTROLLING POWER")));
        set("mine", !!st.power && s.controller === st.power);
        set("state", PP.words(s.state));
        const v = verdict(s);
        set("verdict", v.text); set("kind", v.kind);

        set("hasControl", s.control != null);
        set("control", s.control != null ? Math.min(100, Math.max(0, pct(s.control))) : 0);
        set("controlText", s.control != null ? `${pct(s.control)}%` : "");

        const fight = s.reinforce + s.undermine;
        set("hasFight", fight > 0);
        set("reinforce", fmt(s.reinforce));
        set("undermine", fmt(s.undermine));
        set("rFill", (fight ? s.reinforce / fight : 0.5) + "*");
        set("uFill", (fight ? s.undermine / fight : 0.5) + "*");

        const lead = Math.max(0.0001, ...s.conflict.map(c => c.progress));
        set("conflict", s.conflict.slice().sort((a, b) => b.progress - a.progress).map(c => ({
            power: c.power, text: `${pct(c.progress)}%`, mine: c.power === st.power,
            fill: Math.min(1, c.progress) + "*", rest: Math.max(0.0001, 1 - Math.min(1, c.progress)) + "*",
        })));
        const others = s.powers.filter(p => p !== s.controller);
        set("others", others.length ? tr("js.also_present", "Also present: ") + others.join(", ") : "");
    }
    set("visited", st.visited.slice(s ? 1 : 0, 12).map(v => ({
        name: v.name, when: PP.ago(v.at),
        what: v.controller ? `${v.controller} · ${PP.words(v.state)}` : v.conflict.length ? "Contested" : PP.words(v.state) || "—",
        mine: !!st.power && v.controller === st.power,
    })));
}

show();
