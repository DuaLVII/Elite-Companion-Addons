// Fleet Carrier: overview.
// ---------------------------------------------------------------- carrier.js (built in, so the addon stands alone)
// Shared helpers for the Fleet Carrier addons. Each of them starts with:
//
//
// Folders starting with "_" aren't modules themselves; editing this file reloads every addon.
//
// How the carrier addons stay up to date:
//   - wantHistory() asks the app for the last ~5 weeks of carrier events at startup (not just today's)
//   - each module saves what it knows with store.set(), so it's still filled in after weeks without carrier events
//   - FC.on() only passes on events for YOUR carrier, and each event only once (by its timestamp), so
//     history + today's replay + live events never count twice.

wantHistory();

const FC = (() => {
    // Events the game only writes for the carrier you own
    const OWNER_EVENTS = [
        "CarrierStats", "CarrierBuy", "CarrierJumpRequest", "CarrierJumpCancelled", "CarrierDecommission",
        "CarrierCancelDecommission", "CarrierBankTransfer", "CarrierCrewServices", "CarrierFinance", "CarrierShipPack",
        "CarrierModulePack", "CarrierTradeOrder", "CarrierDockingPermission", "CarrierNameChanged",
    ];

    let mark = store.get("fc.mark", { ts: "", keys: [] });   // newest event handled (and which ones at that second)
    let myId = store.get("fc.id", null);

    function isFleetCarrier(e) {
        return !e.CarrierType || e.CarrierType === "FleetCarrier";      // ignore squadron carriers
    }

    /** Is this event about your carrier? (Learns your carrier's ID from owner-only events.) */
    function mine(e) {
        if (!isFleetCarrier(e)) return false;
        if (OWNER_EVENTS.includes(e.event)) {
            if (e.CarrierID && e.CarrierID !== myId) { myId = e.CarrierID; store.set("fc.id", myId); }
            return true;
        }
        if (myId == null) return false;
        // CarrierDepositFuel is also written when you donate to someone else's carrier; Docked / CarrierJump use MarketID
        return e.CarrierID === myId || e.MarketID === myId;
    }

    /** True the first time an event is seen (history, today's replay and live events overlap). */
    function fresh(e) {
        const ts = e.timestamp || "";
        const key = e.event + ":" + JSON.stringify(e).length;
        if (ts < mark.ts) return false;
        if (ts === mark.ts) {
            if (mark.keys.includes(key)) return false;
            mark.keys.push(key);
        } else {
            mark = { ts: ts, keys: [key] };
        }
        store.set("fc.mark", mark);
        return true;
    }

    /** FC.on(["CarrierStats", "CarrierFinance"], (e, live) => …): your carrier's events, each once. live = not a replay. */
    // Several handlers can share one event (the app passes them all the same object), so check each event once
    let lastEvent = null, lastOk = false;
    function wanted(e) {
        if (e !== lastEvent) { lastEvent = e; lastOk = mine(e) && fresh(e); }
        return lastOk;
    }

    function onCarrier(names, fn) {
        for (const name of [].concat(names)) {
            on(name, (e, replay) => {
                if (!wanted(e)) return;
                fn(e, !replay);
            });
        }
    }

    // ---- formatting ----

    function ms(iso) { const t = Date.parse(iso); return isNaN(t) ? 0 : t; }

    /** 754000 → "12:34", 4000000 → "1h 06m" */
    function duration(msLeft) {
        const s = Math.max(0, Math.round(msLeft / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`;
    }

    /** "3 min ago", "2 h ago", "5 days ago" */
    function ago(iso) {
        const d = Date.now() - ms(iso);
        if (!iso || d < 0) return "";
        if (d < 90000) return "just now";
        if (d < 3600000) return `${Math.round(d / 60000)} min ago`;
        if (d < 172800000) return `${Math.round(d / 3600000)} h ago`;
        return `${Math.round(d / 86400000)} days ago`;
    }

    /** "12 Oct 17:05" (local time) */
    function when(iso) {
        if (!iso) return "";
        const d = new Date(ms(iso));
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${d.getDate()} ${months[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    // ---- carrier vocabulary ----

    const SERVICES = {
        Captain: "Captain", Refuel: "Refuel", Repair: "Repair", Rearm: "Rearm", Commodities: "Commodity Market",
        BlackMarket: "Secure Warehouse", VoucherRedemption: "Redemption Office", Exploration: "Universal Cartographics",
        Shipyard: "Shipyard", Outfitting: "Outfitting", CarrierFuel: "Tritium Depot", VistaGenomics: "Vista Genomics",
        PioneerSupplies: "Pioneer Supplies", Bartender: "Bar", Rearmament: "Rearm",
    };
    const ACCESS = { all: "Everyone", none: "Nobody", friends: "Friends", squadron: "Squadron", squadronfriends: "Squadron & friends" };

    function serviceName(role) {
        const key = Object.keys(SERVICES).find(k => k.toLowerCase() === String(role).toLowerCase());
        return key ? SERVICES[key] : String(role).replace(/([a-z])([A-Z])/g, "$1 $2");
    }
    function accessName(a) { return ACCESS[String(a).toLowerCase()] || a; }

    // Roughly how carrier jumps go (the journal only gives the departure time)
    const LOCKDOWN_BEFORE_MS = 200000;   // pads lock about 3 min 20 s before departure
    const ARRIVE_AFTER_MS = 60000;       // about a minute in hyperspace
    const COOLDOWN_MS = 300000;          // about 5 min before it can jump again

    return { on: onCarrier, mine, fresh, ms, duration, ago, when, serviceName, accessName,
             LOCKDOWN_BEFORE_MS, ARRIVE_AFTER_MS, COOLDOWN_MS,
             get id() { return myId; } };
})();
// ---------------------------------------------------------------- end of carrier.js

let st = store.get("state", {
    name: "", callsign: "", system: "", body: "", locTs: "", locNote: "",
    access: "", notorious: false, balance: null, fuel: null, free: null, total: 25000, services: null,
    jump: null,            // { from, to, body, depart, booked }
    arrivedAt: null,       // for the cooldown
    decomScrap: null, decomRefund: 0, statsTs: "",
});
const save = () => store.set("state", st);

function setLocation(system, body, ts, note) {
    if (!system || ts < st.locTs) return;
    st.system = system; st.body = body || ""; st.locTs = ts; st.locNote = note || "";
}

FC.on("CarrierBuy", e => { st.callsign = e.Callsign || st.callsign; setLocation(e.Location, "", e.timestamp, tr("js.where_you_bought_it", "where you bought it")); done(); });

FC.on("CarrierStats", e => {
    st.name = e.Name || st.name;
    st.callsign = e.Callsign || st.callsign;
    st.access = e.DockingAccess || st.access;
    st.notorious = !!e.AllowNotorious;
    st.fuel = e.FuelLevel;
    if (e.Finance) st.balance = e.Finance.CarrierBalance;
    if (e.SpaceUsage) { st.free = e.SpaceUsage.FreeSpace; st.total = e.SpaceUsage.TotalCapacity || 25000; }
    if ((e.Crew || []).length) st.services = e.Crew.filter(c => c.Activated && c.Enabled !== false && c.CrewRole !== "Captain").length;
    if (!e.PendingDecommission) st.decomScrap = null;
    st.statsTs = e.timestamp;
    done();
});

FC.on("CarrierNameChanged", e => { st.name = e.Name; st.callsign = e.Callsign || st.callsign; done(); });
FC.on("CarrierDockingPermission", e => { st.access = e.DockingAccess; st.notorious = !!e.AllowNotorious; done(); });
FC.on(["CarrierFinance", "CarrierBankTransfer"], e => { st.balance = e.CarrierBalance; done(); });
FC.on("CarrierDepositFuel", e => { st.fuel = e.Total; done(); });
FC.on("CarrierCrewServices", e => {
    if (st.services == null) return;
    if (e.Operation === "Activate" || e.Operation === "Resume") st.services++;
    if (e.Operation === "Deactivate" || e.Operation === "Pause") st.services = Math.max(0, st.services - 1);
    done();
});

FC.on("CarrierJumpRequest", e => {
    const depart = e.DepartureTime || new Date(FC.ms(e.timestamp) + 15 * 60000).toISOString();
    st.jump = { from: st.system, to: e.SystemName, body: e.Body || "", depart: depart, booked: e.timestamp };
    done();
});
FC.on("CarrierJumpCancelled", () => { st.jump = null; done(); });
FC.on("CarrierJump", e => {                       // only written if you were aboard
    setLocation(e.StarSystem, e.Body, e.timestamp, "");
    st.jump = null; st.arrivedAt = e.timestamp;
    done();
});
// Docked at (or logged in aboard) your own carrier
FC.on("Docked", e => { setLocation(e.StarSystem, "", e.timestamp, ""); done(); });
FC.on("Location", e => { setLocation(e.StarSystem, e.BodyType === "Station" ? "" : e.Body, e.timestamp, ""); done(); });
FC.on("CarrierLocation", e => { setLocation(e.StarSystem, "", e.timestamp, ""); done(); });
FC.on("CarrierDecommission", e => { st.decomScrap = e.ScrapTime || null; st.decomRefund = e.ScrapRefund || 0; done(); });
FC.on("CarrierCancelDecommission", () => { st.decomScrap = null; done(); });

function done() { save(); show(); }

/** If a booked jump's time has passed, assume the carrier made it (the journal only says so if you were aboard). */
function settleJump() {
    if (!st.jump) return;
    const arrive = FC.ms(st.jump.depart) + FC.ARRIVE_AFTER_MS;
    if (Date.now() < arrive) return;
    const iso = new Date(arrive).toISOString();
    setLocation(st.jump.to, st.jump.body, iso, tr("js.assumed_arrived_after_its_jump", "assumed: arrived after its jump"));
    st.arrivedAt = iso;
    st.jump = null;
    save();
}

function status() {
    const now = Date.now();
    if (st.jump) {
        const depart = FC.ms(st.jump.depart);
        if (now < depart - FC.LOCKDOWN_BEFORE_MS) return ["jump", tr("js.jumping_to_in", "Jumping to {0} in {1}", st.jump.to, FC.duration(depart - now))];
        if (now < depart) return ["lockdown", tr("js.lockdown_jumping_to_in", "LOCKDOWN · jumping to {0} in {1}", st.jump.to, FC.duration(depart - now))];
        return ["transit", tr("js.in_hyperspace_to", "In hyperspace to {0}…", st.jump.to)];
    }
    if (st.arrivedAt) {
        const left = FC.ms(st.arrivedAt) + FC.COOLDOWN_MS - now;
        if (left > 0) return ["cooldown", tr("js.arrived_cooling_down_about", "Arrived · cooling down (about {0})", FC.duration(left))];
        st.arrivedAt = null;   // cooldown over: stop ticking
        save();
    }
    return ["idle", tr("js.parked_no_jump_booked", "Parked · no jump booked")];
}

function show() {
    settleJump();
    const known = !!(st.callsign || st.name);
    set("hasCarrier", known);
    set("empty", known ? "" : tr("js.no_fleet_carrier_found_yet_open", "No fleet carrier found yet. Open carrier management in the game once and it'll appear here."));
    set("name", st.name || tr("js.fleet_carrier", "Fleet carrier"));
    set("callsign", st.callsign);
    set("location", st.system ? st.system + (st.body ? " · " + st.body : "") : tr("js.location_unknown", "Location unknown"));
    set("locationNote", st.locNote ? `(${st.locNote})` : "");
    const [phase, text] = status();
    set("phase", phase);
    set("status", text);
    set("balance", st.balance == null ? "—" : short(st.balance, "cr"));
    set("fuel", st.fuel == null ? "—" : `${fmt(st.fuel)} t`);
    set("free", st.free == null ? "—" : `${fmt(st.free)} t`);
    set("services", st.services == null ? "—" : String(st.services));
    set("access", st.access ? tr("js.docking", "Docking: {0}{1}", FC.accessName(st.access), st.notorious ? tr("js.notorious_pilots_allowed", " · notorious pilots allowed") : "") : "");
    set("decom", st.decomScrap
        ? tr("js.decommissioning_scrapped_refund", "⚠ DECOMMISSIONING · scrapped {0} · refund {1}", FC.when(new Date(st.decomScrap * 1000).toISOString()), short(st.decomRefund, "cr")) : "");
    set("updated", st.statsTs ? tr("js.carrier_management_last_opened", "Carrier management last opened {0}", FC.ago(st.statsTs)) : tr("js.open_carrier_management_in_game_for", "Open carrier management in game for full details"));
}

// Count down while a jump is booked (or cooling down)
on("tick", () => { if (st.jump || st.arrivedAt) show(); });

show();
