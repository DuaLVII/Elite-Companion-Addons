# module.xml: the look

Plain WPF XAML. The outer card and the module's title bar are added for you; you write what goes inside.
[← Guide](README.md)

```xml
<StackPanel xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
            xmlns:controls="clr-namespace:EliteCompanion.Controls">
    …
</StackPanel>
```

- The root can be any panel (`StackPanel`, `Grid`, `DockPanel`…).
- The file is named **`.xml`**, not `.xaml`: Visual Studio tries to compile every `.xaml` file into the app.
- There's no code-behind: no `x:Class`, no `Click="…"`. Buttons talk to the script with `Tag` (below).
- Missing `xmlns` lines on the root are added for you, but it's tidier to write them.
- Some things aren't allowed, for safety: see [Safety rules](11-safety.md).

## Bindings

| Binding | Shows |
|---|---|
| `{Binding V[name]}` | a value the script set with `set("name", …)`: text, numbers, true/false, lists, objects |
| `{Binding Game.StarSystem}` | anything the app knows about the game, no script needed ([list](06-game-state.md)) |
| `{T key}` | a text from your `lang/<language>.json` ([Languages](08-languages.md)) |
| `{Binding Error}` | the current script error, if any |
| `{Binding Size}` | how wide the module is: `tiny`, `compact`, `normal`, `wide` ([sizes](07-charts-and-sizes.md)) |

Inside a `<Run>` (part of a line of text) add `Mode=OneWay`: `<Run Text="{Binding V[last], Mode=OneWay}"/>`.

## Styles

`Label` (small dim caption), `Value` (big number), `Header`, `HudButton`, `Bar` (progress bar), `Chip`, `SearchBox`.

```xml
<TextBlock Style="{StaticResource Label}" Text="FUEL"/>
<ProgressBar Style="{StaticResource Bar}" Value="{Binding Game.FuelPercent, Mode=OneWay}" Maximum="100"/>
<Button Style="{StaticResource HudButton}" Tag="reset" Content="Reset"/>
```

## Theme colours

Always use the theme's colours, never `"#FF9830"`, so your addon looks right in every theme, light ones included:

| Name | Meaning |
|---|---|
| `Hud` | the accent: highlights, headings, active things |
| `HudText` · `HudDim` | main text · labels and secondary text |
| `Good` · `Warn` · `Danger` · `Ok` | green · yellow · red · blue meanings |
| `Purple` · `Cyan` | extra colours |
| `Panel` · `PanelBorder` · `HeaderBack` · `Control` | module background · borders and lines · title bars and tiles · buttons and boxes |
| `HudSoft` · `HudFaint` · `GoodSoft` · `DangerSoft` · `OkFaint` · `CyanSoft` | see-through versions for backgrounds and highlights |

Write `{StaticResource Hud}`: the app turns it into a live link, so the addon recolours the moment the theme changes.

## Lists

The script sets a list of objects; an `ItemsControl` shows one row per item:

```js
set("rows", [{ name: "Gold", tons: 12, big: false }, { name: "Painite", tons: 40, big: true }]);
```

```xml
<ItemsControl ItemsSource="{Binding V[rows]}" MaxHeight="200">
    <ItemsControl.Template>
        <ControlTemplate TargetType="ItemsControl">
            <ScrollViewer VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled"><ItemsPresenter/></ScrollViewer>
        </ControlTemplate>
    </ItemsControl.Template>
    <ItemsControl.ItemTemplate>
        <DataTemplate>
            <DockPanel Margin="0,1">
                <TextBlock x:Name="Tons" DockPanel.Dock="Right" Text="{Binding tons}" Foreground="{StaticResource HudDim}"/>
                <TextBlock Text="{Binding name}" Foreground="{StaticResource HudText}"/>
            </DockPanel>
            <DataTemplate.Triggers>
                <DataTrigger Binding="{Binding big}" Value="True">
                    <Setter TargetName="Tons" Property="Foreground" Value="{StaticResource Good}"/>
                </DataTrigger>
            </DataTemplate.Triggers>
        </DataTemplate>
    </ItemsControl.ItemTemplate>
</ItemsControl>
```

- Inside the template, bind to the item's fields directly: `{Binding name}`.
- A `MaxHeight` makes the list grow and shrink with the module; the `ScrollViewer` keeps right-hand values clear of the
  scroll bar.
- Lists are only redrawn when their contents really change, so setting the same list again costs nothing.

## Showing and hiding things

Use a `DataTrigger` on a true/false value the script sets:

```xml
<TextBlock Text="⚠ Low fuel" Foreground="{StaticResource Danger}">
    <TextBlock.Style>
        <Style TargetType="TextBlock">
            <Setter Property="Visibility" Value="Collapsed"/>
            <Style.Triggers>
                <DataTrigger Binding="{Binding V[lowFuel]}" Value="True">
                    <Setter Property="Visibility" Value="Visible"/>
                </DataTrigger>
            </Style.Triggers>
        </Style>
    </TextBlock.Style>
</TextBlock>
```

A shortcut: an empty text takes no space, so `set("warning", "")` hides a warning line and `set("warning", "…")` shows it.

## Buttons

Any button with a `Tag` calls the script when clicked. `CommandParameter` is passed along (handy in lists):

```xml
<Button Style="{StaticResource HudButton}" Tag="reset" Content="Reset"/>
<Button Style="{StaticResource HudButton}" Tag="pick" CommandParameter="{Binding name}" Content="{Binding name}"/>
```

```js
on("click:reset", () => { … });
on("click:pick", name => { … });
```

## Check boxes, text boxes, sliders

Bind them two-way to a value; the script reads it with `get(…)` or reacts with `on("change:name", …)`:

```xml
<CheckBox Content="Only landable" IsChecked="{Binding V[onlyLandable], Mode=TwoWay}"/>
<TextBox Style="{StaticResource SearchBox}" Text="{Binding V[search], Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}"/>
```

```js
on("change:onlyLandable", on => show());
on("change:search", text => show());
```

## The app's charts and gauges

```xml
<controls:TimeSeriesChart Series="addon.myaddon.earned" Height="120"/>   <!-- after metric("myaddon.earned", …) -->
<controls:TimeSeriesChart Series="fuel,hull" Height="120"/>               <!-- the app's own series -->
<controls:RadialGauge Value="{Binding Game.FuelPercent}" Height="90" Title="FUEL" Unit="%"/>
```

More in [Charts and fitting any size](07-charts-and-sizes.md).
