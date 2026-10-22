# Your first addon

We'll make **Jump Counter**: how many jumps you've made since the app started, the last system, and a notification
every 10 jumps. [← Guide](README.md)

## 1. Make the folder

Open the `Addons` folder next to `EliteCompanion.exe` and make a folder called `JumpCounter`. (Or copy `_Template`
and rename it. Folders starting with `_` are ignored, so the template never shows up as a module.)

## 2. addon.json

```json
{
  "title": "Jump Counter",
  "author": "CMDR You",
  "version": "1.0",
  "description": "Jumps since the app started, and the last system.",
  "category": "Navigation & Travel"
}
```

## 3. module.xml

```xml
<StackPanel xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    <TextBlock Style="{StaticResource Label}" Text="JUMPS SINCE START"/>
    <TextBlock Style="{StaticResource Value}" FontSize="26" Text="{Binding V[jumps]}"/>
    <TextBlock Style="{StaticResource Label}" Margin="0,6,0,0">
        <Run Text="Last: "/><Run Text="{Binding V[last], Mode=OneWay}" Foreground="{StaticResource Hud}"/>
    </TextBlock>
</StackPanel>
```

`{Binding V[jumps]}` shows whatever the script sets as `jumps`. `{StaticResource Hud}` is the theme's accent colour.

## 4. script.js

```js
let jumps = 0;

on("FSDJump", (e, replay) => {
    if (replay) return;                       // only jumps made while the app is running
    jumps++;
    set("jumps", jumps);
    set("last", e.StarSystem);
    if (jumps % 10 === 0) notify(`${jumps} jumps!`, "info", 5);
});

set("jumps", 0);
set("last", "—");
```

## 5. Try it

Open **MODULES**: Jump Counter is under *Navigation & Travel*. Click **+ Add**. Now change `FontSize="26"` to `40` in
module.xml and save: the module reloads straight away.

No game running? Most events also arrive at startup as a **replay** of today's journal (`replay` is `true`). Take out
the `if (replay) return;` line and save to see today's jumps counted.

## Where next

- Make it remember between sessions: [`store`](04-script.md#store).
- Make it translatable: [Languages](08-languages.md).
- Add a graph: [Charts](07-charts-and-sizes.md).
- Share it: [Publishing](12-publishing.md).
