# Recipes

Copy-paste patterns for common jobs. [← Guide](README.md)

## Totals per day (today, yesterday, 7 days)

```js
wantHistory();
let st = store.get("days1", { days: {} });   // "2026-10-22" → count

const day = iso => { const d = new Date(Date.parse(iso));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

on("MiningRefined", e => {          // (add the "each event once" check from the Journal events page if you store totals)
    const k = day(e.timestamp);
    st.days[k] = (st.days[k] || 0) + 1;
    const keys = Object.keys(st.days).sort();
    while (keys.length > 60) delete st.days[keys.shift()];   // keep 60 days
    store.set("days1", st);
    show();
});

function show() {
    const now = new Date(), ago = n => day(new Date(now - n * 86400000).toISOString());
    set("today", st.days[ago(0)] || 0);
    set("yesterday", st.days[ago(1)] || 0);
    let week = 0; for (let i = 0; i < 7; i++) week += st.days[ago(i)] || 0;
    set("week", week);
}
show();
```

## A countdown

```js
let until = 0;   // ms timestamp
on("CarrierJumpRequest", e => { until = Date.parse(e.DepartureTime); show(); });
on("tick", show);
function show() {
    const s = Math.max(0, Math.round((until - Date.now()) / 1000));
    set("left", until ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");
    set("soon", until > 0 && s < 120);   // for a DataTrigger: turn it yellow
}
```

## Alert once (not every second)

```js
let warned = false;
on("tick", () => {
    const low = game.FuelPercent < 25;
    if (low && !warned) notify("Fuel below 25%", "warning", 6);
    warned = low;
});
```

## A sorted, limited list

```js
set("rows", items
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, size() === "tiny" ? 3 : 10)
    .map(x => ({ name: x.name, value: short(x.value, "cr"), big: x.value > 1e7 })));
```

## Filter buttons that light up

```js
let filter = store.get("filter", "all");
on("click:filter", f => { filter = f; store.set("filter", f); show(); });
function show() {
    set("filters", ["all", "wanted", "clean"].map(f => ({ id: f, on: f === filter })));
}
```

```xml
<ItemsControl ItemsSource="{Binding V[filters]}">
    <ItemsControl.ItemsPanel><ItemsPanelTemplate><WrapPanel/></ItemsPanelTemplate></ItemsControl.ItemsPanel>
    <ItemsControl.ItemTemplate>
        <DataTemplate>
            <Button x:Name="B" Style="{StaticResource HudButton}" Tag="filter" CommandParameter="{Binding id}" Content="{Binding id}" Margin="0,0,4,0"/>
            <DataTemplate.Triggers>
                <DataTrigger Binding="{Binding on}" Value="True">
                    <Setter TargetName="B" Property="Foreground" Value="{StaticResource Hud}"/>
                    <Setter TargetName="B" Property="BorderBrush" Value="{StaticResource Hud}"/>
                </DataTrigger>
            </DataTemplate.Triggers>
        </DataTemplate>
    </ItemsControl.ItemTemplate>
</ItemsControl>
```

## Readable names from journal codes

```js
// "$faction_Thargoid;" → "Thargoid",  "type9_military" → "Type9 Military"
const clean = s => String(s || "").replace(/^\$|;$/g, "").replace(/^faction_/i, "");
const pretty = s => clean(s).split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const name = e => e.Type_Localised || pretty(e.Type);
```

## Sharing code between your own scripts

Scripts can only `include()` the app's own `_shared/` helpers, so a gallery addon is one self-contained `script.js`.
Put helpers at the top of the file.
