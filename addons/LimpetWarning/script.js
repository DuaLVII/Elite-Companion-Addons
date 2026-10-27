// @designer-rules · written by the Elite Companion addon designer from design.json.
// Saving in the designer replaces this file: change the rules there (Your own code is kept, at the end).
// Limpet Warning

// The values the module shows, and what they start at
const START = {
    limpetWarningValue: "",
    hasEnoughLimpets: "",
};
const V = JSON.parse(JSON.stringify(START));
const num = x => Number(x) || 0;
const txt = x => x == null ? "" : typeof x === "number" ? (Number.isInteger(x) ? fmt(x) : fmt(x, 1)) : String(x);
const clock = t => { const d = t ? new Date(Date.parse(t)) : new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const once = {};
const pick = (o, path) => path.split(".").reduce((x, k) => x == null ? undefined : x[k], o);
// formulas: a mistake in the maths (dividing by nothing…) gives 0 instead of stopping the rule
const __calc = f => { try { const r = f(); return Number.isFinite(r) ? r : 0; } catch (_) { return 0; } };
const __round = (x, d) => { const p = Math.pow(10, Math.max(0, Math.min(6, Math.round(num(d))))); return Math.round(num(x) * p) / p; };

// Remembered between sessions: limpetWarningValue
const REMEMBER = ["limpetWarningValue"];
const saved = store.get("designer", null);
if (saved && saved.v) for (const k of REMEMBER) if (k in saved.v) V[k] = saved.v[k];
let mark = (saved && saved.mark) || { ts: "", keys: [] };
let lastSaved = "";
function save() {
    const v = {}; for (const k of REMEMBER) v[k] = V[k];
    const s = JSON.stringify({ v, mark });
    if (s !== lastSaved) { lastSaved = s; store.set("designer", { v, mark }); }
}
// Each event once: events read back at start that were already counted are skipped
function fresh(e) {
    if (e.__fresh !== undefined) return e.__fresh;
    const ts = e.timestamp || "", key = e.event + ":" + JSON.stringify(e).length;
    let ok = true;
    if (ts < mark.ts) ok = false;
    else if (ts === mark.ts) { if (mark.keys.includes(key)) ok = false; else mark.keys.push(key); }
    else mark = { ts, keys: [key] };
    e.__fresh = ok;
    return ok;
}
function show() { for (const k in V) set(k, V[k]); }
function changed() { show(); save(); }
// check boxes and text boxes in the module change their values themselves
on("change", (k, v) => { V[k] = v; if (REMEMBER.includes(k)) save(); });   // (ticked / typed: kept for next time)
show();

// When Limpets drops below = {limpetWarningValue}
let __past1 = null;   // null until the first reading, which only sets the start
on("tick", () => {
    const e = {}, replay = false;
    const past = num(game.Limpets) < num(__calc(() => num(V.limpetWarningValue)));
    const before = __past1;
    __past1 = past;
    if (before !== false || !past) return;   // only the moment it goes past
    {
        if (!replay) notify(`Low Limpet Warning`, "warning", 10);
        V.hasEnoughLimpets = `false`;
    }
    changed();
});

// When Limpets rises above = {limpetWarningValue}
let __past10 = null;   // null until the first reading, which only sets the start
on("tick", () => {
    const e = {}, replay = false;
    const past = num(game.Limpets) > num(__calc(() => num(V.limpetWarningValue)));
    const before = __past10;
    __past10 = past;
    if (before !== false || !past) return;   // only the moment it goes past
    {
        V.hasEnoughLimpets = `true`;
    }
    changed();
});

(() => {
    const e = {}, replay = false;
    // When the module starts
    {
        V.hasEnoughLimpets = `false`;
        if (num(game.Limpets) > num(__calc(() => num(V.limpetWarningValue)))) {
            V.hasEnoughLimpets = `true`;
        }
    }
    changed();
})();

// Every 1 minutes
let __every13 = Date.now();
on("tick", () => {
    if (Date.now() - __every13 < 1 * 60000) return;
    __every13 = Date.now();
    const e = {}, replay = false;
    {
        if (num(game.Limpets) < num(__calc(() => num(V.limpetWarningValue)))) {
            if (!replay) notify(`Low Limpet Warning`, "warning", 10);
        }
    }
    changed();
});

