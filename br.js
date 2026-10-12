// =====================================================================
// Battle Royale on Crestfall Island (offline, against bots).
// Ride the plane in and jump, skydive and pop your parachute, then loot: guns come in five rarities (the rarer,
// the more attachments), and ammo, armor plates, cash, grenades, gas masks and killstreaks lie around and in
// supply boxes. Spend cash at buy stations (plates, UAVs, airstrikes, gas masks, your own loadout), take
// contracts for more (bounties, scavenger hunts, recon), fight your way back from the Gulag after your first
// death, and stay ahead of the gas. Last one standing wins.
// index.html calls the br* hooks (only on the island); everything else lives here.
// =====================================================================
const BR = {
  on: false, state: 'idle', root: null, items: [], grid: new Map(), itemId: 0, crates: [], stations: [], tablets: [], drops: [], spots: [],
  plane: null, att: {}, camo: {}, inv: null, left: 0, place: 0, ui: null, uiSel: 0, uiAcc: 0, hold: null, prompt: null, contract: null,
  gq: [], duel: null, reveal: -1, waypoint: null, mapCur: { x: 0, z: 0 }, said: {}, stats: null, pubDrops: {}, scanT: 0, spec: 0, over: false,
  loopPlane: null, loopWind: null, baseFog: 0, lastOut: null, picks: [], banner: null, shopPrice: {},
};
const BR_N = 100;   // fighters in a match: you and 99 bots
const BR_RAR = [
  { name: 'Common', col: '#c9ced6', glow: [.85, .9, 1], camo: 'factory' },
  { name: 'Uncommon', col: '#5ad86f', glow: [.35, 1.6, .5], camo: 'woodland' },
  { name: 'Rare', col: '#4aa3ff', glow: [.35, .9, 2.4], camo: 'arctic' },
  { name: 'Epic', col: '#bd6bff', glow: [1.4, .5, 2.6], camo: 'neon' },
  { name: 'Legendary', col: '#ffb63a', glow: [2.8, 1.6, .3], camo: 'gold' },
  { name: 'Loadout', col: '#ff6a4a', glow: [2.6, .8, .5], camo: null },
];
const BR_AMMO = {
  light: { name: 'Light ammo', col: '#e9cb5a', hex: 0xd8b13a, max: 300, box: 60 },
  rifle: { name: 'Rifle ammo', col: '#ec8048', hex: 0xd0642c, max: 240, box: 45 },
  shells: { name: 'Shotgun shells', col: '#ef5a5a', hex: 0xc23a3a, max: 48, box: 12 },
  heavy: { name: 'Heavy ammo', col: '#5ec0ff', hex: 0x3a8ed8, max: 40, box: 10 },
};
const BR_AMMO_OF = { pistol: 'light', smg: 'light', ar: 'rifle', lmg: 'rifle', dmr: 'rifle', shotgun: 'shells', sniper: 'heavy', magnum: 'heavy' };
const BR_GUNS = [['ar', 3], ['smg', 3], ['shotgun', 2], ['dmr', 2], ['lmg', 1.3], ['sniper', 1.2], ['pistol', 1.3], ['magnum', 1]];
// gas: [wait, close, radius as a share of the first circle], damage per second per phase; the Gulag shuts after phase 3
const BR_GAS = { phases: [[120, 85, .6], [80, 60, .38], [65, 50, .22], [55, 42, .12], [45, 34, .06], [32, 28, .025], [22, 24, 0]], dmg: [1, 2, 4, 7, 11, 16, 24], gulagUntil: 4, R0: 540 };
const BR_SHOP = [
  { id: 'plate', name: 'Armor Plate', note: '+1 plate', cost: 300 },
  { id: 'armor', name: 'Armor Box', note: 'Full armor and a full plate pouch', cost: 1200 },
  { id: 'ammo', name: 'Ammo Box', note: 'Fills all your ammo', cost: 400 },
  { id: 'frag', name: 'Frag Grenade', note: 'Lethal', cost: 500 },
  { id: 'claymore', name: 'Claymore', note: 'Lethal', cost: 600 },
  { id: 'flash', name: 'Flashbang', note: 'Tactical', cost: 350 },
  { id: 'smoke', name: 'Smoke Grenade', note: 'Tactical', cost: 350 },
  { id: 'mask', name: 'Gas Mask', note: 'Breathe in the gas for a while', cost: 1500 },
  { id: 'carrier', name: 'Plate Carrier', note: 'Carry 8 plates instead of 5', cost: 2000 },
  { id: 'uav', name: 'UAV', note: 'Shows every enemy nearby for 25 s', cost: 3000 },
  { id: 'air', name: 'Precision Airstrike', note: 'Call a jet on a spot', cost: 4500 },
  { id: 'loadout', name: 'Loadout Drop', note: 'Your own guns, attachments and gear', cost: 7500 },
  { id: 'revive', name: 'Self-Revive Kit', note: 'Get yourself back up when you\'re downed', cost: 3000, trio: true },
  { id: 'buyback', name: 'Buy Back Teammate', note: 'Bring a fallen squadmate back in', cost: 4500, trio: true },
];
const brShopList = () => BR_SHOP.filter(s => !s.trio || BR.trio);
const BR_CONTRACT = {
  bounty: { name: 'Bounty', col: '#ff5a48', hex: 0xff4a3a, note: 'Hunt down the marked player', time: 90 },
  scav: { name: 'Scavenger', col: '#5ad86f', hex: 0x4ad06a, note: 'Open the three marked supply boxes', time: 150 },
  recon: { name: 'Recon', col: '#4aa3ff', hex: 0x3a90ff, note: 'Upload data at the marked spot to see where the final circle will be', time: 120 },
};
const BR_ALT = 300, BR_PLANE_SPEED = 34, BR_PLANE_HALF = 600;
const BR_FALL = { v: 27, dive: 48, h: 26, chuteV: 5.4, chuteH: 10.5, auto: 46 };
const brMode = () => MODE === 'br' && !!MAPDEF.br;
const BR_MAP_W = 500;   // the maps show ±500 m
// the bot list for a Battle Royale (the regular modes keep the usual seven)
function brBotList() {
  if (!MAPDEF.br) return BOTS;
  const names = ('Ghost Blaze Raven Jinx Echo Moose Pixel Saber Talon Dusk Frost Hawk Juno Lynx Mako Onyx Atlas Bandit Cobra Dagger Ember Falcon Gizmo Havoc Iris Jackal Kodiak Lotus Mantis Nova ' +
    'Orbit Puma Quill Rook Sable Tango Ursa Viper Wraith Xeno Yeti Zephyr Ajax Bolt Cinder Drake Glyph Flint Gauge Hex Ivy Jolt Kestrel Lumen Mirage Nyx Opal Pike Quasar Rift Spark Torque ' +
    'Umber Vex Warden Axel Blitz Comet Delta Ezra Fang Grit Halo Indigo Jett Karma Laser Mojo Nomad Oak Pyro Quinn Rogue Stitch Titan Ultra Vandal Wolf Yonder Zeal Ace Brick Crash').split(' ');
  const extra = names.map((n, i) => [n, new THREE.Color().setHSL((i*.618) % 1, .65, .58).getHex()]);
  return [...BOTS, ...extra].slice(0, BR_N - 1);
}
const brIn = (a, b) => Math.random() < a/(a + b);
function brPick(list) { let t = 0; for (const [, w] of list) t += w; let r = Math.random()*t; for (const [v, w] of list) { if ((r -= w) <= 0) return v; } return list[0][0]; }
function brRollRar(tbl) { let r = Math.random()*100; for (let i = 0; i < tbl.length; i++) { if ((r -= tbl[i]) <= 0) return i; } return 0; }
const brFmt = n => '$' + Math.round(n).toLocaleString();
const brAmmoOf = wid => BR_AMMO_OF[WEAPONS[wid].model] || 'rifle';
// attachments a gun of this rarity comes with
function brAttFor(w, rar) {
  const slots = ATT_SLOTS[w.model] || {}, out = {}, has = (s, id) => slots[s] && slots[s].includes(id);
  const long = ['ar', 'lmg', 'dmr'].includes(w.model);
  for (const s in slots) {
    let id = slots[s][0];
    if (s === 'optic') id = rar >= 3 && long && has(s, 'acog') ? 'acog' : rar >= 2 && has(s, 'reflex') ? 'reflex' : slots[s][0];
    if (s === 'muzzle') id = rar >= 4 && has(s, 'supp') ? 'supp' : rar >= 1 && has(s, 'comp') ? 'comp' : rar >= 3 && has(s, 'supp') ? 'supp' : 'none';
    if (s === 'under') id = rar >= 2 ? (has(s, 'grip') ? 'grip' : has(s, 'laser') ? 'laser' : 'none') : 'none';
    if (s === 'mag') id = rar >= 3 && has(s, 'ext') ? 'ext' : 'std';
    out[s] = has(s, id) ? id : slots[s][0];
  }
  return out;
}
// index.html: getAtt() asks here first, so the guns you pick up carry their own attachments
function brAttOverride(w) { return BR.on && BR.att[w.id] ? BR.att[w.id] : null; }
function brCamoOverride(i) { return BR.on && BR.camo[i] ? BR.camo[i] : null; }
// ---- styles and HUD pieces ----
function brInitHUD() {
  const css = document.createElement('style');
  css.textContent = `
  .brbox{position:absolute;pointer-events:none;font-family:Rajdhani,system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6)}
  #brCash{left:20px;bottom:128px;font-size:22px;font-weight:700;letter-spacing:.04em;background:rgba(12,16,30,.55);border-radius:10px;padding:3px 12px;display:none}
  #brCash b{color:#6dff9d}
  #brPrompt{left:50%;top:62%;transform:translateX(-50%);text-align:center;font-weight:700;font-size:19px;letter-spacing:.05em;display:none}
  #brPrompt .k{display:inline-block;min-width:26px;padding:1px 7px;margin-right:8px;border-radius:6px;background:rgba(255,255,255,.92);color:#111;text-shadow:none}
  #brPrompt small{display:block;font-size:13px;opacity:.75;letter-spacing:.08em;margin-top:2px}
  #brPrompt i{display:block;width:180px;height:5px;margin:7px auto 0;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden}
  #brPrompt i b{display:block;height:100%;width:0;background:#ffcf5a}
  #brPicks{left:20px;bottom:166px;display:flex;flex-direction:column-reverse;gap:3px;font-weight:700;font-size:14px;letter-spacing:.05em}
  #brPicks div{background:rgba(12,16,30,.55);border-radius:7px;padding:2px 10px;transition:opacity .4s}
  #brDrop{left:50%;top:68%;transform:translateX(-50%);text-align:center;font-weight:700;display:none}
  #brDrop .big{font-size:30px;letter-spacing:.12em}
  #brDrop .sub{font-size:16px;opacity:.85;letter-spacing:.08em;margin-top:4px}
  #brAlt{right:28%;top:50%;transform:translateY(-50%);font-weight:700;font-size:26px;display:none;text-align:right}
  #brAlt small{display:block;font-size:12px;opacity:.7;letter-spacing:.14em}
  #brContract{right:20px;top:208px;width:250px;background:rgba(12,16,30,.62);border-radius:10px;padding:8px 12px;font-weight:700;display:none;border-left:4px solid #fff}
  #brContract .t{font-size:13px;letter-spacing:.14em;opacity:.8} #brContract .n{font-size:17px} #brContract .tm{float:right;font-size:17px}
  #brBanner{left:50%;top:30%;transform:translate(-50%,-50%) scale(.9);text-align:center;font-weight:700;opacity:0;transition:opacity .35s,transform .35s}
  #brBanner.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
  #brBanner .h{font-size:58px;letter-spacing:.14em;background:linear-gradient(180deg,#fff,#ffd27a);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))}
  #brBanner .s{font-size:19px;letter-spacing:.16em;opacity:.92;margin-top:2px}
  #brMask{left:0;top:0;width:100%;height:100%;opacity:0;transition:opacity .4s;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 46%,rgba(5,10,8,.55) 70%,rgba(0,0,0,.92) 100%)}
  #brMaskBar{left:50%;bottom:96px;transform:translateX(-50%);width:200px;font-weight:700;font-size:12px;letter-spacing:.14em;text-align:center;display:none}
  #brMaskBar i{display:block;height:6px;border-radius:3px;background:rgba(255,255,255,.2);margin-top:3px;overflow:hidden} #brMaskBar i b{display:block;height:100%;background:#7affc0}
  #brCompass{left:50%;top:96px;transform:translateX(-50%);width:520px;height:26px;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent);mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent);display:none}
  #brCompass canvas{display:block}
  #brMapWrap{left:0;top:0;width:100%;height:100%;background:rgba(6,10,18,.72);display:none;pointer-events:none}
  #brMapWrap canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  #brMapHelp{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);font-weight:700;font-size:14px;letter-spacing:.12em;opacity:.8}
  #brShop{left:50%;top:50%;transform:translate(-50%,-50%);width:520px;background:rgba(10,14,26,.93);border:1px solid rgba(110,255,170,.35);border-radius:16px;padding:16px 18px;display:none;box-shadow:0 12px 50px rgba(0,0,0,.6)}
  #brShop h3{margin:0 0 4px;font-size:24px;letter-spacing:.14em;color:#7dffaa} #brShop .cash{float:right;font-size:22px;color:#7dffaa}
  #brShop .row{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:9px;font-weight:700;font-size:16px}
  #brShop .row .k{width:22px;opacity:.6;font-size:13px} #brShop .row .nm{flex:1} #brShop .row small{display:block;font-size:12px;opacity:.6;font-weight:600}
  #brShop .row .c{color:#7dffaa} #brShop .row.off{opacity:.38} #brShop .row.sel{background:rgba(125,255,170,.16);outline:1px solid rgba(125,255,170,.5)}
  #brShop .help{font-size:12px;letter-spacing:.1em;opacity:.65;margin-top:8px;text-align:center}
  #brSquad{left:20px;bottom:164px;width:230px;display:none;font-weight:700;font-size:14px;letter-spacing:.04em}
  #brSquad div{background:rgba(12,16,30,.55);border-radius:8px;padding:3px 10px;margin-top:4px;display:flex;align-items:center;gap:8px}
  #brSquad .nm{color:#7ec8ff;min-width:58px} #brSquad i{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden} #brSquad i b{display:block;height:100%}
  #brDown{left:0;top:0;width:100%;height:100%;display:none;text-align:center;font-weight:700;background:radial-gradient(ellipse at center,rgba(120,0,0,0) 40%,rgba(120,0,0,.55) 100%)}
  #brDown .h{margin-top:30vh;font-size:44px;letter-spacing:.2em;color:#ff6a5a} #brDown .s{font-size:18px;letter-spacing:.14em} #brDown .t{font-size:15px;letter-spacing:.1em;opacity:.85;margin-top:6px}
  #brDown i{display:block;width:220px;height:6px;margin:10px auto;border-radius:3px;background:rgba(255,255,255,.2);overflow:hidden} #brDown i b{display:block;height:100%;background:#7affc0}
  #brGulag{left:50%;top:18%;transform:translateX(-50%);text-align:center;font-weight:700;display:none}
  #brGulag .h{font-size:40px;letter-spacing:.2em;color:#ffd27a} #brGulag .s{font-size:17px;letter-spacing:.1em;opacity:.9}
  `;
  document.head.appendChild(css);
  const hud = $('hud');
  const add = (id, html = '', cls = 'brbox') => { const d = document.createElement('div'); d.id = id; d.className = cls; d.innerHTML = html; hud.appendChild(d); return d; };
  add('brMask'); add('brCash'); add('brPrompt'); add('brPicks'); add('brDrop'); add('brAlt'); add('brContract'); add('brBanner'); add('brMaskBar', 'GAS MASK<i><b></b></i>');
  add('brCompass', '<canvas width="520" height="26"></canvas>'); add('brGulag');
  add('brSquad'); add('brDown');
  add('brShop'); add('brMapWrap', '<canvas width="760" height="760"></canvas><div id="brMapHelp"></div>');
}
// ---- models ----
const BRM = {};
function brModels() {
  const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: lin(c), roughness: .6, metalness: .2 }, o));
  BRM.olive = std(0x4f5a34, { roughness: .7 }); BRM.dark = std(0x24282e, { metalness: .6, roughness: .4 }); BRM.yellow = std(0xe6b11e, { roughness: .5 });
  BRM.gold = std(0xe8b53a, { metalness: .9, roughness: .25 }); BRM.green = std(0x2f8a4a, { roughness: .8 }); BRM.paper = std(0x7dbb6a, { roughness: .9 });
  BRM.white = std(0xeeeeee, { roughness: .5 }); BRM.red = std(0xc0342a, { roughness: .5 }); BRM.mask = std(0x1d2226, { roughness: .45, metalness: .3 });
  BRM.glass = new THREE.MeshStandardMaterial({ color: lin(0x9fd6ff), roughness: .05, metalness: .6, envMapIntensity: 1.4 });
  BRM.screen = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2) });
  BRM.ammo = Object.fromEntries(Object.entries(BR_AMMO).map(([k, a]) => [k, std(a.hex, { roughness: .55 })]));
  BRM.glow = BR_RAR.map(r => new THREE.SpriteMaterial({ map: TX.spark, color: new THREE.Color(...r.glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  BRM.beam = BR_RAR.map(r => new THREE.MeshBasicMaterial({ color: new THREE.Color(...r.glow).multiplyScalar(.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .55, side: THREE.DoubleSide }));
  BRM.beamGeo = (() => { const g = new THREE.CylinderGeometry(.06, .14, 2.6, 8, 1, true); g.translate(0, 1.3, 0); return g; })();
  BRM.tall = (() => { const g = new THREE.CylinderGeometry(.18, .28, 60, 10, 1, true); g.translate(0, 30, 0); return g; })();
  BRM.canopy = (() => { const g = new THREE.SphereGeometry(2.6, 18, 8, 0, Math.PI*2, 0, Math.PI*.36); g.scale(1, .55, 1.25); return g; })();
  BRM.chute = [0xff6a3d, 0x3da0ff, 0xffd23a, 0x6bd86a, 0xd86bd2, 0xffffff].map(c => new THREE.MeshStandardMaterial({ color: lin(c), roughness: .8, side: THREE.DoubleSide }));
  BRM.lineMat = new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: .6 });
}
const brBox = (w, h, d, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
const brCyl = (r0, r1, h, m, x, y, z, p, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); p.add(o); return o; };
// the transport plane: a four-engine cargo plane with its ramp open
function brPlaneModel() {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: lin(0x6f7a84), roughness: .5, metalness: .5 }), dark = BRM.dark;
  const f = brCyl(2.4, 2.4, 24, body, 0, 0, 0, g, 20); f.rotation.x = Math.PI/2;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 12, 0, Math.PI*2, 0, Math.PI/2), body); nose.rotation.x = Math.PI/2; nose.position.z = 12; nose.scale.set(1, 1, 1.4); g.add(nose);
  const tail = brCyl(2.4, .7, 9, body, 0, .9, -16.5, g, 20); tail.rotation.x = -Math.PI/2 + .12;
  brBox(40, .5, 5.2, body, 0, 1.6, 2, g); brBox(14, .3, 3.2, body, 0, 2.4, -19.5, g); brBox(.4, 7, 4.2, body, 0, 5, -19.2, g);
  const cock = brBox(2.6, 1.1, 2.6, BRM.glass, 0, 1.25, 12.2, g); cock.rotation.x = -.35;
  g.userData.props = [];
  for (const x of [-13, -6.5, 6.5, 13]) {
    const e = brCyl(.75, .85, 4, dark, x, .9, 4.2, g); e.rotation.x = Math.PI/2;
    const p = new THREE.Group(); p.position.set(x, .9, 6.3); g.add(p); g.userData.props.push(p);
    for (let k = 0; k < 4; k++) { const b = brBox(.32, 3.6, .08, dark, 0, 0, 0, p); b.rotation.z = k*Math.PI/4; }
  }
  const ramp = brBox(4, .25, 5, body, 0, -1.9, -14.8, g); ramp.rotation.x = .45;
  const stripe = brBox(4.84, .4, 18, BRM.yellow, 0, -.2, 2, g); stripe.scale.set(1.002, 1, 1); stripe.visible = false;
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}
function brCrateModel(legend) {
  const g = new THREE.Group(), body = legend ? BRM.gold : BRM.olive;
  brBox(1.1, .5, .68, body, 0, .25, 0, g);
  for (const x of [-.42, .42]) brBox(.08, .52, .7, legend ? BRM.dark : BRM.yellow, x, .25, 0, g);
  const lid = new THREE.Group(); lid.position.set(0, .5, -.34); g.add(lid);
  brBox(1.12, .14, .7, body, 0, .07, .34, lid); brBox(.3, .05, .2, BRM.dark, 0, .16, .5, lid);
  g.userData.lid = lid;
  const beam = new THREE.Mesh(BRM.tall, BRM.beam[legend ? 4 : 1]); beam.scale.setScalar(.6); g.add(beam); g.userData.beam = beam;
  g.traverse(o => { if (o.isMesh && o !== beam) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
// small 3D models for loot, built once per kind and cloned (clones share geometry and materials)
const BR_TPL = new Map();
function brItemTemplate(it) {
  const key = it.kind === 'gun' ? 'gun' + it.wid + ':' + it.rar : it.kind === 'ammo' ? 'ammo' + it.ammo : it.kind === 'lethal' || it.kind === 'tac' ? 'eq' + it.eq : it.kind === 'streak' ? 'ks' + it.eq : it.kind;
  if (BR_TPL.has(key)) return BR_TPL.get(key);
  const g = new THREE.Group();
  if (it.kind === 'gun') {
    const w = WEAPONS[it.wid], gun = buildGun(w.model, false, BR_RAR[it.rar].camo || 'factory', brAttFor(w, it.rar));
    const parts = []; gun.traverse(o => { if (o.isMesh) parts.push(o); }); bake(parts, gun);
    if (gun.userData.glint) gun.userData.glint.visible = false;
    gun.scale.setScalar(1.25); gun.rotation.set(0, 0, Math.PI/2); gun.position.y = .07; g.add(gun);
  } else if (it.kind === 'ammo') {
    brBox(.34, .2, .24, BRM.ammo[it.ammo], 0, .1, 0, g); brBox(.35, .05, .25, BRM.dark, 0, .17, 0, g); brBox(.12, .03, .26, BRM.white, .08, .1, 0, g);
  } else if (it.kind === 'plate') {
    for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(roundedBox(.22, .28, .025, .02), PLATE_MAT); m.position.set(k*.05 - .025, .16 + k*.01, k*.04); m.rotation.x = -.15; g.add(m); }
  } else if (it.kind === 'cash') {
    for (let k = 0; k < 3; k++) { const s = brBox(.3, .06, .15, BRM.paper, (k - 1)*.05, .03 + k*.06, (k % 2)*.03, g); s.rotation.y = (k - 1)*.3; brBox(.06, .065, .155, BRM.white, (k - 1)*.05, .03 + k*.06, (k % 2)*.03, g).rotation.y = (k - 1)*.3; }
  } else if (it.kind === 'lethal' && it.eq === 'frag') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), BRM.olive); s.position.y = .07; s.scale.y = 1.2; g.add(s); brCyl(.025, .025, .05, BRM.dark, 0, .16, 0, g);
  } else if (it.kind === 'lethal') {
    const c = brBox(.22, .13, .06, BRM.olive, 0, .1, 0, g); c.rotation.x = -.2; for (const x of [-.07, .07]) brCyl(.01, .01, .08, BRM.dark, x, .02, 0, g);
  } else if (it.kind === 'tac') {
    brCyl(.045, .045, .15, it.eq === 'smoke' ? BRM.green : BRM.white, 0, .075, 0, g); brCyl(.02, .02, .03, BRM.dark, 0, .165, 0, g);
  } else if (it.kind === 'mask') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.13, 14, 10), BRM.mask); s.scale.set(1, .9, .7); s.position.y = .12; g.add(s);
    for (const x of [-.05, .05]) { const l = brCyl(.04, .04, .02, BRM.glass, x, .15, .08, g); l.rotation.x = Math.PI/2; }
    const fl = brCyl(.05, .05, .09, BRM.dark, 0, .06, .1, g); fl.rotation.x = Math.PI/2;
  } else if (it.kind === 'carrier') {
    brBox(.42, .5, .14, BRM.olive, 0, .07, 0, g).rotation.x = -Math.PI/2; brBox(.3, .05, .3, BRM.dark, 0, .15, 0, g);
  } else if (it.kind === 'streak') {
    brBox(.36, .03, .26, BRM.dark, 0, .015, 0, g); const s = brBox(.36, .24, .02, BRM.dark, 0, .14, -.13, g); s.rotation.x = -.25;
    const scr = brBox(.32, .2, .005, BRM.screen(it.eq === 'uav' ? 0x2a8cff : 0xff5a2a), 0, .14, -.118, g); scr.rotation.x = -.25;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  BR_TPL.set(key, g);
  return g;
}
const brItemRar = it => it.kind === 'gun' ? it.rar : it.kind === 'streak' || it.kind === 'carrier' ? 3 : it.kind === 'mask' ? 2 : it.kind === 'cash' ? 1 : 0;
// ---- set up once at load (island only) ----
function brInit() {
  if (!MAPDEF.br) return [];
  BR.root = new THREE.Group(); scene.add(BR.root);
  brInitHUD(); brModels(); brSquadPicker();
  BR.planeMesh = brPlaneModel(); BR.planeMesh.visible = false; BR.root.add(BR.planeMesh);
  // supply boxes, buy-station markers, contract tablets, loadout crates
  BR.crates = ISLE.crates.map((c, i) => ({ ...c, i, open: false, legend: false, mesh: null, openT: 0 }));
  BR.stations = ISLE.stations.map(s => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: brIconTex('$', '#53ff94'), depthWrite: false, transparent: true, sizeAttenuation: true }));
    sp.position.set(s.kx, s.ky + 3.4, s.kz); sp.scale.setScalar(1.2); BR.root.add(sp); return { ...s, icon: sp };
  });
  // loot spots: the ones the island recorded, checked against the finished world, plus some outdoors
  const near = [];
  const ok = (x, y, z) => {
    const yy = surfaceBelow(x, z, y + .6);
    if (Math.abs(yy - y) > .45 || isleIn(x, z) < 3) return null;
    if (queryBoxes(x - .35, z - .35, x + .35, z + .35, near).some(b => b.maxY > yy + .12 && b.minY < yy + 1.1 && x > b.minX - .3 && x < b.maxX + .3 && z > b.minZ - .3 && z < b.maxZ + .3)) return null;
    return yy;
  };
  for (const s of ISLE.spots) { const y = ok(s.x, s.y, s.z); if (y !== null) BR.spots.push({ x: s.x, y, z: s.z, tier: s.tier }); }
  for (const p of ISLE.pois) for (let i = 0, n = Math.max(14, Math.round(p.r*.5)); i < n; i++) {
    const a = rand(0, 6.283), r = rand(4, p.r), x = p.x + Math.cos(a)*r, z = p.z + Math.sin(a)*r, gy = isleH(x, z), y = ok(x, gy, z);
    if (y !== null && y < gy + .2) BR.spots.push({ x, y, z, tier: p.tier });
  }
  for (let i = 0; i < 1100; i++) { const x = rand(-470, 470), z = rand(-470, 470); if (isleInF(x, z) > ISLE_BEACH + 3) { const y = ok(x, isleH(x, z), z); if (y !== null) BR.spots.push({ x, y, z, tier: 1, wild: true }); } }
  BR.baseFog = scene.fog.density;
  brInitExtras();
  return [BR.root];
}
function brIconTex(txt, col) {
  return T(mk(128, 0, (g, s) => {
    g.clearRect(0, 0, s, s); g.fillStyle = 'rgba(8,14,24,.82)'; g.beginPath(); g.arc(s/2, s/2, s*.42, 0, 7); g.fill();
    g.lineWidth = 7; g.strokeStyle = col; g.stroke();
    g.fillStyle = col; g.font = '700 70px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, s/2, s/2 + 4);
  }));
}
// =====================================================================
// Match flow: everyone starts in the plane
// =====================================================================
function brReset() {
  BR.on = brMode();
  if (BR.root) BR.root.visible = BR.on;
  ['brCash', 'brCompass'].forEach(id => { const e = $(id); if (e) e.style.display = BR.on ? 'block' : 'none'; });
  if (!BR.on) return;
  Object.assign(BR, { state: 'plane', over: false, place: 0, duel: null, reveal: -1, contract: null, waypoint: null, said: {}, ui: null, hold: null, spec: 0, pubDrops: {}, lastOut: null, picks: [] });
  BR.gq.length = 0; BR.att = {}; BR.camo = {};
  BR.stats = { kills: 0, dmg: 0, cash: 0, boxes: 0, contracts: 0, gulag: '', items: 0 };
  $('brShop').style.display = 'none'; $('brMapWrap').style.display = 'none'; $('brGulag').style.display = 'none'; $('brPicks').innerHTML = '';
  for (const it of BR.items) brItemHide(it);
  BR.items.length = 0; BR.grid.clear();
  for (const d of BR.drops) BR.root.remove(d.mesh);
  BR.drops.length = 0;
  for (const t of BR.tablets) BR.root.remove(t.mesh);
  BR.tablets.length = 0;
  for (const c of BR.crates) { c.open = false; c.openT = 0; c.scav = false; c.legend = Math.random() < (c.tier > 1 ? .28 : .08); if (c.mesh) { BR.root.remove(c.mesh); c.mesh = null; } }
  for (const s of BR.spots) if (Math.random() < (s.wild ? .5 : s.tier > 1 ? .82 : .68)) brSpawnLoot(brRollItem(s.tier), s.x, s.y, s.z);
  // contract tablets: about one per named area, on the ground
  const pois = ISLE.pois.slice().sort(() => Math.random() - .5);
  for (const p of pois.slice(0, 14)) {
    const cand = BR.spots.filter(s => s.y < isleH(s.x, s.z) + .2 && Math.hypot(s.x - p.x, s.z - p.z) < p.r);
    const s = cand[Math.floor(Math.random()*cand.length)]; if (!s) continue;
    const kind = brPick([['bounty', 4], ['scav', 3.5], ['recon', 2.5]]);
    BR.tablets.push(brTablet(kind, s.x + .5, s.y, s.z + .5));
  }
  // gas: the first circle covers the whole island
  gas.R0 = BR_GAS.R0; gas.cx = gas.cz = 0; gas.r = gas.R0; gas.phase = 0; gas.respawnsOff = false; gas.state = 'wait'; gas.t0 = now;
  brNextCircle(); gasWall.visible = true; gasWall.scale.y = 2.5;
  MATCH_TIME = matchTime = 1e6;
  // the plane's path: a straight line over the island at a random angle
  const a = rand(0, 6.283), dir = V(Math.cos(a), 0, Math.sin(a)), nrm = V(-dir.z, 0, dir.x), c = nrm.multiplyScalar(rand(-150, 150));
  BR.plane = { from: c.clone().addScaledVector(dir, -BR_PLANE_HALF).setY(BR_ALT), to: c.clone().addScaledVector(dir, BR_PLANE_HALF).setY(BR_ALT), dir, t0: now, dur: 2*BR_PLANE_HALF/BR_PLANE_SPEED, pos: V(), s: 0 };
  BR.plane.pos.copy(BR.plane.from); BR.planeMesh.visible = true;
  brSetupSquads();
  // everyone aboard
  const poiW = ISLE.pois.map(p => [p, p.hot]);
  for (const f of fighters) {
    f.br = { st: 'plane', vx: 0, vy: 0, vz: 0, cash: 0, mask: 0, gulag: false, wantChute: false, canopy: f.br && f.br.canopy, pickT: 0, openT: 0, goal: null, roam: null, rar: 0 };
    f.brZone = 'plane'; f.alive = true; f.hp = 100; f.armor = 0; f.plates = 0; f.maxPlates = 5; f.kills = 0; f.deaths = 0; f.respawnAt = Infinity; f.streak = 0;
    f.pos.copy(BR.plane.pos);
    if (f.br.canopy) f.br.canopy.visible = false;
    if (!f.isPlayer) {
      f.group.visible = false; setAvatarGun(f, WID.pistol); f.ammo = undefined; f.reloadUntil = 0; f.nades = 0; f.target = null; f.path = null; f.hasGoal = false;
      f.baseAcc = f.baseAcc || f.acc; f.acc = f.baseAcc - .03;
      // where to land: a named area (busy ones more often) or now and then somewhere quiet
      let tx, tz;
      if (Math.random() < .85) { const p = brPick(poiW), a2 = rand(0, 6.283), r = Math.sqrt(Math.random())*p.r*.8; tx = p.x + Math.cos(a2)*r; tz = p.z + Math.sin(a2)*r; }
      else { const s = BR.spots[Math.floor(Math.random()*BR.spots.length)]; tx = s.x; tz = s.z; }
      f.br.tx = tx; f.br.tz = tz; f.br.ty = surfaceBelow(tx, tz, 400);
      const s = ((tx - BR.plane.from.x)*dir.x + (tz - BR.plane.from.z)*dir.z)/(2*BR_PLANE_HALF);
      f.br.jumpS = clamp(s - rand(.03, .16), .04, .96);
      // squads land together: your teammates jump when you do, other squads when their leader does
      if (BR.trio && f.squad === player.squad) { f.br.jumpS = 2; f.br.follow = true; }
      else if (BR.trio) { const lead = fighters.find(m => m.squad === f.squad && !m.isPlayer); if (lead !== f) { f.br.tx = lead.br.tx + rand(-6, 6); f.br.tz = lead.br.tz + rand(-6, 6); f.br.ty = surfaceBelow(f.br.tx, f.br.tz, 400); f.br.jumpS = clamp(lead.br.jumpS + rand(0, .02), .04, .97); } }
      f.br.offx = rand(-5, 5); f.br.offz = rand(-5, 5);
    }
  }
  // you: a pistol and a little ammo, no plates, no grenades
  BR.inv = { slots: [{ wid: WID.pistol, rar: 0, mag: null }, null], cur: 0, ammo: { light: 24, rifle: 0, shells: 0, heavy: 0 }, cash: 0 };
  curLethal = 'frag'; nades = 0; curTac = 'flash'; tacs = 0; plating = null;
  for (const k in ksReady) ksReady[k] = false;
  brEquip();
  yaw = Math.atan2(-dir.x, -dir.z); pitch = -.25;
  BR.left = fighters.length;
  brLoops(true);
  later(1.2, () => { brBanner('CRESTFALL ISLAND', `${fighters.length} PLAYERS · JUMP WITH ${btnName('jump').toUpperCase()}`); say('Welcome to Crestfall Island. Jump when you are ready.', true); });
}
// ---- the plane, jumping, freefall and the parachute ----
function brJump(f) {
  const b = f.br; if (b.st !== 'plane') return;
  b.st = 'fall'; f.brZone = 'air'; b.wantChute = false;
  f.pos.copy(BR.plane.pos); f.pos.y -= 3.5;
  b.vx = BR.plane.dir.x*BR_PLANE_SPEED*.7; b.vz = BR.plane.dir.z*BR_PLANE_SPEED*.7; b.vy = -3;
  if (f.isPlayer) {
    pitch = Math.min(pitch, -.6); thud(160, .5, .5); BR.jumpT = now;
    if (BR.trio) brMates(f).forEach((m, i) => { if (m.br.st === 'plane') later(.3 + i*.35, () => brJump(m)); });
  }
  else { f.group.visible = true; f.bodyYaw = Math.atan2(BR.plane.dir.x, BR.plane.dir.z); }
}
function brChute(f) {
  const b = f.br; if (b.st !== 'fall') return;
  b.st = 'chute'; b.wantChute = false;
  if (!b.canopy && !f.isPlayer) {
    const c = new THREE.Group(), m = new THREE.Mesh(BRM.canopy, BRM.chute[Math.floor(Math.random()*BRM.chute.length)]); m.position.y = 4.6; m.castShadow = true; c.add(m);
    const pts = []; for (const [x, z] of [[-2.2, -2.6], [2.2, -2.6], [-2.2, 2.6], [2.2, 2.6]]) pts.push(V(0, 1.5, 0), V(x*.95, 4.5, z*.95));
    c.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), BRM.lineMat)); f.group.add(c); b.canopy = c;
  }
  if (b.canopy) { b.canopy.visible = true; b.canopy.scale.setScalar(.2); }
  const d = f.pos.distanceTo(camera.position);
  // other people's parachutes: only close ones, and not a dozen at once when a crowd opens together
  if (f.isPlayer || (d < 40 && now - (BR.chuteSndT || -9) > .35)) {
    if (!f.isPlayer) BR.chuteSndT = now; const v = f.isPlayer ? 1 : .5/(1 + d*.1); src(.5, 'bandpass', 380, 2.2*v, outNode(.6, 0, false), AC ? AC.currentTime : 0, .7); thud(140, .35, .5*v); }
}
// steering in the air (you with the keys, bots toward where they want to land)
function brAirMove(f, dt, ctl) {
  const b = f.br, chute = b.st === 'chute', hMax = chute ? BR_FALL.chuteH : BR_FALL.h;
  let tvx = ctl.mx*hMax, tvz = ctl.mz*hMax;
  const tvy = chute ? -BR_FALL.chuteV - (ctl.dive ? 2.5 : 0) : -(BR_FALL.v + (ctl.dive || 0)*(BR_FALL.dive - BR_FALL.v)) + (ctl.brake ? 6 : 0);
  const e = isleIn(f.pos.x, f.pos.z);
  if (e < 14) { const r = Math.hypot(f.pos.x, f.pos.z) || 1, k = (14 - e)*1.6; tvx -= f.pos.x/r*k; tvz -= f.pos.z/r*k; }   // the wind pushes you back over the island
  const kh = 1 - Math.exp(-dt*(chute ? 2.2 : 1.5)), kv = 1 - Math.exp(-dt*(chute ? 3 : 1.1));
  b.vx += (tvx - b.vx)*kh; b.vz += (tvz - b.vz)*kh; b.vy += (tvy - b.vy)*kv;
  const y0 = f.pos.y;
  f.pos.x += b.vx*dt; f.pos.z += b.vz*dt; f.pos.y += b.vy*dt;
  // the highest thing under you between where you were and where you are now (a fast fall can cross a whole roof
  // in one frame), wide as your body so you can't slip past a roof's edge into the building
  const gy = surfaceBelow(f.pos.x, f.pos.z, y0 + .3, .3), alt = f.pos.y - gy;
  b.alt = alt;
  if (b.st === 'fall' && (alt < BR_FALL.auto || b.wantChute)) brChute(f);
  if (alt <= 0) brLand(f, gy);
}
function brLand(f, gy) {
  const b = f.br; b.st = 'ground'; f.brZone = 'island';
  f.pos.y = gy; f.velY = 0; f.onGround = true; collide(f.pos, R);
  if (b.canopy) b.canopy.visible = false;
  if (f.isPlayer) {
    player.vel = { x: b.vx*.35, z: b.vz*.35 }; RS.dip.v -= 1.4; RS.mv.v -= 2; thud(320, .18, .55); landSlowT = .2;
    BR.vmCanopy.visible = false; equipLoadout(); switchAnim = .8;
    if (!BR.said.land) { BR.said.land = true; later(.6, () => centerMsg('LOOT UP · OPEN SUPPLY BOXES · FIND CASH')); }
  } else {
    f.group.rotation.set(0, f.bodyYaw, 0); f.lastPos.copy(f.pos); f.path = null; f.think = now + rand(.1, .5); f.stuckCheck = now + 1;
  }
}
// called at the top of updatePlayer: true means it handled you this frame (in the plane, the air, a menu, a countdown)
function brPlayerAir(dt) {
  if (!BR.on || !player.br) return false;
  const b = player.br, st = b.st;
  if (st === 'plane') { player.pos.copy(BR.plane.pos); if (jumpBuf >= 0 && now - jumpBuf < .3) { jumpBuf = -1; brJump(player); } firing = false; return true; }
  if (st === 'fall' || st === 'chute') {
    const m = moveInput(), dive = st === 'fall' && m.f > 0 ? clamp((-pitch - .35)/.8, 0, 1) : st === 'chute' && m.f > 0 && pitch < -.6 ? 1 : 0;
    if (jumpBuf >= 0 && now - jumpBuf < .3) { jumpBuf = -1; if (st === 'fall') b.wantChute = true; }
    brAirMove(player, dt, { mx: m.mx*(m.len ? 1 : 0), mz: m.mz*(m.len ? 1 : 0), dive, brake: m.f < 0 });
    player.speed = Math.hypot(b.vx, b.vz); firing = false; adsHeld = false; eyeH = 1.6; onGround = false;
    return true;
  }
  if (st === 'gulag' && BR.duel && BR.duel.frozen) { if (player.vel) player.vel.x = player.vel.z = 0; firing = false; return true; }
  if (player.downed) {
    if (BR.inv.selfRevive && held('interact')) { player.reviveT = (player.reviveT || 0) + dt; if (player.reviveT >= 4) { BR.inv.selfRevive = false; brRevive(player, player); } }
    else if (!brMates(player).some(m => m.alive && !m.downed && m.pos.distanceTo(player.pos) < 2.2 && m.br.revT > 0)) player.reviveT = 0;
    return brDownedMove(dt);
  }
  if (BR.ui === 'shop') { if (player.vel) { player.vel.x *= .8; player.vel.z *= .8; } stepPhysics(player, dt, STAND_H); firing = false; return true; }
  return false;
}
// called at the top of updateBot: true means it handled the bot this frame
function brBotAir(b, dt) {
  if (!BR.on || !b.br) return false;
  const s = b.br.st;
  if (s === 'wait' || s === 'out') { if (now - b.dieT < 2.4 && !b.alive) return false; b.group.visible = false; return true; }   // (after the fall animation)
  if (s === 'plane') { b.pos.copy(BR.plane.pos); b.group.visible = false; if (BR.plane.s >= b.br.jumpS) brJump(b); return true; }
  if (s === 'fall' || s === 'chute') {
    if (b.br.follow && player.br && player.br.st !== 'plane') {   // your teammates come down next to you
      const lead = player.br.st === 'fall' || player.br.st === 'chute' ? 2.5 : 0;
      b.br.tx = player.pos.x + player.br.vx*lead + b.br.offx; b.br.tz = player.pos.z + player.br.vz*lead + b.br.offz; b.br.ty = surfaceBelow(b.br.tx, b.br.tz, 400);
    }
    const dx = b.br.tx - b.pos.x, dz = b.br.tz - b.pos.z, d = Math.hypot(dx, dz) || 1, alt = b.pos.y - (b.br.ty || 0);
    // glide toward the landing spot; dive once it's below; open the parachute late when right over it
    const reach = s === 'fall' ? (alt - BR_FALL.auto)/BR_FALL.v*BR_FALL.h + BR_FALL.auto/BR_FALL.chuteV*BR_FALL.chuteH : alt/BR_FALL.chuteV*BR_FALL.chuteH;
    const over = d < reach*.55;
    brAirMove(b, dt, { mx: d > 2 ? dx/d : 0, mz: d > 2 ? dz/d : 0, dive: over ? 1 : 0 });
    if (b.br.st !== 'fall' && b.br.st !== 'chute') return true;   // just landed
    b.group.visible = true; b.group.position.copy(b.pos);
    b.bodyYaw = approach(b.bodyYaw, Math.atan2(b.br.vx, b.br.vz), dt*3);
    const tilt = s === 'fall' ? 1.15 : .1 + Math.sin(now*1.3 + b.stepPh)*.05;
    b.group.rotation.set(tilt, b.bodyYaw, s === 'chute' ? Math.sin(now*1.1 + b.acc*9)*.08 : 0);
    if (b.br.canopy && s === 'chute') b.br.canopy.scale.setScalar(Math.min(1, b.br.canopy.scale.x + dt*3));
    if (b.mixer) animateSoldier(b, dt, 0, false, 0, b.pos.distanceTo(camera.position) < 70, 2);
    b.headW.set(b.pos.x, b.pos.y + 1.6, b.pos.z); b.bodyW.set(b.pos.x, b.pos.y + .9, b.pos.z);
    return true;
  }
  if (s === 'gulag' && BR.duel && BR.duel.frozen) { b.group.position.copy(b.pos); if (b.mixer) animateSoldier(b, dt, 0, false, 0, true, 1); return true; }
  if (b.downed && b.alive) return brDownedBot(b, dt);
  return false;
}
// the camera in the plane, and the extras in the air (index.html: end of updateView)
function brCamera(dt) {
  if (!BR.on || !player.br) return;
  const st = player.br.st;
  if (st === 'plane') {
    const p = BR.plane.pos, d = 46, cp = Math.cos(pitch);
    camera.position.set(p.x + Math.sin(yaw)*cp*d, p.y + 5 - Math.sin(pitch)*d, p.z + Math.cos(yaw)*cp*d);
    camera.lookAt(p.x, p.y + 1, p.z);
    if (Math.abs(camera.fov - 66) > .01) { camera.fov = 66; camera.updateProjectionMatrix(); }
    vmRoot.visible = false; sky.position.copy(camera.position);
  } else if (st === 'fall' || st === 'chute') {
    vmRoot.visible = false;
    const sp = Math.hypot(player.br.vx, player.br.vy, player.br.vz), fov = st === 'fall' ? 84 + Math.min(10, sp*.15) : 78;
    camera.rotation.z += Math.sin(now*17)*.003*Math.min(1, sp/30) + (st === 'chute' ? Math.sin(now*1.2)*.02 : 0);
    if (Math.abs(camera.fov - fov) > .01) { camera.fov += (fov - camera.fov)*Math.min(1, dt*4); camera.updateProjectionMatrix(); }
  }
  if (player.downed) vmRoot.visible = false;
  BR.vmCanopy.visible = st === 'chute';
  if (BR.vmCanopy.visible) { const k = Math.min(1, (BR.vmCanopy.userData.k = (BR.vmCanopy.userData.k || 0) + dt*3)); BR.vmCanopy.scale.setScalar(k); BR.vmCanopy.rotation.z = Math.sin(now*1.2)*.05; }
  else BR.vmCanopy.userData.k = 0;
  // haze thins out with height so the island is clear from the plane
  scene.fog.density = BR.baseFog * (1 - .8*clamp((camera.position.y - 12)/90, 0, 1));
  // high up, the near clip plane moves out: the depth buffer then stays precise enough that the sea and the
  // sea bed don't flicker through each other (on the ground it's back to normal for things right in your face)
  const near = clamp((camera.position.y - surfaceBelow(camera.position.x, camera.position.z, camera.position.y) - 4)*.012, .05, 2.4);
  if (Math.abs(camera.near - near) > .01) { camera.near = near; camera.updateProjectionMatrix(); }
}
// looping engine drone and wind
function brLoops(on) {
  if (!AC) return;
  const mk2 = (freq, q, type) => {
    // a steady noise loop (the shared noise() buffers fade out, which made the loop pulse and click every 2 s)
    if (!BR.loopBuf) { const n = AC.sampleRate*3, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0); let lp = 0; for (let i = 0; i < n; i++) { lp += (Math.random()*2 - 1 - lp)*.5; d[i] = lp; } BR.loopBuf = b; }
    const s = AC.createBufferSource(); s.buffer = BR.loopBuf; s.loop = true;
    const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = AC.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(outNode(1, 0, false)); s.start(); return { s, f, g };
  };
  if (on && !BR.loopPlane) { BR.loopPlane = mk2(90, 2.5, 'lowpass'); BR.loopWind = mk2(700, .6, 'bandpass'); }
  if (!on && BR.loopPlane) { for (const L of [BR.loopPlane, BR.loopWind]) { try { L.s.stop(); } catch (e) {} } BR.loopPlane = BR.loopWind = null; }
}
// =====================================================================
// Loot
// =====================================================================
function brRollItem(tier, crate) {
  const r = Math.random();
  if (r < (crate ? .5 : .24)) {
    const wid = WID[brPick(BR_GUNS)], tbl = crate === 2 ? [0, 0, 25, 45, 30] : crate ? [0, 30, 40, 22, 8] : tier > 1 ? [20, 34, 28, 13, 5] : [44, 32, 16, 6.5, 1.5];
    return { kind: 'gun', wid, rar: brRollRar(tbl), mag: null };
  }
  if (r < (crate ? .62 : .5)) { const a = brPick([['light', 3], ['rifle', 3], ['shells', 1.4], ['heavy', 1]]); return { kind: 'ammo', ammo: a, n: BR_AMMO[a].box }; }
  if (r < (crate ? .78 : .64)) return { kind: 'plate', n: Math.random() < .25 || crate ? 2 : 1 };
  if (r < (crate ? .9 : .77)) return { kind: 'cash', n: 100*(1 + Math.floor(Math.random()*(tier > 1 || crate ? 6 : 4))) };
  if (r < .86) return { kind: 'lethal', eq: Math.random() < .62 ? 'frag' : 'claymore', n: 1 };
  if (r < .93) return { kind: 'tac', eq: Math.random() < .55 ? 'flash' : 'smoke', n: 1 };
  if (r < .965) return { kind: 'mask' };
  if (r < .985) return { kind: 'carrier' };
  return tier > 1 || crate ? { kind: 'streak', eq: Math.random() < .7 ? 'uav' : 'air' } : { kind: 'cash', n: 300 };
}
const brCell = (x, z) => (Math.floor(x/16) + 64)*256 + Math.floor(z/16) + 64;
function brSpawnLoot(it, x, y, z, toss) {
  it.id = ++BR.itemId; it.x = x; it.y = y; it.z = z; it.mesh = null; it.born = now;
  if (toss) { it.fx = toss.x; it.fy = toss.y; it.fz = toss.z; it.ft = 0; }
  BR.items.push(it);
  const k = brCell(x, z); if (!BR.grid.has(k)) BR.grid.set(k, []); BR.grid.get(k).push(it);
  return it;
}
function brRemoveItem(it) {
  brItemHide(it); it.gone = true;
  const i = BR.items.indexOf(it); if (i >= 0) BR.items.splice(i, 1);
  const L = BR.grid.get(brCell(it.x, it.z)); if (L) { const j = L.indexOf(it); if (j >= 0) L.splice(j, 1); }
}
function brItemsNear(x, z, r, out = []) {
  out.length = 0;
  for (let i = Math.floor((x - r)/16); i <= Math.floor((x + r)/16); i++) for (let j = Math.floor((z - r)/16); j <= Math.floor((z + r)/16); j++) {
    const L = BR.grid.get((i + 64)*256 + j + 64); if (!L) continue;
    for (const it of L) if ((it.x - x)**2 + (it.z - z)**2 < r*r) out.push(it);
  }
  return out;
}
function brItemShow(it) {
  if (it.mesh) return;
  const g = new THREE.Group(), rar = brItemRar(it);
  g.add(brItemTemplate(it).clone());
  const glow = new THREE.Sprite(BRM.glow[rar]); glow.scale.setScalar(it.kind === 'gun' ? 1.5 : .9); glow.position.y = .12; g.add(glow);
  if (rar >= 2) { const bm = new THREE.Mesh(BRM.beamGeo, BRM.beam[rar]); bm.scale.y = it.kind === 'gun' ? 1 : .6; g.add(bm); }
  g.rotation.y = (it.id*2.399) % 6.283;
  BR.root.add(g); it.mesh = g;
}
function brItemHide(it) { if (it.mesh) { BR.root.remove(it.mesh); it.mesh = null; } }
// what the player has, as the regular game sees it: two gun slots, mags, ammo reserves
function brEquip() {
  const inv = BR.inv; if (!inv) return;
  for (const s of inv.slots) if (s) {
    const w = WEAPONS[s.wid];
    BR.att[w.id] = s.rar >= 5 ? null : brAttFor(w, s.rar); BR.camo[s.wid] = s.rar >= 5 ? null : BR_RAR[s.rar].camo;
    applyAttachments(w); rebuildViewmodel(s.wid);
    if (s.mag === null || s.mag === undefined) s.mag = w.mag;
    mags[s.wid] = Math.min(s.mag, w.mag);
  }
  if (!inv.slots[inv.cur]) inv.cur = inv.slots[0] ? 0 : 1;
  loadout = [inv.slots[0] ? inv.slots[0].wid : -1, inv.slots[1] ? inv.slots[1].wid : -1];
  weapon = inv.slots[inv.cur].wid; reloadUntil = 0; action = null; inspectT = 0;
  guns.forEach((g, j) => g.visible = j === weapon);
  brSlotsHUD();
}
function brSlotsHUD() {
  const inv = BR.inv; if (!inv) return;
  $('slots').innerHTML = inv.slots.map((s, k) => s ? `<span style="color:${BR_RAR[s.rar].col}">${k + 1} ${WEAPONS[s.wid].name}</span>` : `<span style="opacity:.35">${k + 1} empty</span>`).join('');
  hudCache.slot = -1;
}
// keep the inventory in step with what the regular game did (switching guns, shooting)
function brSyncInv() {
  const inv = BR.inv; if (!inv) return;
  for (let k = 0; k < 2; k++) { const s = inv.slots[k]; if (s) { s.mag = mags[s.wid]; if (s.wid === weapon) inv.cur = k; } }
}
const brReserve = wid => BR.inv ? BR.inv.ammo[brAmmoOf(wid)] || 0 : 0;
function brTake(wid, n) { const a = brAmmoOf(wid), have = BR.inv.ammo[a] || 0, t = Math.min(have, n); BR.inv.ammo[a] = have - t; return t; }
function brPickMsg(text, col) {
  const el = $('brPicks'), d = document.createElement('div'); d.innerHTML = text; if (col) d.style.color = col;
  el.prepend(d); while (el.children.length > 5) el.lastChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 450); }, 2600);
}
// picking something up. Returns false when you can't (full up). `who` is any fighter.
function brTakeItem(who, it, manual) {
  if (it.gone) return false;
  if (!who.isPlayer) return brBotTake(who, it);
  const inv = BR.inv, P = player;
  switch (it.kind) {
    case 'gun': {
      if (!manual) return false;
      const w = WEAPONS[it.wid];
      let k = inv.slots.findIndex(s => s && s.wid === it.wid);
      if (k < 0) k = inv.slots.findIndex(s => !s);
      if (k < 0) k = inv.cur;
      const old = inv.slots[k];
      brSyncInv();
      if (old) brDropGun(old, P.pos.x - Math.sin(yaw)*.6, P.pos.y, P.pos.z - Math.cos(yaw)*.6);
      inv.slots[k] = { wid: it.wid, rar: it.rar, mag: it.mag };
      inv.cur = k;
      const a = brAmmoOf(it.wid); inv.ammo[a] = Math.min(BR_AMMO[a].max, (inv.ammo[a] || 0) + Math.round(w.base ? w.base.mag : w.mag));   // a spare mag comes with it
      brEquip(); switchAnim = 1; mech('switch');
      brPickMsg(`${w.name} <small style="opacity:.7">· ${BR_RAR[it.rar].name.toUpperCase()}</small>`, BR_RAR[it.rar].col);
      if (it.rar >= 4) { tone(880, .1, .1, 'triangle'); setTimeout(() => tone(1320, .2, .1, 'triangle'), 90); }
      break;
    }
    case 'ammo': {
      const have = inv.ammo[it.ammo] || 0, max = BR_AMMO[it.ammo].max; if (have >= max) return false;
      const t = Math.min(it.n, max - have); inv.ammo[it.ammo] = have + t; it.n -= t;
      brPickMsg(`+${t} ${BR_AMMO[it.ammo].name}`, BR_AMMO[it.ammo].col); mech('magIn', 0, .3);
      if (it.n > 0) return true;
      break;
    }
    case 'plate': {
      const room = (P.maxPlates || 5) - (P.plates || 0); if (room <= 0) return false;
      const t = Math.min(room, it.n); P.plates += t; it.n -= t; brPickMsg(`+${t} Armor plate${t > 1 ? 's' : ''}`, '#9fd0ff'); mech('plateIn', 0, .4);
      if (it.n > 0) return true;
      break;
    }
    case 'cash': inv.cash += it.n; BR.stats.cash += it.n; brPickMsg(`+${brFmt(it.n)}`, '#6dff9d'); tone(1568, .06, .06, 'triangle'); setTimeout(() => tone(2093, .09, .06, 'triangle'), 60); break;
    case 'lethal': {
      if (nades > 0 && curLethal !== it.eq) { if (!manual) return false; brSpawnLoot({ kind: 'lethal', eq: curLethal, n: nades }, P.pos.x, P.pos.y, P.pos.z); nades = 0; }
      if (nades >= 3) return false;
      curLethal = it.eq; nades = Math.min(3, nades + it.n); brPickMsg(`+${EQUIP[it.eq].name}`, '#ffd27a'); mech('pin', 0, .3); break;
    }
    case 'tac': {
      if (tacs > 0 && curTac !== it.eq) { if (!manual) return false; brSpawnLoot({ kind: 'tac', eq: curTac, n: tacs }, P.pos.x, P.pos.y, P.pos.z); tacs = 0; }
      if (tacs >= 3) return false;
      curTac = it.eq; tacs = Math.min(3, tacs + it.n); brPickMsg(`+${EQUIP[it.eq].name}`, '#ffd27a'); mech('pin', 0, .3); break;
    }
    case 'mask': if ((P.brMask || 0) >= 14) return false; P.brMask = 14; brPickMsg('+Gas mask', '#7affc0'); mech('plateStart', 0, .5); break;
    case 'carrier': if ((P.maxPlates || 5) >= 8) return false; P.maxPlates = 8; brPickMsg('Plate carrier · 8 plates', '#9fd0ff'); mech('plateIn', 0, .5); break;
    case 'streak': if (ksReady[it.eq]) return false; ksReady[it.eq] = true; brPickMsg(`${it.eq === 'uav' ? 'UAV' : 'Airstrike'} ready · press ${btnName(it.eq === 'uav' ? 'ksUav' : 'ksAir').toUpperCase()}`, '#ffb63a'); tone(1200, .08, .1, 'square'); break;
  }
  BR.stats.items++;
  brRemoveItem(it);
  return true;
}
function brDropGun(s, x, y, z) {
  const it = brSpawnLoot({ kind: 'gun', wid: s.wid, rar: s.rar, mag: s.mag }, x, surfaceBelow(x, z, y + .5), z);
  return it;
}
// everything someone carried spills out where they fell
function brDropAll(f) {
  const x = f.pos.x, y = surfaceBelow(f.pos.x, f.pos.z, f.pos.y + .5), z = f.pos.z, list = [];
  if (f.isPlayer && BR.inv) {
    brSyncInv();
    for (const s of BR.inv.slots) if (s && !(s.wid === WID.pistol && s.rar === 0)) list.push({ kind: 'gun', wid: s.wid, rar: s.rar, mag: s.mag });
    for (const a in BR.inv.ammo) if (BR.inv.ammo[a] > 0) list.push({ kind: 'ammo', ammo: a, n: Math.ceil(BR.inv.ammo[a]*.6) });
    if (BR.inv.cash > 0) { const c = Math.max(100, Math.round(BR.inv.cash*.5/50)*50); list.push({ kind: 'cash', n: c }); BR.inv.cash -= Math.min(BR.inv.cash, c); }
    if (nades > 0) list.push({ kind: 'lethal', eq: curLethal, n: nades });
    if (tacs > 0) list.push({ kind: 'tac', eq: curTac, n: tacs });
  } else {
    if (f.wid !== WID.pistol || (f.br.rar || 0) > 0) list.push({ kind: 'gun', wid: f.wid, rar: f.br.rar || 0, mag: null });
    list.push({ kind: 'ammo', ammo: brAmmoOf(f.wid), n: Math.round(BR_AMMO[brAmmoOf(f.wid)].box*rand(.6, 1.2)) });
    list.push({ kind: 'cash', n: Math.max(100, Math.round(((f.br.cash || 0)*.6 + 150)/50)*50) });
    if (f.br.mask > 0) list.push({ kind: 'mask' });
  }
  if ((f.plates || 0) > 0) list.push({ kind: 'plate', n: Math.min(3, f.plates) });
  f.plates = 0;
  list.forEach((it, i) => {
    const a = i/list.length*6.283 + rand(-.3, .3), r = .7 + Math.random()*.6;
    brSpawnLoot(it, x + Math.cos(a)*r, y, z + Math.sin(a)*r, { x, y: y + .9, z });
  });
}
// the item drawn on the ground (only near the camera), bobbing; freshly dropped items arc out
const _bri = [];
function brUpdateItems(dt) {
  const cx = camera.position.x, cz = camera.position.z, R2 = 46*46;
  if ((BR.scanT -= dt) <= 0) {
    BR.scanT = .25;
    for (const it of BR.items) { const d2 = (it.x - cx)**2 + (it.z - cz)**2; if (d2 < R2 && camera.position.y - it.y < 60) brItemShow(it); else if (d2 > 52*52 || camera.position.y - it.y > 70) brItemHide(it); }
  }
  for (const it of BR.items) {
    if (!it.mesh) continue;
    let x = it.x, y = it.y, z = it.z;
    if (it.ft !== undefined && it.ft < 1) { it.ft = Math.min(1, it.ft + dt*2.4); const k = it.ft; x = it.fx + (it.x - it.fx)*k; z = it.fz + (it.z - it.fz)*k; y = it.fy + (it.y - it.fy)*k + Math.sin(k*Math.PI)*.5; }
    it.mesh.position.set(x, y + .02 + Math.sin(now*2.2 + it.id)*.025, z);
    it.mesh.rotation.y += dt*.6;
  }
}
// =====================================================================
// Supply boxes
// =====================================================================
function brUpdateCrates(dt) {
  const cx = camera.position.x, cz = camera.position.z;
  for (const c of BR.crates) {
    const d2 = (c.x - cx)**2 + (c.z - cz)**2;
    if (d2 < 170*170) {
      if (!c.mesh) {
        c.mesh = brCrateModel(c.legend); c.mesh.position.set(c.x, c.y, c.z); c.mesh.rotation.y = c.rot ? Math.PI/2 : 0; BR.root.add(c.mesh);
        c.mesh.userData.beam.scale.set(c.legend ? .7 : .45, c.legend ? .5 : .14, c.legend ? .7 : .45);
        if (c.open) c.mesh.userData.lid.rotation.x = -1.9;
      }
    } else if (c.mesh) { BR.root.remove(c.mesh); c.mesh = null; }
    if (!c.mesh) continue;
    const bm = c.mesh.userData.beam;
    bm.visible = !c.open || c.scav;
    if (c.scav && !c.open) { bm.material = BRM.beam[1]; bm.scale.set(.8, .55, .8); }
    if (c.anim !== undefined && c.anim < 1) { c.anim = Math.min(1, c.anim + dt*2.6); c.mesh.userData.lid.rotation.x = -(1 - (1 - c.anim)**3)*1.9; }
  }
}
function brOpenCrate(c, who) {
  if (c.open) return;
  c.open = true; c.anim = 0;
  const legend = c.legend, n = legend ? 6 : 4 + (Math.random() < .5 ? 1 : 0), top = { x: c.x, y: c.y + .7, z: c.z };
  const list = [];
  const gun = brRollItem(c.tier, legend ? 2 : 1); while (gun.kind !== 'gun') Object.assign(gun, brRollItem(c.tier, legend ? 2 : 1));
  list.push(gun, { kind: 'ammo', ammo: brAmmoOf(gun.wid), n: BR_AMMO[brAmmoOf(gun.wid)].box });
  list.push({ kind: 'cash', n: 100*(2 + Math.floor(Math.random()*(legend ? 10 : 5))) });
  while (list.length < n) { const it = brRollItem(c.tier, legend ? 2 : 1); if (it.kind !== 'gun' || legend) list.push(it); }
  if (legend && Math.random() < .5) list.push({ kind: 'streak', eq: Math.random() < .65 ? 'uav' : 'air' });
  if (c.scav) { list.push({ kind: 'cash', n: 500 }); }
  const fx = c.rot ? 1 : 0, fz = c.rot ? 0 : 1;
  list.forEach((it, i) => {
    const off = (i - (list.length - 1)/2)*.55, x = c.x + (fx ? .9 : off) * (fx || 1), z = c.z + (fz ? .9 : off);
    const tx = c.rot ? c.x + .95 + Math.random()*.4 : c.x + off, tz = c.rot ? c.z + off : c.z + .95 + Math.random()*.4;
    brSpawnLoot(it, tx, surfaceBelow(tx, tz, c.y + .8), tz, top);
  });
  const d = who.pos.distanceTo(camera.position);
  if (who.isPlayer || d < 30) {
    const v = who.isPlayer ? 1 : .6/(1 + d*.15);
    mech('plateStart', 0, .6*v); src(.3, 'bandpass', 520, 1.2*v, outNode(.6, 0, false), AC ? AC.currentTime + .05 : 0, 1.4);
    if (who.isPlayer) { tone(988, .12, .08, 'triangle'); setTimeout(() => tone(1319, .14, .08, 'triangle'), 80); if (legend) setTimeout(() => tone(1760, .25, .09, 'triangle'), 170); }
  }
  if (who.isPlayer) { BR.stats.boxes++; stat('brBoxes'); addXP(legend ? 75 : 25, legend ? 'LEGENDARY SUPPLY BOX' : 'SUPPLY BOX'); }
  if (c.scav && BR.contract && BR.contract.kind === 'scav' && BR.contract.box === c) brScavStep(who);
}
// =====================================================================
// Buy stations, the shop, loadout drops
// =====================================================================
function brPrice(s) { return s.id === 'loadout' ? s.cost + (BR.shopPrice.loadout || 0) : s.cost; }
function brShopOpen(st) { BR.ui = 'shop'; BR.uiSel = BR.uiSel || 0; BR.shopAt = st; firing = false; adsHeld = false; brShopRender(); $('brShop').style.display = 'block'; mech('aim'); }
function brShopClose() { if (BR.ui !== 'shop') return; BR.ui = null; $('brShop').style.display = 'none'; mech('aim', 0, .3); }
function brShopOk(s) {
  const P = player;
  if (s.id === 'plate') return (P.plates || 0) < (P.maxPlates || 5);
  if (s.id === 'carrier') return (P.maxPlates || 5) < 8;
  if (s.id === 'mask') return (P.brMask || 0) < 14;
  if (s.id === 'uav' || s.id === 'air') return !ksReady[s.id];
  if (s.id === 'revive') return !BR.inv.selfRevive;
  if (s.id === 'buyback') return brMates(player).some(m => m.br.st === 'out');
  return true;
}
function brShopRender() {
  const cash = BR.inv.cash;
  $('brShop').innerHTML = `<h3>BUY STATION <span class="cash">${brFmt(cash)}</span></h3>` +
    brShopList().map((s, i) => { const p = brPrice(s), off = cash < p || !brShopOk(s); return `<div class="row ${i === BR.uiSel ? 'sel' : ''} ${off ? 'off' : ''}"><span class="k">${i < 9 ? i + 1 : i === 9 ? 0 : i === 10 ? '-' : i === 11 ? '=' : ''}</span><span class="nm">${s.name}<small>${s.note}</small></span><span class="c">${brFmt(p)}</span></div>`; }).join('') +
    `<div class="help">MOUSE / W S: CHOOSE · CLICK / SPACE / NUMBER: BUY · ${btnName('interact').toUpperCase()}: CLOSE</div>`;
}
function brBuy(i) {
  const s = brShopList()[i]; if (!s) return;
  const p = brPrice(s), P = player;
  if (BR.inv.cash < p) { centerMsg2('NOT ENOUGH CASH'); mech('dry'); return; }
  if (!brShopOk(s)) { centerMsg2(s.id === 'plate' ? 'PLATES FULL' : 'YOU ALREADY HAVE THAT'); mech('dry'); return; }
  switch (s.id) {
    case 'plate': P.plates++; break;
    case 'armor': P.armor = 150; P.plates = P.maxPlates || 5; break;
    case 'ammo': for (const a in BR.inv.ammo) BR.inv.ammo[a] = BR_AMMO[a].max; break;
    case 'frag': case 'claymore': if (curLethal !== s.id) nades = 0; curLethal = s.id; nades = Math.min(3, nades + 1); break;
    case 'flash': case 'smoke': if (curTac !== s.id) tacs = 0; curTac = s.id; tacs = Math.min(3, tacs + 1); break;
    case 'mask': P.brMask = 14; break;
    case 'carrier': P.maxPlates = 8; break;
    case 'uav': case 'air': ksReady[s.id] = true; break;
    case 'revive': BR.inv.selfRevive = true; break;
    case 'buyback': { const m = brMates(player).find(m => m.br.st === 'out'); if (m) brBuyback(m, player); break; }
    case 'loadout': {
      BR.shopPrice.loadout = (BR.shopPrice.loadout || 0) + 2500;
      const st = BR.shopAt || { x: P.pos.x, z: P.pos.z }, a = rand(0, 6.283);
      brSpawnDrop(st.x + Math.cos(a)*5, st.z + Math.sin(a)*5, player);
      say('Loadout drop inbound'); break;
    }
  }
  BR.inv.cash -= p;
  tone(660, .05, .08, 'square'); setTimeout(() => tone(990, .07, .08, 'square'), 50); setTimeout(() => tone(1320, .1, .07, 'triangle'), 110);
  brPickMsg(`Bought ${s.name}`, '#7dffaa');
  brShopRender();
}
// a loadout crate floating down under a parachute, trailing red smoke once it lands
function brSpawnDrop(x, z, owner) {
  const g = new THREE.Group();
  brBox(1.5, .9, 1, BRM.red, 0, .45, 0, g); brBox(1.52, .12, 1.02, BRM.dark, 0, .9, 0, g); for (const xx of [-.6, .6]) brBox(.1, .92, 1.02, BRM.dark, xx, .45, 0, g);
  const can = new THREE.Mesh(BRM.canopy, BRM.chute[0]); can.position.y = 5; can.scale.setScalar(.9); g.add(can);
  const beam = new THREE.Mesh(BRM.tall, BRM.beam[5]); beam.scale.set(.8, .7, .8); g.add(beam);
  g.traverse(o => { if (o.isMesh && o !== beam) o.castShadow = true; });
  const gy = surfaceBelow(x, z, 60); g.position.set(x, gy + 110, z); BR.root.add(g);
  const d = { x, z, y: gy + 110, gy, mesh: g, can, beam, landed: false, owner, open: false, smokeT: 0 };
  BR.drops.push(d); return d;
}
function brUpdateDrops(dt) {
  for (const d of BR.drops) {
    if (!d.landed) {
      d.y = Math.max(d.gy, d.y - 10*dt); d.mesh.position.y = d.y; d.mesh.rotation.y += dt*.4;
      if (d.y <= d.gy) { d.landed = true; d.can.visible = false; thud(120, .4, .5/(1 + d.mesh.position.distanceTo(camera.position)*.05)); }
    } else if (!d.open && (d.smokeT -= dt) <= 0) {
      d.smokeT = .12;
      particle(TX.smoke, V(d.x + rand(-.3, .3), d.gy + 1, d.z + rand(-.3, .3)), V(rand(-.3, .3), rand(1.5, 2.5), rand(-.3, .3)), rand(2.5, 3.5), .8, 3, lin(0xd83a2a), false, -.1, .7, .3);
    }
    d.beam.visible = !d.open;
  }
}
function brOpenDrop(d, who) {
  if (d.open) return;
  d.open = true;
  if (who.isPlayer) {
    const inv = BR.inv; brSyncInv();
    for (const s of inv.slots) if (s && s.rar < 5 && !(s.wid === WID.pistol && s.rar === 0)) brDropGun(s, d.x + rand(-1, 1), d.gy, d.z + rand(-1, 1));
    inv.slots = [{ wid: pendingLoadout[0], rar: 5, mag: null }, { wid: pendingLoadout[1], rar: 5, mag: null }]; inv.cur = 0;
    for (const s of inv.slots) { const a = brAmmoOf(s.wid); inv.ammo[a] = Math.min(BR_AMMO[a].max, (inv.ammo[a] || 0) + WEAPONS[s.wid].mag*3); }
    curLethal = lethalSel; nades = EQUIP[lethalSel].count; curTac = tacticalSel; tacs = EQUIP[tacticalSel].count;
    brEquip(); switchAnim = 1; mech('switch');
    brBanner('LOADOUT EQUIPPED', `${WEAPONS[pendingLoadout[0]].name.toUpperCase()} · ${WEAPONS[pendingLoadout[1]].name.toUpperCase()}`);
    tone(784, .1, .1, 'triangle'); setTimeout(() => tone(1175, .18, .1, 'triangle'), 90);
  } else {
    const wid = WID[brPick(BR_GUNS.filter(g => g[0] !== 'pistol'))]; brBotGun(who, wid, 4); who.plates = Math.max(who.plates || 0, 4); who.armor = 150;
  }
  setTimeout(() => { BR.root.remove(d.mesh); const i = BR.drops.indexOf(d); if (i >= 0) BR.drops.splice(i, 1); }, 2500);
}
// =====================================================================
// Contracts
// =====================================================================
function brTablet(kind, x, y, z) {
  const g = new THREE.Group(), C = BR_CONTRACT[kind];
  brBox(.08, .8, .08, BRM.dark, 0, .4, 0, g); const t = brBox(.5, .34, .05, BRM.dark, 0, .9, 0, g); t.rotation.x = -.5;
  const s = brBox(.44, .28, .01, BRM.screen(C.hex), 0, .905, .028, g); s.rotation.x = -.5;
  const beam = new THREE.Mesh(BRM.tall, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.hex).multiplyScalar(.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .5 }));
  beam.scale.set(.5, .25, .5); g.add(beam);
  g.position.set(x, y, z); BR.root.add(g);
  return { kind, x, y, z, mesh: g, taken: false };
}
function brStartContract(t) {
  if (BR.contract) { centerMsg2('FINISH YOUR CONTRACT FIRST'); mech('dry'); return; }
  const C = BR_CONTRACT[t.kind], c = { kind: t.kind, t0: now, until: now + C.time };
  if (t.kind === 'bounty') {
    let best = null, bd = 1e9;
    for (const b of bots) if (b.alive && b.br.st === 'ground') { const d = b.pos.distanceTo(player.pos); if (d > 25 && d < bd) { bd = d; best = b; } }
    if (!best) { centerMsg2('NO TARGETS RIGHT NOW'); return; }
    c.target = best; c.ping = V(); c.pingAt = 0;
  } else if (t.kind === 'scav') {
    c.step = 0; c.box = brScavBox(); if (!c.box) { centerMsg2('NO SUPPLY BOXES LEFT NEARBY'); return; }
  } else {
    const s = brReconSpot(); if (!s) { centerMsg2('NOTHING TO SCOUT RIGHT NOW'); return; }
    c.pt = s; c.prog = 0; c.term = brTablet('recon', s.x, s.y, s.z); c.term.mesh.scale.setScalar(1.6);
  }
  t.taken = true; BR.root.remove(t.mesh);
  BR.contract = c;
  brBanner(`${C.name.toUpperCase()} CONTRACT`, C.note.toUpperCase());
  say(`${C.name} contract accepted`); mech('beep'); setTimeout(() => mech('beep'), 140);
}
function brScavBox() {
  const P = player.pos, cand = BR.crates.filter(c => !c.open && !c.scav && Math.hypot(c.x - gas.cx, c.z - gas.cz) < gas.r - 6).map(c => [c, Math.hypot(c.x - P.x, c.z - P.z)]).filter(([, d]) => d > 20);
  cand.sort((a, b) => Math.abs(a[1] - 55) - Math.abs(b[1] - 55));
  const c = cand.length ? cand[0][0] : null; if (c) c.scav = true; return c;
}
function brScavStep(who) {
  const c = BR.contract; c.box.scav = false;
  if (!who.isPlayer) { c.box = brScavBox(); if (!c.box) brContractEnd(false, 'THE BOXES ARE GONE'); return; }
  c.step++;
  if (c.step >= 3) { brContractEnd(true); return; }
  c.box = brScavBox(); if (!c.box) { brContractEnd(true); return; }
  c.until = Math.max(c.until, now + 50);
  centerMsg(`SUPPLY BOX ${c.step}/3 · NEXT ONE MARKED`); mech('beep');
}
function brReconSpot() {
  const P = player.pos, list = BR.spots.filter(s => s.y < isleH(s.x, s.z) + .2 && Math.hypot(s.x - gas.cx, s.z - gas.cz) < gas.r - 10).map(s => [s, Math.hypot(s.x - P.x, s.z - P.z)]).filter(([, d]) => d > 35 && d < 110);
  return list.length ? list[Math.floor(Math.random()*list.length)][0] : null;
}
function brContractEnd(win, why) {
  const c = BR.contract; if (!c) return;
  if (c.term) BR.root.remove(c.term.mesh);
  if (c.box) c.box.scav = false;
  BR.contract = null;
  if (!win) { centerMsg(why || 'CONTRACT FAILED'); mech('dry'); return; }
  const reward = c.kind === 'bounty' ? 1500 : c.kind === 'scav' ? 1200 : 1000;
  BR.inv.cash += reward; BR.stats.cash += reward; BR.stats.contracts++; stat('brContracts');
  addXP(400, 'CONTRACT COMPLETE');
  if (c.kind === 'recon') { BR.reveal = 1; brBanner('RECON COMPLETE', 'THE FINAL CIRCLE IS ON YOUR MAP · +' + brFmt(reward)); }
  else brBanner('CONTRACT COMPLETE', '+' + brFmt(reward));
  tone(784, .1, .1, 'triangle'); setTimeout(() => tone(1047, .1, .1, 'triangle'), 90); setTimeout(() => tone(1568, .25, .1, 'triangle'), 180);
}
function brContractTick(dt) {
  const c = BR.contract, el = $('brContract');
  if (!c) { el.style.display = 'none'; return; }
  const C = BR_CONTRACT[c.kind], left = Math.max(0, Math.ceil(c.until - now));
  if (left <= 0) { brContractEnd(false, 'CONTRACT EXPIRED'); return; }
  let line = C.note;
  if (c.kind === 'bounty') {
    const t = c.target;
    if (!t.alive || t.br.st !== 'ground') { brContractEnd(false, 'YOUR TARGET IS GONE'); return; }
    if (now - c.pingAt > 5) { c.pingAt = now; c.ping.set(t.pos.x + rand(-14, 14), 0, t.pos.z + rand(-14, 14)); }
    line = `Target <b style="color:${t.color}">${t.name}</b> · ${Math.round(t.pos.distanceTo(player.pos))} m`;
  } else if (c.kind === 'scav') line = `Supply box ${c.step + 1}/3 · ${Math.round(Math.hypot(c.box.x - player.pos.x, c.box.z - player.pos.z))} m`;
  else line = c.prog > 0 ? `Uploading ${Math.round(c.prog*100)}%` : `Data point · ${Math.round(Math.hypot(c.pt.x - player.pos.x, c.pt.z - player.pos.z))} m`;
  el.style.display = 'block'; el.style.borderLeftColor = C.col;
  el.innerHTML = `<span class="tm">${Math.floor(left/60)}:${String(left % 60).padStart(2, '0')}</span><div class="t" style="color:${C.col}">${C.name.toUpperCase()} CONTRACT</div><div class="n">${line}</div>`;
}
// =====================================================================
// Interacting: pick up, open, buy, take a contract (one key, E by default)
// =====================================================================
const _bin = [];
function brFindTarget() {
  const P = player;
  if (!P.alive || P.downed || !P.br || (P.br.st !== 'ground' && P.br.st !== 'gulag') || BR.ui) return null;
  const e = camera.position, cp = Math.cos(pitch), fx = -Math.sin(yaw)*cp, fy = Math.sin(pitch), fz = -Math.cos(yaw)*cp;
  let best = null, bs = 0;
  const consider = (x, y, z, rad, mk) => {
    const h = Math.hypot(x - P.pos.x, z - P.pos.z); if (h > rad || Math.abs(y - P.pos.y) > 1.7) return;
    const dx = x - e.x, dy = y + .3 - e.y, dz = z - e.z, d = Math.hypot(dx, dy, dz), dot = (dx*fx + dy*fy + dz*fz)/(d || 1);
    if (h > 1.1 && dot < .55) return;
    const sc = (dot + 1.3)/(d + .4); if (sc > bs) { bs = sc; best = mk; }
  };
  for (const it of brItemsNear(P.pos.x, P.pos.z, 2.8, _bin)) consider(it.x, it.y, it.z, 2.6, { type: 'item', obj: it });
  for (const c of BR.crates) if (!c.open && Math.abs(c.x - P.pos.x) < 3 && Math.abs(c.z - P.pos.z) < 3) consider(c.x, c.y + .4, c.z, 2.4, { type: 'crate', obj: c, hold: .7 });
  for (const s of BR.stations) if (Math.abs(s.x - P.pos.x) < 3 && Math.abs(s.z - P.pos.z) < 3) consider(s.kx, s.ky + 1.2, s.kz, 2.8, { type: 'station', obj: s });
  for (const t of BR.tablets) if (!t.taken && Math.abs(t.x - P.pos.x) < 3 && Math.abs(t.z - P.pos.z) < 3) consider(t.x, t.y + .8, t.z, 2.4, { type: 'tablet', obj: t });
  for (const d of BR.drops) if (d.landed && !d.open && Math.abs(d.x - P.pos.x) < 3 && Math.abs(d.z - P.pos.z) < 3) consider(d.x, d.gy + .6, d.z, 2.6, { type: 'drop', obj: d, hold: .8 });
  const c = BR.contract;
  if (c && c.kind === 'recon' && Math.hypot(c.pt.x - P.pos.x, c.pt.z - P.pos.z) < 3 && Math.abs(c.pt.y - P.pos.y) < 1.7) best = { type: 'recon', obj: c, hold: 5 };
  if (BR.trio) for (const m of brMates(P)) if (m.downed && m.alive && m.pos.distanceTo(P.pos) < 2.2) best = { type: 'revive', obj: m, hold: 4 };
  return best;
}
function brLabel(t) {
  if (t.type === 'item') {
    const it = t.obj;
    if (it.kind === 'gun') { const w = WEAPONS[it.wid], R = BR_RAR[it.rar]; return [`Pick up ${w.name}`, `${R.name.toUpperCase()} ${w.cls.toUpperCase()}${BR.inv.slots.every(Boolean) && !BR.inv.slots.some(s => s.wid === it.wid) ? ` · SWAPS YOUR ${WEAPONS[weapon].name.toUpperCase()}` : ''}`, R.col]; }
    const nm = { ammo: () => `${BR_AMMO[it.ammo].name} ×${it.n}`, plate: () => `Armor plate${it.n > 1 ? 's ×' + it.n : ''}`, cash: () => brFmt(it.n), lethal: () => EQUIP[it.eq].name, tac: () => EQUIP[it.eq].name, mask: () => 'Gas mask', carrier: () => 'Plate carrier', streak: () => it.eq === 'uav' ? 'UAV' : 'Precision airstrike' }[it.kind]();
    return [`Pick up ${nm}`, '', BR_RAR[brItemRar(it)].col];
  }
  if (t.type === 'crate') return [t.obj.legend ? 'Open legendary supply box' : 'Open supply box', 'HOLD', t.obj.legend ? '#ffb63a' : '#5ad86f'];
  if (t.type === 'station') return ['Buy station', `YOU HAVE ${brFmt(BR.inv.cash)}`, '#7dffaa'];
  if (t.type === 'tablet') { const C = BR_CONTRACT[t.obj.kind]; return [`Take ${C.name} contract`, C.note.toUpperCase(), C.col]; }
  if (t.type === 'drop') return ['Take your loadout', 'HOLD', '#ff6a4a'];
  if (t.type === 'recon') return ['Upload recon data', 'HOLD · STAY CLOSE', '#4aa3ff'];
  if (t.type === 'revive') return [`Revive ${t.obj.name}`, 'HOLD', '#7ec8ff'];
  return ['', '', '#fff'];
}
function brUse(t) {
  if (t.type === 'item') { if (!brTakeItem(player, t.obj, true)) { centerMsg2(t.obj.kind === 'plate' ? 'PLATES FULL' : t.obj.kind === 'ammo' ? 'AMMO FULL' : 'CAN\'T CARRY MORE'); mech('dry'); } }
  else if (t.type === 'station') brShopOpen(t.obj);
  else if (t.type === 'tablet') brStartContract(t.obj);
  else if (t.hold) { BR.hold = { t, t0: now }; if (t.type === 'crate') mech('plateStart', 0, .4); }
}
function brInteractKey(down) {
  if (!BR.on || !running) return;
  if (!down) { BR.hold = null; return; }
  if (BR.ui === 'shop') { brShopClose(); return; }
  if (BR.ui === 'map') { brMapToggle(false); return; }
  const t = BR.prompt; if (t) brUse(t);
}
function brInteractTick(dt) {
  const t = brFindTarget(); BR.prompt = t;
  const el = $('brPrompt');
  if (!BR.hold && t && t.hold && held('interact') && running) BR.hold = { t, t0: now };   // already holding the key as you walk up
  if (BR.hold) {
    const h = BR.hold, same = t && t.obj === h.t.obj;
    if (!same || !held('interact')) BR.hold = null;
    else if (now - h.t0 >= h.t.hold) {
      BR.hold = null;
      if (h.t.type === 'crate') brOpenCrate(h.t.obj, player);
      else if (h.t.type === 'drop') brOpenDrop(h.t.obj, player);
      else if (h.t.type === 'recon') brContractEnd(true);
      else if (h.t.type === 'revive') brRevive(h.t.obj, player);
    }
  }
  if (BR.hold && BR.hold.t.type === 'revive') BR.hold.t.obj.reviveT = now - BR.hold.t0;
  if (t) {
    const [a, b, col] = brLabel(t), k = btnName('interact').toUpperCase();
    const prog = BR.hold && BR.hold.t.obj === t.obj ? clamp((now - BR.hold.t0)/BR.hold.t.hold, 0, 1) : -1;
    put('brPrompt', 'innerHTML', `<span class="k">${k}</span><span style="color:${col}">${a}</span>${b ? `<small>${b}</small>` : ''}${prog >= 0 ? `<i><b style="width:${Math.round(prog*100)}%"></b></i>` : ''}`);
    put('brPrompt', 'style.display', 'block');
    if (BR.contract && BR.contract.kind === 'recon' && t.type === 'recon') BR.contract.prog = Math.max(0, prog);
  } else put('brPrompt', 'style.display', 'none');
  // walk over ammo, cash, plates and gear to grab them
  if ((BR.autoT = (BR.autoT || 0) - dt) <= 0 && player.alive && player.br && (player.br.st === 'ground' || player.br.st === 'gulag')) {
    BR.autoT = .12;
    for (const it of brItemsNear(player.pos.x, player.pos.z, 1.35, _bin).slice()) if (it.kind !== 'gun' && Math.abs(it.y - player.pos.y) < 1.2 && (it.ft === undefined || it.ft >= 1)) brTakeItem(player, it, false);
  }
}
// =====================================================================
// The gas: a chain of circles worked out at the start (Recon reveals the last one)
// =====================================================================
function brPlanCircles() {
  BR.circles = [];
  let cx = 0, cz = 0, r = BR_GAS.R0;
  for (const ph of BR_GAS.phases) {
    const toR = ph[2]*BR_GAS.R0; let tx = cx, tz = cz;
    for (let k = 0; k < 120; k++) {
      const a = Math.random()*6.283, d = Math.random()*Math.max(0, r - toR)*.85, x = cx + Math.cos(a)*d, z = cz + Math.sin(a)*d;
      if (isleIn(x, z) > Math.max(16, toR*.4) && nearestNode(x, 0, z) >= 0) { tx = x; tz = z; break; }
    }
    BR.circles.push({ x: tx, z: tz, r: toR }); cx = tx; cz = tz; r = toR;
  }
}
// (the plan is made in brReset; this hands out the next one)
function brNextCircle() {
  if (!BR.circles || gas.phase === 0) brPlanCircles();
  const c = BR.circles[gas.phase];
  Object.assign(gas, { fromX: gas.cx, fromZ: gas.cz, fromR: gas.r, toX: c.x, toZ: c.z, toR: c.r });
}
function brSiren() {
  if (!AC || bgMuted) return;
  for (let i = 0; i < 3; i++) { setTimeout(() => tone(620, .28, .05, 'sawtooth'), i*600); setTimeout(() => tone(880, .28, .05, 'sawtooth'), i*600 + 300); }
}
function brGas(dt) {
  gasMat.uniforms.time.value = now;
  const ph = BR_GAS.phases[gas.phase], t = now - gas.t0;
  if (gas.state === 'wait' && t >= ph[0]) {
    gas.state = 'close'; gas.t0 = now;
    centerMsg(gas.phase === BR_GAS.phases.length - 1 ? 'FINAL CIRCLE CLOSING' : 'THE GAS IS CLOSING'); say('The circle is closing'); brSiren();
  } else if (gas.state === 'close') {
    const k = Math.min(1, t/ph[1]), e = k*k*(3 - 2*k);
    gas.cx = gas.fromX + (gas.toX - gas.fromX)*e; gas.cz = gas.fromZ + (gas.toZ - gas.fromZ)*e; gas.r = gas.fromR + (gas.toR - gas.fromR)*e;
    if (k >= 1 && gas.phase < BR_GAS.phases.length - 1) {
      gas.phase++; brNextCircle(); gas.state = 'wait'; gas.t0 = now;
      if (gas.phase === BR_GAS.gulagUntil) brGulagClose();
      if ((gas.phase === 1 || gas.phase === 3) && !BR.pubDrops[gas.phase]) { BR.pubDrops[gas.phase] = true; brPublicDrops(); }
    }
  }
  gasWall.position.set(gas.cx, 0, gas.cz); gasWall.scale.set(Math.max(.05, gas.r), 2.5, Math.max(.05, gas.r));
  let maskOn = false;
  for (const f of fighters) {
    if (!f.alive || !f.br || (f.brZone !== 'island' && f.brZone !== 'air')) { if (f.br) f.gasT = 0; continue; }
    if (Math.hypot(f.pos.x - gas.cx, f.pos.z - gas.cz) <= gas.r) { f.gasT = 0; continue; }
    const mk = f.isPlayer ? 'brMask' : null, mask = f.isPlayer ? player.brMask || 0 : f.br.mask || 0;
    if (mask > 0) { if (f.isPlayer) { player.brMask = Math.max(0, mask - dt); maskOn = true; if (player.brMask === 0) { centerMsg2('GAS MASK BROKE'); mech('armorBreak', 0, .5); } } else f.br.mask = Math.max(0, mask - dt); continue; }
    f.gasT = (f.gasT || 0) + dt;
    if (f.gasT >= .5) { f.gasT -= .5; damage(f, BR_GAS.dmg[gas.phase]*.5, null, false, 'Gas'); }
    if (f === player && now > gas.coughAt && AC && !bgMuted) { gas.coughAt = now + rand(1.1, 1.8); src(.22, 'bandpass', rand(500, 700), 1.4, outNode(.5, 0, false), AC.currentTime, 1.2); }
  }
  if (maskOn && !BR.maskOn) { mech('plateStart', 0, .6); BR.breathAt = now + .6; }
  BR.maskOn = maskOn;
  if (maskOn && now > (BR.breathAt || 0) && AC && !bgMuted) { BR.breathAt = now + 1.7; src(.5, 'bandpass', 900, .5, outNode(.4, 0, false), AC.currentTime, .8); }
}
// loadout drops anyone can open, dropped around the next circle
function brPublicDrops() {
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 30; k++) {
      const a = rand(0, 6.283), r = Math.sqrt(Math.random())*gas.toR*.75, x = gas.toX + Math.cos(a)*r, z = gas.toZ + Math.sin(a)*r;
      const gy = isleH(x, z); if (isleIn(x, z) > 12 && clearAt(x, z, gy + .1, gy + 2, .9)) { brSpawnDrop(x, z, null); break; }
    }
  }
  brBanner('LOADOUT DROPS INBOUND', 'RED SMOKE MARKS THEM · YOUR OWN GUNS INSIDE'); say('Loadout drops inbound');
}
// =====================================================================
// The Gulag: lose your first life early and you get a 1v1 to earn your way back
// =====================================================================
function brEnterGulag(f) {
  f.br.st = 'wait'; f.br.gulag = true; f.brZone = 'wait'; f.alive = false; f.br.waitT = now;
  BR.gq.push(f);
  if (f.isPlayer) {
    $('dead').style.display = 'none'; brGulagMsg('THE GULAG', 'WAITING FOR AN OPPONENT · WIN THE 1v1 TO GET BACK IN');
    say('Welcome to the Gulag', true);
  }
}
function brGulagMsg(h, s) { const el = $('brGulag'); if (!h) { el.style.display = 'none'; return; } el.innerHTML = `<div class="h">${h}</div><div class="s">${s}</div>`; el.style.display = 'block'; }
function brGulagClose() {
  for (const f of BR.gq.slice()) { if (f.isPlayer && BR.duel) continue; brOut(f, null); }
  BR.gq.length = 0; BR.sim = [];
  brBanner('THE GULAG IS CLOSED', 'NO MORE SECOND CHANCES'); say('The Gulag is closed');
}
function brGulagTick(dt) {
  BR.sim = BR.sim || [];
  // you're waiting: take the next fallen bot, or after a while drag one back from the dead
  const meWait = BR.gq.includes(player);
  if (meWait && !BR.duel) {
    const inSim = f => BR.sim.some(s => s.a === f || s.b === f);
    let opp = BR.gq.find(f => !f.isPlayer && !inSim(f));
    if (!opp && now - player.br.waitT > 4) {
      // take one out of a bot-vs-bot fight (the other waits for the next one)...
      const s = BR.sim[0];
      if (s) { BR.sim.shift(); opp = s.a; }
      // ...or drag the most recently eliminated bot back for one more go
      else { const o = fighters.filter(f => !f.isPlayer && f.br.st === 'out').sort((a, b) => (b.br.outT || 0) - (a.br.outT || 0))[0]; if (o) { brUnOut(o); opp = o; } }
    }
    if (opp) brDuelStart(opp);
    else if (now - player.br.waitT > 15) { BR.gq = BR.gq.filter(f => f !== player); brBanner('NO ONE TO FIGHT', 'YOU\'RE BACK IN'); brRedeploy(player); }
  }
  // bot pairs fight it out off screen
  const waiting = BR.gq.filter(f => !f.isPlayer && !BR.sim.some(s => s.a === f || s.b === f) && !(BR.duel && (BR.duel.b === f)));
  if (!meWait || BR.duel) while (waiting.length >= 2) { const a = waiting.shift(), b = waiting.shift(); BR.sim.push({ a, b, at: now + rand(14, 26) }); }
  for (let i = BR.sim.length - 1; i >= 0; i--) {
    const s = BR.sim[i]; if (now < s.at) continue;
    BR.sim.splice(i, 1);
    const win = Math.random() < .5 ? s.a : s.b, lose = win === s.a ? s.b : s.a;
    BR.gq = BR.gq.filter(f => f !== s.a && f !== s.b);
    brOut(lose, win); brRedeploy(win);
  }
  // a lone bot that's waited a long time gets a free pass back
  for (const f of BR.gq) if (!f.isPlayer && now - f.br.waitT > 45 && !BR.sim.some(s => s.a === f || s.b === f) && !(BR.duel && BR.duel.b === f)) { BR.gq = BR.gq.filter(x => x !== f); brRedeploy(f); break; }
  const D = BR.duel; if (!D) return;
  const G = ISLE.gulag;
  if (D.frozen) {
    const left = 3 - (now - D.t0);
    brGulagMsg('GULAG', left > 0 ? `${D.b.name.toUpperCase()} · FIGHT IN ${Math.ceil(left)}` : 'FIGHT!');
    if (left <= 0) { D.frozen = false; D.b.reactAt = now + .4; tone(1320, .2, .12, 'square'); setTimeout(() => brGulagMsg(null), 900); }
    return;
  }
  const el = now - D.t0 - 3;
  if (el > 35 && !D.flag) { D.flag = true; BR.gflag.visible = true; BR.gflag.position.set(G.flag.x, 0, G.flag.z); centerMsg('OVERTIME · TAKE THE FLAG'); say('Overtime. Capture the flag.'); D.b.gFlag = true; }
  if (D.flag) {
    const inA = D.a.alive && Math.hypot(D.a.pos.x - G.flag.x, D.a.pos.z - G.flag.z) < 2.2, inB = D.b.alive && Math.hypot(D.b.pos.x - G.flag.x, D.b.pos.z - G.flag.z) < 2.2;
    if (inA !== inB) { D.cap = (D.capBy === (inA ? D.a : D.b) ? D.cap : 0) + dt; D.capBy = inA ? D.a : D.b; if (D.capBy.isPlayer) put('wzinfo', 'innerHTML', `CAPTURING ${Math.round(D.cap/3*100)}%`); if (D.cap >= 3) { brDuelEnd(D.capBy); return; } }
    BR.gflag.rotation.y += dt*2;
  }
  if (el > 55) { brDuelEnd(null); return; }
}
function brDuelStart(opp) {
  const G = ISLE.gulag, wid = WID[brPick([['pistol', 3], ['magnum', 2], ['smg', 2], ['shotgun', 2]])];
  BR.gq = BR.gq.filter(f => f !== player && f !== opp);
  const fs = [player, opp];
  fs.forEach((f, i) => {
    const [x, z] = G.spawns[i];
    f.br.st = 'gulag'; f.brZone = 'gulag'; f.alive = true; f.hp = 100; f.armor = 0; f.plates = 0; f.dmgBy = null; f.pos.set(x, 0, z); f.velY = 0; f.onGround = true; f.mantle = null;
  });
  // you: the Gulag gun and two spare mags
  const inv = BR.inv; inv.slots = [{ wid, rar: 0, mag: null }, null]; inv.cur = 0; inv.ammo[brAmmoOf(wid)] = Math.max(inv.ammo[brAmmoOf(wid)], WEAPONS[wid].mag*2);
  nades = 0; tacs = 0; plating = null; designating = false; cookStart = -1;
  yaw = Math.atan2(-(G.spawns[1][0] - G.spawns[0][0]), -(G.spawns[1][1] - G.spawns[0][1])); pitch = 0;
  player.vel = { x: 0, z: 0 }; stance = 'stand'; slide = null; crouchToggle = false; KC.pending = null;
  $('dead').style.display = 'none'; drReset(); specStop();
  brEquip();
  // them: same gun
  opp.group.visible = true; opp.group.rotation.set(0, 0, 0); brBotGun(opp, wid, 0); opp.target = player; opp.path = null; opp.reactAt = now + 3.4; opp.think = now + 3.2;
  opp.bodyYaw = opp.aimYaw = Math.atan2(G.spawns[0][0] - G.spawns[1][0], 0); opp.lastPos.copy(opp.pos); opp.detourUntil = 0; opp.flinch = 0; opp.blindUntil = 0;
  opp.tag.userData.draw(100); opp.drawnHp = 100;
  BR.duel = { a: player, b: opp, t0: now, frozen: true, flag: false, cap: 0 };
  BR.stats.gulag = 'fought';
}
function brDuelEnd(winner) {
  const D = BR.duel; if (!D) return;
  BR.duel = null; BR.gflag.visible = false; brGulagMsg(null);
  for (const f of [D.a, D.b]) {
    if (f === winner) continue;
    if (f.alive) { f.alive = false; f.hp = 0; f.dieT = now; }
    brOut(f, winner);
  }
  if (winner) {
    winner.alive = true;
    if (winner.isPlayer) { BR.stats.gulag = 'won'; brBanner('YOU WON YOUR FREEDOM', 'REDEPLOYING'); say('You won. Redeploying.', true); tone(784, .1, .1, 'triangle'); setTimeout(() => tone(1175, .3, .1, 'triangle'), 100); stat('brGulagWins'); addXP(300, 'GULAG WIN'); }
    later(1.6, () => brRedeploy(winner));
  }
}
// back into the fight: dropped from the sky over the safe zone
function brRedeploy(f) {
  let x = gas.cx, z = gas.cz;
  for (let k = 0; k < 40; k++) { const a = rand(0, 6.283), r = Math.sqrt(Math.random())*Math.max(10, gas.r*.6); x = gas.cx + Math.cos(a)*r; z = gas.cz + Math.sin(a)*r; if (isleIn(x, z) > 15) break; }
  const mate = BR.trio && brMates(f).find(m => brUp(m) && m.br.st === 'ground' && Math.hypot(m.pos.x - gas.cx, m.pos.z - gas.cz) < gas.r);
  if (mate) { x = mate.pos.x + rand(-12, 12); z = mate.pos.z + rand(-12, 12); }
  f.alive = true; f.hp = 100; f.armor = 0; f.plates = 0; f.dmgBy = null; f.flinch = 0; f.blindUntil = 0;
  f.br.st = 'fall'; f.brZone = 'air'; f.br.vx = f.br.vz = 0; f.br.vy = -5; f.br.wantChute = false;
  f.pos.set(x, isleH(x, z) + 130, z);
  if (f.isPlayer) {
    if (BR.inv.slots[0] && BR.inv.slots[0].rar === 0 && !BR.inv.slots[1]) {}
    $('dead').style.display = 'none'; drReset(); specStop(); brGulagMsg(null); KC.pending = null;
    pitch = -.9; BR.pendingDeath = null; player.downed = false; BR.state = 'live';
    if (!BR.inv.slots.some(Boolean)) { BR.inv.slots = [{ wid: WID.pistol, rar: 0, mag: null }, null]; BR.inv.cur = 0; }
    brEquip();
  } else {
    f.br.tx = x + rand(-8, 8); f.br.tz = z + rand(-8, 8); f.br.ty = surfaceBelow(f.br.tx, f.br.tz, 400);
    brBotGun(f, WID.pistol, 0); f.group.visible = true; f.target = null; f.path = null; f.tag.userData.draw(100); f.drawnHp = 100;
    if (f.pos.distanceTo(player.pos) < 160 && player.alive) feedNote(`${f.name} is back from the Gulag`);
  }
}
// out of the match for good
function brOut(f, killer) {
  if (f.br.st === 'out') return;
  const sq0 = brSquadsLeft();
  f.br.st = 'out'; f.brZone = 'out'; f.alive = false; f.downed = false; f.br.outT = now; f.br.place = BR.left;
  BR.gq = BR.gq.filter(x => x !== f);
  BR.left--;
  // a whole squad gone: that's its place
  const wiped = !fighters.some(m => m.squad === f.squad && m.br.st !== 'out');
  if (wiped && f.squad === player.squad) { BR.place = BR.trio ? sq0 : f.br.place; brPlayerOut(killer, true); }
  else if (f.isPlayer) brPlayerOut(killer, false);
  brCountdown();
}
// a fallen bot pulled back for your Gulag fight
function brUnOut(f) { if (f.br.st !== 'out') return; f.br.st = 'wait'; f.brZone = 'wait'; BR.left++; f.br.place = 0; f.br.waitT = now; }
const BR_MARKS = [20, 15, 10, 5, 3, 2];
function brCountdown() {
  const n = BR.left;
  for (const m of BR_MARKS) if (n <= m && !BR.said['left' + m] && n > 1) {
    BR.said['left' + m] = true;
    if (player.br && player.br.st !== 'out') {
      if (m === 10) { addXP(250, 'TOP 10'); stat('brTop10'); }
      if (m === 5) { addXP(500, 'TOP 5'); stat('brTop5'); }
      if (m <= 10) brBanner(`TOP ${m}`, `${n} PLAYERS LEFT`);
    }
    say(`${n} players left`);
    break;
  }
  // last one (or last squad) standing
  const alive = fighters.filter(f => f.br && f.br.st !== 'out'), squads = new Set(alive.map(f => f.squad));
  if (squads.size === 1 && !BR.over) {
    BR.over = true;
    const w = alive[0];
    if (w.squad === player.squad) brVictory(); else { feedNote(`${BR.trio ? w.name + '\'s squad' : w.name} wins the match`); if (BR.place) later(2.5, () => endMatch()); }
  }
}
function brVictory() {
  BR.place = 1; stat('brWins'); specStop();
  addXP(3000, 'BOOM ROYALE · #1');
  brBanner('BOOM ROYALE', '#1 · LAST ONE STANDING', 4.5);
  say('Victory! Last one standing!', true);
  const notes = [523, 659, 784, 1047, 784, 1047, 1319];
  notes.forEach((f, i) => setTimeout(() => tone(f, i === notes.length - 1 ? .7 : .16, .1, 'triangle'), i*130));
  for (let i = 0; i < 90; i++) later(i*.02, () => {
    const c = new THREE.Color().setHSL(Math.random(), .9, .6);
    particle(TX.spark, V(player.pos.x + rand(-4, 4), player.pos.y + rand(2, 5), player.pos.z + rand(-4, 4)), V(rand(-3, 3), rand(2, 6), rand(-3, 3)), rand(1.4, 2.4), .25, .6, c, true, 6, 1, .5);
  });
  later(5, () => endMatch());
}
// you're out: watch whoever got you for a moment, then the results
function brPlayerOut(killer, wiped) {
  brGulagMsg(null);
  if (!wiped) {   // Trios: your squad's still in it, and can buy you back
    BR.state = 'out';
    brBanner('YOU\'RE OUT', 'YOUR SQUAD CAN BUY YOU BACK AT A BUY STATION', 3.5);
    later(3.6, () => { if (matchOver || player.br.st !== 'out') return; const m = brMates(player).find(m => m.alive && m.br.st === 'ground'); if (m) specStart(m); else if (specCandidates().length) specStart(); });
    return;
  }
  BR.state = 'out';
  brBanner(`${BR.trio ? 'SQUAD ' : ''}ELIMINATED · #${BR.place}`, BR.trio ? `OF ${Math.ceil(fighters.length/3)} SQUADS` : `OF ${fighters.length} PLAYERS`, 3.5);
  later(3.6, () => {
    if (matchOver) return;
    const k = killer && killer.alive && killer.br && killer.br.st !== 'out' ? killer : null;
    if (k || specCandidates().length) specStart(k);
    later(7, () => { if (!matchOver) endMatch(); });
  });
}
// index.html: after kill() has done its bookkeeping
function brOnKill(v, a, self, how) {
  if (!BR.on || !v.br) return;
  v.respawnAt = Infinity;
  const killer = a && a !== v ? a : null;
  if (killer === player) { BR.stats.kills++; stat('brKills'); }
  if (v.br.st === 'gulag' && BR.duel) { brDuelEnd(killer || (BR.duel.a === v ? BR.duel.b : BR.duel.a)); return; }
  brDropAll(v);
  const c = BR.contract;
  if (c && c.kind === 'bounty' && c.target === v) { if (killer === player) brContractEnd(true); else brContractEnd(false, 'SOMEONE ELSE GOT YOUR TARGET'); }
  const eligible = !v.br.gulag && gas.phase < BR_GAS.gulagUntil;
  if (v.isPlayer) {
    if (c) brContractEnd(false, 'CONTRACT LOST');
    BR.pendingDeath = eligible ? 'gulag' : 'out'; BR.deathKiller = killer; v.br.st = 'dead'; v.brZone = 'dead';
    brShopClose(); brMapToggle(false);
    if (!eligible) brOut(v, killer);
    return;
  }
  if (eligible) brEnterGulag(v); else brOut(v, killer);
}
// =====================================================================
// Bots: land, loot, open boxes, rotate with the gas, fight
// =====================================================================
const brQ = (wid, rar) => rar + (WEAPONS[wid].model === 'pistol' ? -2 : WEAPONS[wid].model === 'magnum' ? -1 : 0);
function brBotGun(b, wid, rar) {
  setAvatarGun(b, wid); b.br.rar = rar; b.ammo = undefined; b.reloadUntil = 0; b.burstLeft = 0;
  b.acc = (b.baseAcc || b.acc) - .03 + rar*.018;
}
function brItemValue(b, it) {
  switch (it.kind) {
    case 'gun': { const d = brQ(it.wid, it.rar) - brQ(b.wid, b.br.rar || 0); return d > 0 ? 5 + d*2 : 0; }
    case 'plate': return (b.plates || 0) < (b.maxPlates || 5) ? 3 + (b.armor < 100 ? 1 : 0) : 0;
    case 'mask': return (b.br.mask || 0) > 0 ? 0 : 2;
    case 'carrier': return (b.maxPlates || 5) < 8 ? 1.5 : 0;
    case 'cash': return 1.2;
    case 'lethal': return (b.nades || 0) < 2 ? .8 : 0;
    default: return 0;
  }
}
function brBotTake(b, it) {
  if (brItemValue(b, it) <= 0) return false;
  switch (it.kind) {
    case 'gun': if (brQ(b.wid, b.br.rar || 0) > -2) brDropGun({ wid: b.wid, rar: b.br.rar || 0, mag: null }, b.pos.x, b.pos.y, b.pos.z); brBotGun(b, it.wid, it.rar); break;
    case 'plate': b.plates = Math.min(b.maxPlates || 5, (b.plates || 0) + it.n); break;
    case 'mask': b.br.mask = 14; break;
    case 'carrier': b.maxPlates = 8; break;
    case 'cash': b.br.cash = (b.br.cash || 0) + it.n; break;
    case 'lethal': if (it.eq === 'frag') { b.nades = Math.min(2, (b.nades || 0) + 1); b.nadeKind = 'frag'; b.nadeAt = Math.min(b.nadeAt, now + 4); } break;
  }
  brRemoveItem(it);
  return true;
}
// index.html: botObjective() asks here what a bot should be heading for
function brBotGoal(b) {
  if (!b.br || b.br.st !== 'ground') return null;
  const ph = BR_GAS.phases[gas.phase], dNow = Math.hypot(b.pos.x - gas.cx, b.pos.z - gas.cz), dNext = Math.hypot(b.pos.x - gas.toX, b.pos.z - gas.toZ);
  const inGas = dNow > gas.r - 2, late = gas.state === 'close' || now - gas.t0 > ph[0]*.45;
  if (inGas || (late && dNext > gas.toR*.8)) {
    if (b.br.zoneKey !== gas.phase + gas.state) {
      b.br.zoneKey = gas.phase + gas.state;
      let x = gas.toX, z = gas.toZ;
      for (let k = 0; k < 20; k++) { const a = rand(0, 6.283), r = Math.sqrt(Math.random())*gas.toR*.6; x = gas.toX + Math.cos(a)*r; z = gas.toZ + Math.sin(a)*r; if (isleIn(x, z) > 8) break; }
      b.br.zone = [x, z];
    }
    return { key: 'zone' + b.br.zoneKey, x: b.br.zone[0], y: isleH(b.br.zone[0], b.br.zone[1]), z: b.br.zone[1], urgent: inGas };
  }
  if (BR.trio) {
    // a squadmate down nearby: go and get them up
    for (const m of brMates(b)) if (m.downed && m.alive && m.pos.distanceTo(b.pos) < 80) return { key: 'rev' + m.name, x: m.pos.x, y: m.pos.y, z: m.pos.z, urgent: !(b.sees && b.target && b.pos.distanceTo(b.target.pos) < 14) };
    const bb = brBotBuyback(b); if (bb) return bb;
    // your teammates stay with you
    if (b.squad === player.squad && player.alive && player.br.st === 'ground' && b.pos.distanceTo(player.pos) > 24) return { key: 'follow' + Math.round(player.pos.x/6) + ',' + Math.round(player.pos.z/6), x: player.pos.x + b.br.offx, y: player.pos.y, z: player.pos.z + b.br.offz };
  }
  // an enemy right on top of them: fight. Otherwise loot first (they still shoot on the move)
  const t = b.target && b.target.alive && b.sees ? b.target : null, fight = t && b.pos.distanceTo(t.pos) < WEAPONS[b.wid].bot.pref[1] + 6;
  const q = brQ(b.wid, b.br.rar || 0);
  // anything worth picking up close by (a better gun beats everything), a supply box, a loadout drop
  let best = null, bs = 0;
  for (const it of brItemsNear(b.pos.x, b.pos.z, 26, _bin)) {
    if (Math.hypot(it.x - gas.cx, it.z - gas.cz) > gas.r - 3) continue;
    const v = brItemValue(b, it); if (v <= 0) continue;
    const s = v/(Math.hypot(it.x - b.pos.x, it.z - b.pos.z) + Math.abs(it.y - b.pos.y)*3 + 6);
    if (s > bs) { bs = s; best = { key: 'it' + it.id, x: it.x, y: it.y, z: it.z, gun: it.kind === 'gun' }; }
  }
  for (const c of BR.crates) if (!c.open && Math.abs(c.x - b.pos.x) < 40 && Math.abs(c.z - b.pos.z) < 40) {
    const d = Math.hypot(c.x - b.pos.x, c.z - b.pos.z) + Math.abs(c.y - b.pos.y)*3, s = (q < 2 ? 9 : 4)/(d + 6);
    if (s > bs && Math.hypot(c.x - gas.cx, c.z - gas.cz) < gas.r - 3) { bs = s; best = { key: 'c' + c.i, x: c.x + (c.rot ? .85 : 0), y: c.y, z: c.z + (c.rot ? 0 : .85) }; }
  }
  for (const d of BR.drops) if (d.landed && !d.open && !d.owner) { const dd = Math.hypot(d.x - b.pos.x, d.z - b.pos.z), s = 12/(dd + 6); if (dd < 60 && s > bs) { bs = s; best = { key: 'd' + d.x.toFixed(1), x: d.x, y: d.gy, z: d.z }; } }
  if (best) { best.urgent = !fight && (q < 1 || !t); return best; }
  // otherwise roam between loot spots inside the safe zone
  if (!b.br.roam || Math.hypot(b.br.roam.x - b.pos.x, b.br.roam.z - b.pos.z) < 2.5 || now > b.br.roamUntil || Math.hypot(b.br.roam.x - gas.toX, b.br.roam.z - gas.toZ) > gas.toR + 10) {
    for (let k = 0; k < 25; k++) {
      const s = BR.spots[Math.floor(Math.random()*BR.spots.length)], d = Math.hypot(s.x - b.pos.x, s.z - b.pos.z);
      if (d > 12 && d < 75 && Math.hypot(s.x - gas.cx, s.z - gas.cz) < gas.r - 6 && Math.hypot(s.x - gas.toX, s.z - gas.toZ) < gas.toR + 8) { b.br.roam = s; b.br.roamUntil = now + 40; break; }
    }
    if (!b.br.roam) b.br.roam = { x: gas.toX, y: isleH(gas.toX, gas.toZ), z: gas.toZ };
  }
  return { key: 'roam' + b.br.roam.x.toFixed(1), x: b.br.roam.x, y: b.br.roam.y || 0, z: b.br.roam.z };
}
// bots grab what they're standing on and open boxes they reach
function brBotLoot(b, dt) {
  if (!b.alive || !b.br || b.br.st !== 'ground' || b.downed) return;
  if ((b.br.pickT -= dt) > 0) return;
  b.br.pickT = .3;
  brBotRevive(b);
  for (const it of brItemsNear(b.pos.x, b.pos.z, 1.5, _bin).slice()) if (Math.abs(it.y - b.pos.y) < 1.3 && (it.ft === undefined || it.ft >= 1)) brBotTake(b, it);
  let near = null;
  for (const c of BR.crates) if (!c.open && Math.abs(c.x - b.pos.x) < 1.9 && Math.abs(c.z - b.pos.z) < 1.9 && Math.abs(c.y - b.pos.y) < 1.2) { near = c; break; }
  const hot = b.sees && b.target && b.target.alive && b.pos.distanceTo(b.target.pos) < 30;
  if (near && !hot) { b.br.openT += .3; if (b.br.openT >= 1) { b.br.openT = 0; brOpenCrate(near, b); } } else b.br.openT = 0;
  for (const d of BR.drops) if (d.landed && !d.open && !d.owner && Math.hypot(d.x - b.pos.x, d.z - b.pos.z) < 2.2) brOpenDrop(d, b);
}
// index.html: bots ignore anyone too far away to matter
function brFar(b, f) { const d2 = (f.pos.x - b.pos.x)**2 + (f.pos.z - b.pos.z)**2, r = WEAPONS[b.wid].bot.longAcc ? 125 : 85; return d2 > r*r; }
// only fighters in the same place can hurt each other (the island and the sky are one place; each Gulag duel is its own)
function brZoneOk(a, b) {
  if (BR.trio && a.squad === b.squad) return false;
  const za = a.brZone || 'island', zb = b.brZone || 'island';
  if (za === 'gulag' || zb === 'gulag') return za === zb;
  return (za === 'island' || za === 'air') && (zb === 'island' || zb === 'air');
}
// =====================================================================
// Every frame while a Battle Royale is running
// =====================================================================
function brTick(dt) {
  if (!BR.on) return;
  const P = BR.plane;
  if (BR.planeMesh.visible) {
    P.s = (now - P.t0)/P.dur; P.pos.lerpVectors(P.from, P.to, P.s);
    BR.planeMesh.position.copy(P.pos); BR.planeMesh.rotation.set(0, Math.atan2(P.dir.x, P.dir.z), Math.sin(now*.6)*.03);
    for (const p of BR.planeMesh.userData.props) p.rotation.z += dt*40;
    if (P.s >= 1) for (const f of fighters) if (f.br && f.br.st === 'plane') brJump(f);
    if (P.s > 1.35) BR.planeMesh.visible = false;
  }
  if (BR.state === 'plane' && fighters.every(f => !f.br || f.br.st !== 'plane')) BR.state = 'live';
  // sound: the plane's drone and the wind while you fall
  // watchdog: report (once) if anything has gone non-finite, with enough to find out why
  if (!BR.nanSaid && (!isFinite(camera.position.x + camera.position.y + camera.position.z) || !isFinite(player.pos.x + player.pos.y + player.pos.z) || !isFinite(P.pos.x) || !isFinite(now))) {
    BR.nanSaid = true;
    console.error('BR NaN', JSON.stringify({ cam: camera.position.toArray(), pos: player.pos.toArray(), plane: P.pos.toArray(), s: P.s, now, yaw, pitch, st: player.br && player.br.st, alive: player.alive, br: player.br && { vx: player.br.vx, vy: player.br.vy, vz: player.br.vz, alt: player.br.alt }, eyeH, fov: camera.fov, near: camera.near, duel: !!BR.duel }));
  }
  if (BR.loopPlane && isFinite(camera.position.x + P.pos.x)) {
    const d = camera.position.distanceTo(P.pos), inPlane = player.br && player.br.st === 'plane';
    const t = AC.currentTime;   // (eased, not set each frame: direct jumps crackle)
    BR.loopPlane.g.gain.setTargetAtTime(BR.planeMesh.visible ? (inPlane ? .5 : .9/(1 + d*.03)) : 0, t, .08);
    const st = player.br && player.br.st, sp = st === 'fall' || st === 'chute' ? Math.hypot(player.br.vx, player.br.vy, player.br.vz) : 0;
    if (isFinite(sp)) { BR.loopWind.g.gain.setTargetAtTime(Math.min(.7, sp/45), t, .12); BR.loopWind.f.frequency.setTargetAtTime(500 + sp*12, t, .15); }
  }
  brGas(dt);
  brUpdateItems(dt); brUpdateCrates(dt); brUpdateDrops(dt);
  brInteractTick(dt); brContractTick(dt); brGulagTick(dt); brDownTick(dt);
  for (const b of bots) brBotLoot(b, dt);
  brSyncInv();
  // after you fall: the killcam (if on) plays, then the Gulag or you're out
  if (BR.pendingDeath && !KC.on && !KC.pending && now - player.dieT > 3) {
    const what = BR.pendingDeath; BR.pendingDeath = null;
    if (what === 'gulag' && gas.phase < BR_GAS.gulagUntil) brEnterGulag(player);
    else if (player.br.st !== 'out') brOut(player, BR.deathKiller);
  }
  for (const s of BR.stations) s.icon.position.y = s.ky + 3.4 + Math.sin(now*2 + s.kx)*.08;
  if (ISLE.mastLamp) ISLE.mastLamp.visible = Math.sin(now*3) > 0;
  for (const h of ISLE_FAR.turbines) h.rotation.z += dt*.5;
  if (ISLE.flare && Math.random() < dt*12) particle(TX.flash, ISLE.flare.clone().add(V(rand(-.2, .2), rand(0, .4), rand(-.2, .2))), V(rand(-.3, .3), rand(1.5, 3), rand(-.3, .3)), rand(.4, .8), .9, .4, new THREE.Color(4, 2, .6), true, -1, .9, 1);
  brHUD(dt);
}
// =====================================================================
// HUD: cash, prompts, altitude, the gas mask, the compass, banners
// =====================================================================
function brBanner(h, s, dur = 2.6) {
  const el = $('brBanner'); el.innerHTML = `<div class="h">${h}</div>${s ? `<div class="s">${s}</div>` : ''}`; el.classList.add('on');
  clearTimeout(BR.bannerTO); BR.bannerTO = setTimeout(() => el.classList.remove('on'), dur*1000);
}
const brClock = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s/60)}:${String(s % 60).padStart(2, '0')}`; };
function brGasLeft() { const ph = BR_GAS.phases[gas.phase]; return (gas.state === 'wait' ? ph[0] : ph[1]) - (now - gas.t0); }
function brInfoText() {
  if (BR.state === 'plane' && player.br.st === 'plane') return 'THE PLANE IS CROSSING CRESTFALL ISLAND';
  const t = brClock(brGasLeft()), g = gas.phase < BR_GAS.gulagUntil ? 'GULAG OPEN' : '<span class="gasw">GULAG CLOSED</span>';
  return `${gas.state === 'close' ? `<span class="gasw">GAS CLOSING ${t}</span>` : `PHASE ${gas.phase + 1} · CIRCLE CLOSES IN ${t}`} &nbsp;·&nbsp; ${g}`;
}
// index.html: the pills along the top
function brTopHUD() {
  if (BR.trio) put('me', 'innerHTML', `SQUADS <b style="font-size:22px">${brSquadsLeft()}</b> <span style="opacity:.6">· ${BR.left} PLAYERS</span>`);
  else put('me', 'innerHTML', `ALIVE <b style="font-size:22px">${BR.left}</b><span style="opacity:.6">/ ${fighters.length}</span>`);
  put('timer', 'textContent', brClock(brGasLeft()));
  put('lead', 'innerHTML', `KILLS <b style="font-size:22px">${player.kills}</b>`);
}
function brHUD(dt) {
  const P = player, st = P.br ? P.br.st : '';
  put('brCash', 'innerHTML', `<b>${brFmt(BR.inv ? BR.inv.cash : 0)}</b>`);
  // the drop: plane, freefall, parachute
  const drop = $('brDrop');
  if (st === 'plane') {
    put('brDrop', 'innerHTML', `<div class="big">${btnName('jump').toUpperCase()} · JUMP</div><div class="sub">AUTO JUMP IN ${brClock(BR.plane.dur*(1 - BR.plane.s))} · ${btnName('map').toUpperCase()}: MAP · MOUSE: LOOK AROUND</div>`);
    put('brDrop', 'style.display', 'block');
  } else if (st === 'fall' || st === 'chute') {
    put('brDrop', 'innerHTML', `<div class="big">${Math.max(0, Math.round(P.br.alt || 0))} M</div><div class="sub">${st === 'fall' ? `${btnName('jump').toUpperCase()}: OPEN PARACHUTE · ${btnName('forward').toUpperCase()} + LOOK DOWN: DIVE` : 'STEER WITH ' + ['forward', 'left', 'back', 'right'].map(k => btnName(k).toUpperCase()).join('')}</div>`);
    put('brDrop', 'style.display', 'block');
  } else put('brDrop', 'style.display', 'none');
  // gas mask
  put('brMask', 'style.opacity', BR.maskOn ? 1 : 0);
  const mk = P.brMask || 0;
  put('brMaskBar', 'style.display', mk > 0 && P.alive ? 'block' : 'none');
  if (mk > 0) $('brMaskBar').querySelector('b').style.width = Math.round(mk/14*100) + '%';
  if (BR.ui === 'shop') { const c = BR.inv.cash; if (BR.shopCash !== c) { BR.shopCash = c; brShopRender(); } if (!P.alive || Math.hypot(BR.shopAt.x - P.pos.x, BR.shopAt.z - P.pos.z) > 4) brShopClose(); }
  brSquadHUD(); brDownHUD();
  if (BR.ui === 'map') { if (PAD.gp && PAD.used) { BR.mapCur.x = clamp(BR.mapCur.x + PAD.rx*dt*260, -BR_MAP_W, BR_MAP_W); BR.mapCur.z = clamp(BR.mapCur.z + PAD.ry*dt*260, -BR_MAP_W, BR_MAP_W); } brMapDraw(); }
  brCompass();
}
function brCompass() {
  const cv = $('brCompass').firstChild, g = cv.getContext('2d'), W = 520, H = 26, ppd = W/150;
  const head = ((-yaw*180/Math.PI) % 360 + 360) % 360;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(10,14,24,.45)'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 13px Rajdhani,system-ui,sans-serif';
  const lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let a = Math.floor((head - 75)/15)*15; a <= head + 75; a += 15) {
    const x = W/2 + (a - head)*ppd, n = ((a % 360) + 360) % 360;
    if (lab[n] !== undefined) { g.fillStyle = n === 0 ? '#ffcf5a' : '#fff'; g.fillText(lab[n], x, 14); }
    else { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - .5, 9, 1, 8); }
  }
  const mark = (x, z, col, shape) => {
    const a = Math.atan2(x - player.pos.x, -(z - player.pos.z))*180/Math.PI;
    let d = ((a - head + 540) % 360) - 180; if (Math.abs(d) > 74) d = Math.sign(d)*74;
    const px = W/2 + d*ppd; g.fillStyle = col;
    if (shape === 'v') { g.beginPath(); g.moveTo(px - 6, 2); g.lineTo(px + 6, 2); g.lineTo(px, 11); g.fill(); }
    else { g.beginPath(); g.arc(px, 22, 3.5, 0, 7); g.fill(); }
  };
  if (BR.waypoint) mark(BR.waypoint.x, BR.waypoint.z, '#ffd23a', 'v');
  if (Math.hypot(player.pos.x - gas.toX, player.pos.z - gas.toZ) > gas.toR) mark(gas.toX, gas.toZ, '#fff', 'v');
  const c = BR.contract;
  if (c) { const p = c.kind === 'bounty' ? c.ping : c.kind === 'scav' ? c.box : c.pt; if (p) mark(p.x, p.z, BR_CONTRACT[c.kind].col, 'v'); }
  g.fillStyle = '#fff'; g.fillRect(W/2 - 1, H - 6, 2, 6);
}
// =====================================================================
// Maps: the corner minimap and the full island map (M)
// =====================================================================
function brMapImage() {
  const S = 1400, W = BR_MAP_W, sc = S/(2*W), c = mk(S, 0, g => {
    const img = g.createImageData(S, S), d = img.data;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = i/sc - W, z = j/sc - W, e = isleInF(x, z), o = (j*S + i)*4, h = isleH(x, z), shade = 1 + (isleH(x - 1.5, z - 1.5) - isleH(x + 1.5, z + 1.5))*.22 + h*.004;
      let col = e < -3 ? [22, 70, 86] : e < 0 ? [40, 105, 112] : e < ISLE_BEACH ? [208, 190, 140] : [(88 + vnoise(x*.03, z*.03)*18 + h*1.2)*shade, (118 + vnoise(x*.03 + 9, z*.03)*16 + h*.6)*shade, (66 + h*.9)*shade];
      if (ISLE.corn && x > ISLE.corn.x0 && x < ISLE.corn.x1 && z > ISLE.corn.z0 && z < ISLE.corn.z1) col = [150, 160, 70];
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    for (const r of ISLE.roads) { g.strokeStyle = r.asph ? '#5b5d62' : '#9b8464'; g.lineWidth = Math.max(1.5, r.w*sc); g.beginPath(); g.moveTo((r.x0 + W)*sc, (r.z0 + W)*sc); g.lineTo((r.x1 + W)*sc, (r.z1 + W)*sc); g.stroke(); }
    g.fillStyle = 'rgba(40,70,32,.8)';
    for (const [x, z, s] of ISLE.trees) { g.beginPath(); g.arc((x + W)*sc, (z + W)*sc, Math.max(.8, 1.8*s*sc), 0, 7); g.fill(); }
    for (const b of boxes) {
      if (b.coast) continue;
      const gy = isleH((b.minX + b.maxX)/2, (b.minZ + b.maxZ)/2); if (b.minY > gy + 1.5 || b.maxY < gy + 1.2) continue;
      const w = b.maxX - b.minX, dd = b.maxZ - b.minZ; if (w < .9 && dd < .9) continue;
      g.fillStyle = b.maxY > gy + 2.6 ? 'rgba(232,228,218,.92)' : 'rgba(180,176,166,.8)';
      g.fillRect((b.minX + W)*sc, (b.minZ + W)*sc, w*sc, dd*sc);
    }
  });
  return c;
}
function brCircle(g, x, z, r, sc, style, dash) { g.save(); g.strokeStyle = style; g.lineWidth = 2; if (dash) g.setLineDash(dash); g.beginPath(); g.arc(x*sc, z*sc, Math.max(1, r*sc), 0, 7); g.stroke(); g.restore(); }
function brDrawMap() {
  const st = player.br && player.br.st, high = st === 'plane' || st === 'fall' || st === 'chute', c = mapCtx, S = 176;
  BR.miniZ = (BR.miniZ || 115) + ((high ? 520 : 115) - (BR.miniZ || 115))*.08;   // zoomed out while you're up in the air
  const sc = S/BR.miniZ;
  if (!BR.mapImg) BR.mapImg = brMapImage();
  c.clearRect(0, 0, S, S);
  c.save(); c.translate(S/2, S/2); c.rotate(yaw); c.translate(-player.pos.x*sc, -player.pos.z*sc);
  c.drawImage(BR.mapImg, -BR_MAP_W*sc, -BR_MAP_W*sc, 2*BR_MAP_W*sc, 2*BR_MAP_W*sc);
  c.beginPath(); c.rect(-1000, -1000, 2000, 2000); c.arc(gas.cx*sc, gas.cz*sc, gas.r*sc, 0, Math.PI*2, true); c.fillStyle = 'rgba(255,140,40,.3)'; c.fill();
  brCircle(c, gas.cx, gas.cz, gas.r, sc, 'rgba(255,255,255,.9)'); brCircle(c, gas.toX, gas.toZ, gas.toR, sc, 'rgba(255,255,255,.85)', [4, 4]);
  brMapMarks(c, sc, 1.2);
  c.restore();
  if (uavUntil > now) { const a = (performance.now()/1000*2.4) % 6.283; c.strokeStyle = 'rgba(255,90,70,.4)'; c.lineWidth = 2; c.beginPath(); c.moveTo(S/2, S/2); c.lineTo(S/2 + Math.cos(a)*S/2, S/2 + Math.sin(a)*S/2); c.stroke(); }
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(S/2, S/2 - 8); c.lineTo(S/2 + 6, S/2 + 6); c.lineTo(S/2, S/2 + 3); c.lineTo(S/2 - 6, S/2 + 6); c.fill();
}
// things marked on both maps (k scales the icons)
function brMapMarks(g, sc, k, big) {
  const dot = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x*sc, z*sc, r*k, 0, 7); g.fill(); };
  const sq = (x, z, s, col) => { g.fillStyle = col; g.fillRect(x*sc - s*k/2, z*sc - s*k/2, s*k, s*k); };
  for (const s of BR.stations) { dot(s.kx, s.kz, 5, '#0b1a12'); g.strokeStyle = '#53ff94'; g.lineWidth = 1.5*k; g.beginPath(); g.arc(s.kx*sc, s.kz*sc, 5*k, 0, 7); g.stroke(); dot(s.kx, s.kz, 2, '#53ff94'); }
  for (const t of BR.tablets) if (!t.taken) sq(t.x, t.z, 6, BR_CONTRACT[t.kind].col);
  for (const d of BR.drops) if (!d.open) sq(d.x, d.z, 7, '#ff4a3a');
  const near = big ? 0 : 55;
  if (!big) for (const cr of BR.crates) if (!cr.open && Math.hypot(cr.x - player.pos.x, cr.z - player.pos.z) < near) sq(cr.x, cr.z, 3.5, cr.legend ? '#ffb63a' : '#e8e05a');
  if (BR.reveal > 0 && BR.circles) { const f = BR.circles[BR.circles.length - 2]; brCircle(g, f.x, f.z, f.r, sc, '#4aa3ff', [3, 3]); dot(f.x, f.z, 2.5, '#4aa3ff'); }
  const c = BR.contract;
  if (c) {
    if (c.kind === 'bounty') { g.fillStyle = 'rgba(255,74,58,.22)'; g.beginPath(); g.arc(c.ping.x*sc, c.ping.z*sc, 22*sc, 0, 7); g.fill(); brCircle(g, c.ping.x, c.ping.z, 22, sc, '#ff4a3a'); }
    else if (c.kind === 'scav') { sq(c.box.x, c.box.z, 7, '#5ad86f'); }
    else { sq(c.pt.x, c.pt.z, 7, '#4aa3ff'); }
  }
  if (BR.waypoint) { g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(BR.waypoint.x*sc, BR.waypoint.z*sc); g.lineTo(BR.waypoint.x*sc - 5*k, BR.waypoint.z*sc - 10*k); g.lineTo(BR.waypoint.x*sc + 5*k, BR.waypoint.z*sc - 10*k); g.fill(); }
  // enemies: anyone shooting near you, or everyone in range while your UAV is up
  const uav = uavUntil > now;
  for (const b of bots) {
    if (!b.alive || !b.br || b.brZone !== 'island' && b.brZone !== 'air') continue;
    const d = Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z);
    if ((uav && d < 110) || (now - b.lastShot < 1.5 && d < 60)) dot(b.pos.x, b.pos.z, 3.5, '#ff4a3a');
  }
  if (player.br && player.br.st === 'plane' || big && BR.planeMesh.visible) {
    const P = BR.plane; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2*k; g.setLineDash([6*k, 5*k]); g.beginPath(); g.moveTo(P.from.x*sc, P.from.z*sc); g.lineTo(P.to.x*sc, P.to.z*sc); g.stroke(); g.setLineDash([]);
    dot(P.pos.x, P.pos.z, 5, '#ffd23a');
  }
}
function brMapToggle(open) {
  if (!BR.on) return;
  if (open === undefined) open = BR.ui !== 'map';
  if (open && BR.ui === 'shop') return;
  BR.ui = open ? 'map' : BR.ui === 'map' ? null : BR.ui;
  $('brMapWrap').style.display = open ? 'block' : 'none';
  if (open) { BR.mapCur = { x: player.pos.x, z: player.pos.z }; firing = false; adsHeld = false; brMapDraw(); mech('aim', 0, .3); }
}
function brMapDraw() {
  const cv = $('brMapWrap').querySelector('canvas'), g = cv.getContext('2d'), S = cv.width, sc = (S - 24)/(2*BR_MAP_W);
  if (!BR.mapImg) BR.mapImg = brMapImage();
  g.clearRect(0, 0, S, S); g.save(); g.translate(S/2, S/2);
  g.drawImage(BR.mapImg, -BR_MAP_W*sc, -BR_MAP_W*sc, 2*BR_MAP_W*sc, 2*BR_MAP_W*sc);
  g.beginPath(); g.rect(-S, -S, S*2, S*2); g.arc(gas.cx*sc, gas.cz*sc, gas.r*sc, 0, Math.PI*2, true); g.fillStyle = 'rgba(255,140,40,.28)'; g.fill();
  brCircle(g, gas.cx, gas.cz, gas.r, sc, '#fff'); brCircle(g, gas.toX, gas.toZ, gas.toR, sc, 'rgba(255,255,255,.9)', [6, 5]);
  g.font = '700 15px Rajdhani,system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of ISLE.pois) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(p.name.toUpperCase(), p.x*sc + 1, p.z*sc + 1); g.fillStyle = p.tier > 1 ? '#ffd27a' : '#fff'; g.fillText(p.name.toUpperCase(), p.x*sc, p.z*sc); }
  brMapMarks(g, sc, 1.3, true);
  // you
  g.save(); g.translate(player.pos.x*sc, player.pos.z*sc); g.rotate(-yaw); g.fillStyle = '#ffcf5a'; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.fill(); g.restore();
  // the cursor
  const mx = BR.mapCur.x*sc, mz = BR.mapCur.z*sc;
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(mx, mz, 9, 0, 7); g.moveTo(mx - 15, mz); g.lineTo(mx - 5, mz); g.moveTo(mx + 5, mz); g.lineTo(mx + 15, mz); g.moveTo(mx, mz - 15); g.lineTo(mx, mz - 5); g.moveTo(mx, mz + 5); g.lineTo(mx, mz + 15); g.stroke();
  g.restore();
  const d = Math.round(Math.hypot(BR.mapCur.x - player.pos.x, BR.mapCur.z - player.pos.z));
  $('brMapHelp').textContent = `${d} M · CLICK: ${BR.waypoint ? 'MOVE / REMOVE' : 'SET'} MARKER · ${btnName('map').toUpperCase()}: CLOSE`;
}
// ---- input while a menu is open (index.html sends keys, mouse and wheel here first) ----
function brKey(code) {
  if (!BR.on || BR.ui !== 'shop') return false;
  const dig = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9, Minus: 10, Equal: 11 };
  if (code in dig) { BR.uiSel = dig[code]; brBuy(dig[code]); return true; }
  const n = brShopList().length;
  if (code === 'KeyW' || code === 'ArrowUp') { BR.uiSel = (BR.uiSel + n - 1) % n; brShopRender(); return true; }
  if (code === 'KeyS' || code === 'ArrowDown') { BR.uiSel = (BR.uiSel + 1) % n; brShopRender(); return true; }
  if (code === 'Space' || code === 'Enter') { brBuy(BR.uiSel); return true; }
  if (code === BINDS.interact || code === 'Escape' || code === 'Tab' || code === BINDS.map) return false;
  return true;
}
function brUiMouse(dx, dy) {
  if (BR.ui === 'shop') {
    BR.uiAcc += dy;
    while (BR.uiAcc > 34) { BR.uiAcc -= 34; BR.uiSel = Math.min(brShopList().length - 1, BR.uiSel + 1); brShopRender(); }
    while (BR.uiAcc < -34) { BR.uiAcc += 34; BR.uiSel = Math.max(0, BR.uiSel - 1); brShopRender(); }
  } else if (BR.ui === 'map') { BR.mapCur.x = clamp(BR.mapCur.x + dx*.9, -BR_MAP_W, BR_MAP_W); BR.mapCur.z = clamp(BR.mapCur.z + dy*.9, -BR_MAP_W, BR_MAP_W); }
}
function brUiClick(btn) {
  if (BR.ui === 'shop') { if (btn === 0) brBuy(BR.uiSel); else if (btn === 2) brShopClose(); }
  else if (BR.ui === 'map') {
    if (btn === 2) { brMapToggle(false); return; }
    const w = BR.waypoint;
    if (w && Math.hypot(w.x - BR.mapCur.x, w.z - BR.mapCur.z) < 8) BR.waypoint = null; else BR.waypoint = { x: BR.mapCur.x, z: BR.mapCur.z };
    mech('aim', 0, .4);
  }
}
function brUiWheel(dy) { if (BR.ui === 'shop') { BR.uiSel = clamp(BR.uiSel + (dy > 0 ? 1 : -1), 0, brShopList().length - 1); brShopRender(); } }
// the end screen line
function brResultLine() {
  const s = BR.stats || {};
  return `${BR.place === 1 ? (BR.trio ? '<b>#1</b> · Last squad standing on Crestfall Island' : '<b>#1</b> · Last one standing on Crestfall Island') : BR.trio ? `Your squad placed <b>#${BR.place || brSquadsLeft()}</b> of ${Math.ceil(fighters.length/3)}` : `You placed <b>#${BR.place || BR.left}</b> of ${fighters.length}`}<br><span style="opacity:.75;font-size:14px">${s.kills || 0} kills · ${brFmt(s.cash || 0)} found · ${s.boxes || 0} supply boxes · ${s.contracts || 0} contracts${s.gulag === 'won' ? ' · won the Gulag' : ''}</span>`;
}
// extra pieces made once at load: your parachute (drawn with your view), the Gulag's overtime flag
function brInitExtras() {
  const c = new THREE.Group(), m = new THREE.Mesh(BRM.canopy, BRM.chute[0]); m.position.set(0, 3.1, -.6); m.scale.setScalar(.9); c.add(m);
  const pts = []; for (const [x, z] of [[-2, -2.3], [2, -2.3], [-2, 1.6], [2, 1.6]]) pts.push(V(x*.3, -.4, z*.15 - .4), V(x*.85, 3, z*.85 - .6));
  c.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), BRM.lineMat));
  c.visible = false; vmScene.add(c); BR.vmCanopy = c;
  const f = new THREE.Group(); brCyl(.05, .05, 3, BRM.dark, 0, 1.5, 0, f); const cl = brBox(1, .6, .03, BRM.screen(0xff5a2a), .5, 2.6, 0, f);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2, 2.2, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, .8, .3), side: THREE.DoubleSide })); ring.rotation.x = -Math.PI/2; ring.position.y = .03; f.add(ring);
  f.visible = false; BR.root.add(f); BR.gflag = f;
}
// load time: build every loot model once and show it (out of sight) while the game compiles its shaders, so the
// first time you see a legendary sniper or open a box doesn't stutter
function brWarm(on) {
  if (!MAPDEF.br || !BR.root) return;
  if (on) {
    const g = BR.warm = new THREE.Group(); g.position.set(0, -60, 0); BR.root.add(g);
    const kinds = [];
    for (const [id] of BR_GUNS) for (let r = 0; r < 5; r++) kinds.push({ kind: 'gun', wid: WID[id], rar: r });
    for (const a in BR_AMMO) kinds.push({ kind: 'ammo', ammo: a });
    kinds.push({ kind: 'plate' }, { kind: 'cash' }, { kind: 'lethal', eq: 'frag' }, { kind: 'lethal', eq: 'claymore' }, { kind: 'tac', eq: 'flash' }, { kind: 'tac', eq: 'smoke' }, { kind: 'mask' }, { kind: 'carrier' }, { kind: 'streak', eq: 'uav' }, { kind: 'streak', eq: 'air' });
    kinds.forEach((it, i) => { it.id = -i; brItemShow(it); it.mesh.position.set((i % 10)*2, 0, Math.floor(i/10)*2); BR.root.remove(it.mesh); g.add(it.mesh); });
    g.add(brCrateModel(false), brCrateModel(true));
    const t = brTablet('bounty', 0, 0, 0); BR.root.remove(t.mesh); g.add(t.mesh);
    BR.warmWas = [BR.planeMesh.visible, BR.vmCanopy.visible, BR.gflag.visible];
    BR.planeMesh.visible = BR.vmCanopy.visible = BR.gflag.visible = true;
  } else if (BR.warm) {
    BR.root.remove(BR.warm); BR.warm = null;
    [BR.planeMesh.visible, BR.vmCanopy.visible, BR.gflag.visible] = BR.warmWas;
  }
}
// controller: X interacts when there's something to interact with (and reloads otherwise), View opens the map,
// and the shop and map take the buttons while they're open
function brPad(a, down) {
  if (!BR.on || !running) return false;
  if (BR.ui === 'shop') {
    if (down) {
      if (a === 'ksUav') { BR.uiSel = Math.max(0, BR.uiSel - 1); brShopRender(); }
      else if (a === 'plate') { BR.uiSel = Math.min(brShopList().length - 1, BR.uiSel + 1); brShopRender(); }
      else if (a === 'jump') brBuy(BR.uiSel);
      else if (a === 'crouch' || a === 'reload') brShopClose();
    }
    return true;
  }
  if (BR.ui === 'map') {
    if (a === 'jump' || a === 'crouch' || a === 'scoreboard') { if (down) { if (a === 'jump') brUiClick(0); else brMapToggle(false); } return true; }
    return false;
  }
  if (a === 'scoreboard') { if (down) brMapToggle(true); return true; }
  if (a === 'reload') {
    if (down && (BR.prompt || BR.hold)) { PAD.held.interact = true; brInteractKey(true); return true; }
    if (!down && PAD.held.interact) { PAD.held.interact = false; brInteractKey(false); return true; }
  }
  return false;
}
// =====================================================================
// Trios: you and two bot teammates against seven other squads of three. A teammate who's still up keeps you in
// the fight: you go down instead of dying, bleed out over 30 s, and can be revived (or get yourself up with a
// self-revive kit). Fallen teammates can be bought back at a buy station. Last squad standing wins.
// =====================================================================
const brTrio = () => !!BR.trio;
const brMates = f => fighters.filter(m => m !== f && m.squad === f.squad);
const brUp = f => f.alive && !f.downed && f.br && (f.br.st === 'ground' || f.br.st === 'fall' || f.br.st === 'chute');
function brSquadsLeft() { const s = new Set(); for (const f of fighters) if (f.br && f.br.st !== 'out') s.add(f.squad); return s.size; }
function brSetupSquads() {
  BR.trio = store.get('boomBrSquad', 'solo') === 'trio';
  fighters.forEach((f, i) => { f.squad = BR.trio ? Math.floor(i/3) : i; f.downed = false; });
  for (const b of bots) {
    const mate = BR.trio && b.squad === player.squad;
    b.color = mate ? TEAM[0].color : b.ownColor; b.tag.userData.draw(100); b.drawnHp = 100;
  }
}
// index.html: damage() asks here before killing anyone. True: they went down instead
function brDown(v, a, head, how) {
  if (!BR.on || !BR.trio || v.downed || !v.br || !(v.br.st === 'ground' || v.br.st === 'chute' || v.br.st === 'fall')) return false;
  if (!brMates(v).some(brUp)) {
    // nobody left standing: the squad is wiped, anyone still down goes with them
    later(0, () => { for (const m of brMates(v)) if (m.downed && m.alive) { m.hp = 0; kill(m, a && a !== m ? a : m.downBy, false, how); } });
    return false;
  }
  v.downed = true; v.hp = 100; v.downT = now; v.downBy = a && a !== v ? a : null; v.reviveT = 0; v.armor = 0; v.target = null;
  if (v.br.st !== 'ground') { v.br.st = 'ground'; v.brZone = 'island'; v.pos.y = surfaceBelow(v.pos.x, v.pos.z, v.pos.y + .5); if (v.br.canopy) v.br.canopy.visible = false; }
  if (a === player && v !== player) { centerMsg2('ENEMY DOWNED'); addXP(50, 'DOWN'); if (S.hitSounds) { tone(660, .1, .1, 'triangle'); } }
  if (v.isPlayer) { firing = false; adsHeld = false; plating = null; cookStart = -1; designating = false; brShopClose(); brMapToggle(false); thud(160, .5, .6); say('You are down', true); }
  else if (v.squad === player.squad) feedNote(`${v.name} is down`);
  return true;
}
function brRevive(f, by) {
  if (!f.downed) return;
  f.downed = false; f.hp = 35; f.reviveT = 0; f.lastHurt = now;
  if (f.isPlayer) { brBanner('BACK UP', by === player ? 'SELF-REVIVED' : `${by ? by.name.toUpperCase() : 'A TEAMMATE'} GOT YOU UP`, 1.8); tone(784, .1, .1, 'triangle'); setTimeout(() => tone(1175, .2, .1, 'triangle'), 90); }
  else { f.group.rotation.set(0, f.bodyYaw, 0); if (by === player) { addXP(100, 'REVIVE'); stat('brRevives'); } }
  if (by && by !== f && f.squad === player.squad && !f.isPlayer && !by.isPlayer) feedNote(`${by.name} revived ${f.name}`);
}
// bleeding out, and squads wiped when nobody's left up
function brDownTick(dt) {
  if (!BR.trio) return;
  for (const f of fighters) {
    if (!f.downed || !f.alive) continue;
    f.hp -= dt*100/30;
    if (f.isPlayer && f.reviveT > 0) f.hp += dt*100/30;   // no bleeding while someone's reviving you
    if (f.hp <= 0) { f.hp = 0; f.downed = false; kill(f, f.downBy || null, false, 'Bled out'); continue; }
    if (!brMates(f).some(brUp)) { f.hp = 0; f.downed = false; kill(f, f.downBy || null, false, 'Squad wiped'); }
  }
}
// a downed player crawls (no shooting); returns true when it handled you
function brDownedMove(dt) {
  const P = player, m = moveInput(), sp = 1.3;
  if (!P.vel) P.vel = { x: 0, z: 0 };
  P.vel.x += (m.mx*sp*(m.len ? 1 : 0) - P.vel.x)*Math.min(1, dt*6); P.vel.z += (m.mz*sp*(m.len ? 1 : 0) - P.vel.z)*Math.min(1, dt*6);
  P.pos.x += P.vel.x*dt; P.pos.z += P.vel.z*dt; stepPhysics(P, dt, .7);
  eyeH += (.5 - eyeH)*Math.min(1, dt*6); stance = 'crouch';
  firing = false; adsHeld = false; P.speed = Math.hypot(P.vel.x, P.vel.z);
  return true;
}
// a downed bot crawls toward its nearest standing squadmate
function brDownedBot(b, dt) {
  let best = null, bd = 1e9;
  for (const m of brMates(b)) if (brUp(m)) { const d = m.pos.distanceTo(b.pos); if (d < bd) { bd = d; best = m; } }
  let mx = 0, mz = 0;
  if (best && bd > 1.4) { mx = (best.pos.x - b.pos.x)/bd; mz = (best.pos.z - b.pos.z)/bd; }
  b.vx += (mx*1.1 - b.vx)*Math.min(1, dt*5); b.vz += (mz*1.1 - b.vz)*Math.min(1, dt*5);
  b.pos.x += b.vx*dt; b.pos.z += b.vz*dt; stepPhysics(b, dt, .7);
  if (Math.hypot(mx, mz) > .1) b.bodyYaw = approach(b.bodyYaw, Math.atan2(mx, mz), dt*4);
  b.group.position.set(b.pos.x, b.pos.y + .25, b.pos.z); b.group.rotation.set(-1.32, b.bodyYaw, 0);
  if (b.mixer) animateSoldier(b, dt, 0, false, 0, b.pos.distanceTo(camera.position) < 60, 2);
  b.headW.set(b.pos.x - Math.sin(b.bodyYaw)*.9, b.pos.y + .35, b.pos.z - Math.cos(b.bodyYaw)*.9); b.bodyW.set(b.pos.x, b.pos.y + .3, b.pos.z);
  b.speed = Math.hypot(b.vx, b.vz);
  if (b.drawnHp !== Math.ceil(b.hp)) { b.drawnHp = Math.ceil(b.hp); b.tag.userData.draw(b.hp); }
  return true;
}
// bots get downed squadmates back up when it's quiet around them
function brBotRevive(b) {
  if (!BR.trio || b.downed || !b.alive || b.br.st !== 'ground') return;
  let m = null;
  for (const f of brMates(b)) if (f.downed && f.alive && f.pos.distanceTo(b.pos) < 1.9) { m = f; break; }
  if (!m || (b.sees && b.target && b.target.alive && b.pos.distanceTo(b.target.pos) < 25)) { if (m) m.reviveT = 0; b.br.revT = 0; return; }
  b.br.revT = (b.br.revT || 0) + .3; m.reviveT = b.br.revT;
  if (b.br.revT >= 4) { b.br.revT = 0; brRevive(m, b); }
}
// bots with enough cash buy back their fallen squadmates (you included)
function brBotBuyback(b) {
  if (!BR.trio || b.downed || b.br.st !== 'ground' || (b.br.cash || 0) < 4500) return null;
  const dead = brMates(b).find(m => m.br.st === 'out');
  if (!dead) return null;
  let st = null, bd = 1e9;
  for (const s of BR.stations) { const d = Math.hypot(s.x - b.pos.x, s.z - b.pos.z); if (d < bd && Math.hypot(s.x - gas.cx, s.z - gas.cz) < gas.r - 4) { bd = d; st = s; } }
  if (!st) return null;
  if (bd < 2.8) { b.br.cash -= 4500; brBuyback(dead, b); return null; }
  return { key: 'buy' + st.kx, x: st.x, y: 0, z: st.z };
}
function brBuyback(f, by) {
  if (f.br.st !== 'out') return;
  brUnOut(f); f.br.gulag = true; brRedeploy(f);
  if (f.isPlayer) { brBanner('YOU\'VE BEEN BOUGHT BACK', by ? `THANKS, ${by.name.toUpperCase()}` : 'REDEPLOYING'); say('You have been bought back', true); BR.state = 'live'; specStop(); }
  else if (f.squad === player.squad) feedNote(`${by ? by.name : 'Your squad'} bought back ${f.name}`);
}
// the squad panel on the left
function brSquadHUD() {
  const el = $('brSquad');
  if (!BR.trio) { el.style.display = 'none'; return; }
  const rows = brMates(player).map(m => {
    const st = m.br.st, hp = Math.max(0, Math.round(m.hp));
    const tag = st === 'out' ? '<span style="color:#ff6a5a">DEAD · BUY BACK $4,500</span>' : st === 'wait' || st === 'gulag' ? '<span style="color:#ffd27a">GULAG</span>' : m.downed ? `<span style="color:#ff6a5a">DOWN ${Math.ceil(m.hp/100*30)}s</span>` : st === 'plane' ? 'IN THE PLANE' : st === 'fall' || st === 'chute' ? 'DROPPING' : `<i><b style="width:${hp}%;background:${hp > 50 ? '#3fe08a' : '#ffc040'}"></b></i>`;
    return `<div><span class="nm">${m.name}</span>${tag}</div>`;
  });
  put('brSquad', 'innerHTML', rows.join('')); put('brSquad', 'style.display', 'block');
}
function brDownHUD() {
  const P = player, el = $('brDown');
  if (!P.downed || !P.alive) { put('brDown', 'style.display', 'none'); return; }
  const left = Math.max(0, Math.ceil(P.hp/100*30)), kit = BR.inv && BR.inv.selfRevive;
  const rev = P.reviveT > 0 ? `<i><b style="width:${Math.round(P.reviveT/4*100)}%"></b></i>` : '';
  put('brDown', 'innerHTML', `<div class="h">DOWNED</div><div class="s">BLEEDING OUT · ${left}s</div><div class="t">${P.reviveT > 0 ? 'REVIVING…' : kit ? `HOLD ${btnName('interact').toUpperCase()}: SELF-REVIVE` : 'CRAWL TO A TEAMMATE · THEY CAN REVIVE YOU'}</div>${rev}`);
  put('brDown', 'style.display', 'block');
}
// the Solos / Trios picker on the menu (island only)
function brSquadPicker() {
  if (!MAPDEF.br || $('brSquadPick')) return;
  const d = document.createElement('div'); d.id = 'brSquadPick';
  d.style.cssText = 'display:flex;gap:8px;margin:8px 0 2px;justify-content:center';
  const draw = () => {
    const v = store.get('boomBrSquad', 'solo');
    d.innerHTML = [['solo', 'SOLOS', 'Every player for themselves'], ['trio', 'TRIOS', 'You + 2 bot teammates vs 7 squads']].map(([id, n, s]) =>
      `<button data-sq="${id}" style="flex:1;padding:8px 10px;border-radius:9px;border:1px solid ${v === id ? 'var(--accent,#ff8a2b)' : 'transparent'};background:${v === id ? '#2a2440' : '#1c2440'};color:#fff;font:700 15px Rajdhani,system-ui,sans-serif;letter-spacing:.08em;cursor:pointer;opacity:${v === id ? 1 : .7}">${n}<small style="display:block;font-size:11px;opacity:.65;letter-spacing:.04em;font-weight:600">${s}</small></button>`).join('');
    [...d.children].forEach(b => b.onclick = () => { store.set('boomBrSquad', b.dataset.sq); if (started && !matchOver) { started = false; $('play').textContent = 'Play'; } draw(); });
  };
  draw();
  $('modes').after(d);
}
