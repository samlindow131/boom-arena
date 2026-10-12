# Boom Arena

A fast first-person shooter that runs in your browser. Fight bots on your own or play online with friends.

## Modes

- **Battle Royale** on Crestfall Island: 100 players (you and 99 bots) on a kilometre-wide island, Solos or Trios with bot teammates. Details below.
- **Free-for-all**, **Team Deathmatch**, **Kill Confirmed**, **Domination**
- **Gun Game**: every two kills hand you the next gun; first through every gun wins
- **Mini Warzone**: a quick battle royale on the regular maps

## Battle Royale

- **The drop:** a cargo plane crosses Crestfall Island at 300 m. Jump when you like (Space), skydive (W and look down to dive), and open your parachute.
- **The island:** about a kilometre across, with mountains, forests and fields between 18 named areas: downtown Crestfall City with its towers, Old Town, the Maple Heights suburbs, Crestfall Mall, the Stadium, the Airfield, the Harbor, the Container Port, the Power Plant, the Refinery, Fort Ironside, Hollow Farm, Radio Hill, the Lumber Mill, Pine Motel, Skyline Site, Fisher's Cove and Lighthouse Point, plus farms, cabins and gas stations along the roads. Buildings have furnished interiors.
- **100 players:** bots spread out across the drop; far-away bots think and move less often so the game stays smooth.
- **Looting:** guns come in five rarities: Common, Uncommon, Rare, Epic and Legendary. The rarer the gun, the more attachments it has. You'll also find ammo, armor plates, cash, grenades, gas masks and killstreaks. Open supply boxes (hold E) for better loot; gold ones are legendary.
- **Cash and buy stations:** spend cash on plates, armor, ammo, grenades, a gas mask, a plate carrier, UAVs, airstrikes, or a **loadout drop** with your own guns and attachments. In Trios you can also buy self-revive kits and buy back fallen teammates.
- **Contracts:** grab a tablet to start one:
  - **Bounty:** hunt a marked player.
  - **Scavenger:** open three marked supply boxes.
  - **Recon:** upload data to see where the final circle will be.
- **The Gulag:** die early and you get a 1v1 in an offshore prison. Win it and you parachute back in. It closes after the third circle.
- **The gas:** seven circles close in, each faster and deadlier (a match lasts about 15 minutes). A gas mask lets you breathe in it for a while.
- **Trios:** a teammate still standing means you go down instead of dying. Crawl to them to be revived before you bleed out. Last squad standing wins.
- **Keys:** E interact (hold to open boxes or revive), M island map (click to place a marker), X armor plate.

## Progression

Level up to 55, prestige 10 times, then climb 1,000 Prestige Master levels. Operator skins, weapon camos, attachments and new guns unlock along the way, and three daily challenges reset every day.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move (Shift sprints, double-tap Shift for a tactical sprint) |
| Mouse | Aim and shoot (right-click aims down sights) |
| Space | Jump, vault, climb |
| C / Ctrl | Crouch; while sprinting, slide |
| R / V | Reload / melee |
| G / T | Lethal / tactical grenade |
| 3 4 5 | Killstreaks |
| E / M / X | Battle Royale: interact, island map, armor plate |
| Tab | Scoreboard |

Every key can be changed in Settings. Controllers work too.

## Playing it

**Quickest way, on any computer:** click the green **Code** button on this page, then **Download ZIP**. Unzip it and double-click `index.html`. It opens in your browser and you can play against bots straight away (it needs an internet connection the first time, to load the 3D engine). Chrome or Edge work best.

- **Online with friends:** open the game's web address (see `DEPLOY.md` for putting it on Render) and click **Play Online**.
- **On your own computer:** install [Node.js](https://nodejs.org) 18 or newer, then run `node server.js` in this folder and open http://localhost:8080. Friends on the same Wi-Fi can join at the address it prints.

## For developers

- `index.html` is the game (Three.js r128); `island.js` builds Crestfall Island and `br.js` runs Battle Royale.
- `server.js` and `game.js` run online matches; the server decides every hit, so nobody can cheat by editing their copy.
- `shared.js` holds the numbers both sides use (weapons, equipment, killstreaks).
- `npm test` runs the protocol, rules and match-simulation tests.

## Credits

Photo-scanned textures (ground, rock, asphalt, brick, concrete, plaster, wood, roofing, bark) from [Poly Haven](https://polyhaven.com), CC0.
