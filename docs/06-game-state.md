# Game state

The app keeps track of a lot already. Show any of it in module.xml with `{Binding Game.Name}`, or read it in the
script as `game.Name`, without handling any events yourself. [← Guide](README.md)

```xml
<TextBlock Text="{Binding Game.StarSystem}"/>
<ProgressBar Style="{StaticResource Bar}" Value="{Binding Game.HullPercent, Mode=OneWay}" Maximum="100"/>
```

```js
on("tick", () => set("rich", game.Credits > 1e9));
```

| Area | Names |
|---|---|
| Commander | `Commander` · `Credits` · `CreditsText` · `CreditsShort` · `LegalState` · `GameMode` |
| Ship | `Ship` · `ShipName` · `Fuel` · `FuelPercent` · `FuelText` · `FuelCapacity` · `HullPercent` · `HullText` · `Cargo` · `CargoCapacity` · `CargoText` · `JumpRange` · `Limpets` |
| Power and controls | `PipSys` · `PipEng` · `PipWep` · `FireGroup` · `SelectedWeapon` |
| Flags (true / false) | `Docked` · `Landed` · `LandingGear` · `ShieldsUp` · `Supercruise` · `Hardpoints` · `CargoScoop` · `SilentRunning` · `ScoopingFuel` · `MassLocked` · `FsdCharging` · `LowFuel` · `Overheating` · `InDanger` · `BeingInterdicted` · `InSrv` · `InFighter` · `OnFoot` |
| Shields | `ShieldsText` (UP / DOWN) · `ShieldsDetail` ("down 0:42") · `ShieldDrops` |
| Where | `FlightMode` · `StarSystem` · `Station` · `LandingPad` · `Body` · `Economy` · `Security` · `Allegiance` · `Population` · `StarClass` · `Scoopable` |
| Route | `NextTarget` · `JumpsRemaining` · `RouteDestination` |
| On a planet / on foot | `GroundSpeed` · `VerticalSpeed` · `Altitude` · `Heading` · `Oxygen` · `Health` · `Temperature` · `Gravity` |
| Session | `ClockText` · `SessionTimeText` · `SessionJumps` · `SessionDistance` · `SessionBounties` · `SessionKills` · `SessionBodiesScanned` · `SessionExplorationValue` · `SessionIncome` · `SessionProfitText` · `MissionsActive` |
| Target | `HasTarget` · `TargetShip` · `TargetPilot` · `TargetRank` · `TargetLegal` · `TargetFaction` · `TargetBounty` · `TargetShield` · `TargetHull` |

Names ending in `Text` are ready to show ("1,234,567 cr"); the plain ones are numbers you can calculate with.
