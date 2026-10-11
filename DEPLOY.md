# Putting Boom Arena online

The game runs on a small Node.js server (`server.js`). The server sends the game to players' browsers and runs every online match. It moves the bots and decides every hit, kill and explosion, so nobody can cheat by editing their copy. Players are put into matches automatically: up to 8 per match, with bots filling the empty places.

These steps use **Render** (render.com), which has a free plan. You'll need a GitHub account too, which is also free.

## 1. Put the game on GitHub

1. Sign in at github.com and click **New repository**. Name it `boom-arena`. Leave it Public (or pick Private), then click **Create repository**.
2. On the new repository's page, click **uploading an existing file**.
3. Drag these in from the `boom-arena` folder:
   `index.html`, `soldier.js`, `shared.js`, `game.js`, `server.js`, `maps.json`, `package.json`, `render.yaml`, `sw.js`, `manifest.webmanifest`, the whole `icons` folder, and the `operators` folder if you have one (your converted Mixamo characters; drag each folder itself in)
4. Click **Commit changes**.

## 2. Start it on Render

1. Go to render.com, click **Get Started**, and sign up with your GitHub account.
2. Click **New +**, choose **Blueprint**, and pick your `boom-arena` repository. Render reads `render.yaml` and fills in everything. Click **Apply**.
   - Not offered a Blueprint? Choose **New + → Web Service** instead, pick the repository, and set:
     - **Build command:** `npm install`
     - **Start command:** `node server.js`
     - **Instance type:** Free
3. Wait a minute or two until the service shows **Live**.
4. Your game's address is at the top of the page, something like `https://boom-arena-xxxx.onrender.com`. Open it, type a name, and click **Play Online**. Send that link to anyone you want to play with.

## Adding characters (operators)

1. On mixamo.com (free Adobe account), open **Characters**, pick a realistic person, click **Download**, and choose **FBX Binary (.fbx)** and **T-pose**.
2. Put the `.fbx` files in the `boom-arena/characters` folder.
3. Start the game on your Mac (`start-server.command`) and open it. Each new character is converted automatically (a "New operator ready" message pops up) and appears in the menu's **Operator** tab. The converted models are saved in the `operators` folder; upload that folder to GitHub to put them online.

## Installing it like an app

Once it's live, Chrome and Edge show an install icon at the right end of the address bar, and the game's menu shows an **Install app** button. Installed, it gets its own icon in the Dock / on the desktop, opens in its own window, starts faster, and single-player works without internet. Updates still arrive automatically. On iPhone/iPad Safari: Share → Add to Home Screen.

## Good to know

- **The free plan sleeps** after about 15 minutes with nobody playing. The next visitor waits about a minute while it wakes up. For a server that's always on, change the plan to **Starter** in Render's settings (this costs money; see Render's pricing page).
- **Updating the game:** upload the changed files to the GitHub repository again (same "Add file → Upload files" button). Render puts the new version live by itself in a minute or two. Anyone still on the old version is asked to refresh.
- **Checking on it:** `your-address/status` shows how many people are online and which matches are running. Render's **Logs** tab shows who joins and leaves.
- **Your own web address** (for example `boomarena.gg`): buy the name from any domain seller, then add it under **Settings → Custom Domains** in Render.

## Playing online on your own Wi-Fi (no Render)

Double-click `start-server.command`. Everyone on the same Wi-Fi opens the address it prints and clicks **Play Online**.

## Built-in protections

- The server decides every hit, using the shooter's own view of the moment (lag compensation), so shots that look on target count.
- Shots that come too fast, go wider than the gun can, or come from somewhere the player isn't are thrown out. So is movement that's too fast, through walls, or flying.
- Message flooding gets a connection closed, and each address can open only a few connections at once.
- Rude names are swapped for a random one.
- A player whose connection drops keeps their place for 30 seconds while the game reconnects them.
