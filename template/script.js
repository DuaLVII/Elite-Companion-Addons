let jumps = 0;
set("jumps", jumps);

on("FSDJump", (e, replay) => {
    if (replay) return;          // ignore today's earlier jumps read back at startup
    jumps++;
    set("jumps", jumps);
    if (jumps % 10 == 0) notify(tr("js.jumps_milestone", "{0} jumps!", jumps));   // tr(key, English, …values)
});
