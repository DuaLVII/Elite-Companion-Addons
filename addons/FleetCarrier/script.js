// Fleet Carrier: overview.
include("_shared/carrier.js");

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
