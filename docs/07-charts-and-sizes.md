# Charts and fitting any size

[← Guide](README.md)

## Charts

Add `xmlns:controls="clr-namespace:EliteCompanion.Controls"` to the root element, then:

```xml
<!-- A line graph of your own numbers (after metric("myaddon.earned", …) in the script) -->
<controls:TimeSeriesChart Series="addon.myaddon.earned" Height="120" ShowLegend="False"/>

<!-- The app's own series, several at once -->
<controls:TimeSeriesChart Series="fuel,hull" Height="120"/>

<!-- A gauge -->
<controls:RadialGauge Value="{Binding Game.FuelPercent}" Height="90" Title="FUEL" Unit="%" Warn="25" Crit="10"/>
```

- `metric("myaddon.earned", value, "Label", "unit")` in the script adds a point; the series is called `addon.` + that name.
- The graph's time range follows the app's range button (5 min … whole session).
- `RadialGauge`: `Min` / `Max` (default 0–100), `Warn` / `Crit` thresholds (`HighIsGood="False"` to flip them, e.g. heat),
  or a fixed `Color` like `"#5794F2"` (better: leave it, so it follows the theme).

## Fitting any size

Modules can be dragged into narrow columns or wide rows. The app tells every module how wide it is:
**tiny** (under 230 px), **compact** (under 330), **normal** (under 560) or **wide**.

Done for you:

- **UniformGrids** drop columns as the module narrows (4 → 2 in compact; in tiny anything over 2 becomes 2, and a row
  of gauges stacks into one column).
- **The charts** simplify themselves: `TimeSeriesChart` loses its axis, then becomes a sparkline, then just text;
  `RadialGauge` becomes a bar, then just the value; `ColumnChart`, `DonutChart` and `BarList` shrink similarly.
- The `Label` and `Value` styles get a little smaller in tiny modules.

Yourself, in module.xml:

```xml
<!-- Hide when narrower than normal (compact or tiny) -->
<TextBlock controls:Responsive.HideBelow="Normal" Text="{Binding V[details]}"/>
<!-- Only show when narrower than normal: a short form -->
<TextBlock controls:Responsive.ShowBelow="Normal" Text="{Binding V[short]}"/>
<!-- Choose the columns -->
<UniformGrid Columns="4" controls:Responsive.CompactColumns="2" controls:Responsive.TinyColumns="1">…</UniformGrid>
<!-- Stacked normally, side by side when wide -->
<UniformGrid Columns="1" controls:Responsive.WideColumns="2">…</UniformGrid>
<!-- The size as a value: also IsTiny, IsCompact, IsSmall (tiny or compact) -->
<TextBlock Text="{Binding Size}"/>
```

Don't put `HideBelow` / `ShowBelow` on something whose `Visibility` is already bound; wrap it in a `Border` instead.

Lists with a `MaxHeight` (and charts with a `Height`) grow and shrink when the module is resized.

## In the script

```js
on("resize", size => show());              // "tiny", "compact", "normal" or "wide"
function show() {
    const rows = size() === "tiny" ? all.slice(0, 3) : all;
    set("rows", rows);
}
```
