# Boom Arena

A fast first-person shooter that runs in your browser. Fight bots on your own or play online with friends.

## Modes

- **Free-for-all**, **Team Deathmatch**, **Kill Confirmed**, **Domination**
- **Gun Game**: every two kills hand you the next gun; first through every gun wins
- **Mini Warzone**: a quick battle royale on the regular maps

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
| Tab | Scoreboard |

Every key can be changed in Settings. Controllers work too.

## Playing it

**Quickest way, on any computer:** click the green **Code** button on this page, then **Download ZIP**. Unzip it and double-click `index.html`. It opens in your browser and you can play against bots straight away (it needs an internet connection the first time, to load the 3D engine). Chrome or Edge work best.

- **Online with friends:** open the game's web address (see `DEPLOY.md` for putting it on Render) and click **Play Online**.
- **On your own computer:** install [Node.js](https://nodejs.org) 18 or newer, then run `node server.js` in this folder and open http://localhost:8080. Friends on the same Wi-Fi can join at the address it prints.

## For developers

- `index.html` is the whole game (Three.js r128).
- `server.js` and `game.js` run online matches; the server decides every hit, so nobody can cheat by editing their copy.
- `shared.js` holds the numbers both sides use (weapons, equipment, killstreaks).
- `npm test` runs the protocol, rules and match-simulation tests.
