// =====================================================================
// Crestfall Island: the Battle Royale map, about 950 m across, ringed by sea. A downtown in the middle, an old
// town, suburbs, a mall, a stadium, an airfield, a harbor and a container port, a power plant, a refinery, a fort,
// farms, a lumber mill, a motel, a fishing village and a lighthouse, with mountains, forests and fields between.
// index.html calls buildIsland() while it builds the world (only when the island is the current map), so
// everything here can use the world helpers (block, building, container, stairRun, …). Building the island
// also records where loot lies, where the supply boxes and buy stations stand, the named areas and the
// Gulag, for br.js.
// =====================================================================
const ISLE = {
  P: 2.6, R: 462, pois: [], spots: [], crates: [], stations: [], roads: [], trees: [], noTree: [], hard: [],
  gulag: { x: 430, z: -430, w: 26, d: 18, spawns: [], flag: null },
};
// the shoreline: a rounded square with a wobbly coast
const isleNorm = (x, z) => Math.pow(Math.pow(Math.abs(x), ISLE.P) + Math.pow(Math.abs(z), ISLE.P), 1/ISLE.P);
const isleCoastBase = a => ISLE.R + 14*Math.sin(3*a + .7) + 9*Math.sin(7*a + 2.1) + 4*Math.sin(13*a + .4) + 6*Math.sin(5*a + 1.3);
// straight stretches of coast where the harbor (east), the port (south) and the village (west) meet the sea:
// [axis the line is fixed on, which side, from, to]; the line sits where the wobbly coast crosses that axis
const ISLE_QUAYS = [['x', 1, -70, 80], ['z', 1, -150, 40], ['x', -1, -250, -100]].map(([ax, sg, from, to]) => {
  const c = isleCoastBase(ax === 'x' ? (sg > 0 ? 0 : Math.PI) : Math.PI/2), A = ax === 'x' ? [Math.atan2(from, sg*c), Math.atan2(to, sg*c)] : [Math.atan2(c, from), Math.atan2(c, to)];
  return { ax, sg, c, a0: Math.min(...A), a1: Math.max(...A) };
});
const isleCoast = a => {
  let r = isleCoastBase(a);
  for (const q of ISLE_QUAYS) {
    const d = a < q.a0 ? q.a0 - a : a > q.a1 ? a - q.a1 : 0; if (d > .08) continue;
    const t = q.ax === 'x' ? Math.abs(Math.tan(a)) : Math.abs(1/Math.tan(a)), line = q.c*Math.pow(1 + Math.pow(t, ISLE.P), 1/ISLE.P);
    r += (line - r)*(1 - d/.08);
  }
  return r;
};
// how far inside the shoreline a point is (negative: out at sea)
const isleIn = (x, z) => isleCoast(Math.atan2(z, x)) - isleNorm(x, z);
const ISLE_BEACH = 8;
// Named areas: tier 2 areas have better loot; hot = how many bots like to land there. coast: stays at sea level.
const ISLE_POIS = [
  { id: 'city', name: 'Crestfall City', x: 0, z: 0, r: 104, tier: 2, hot: 14 },
  { id: 'town', name: 'Old Town', x: -238, z: -34, r: 48, tier: 1, hot: 7 },
  { id: 'harbor', name: 'Harbor', x: 0, z: 8, r: 34, tier: 1, hot: 6, coast: true },
  { id: 'fort', name: 'Fort Ironside', x: -296, z: -292, r: 30, tier: 2, hot: 5 },
  { id: 'farm', name: 'Hollow Farm', x: -306, z: 286, r: 28, tier: 1, hot: 4 },
  { id: 'refinery', name: 'Refinery', x: 334, z: -190, r: 28, tier: 1, hot: 4 },
  { id: 'radio', name: 'Radio Hill', x: 0, z: -396, r: 20, tier: 2, hot: 2 },
  { id: 'lumber', name: 'Lumber Mill', x: 126, z: 384, r: 22, tier: 1, hot: 3 },
  { id: 'motel', name: 'Pine Motel', x: -404, z: 52, r: 22, tier: 1, hot: 3 },
  { id: 'site', name: 'Skyline Site', x: 168, z: -214, r: 24, tier: 2, hot: 4 },
  { id: 'suburb', name: 'Maple Heights', x: 244, z: -78, r: 66, tier: 1, hot: 8 },
  { id: 'mall', name: 'Crestfall Mall', x: 206, z: 176, r: 54, tier: 2, hot: 7 },
  { id: 'stadium', name: 'Stadium', x: -168, z: 196, r: 56, tier: 1, hot: 6 },
  { id: 'airfield', name: 'Airfield', x: -112, z: -250, r: 64, tier: 2, hot: 7 },
  { id: 'power', name: 'Power Plant', x: 334, z: 262, r: 46, tier: 2, hot: 5 },
  { id: 'port', name: 'Container Port', x: -60, z: 402, r: 50, tier: 1, hot: 6, coast: true },
  { id: 'village', name: "Fisher's Cove", x: -400, z: -176, r: 34, tier: 1, hot: 3, coast: true },
  { id: 'light', name: 'Lighthouse Point', x: 300, z: -350, r: 20, tier: 1, hot: 2 },
];
const islePoi = id => ISLE_POIS.find(p => p.id === id);
// the land before towns are cut into it: rolling hills, a few mountains, sloping down to the beaches
const ISLE_MTN = [[-150, -392, 150, 46], [20, -440, 80, 20], [392, -96, 100, 34], [-410, 150, 110, 34], [110, 296, 120, 26], [-70, 160, 80, 16],
  [262, 392, 90, 24], [-300, -120, 100, 28], [-380, -350, 90, 22], [70, -150, 70, 12], [-210, 360, 90, 20], [430, 140, 80, 22]];
function isleNat(x, z, e = isleIn(x, z)) {
  if (e < ISLE_BEACH + 2) return 0;
  const n = vnoise(x*.0062 + 31.7, z*.0062 - 12.3)*.55 + vnoise(x*.014 - 7.1, z*.014 + 3.3)*.3 + vnoise(x*.04 + 2.2, z*.04 + 9.9)*.15;
  let h = Math.pow(clamp((n - .3)/.5, 0, 1), 1.2)*20;
  for (const [mx, mz, r, H] of ISLE_MTN) { const d2 = ((x - mx)**2 + (z - mz)**2)/(r*r); if (d2 < 3) h += H*Math.exp(-d2*2.2)*(.75 + .5*vnoise(x*.02 + mx, z*.02)); }
  return h*smooth(e, ISLE_BEACH + 2, ISLE_BEACH + 90);
}
// the level a town sits at: the land under its middle (coastal ones at sea level)
const isleLevel = (x, z, coast) => coast ? 0 : Math.round(isleNat(x, z)*2)/2;
const MI = {};
function isleMats() {
  if (MI.red) return;   // once (the ground needs the sea's material before the rest of the island is built)
  const sid = c => heightAO(stdMat(C.siding, 1, { color: lin(c), roughness: .82, normal: 2.2, rough: [.9, -.2] }));
  MI.red = sid(0xa3412c); MI.white = sid(0xe9e4da); MI.green = sid(0x7f9c7a); MI.blue = sid(0x6d8db0); MI.cream = sid(0xe3cc92); MI.grey = sid(0x9a9ea4);
  MI.stone = heightAO(stdMat(C.concrete, 1, { color: lin(0xcabfa8), roughness: .95, normal: 3, rough: [1, -.3] }));
  MI.army = heightAO(stdMat(C.concrete, 1, { color: lin(0x8b9277), roughness: .9, normal: 2.5, rough: [1, -.3] }));
  MI.olive = heightAO(new THREE.MeshStandardMaterial({ color: lin(0x56613a), roughness: .65, metalness: .25 }));
  MI.hay = heightAO(stdMat(C.sandbag, 1, { color: lin(0xe0bb62), roughness: 1, normal: 3, rough: [1, 0] }));
  MI.log = new THREE.MeshStandardMaterial({ color: lin(0x6e4a2c), roughness: .95 });
  MI.logEnd = new THREE.MeshStandardMaterial({ color: lin(0xcf9f66), roughness: .9 });
  MI.plank = heightAO(stdMat(C.wood || C.wfloor, 1, { color: lin(0xd9b88a), roughness: .85, normal: 2, rough: [.9, -.2] }));
  MI.kiosk = heightAO(new THREE.MeshStandardMaterial({ color: lin(0x1f2c44), roughness: .35, metalness: .7 }));
  MI.corn = new THREE.MeshStandardMaterial({ color: lin(0x88a23e), roughness: .9, flatShading: true });
  MI.cornTop = new THREE.MeshStandardMaterial({ color: lin(0xd8c35a), roughness: .9, flatShading: true });
  MI.rock = new THREE.MeshStandardMaterial({ color: lin(0x8e897f), roughness: .95, flatShading: true });
  MI.sea = new THREE.MeshStandardMaterial({ color: lin(0x13505e), roughness: .07, metalness: 0, envMapIntensity: 1.3 });
  MI.hull = new THREE.MeshStandardMaterial({ color: lin(0xd8d4cc), roughness: .5, metalness: .2 });
  MI.hullRed = new THREE.MeshStandardMaterial({ color: lin(0xa8322a), roughness: .5, metalness: .2 });
  MI.pine = new THREE.MeshStandardMaterial({ color: lin(0xffffff), roughness: .95, flatShading: true });
  MI.dirtRoad = stdMat(C.sand, 1, { color: lin(0x8c7a64), roughness: 1, normal: 2, rough: [1, -.1] });
  MI.dirtRoad.polygonOffset = true; MI.dirtRoad.polygonOffsetFactor = -1;
  MI.road = stdMat(C.asphalt, 1, { roughness: .9, normal: 1.4, rough: [.98, -.3] });
  MI.road.polygonOffset = true; MI.road.polygonOffsetFactor = -1;
  MI.pave = stdMat(C.tiles, 1, { roughness: .85, normal: 3, rough: [.95, -.35] });
  MI.pave.polygonOffset = true; MI.pave.polygonOffsetFactor = -1;
  MI.quay = stdMat(C.concrete, 1, { roughness: .9, color: lin(0xb9b6ae), normal: 2.5, rough: [1, -.3] });
  MI.quay.polygonOffset = true; MI.quay.polygonOffsetFactor = -1;
  MI.screen = new THREE.MeshBasicMaterial({ map: T(mk(256, 192, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0f3f2a'); gr.addColorStop(1, '#062016'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4dff9a'; g.font = '700 120px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', w/2, h*.45);
    g.font = '700 30px Rajdhani, sans-serif'; g.fillText('BUY STATION', w/2, h*.86);
  })), color: new THREE.Color(1.8, 1.8, 1.8) });
  MI.pad = new THREE.MeshStandardMaterial({ map: T(mk(256, 0, (g, s) => {
    g.clearRect(0, 0, s, s); g.strokeStyle = '#f2f2f2'; g.lineWidth = 12; g.beginPath(); g.arc(s/2, s/2, s*.42, 0, 7); g.stroke();
    g.fillStyle = '#f2f2f2'; g.font = '700 150px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', s/2, s/2 + 8);
  })), transparent: true, depthWrite: false, roughness: .8, polygonOffset: true, polygonOffsetFactor: -2 });
  MI.sign = txt => new THREE.MeshStandardMaterial({ map: T(mk(512, 128, (g, w, h) => {
    g.fillStyle = '#1d2533'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e9e1cf'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f3ead7'; g.font = '700 70px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w/2, h/2 + 4);
  })), roughness: .7 });
}
// a flat textured plane lying on the ground, its texture repeating every `tile` meters
function islePlane(w, d, mat, x, y, z, tile = 3, rotY = 0) {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI/2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*w/tile, uv.getY(i)*d/tile);
  const m = mesh(g, mat, x, y, z, scene, false); m.rotation.y = rotY; return m;
}
const DOOR = { w: 1.6, bottom: 0, top: 2.3 }, GATE = (w, top = 3.6) => ({ w, bottom: 0, top });
// ---- registering places for br.js ----
function isleSpot(x, y, z, tier) { ISLE.spots.push({ x, y, z, tier }); }
function isleCrate(x, z, y = 0, tier = 1, rot = 0) {
  solid(x, z, rot ? .72 : 1.15, rot ? 1.15 : .72, .7, 'wood', false, y, { vaultOnly: true });
  ISLE.crates.push({ x, y, z, tier, rot });
}
function isleHard(x0, z0, x1, z1) { ISLE.hard.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), 0]); }
// a building with loot spots on every floor (and on the roof when there's a way up)
function isleRoom(o, tier = 1, per = 1) {
  if (o.furnish === undefined) o.furnish = true;
  building(o);
  const { cx, cz, w, d, floors = 1, fh = 3.1, t = .3 } = o, near = [];
  isleHard(cx - w/2 - .5, cz - d/2 - .5, cx + w/2 + .5, cz + d/2 + .5);
  // loot lies on the floor, never inside furniture or under the stairs
  const clear = (x, y, z) => !queryBoxes(x - .4, z - .4, x + .4, z + .4, near).some(b => b.maxY > y + .05 && b.minY < y + 1.2 && b.maxX > x - .4 && b.minX < x + .4 && b.maxZ > z - .4 && b.minZ < z + .4);
  for (let f = 0; f < floors; f++) {
    const n = Math.max(2, Math.round(w*d/22*per));
    for (let i = 0; i < n; i++) for (let k = 0; k < 10; k++) {
      const x = cx + rand(-w/2 + t + .7, w/2 - t - .7), z = cz + rand(-d/2 + t + .7, d/2 - t - .7);
      if (clear(x, f*fh, z) || k === 9) { isleSpot(x, f*fh, z, tier); break; }
    }
  }
  if (o.roof !== 'pitched' && (o.extStairs || o.roofGaps)) for (let i = 0; i < 2; i++) isleSpot(cx + rand(-w/2 + 1, w/2 - 1), floors*fh + .05, cz + rand(-d/2 + 1, d/2 - 1), tier);
}
// buy station: a kiosk with a glowing screen; rot 0..3 = faces south, east, north, west
function isleStation(x, z, rot = 0) {
  const ax = rot % 2 === 1, fx = [0, 1, 0, -1][rot], fz = [1, 0, -1, 0][rot];
  block(x, 0, z, ax ? .8 : 1.6, 2.35, ax ? 1.6 : .8, MI.kiosk, 'metal', { tile: 1 });
  const scr = mesh(new THREE.PlaneGeometry(1.15, .86), MI.screen, x + fx*.41, 1.55, z + fz*.41, scene, false); scr.rotation.y = Math.atan2(fx, fz);
  const bar = mesh(new THREE.BoxGeometry(ax ? .84 : 1.66, .08, ax ? 1.66 : .84), MAT.lampOn, x, 2.39, z, scene, false);
  mesh(new THREE.BoxGeometry(ax ? 1 : 1.9, .12, ax ? 1.9 : 1), MAT.metalDark, x, .06, z);
  ISLE.stations.push({ x: x + fx*1.3, z: z + fz*1.3, kx: x, ky: 0, kz: z, rot });
  return bar;
}
// ---- small builders ----
function isleTower(x, z, h, mat = MI.olive) {   // watchtower: a covered platform on legs with a stair up one side
  const s = 3.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(x + sx*(s/2 - .15), 0, z + sz*(s/2 - .15), .3, h + 2.6, .3, MAT.metalDark, 'metal', { tile: 1 });
  block(x, h - .22, z, s, .22, s, MAT.grate, 'metal', { tile: 1.5 });
  railing('x', x - s/2, x + s/2, z - s/2 + .05, h); railing('z', z - s/2, z + s/2, x - s/2 + .05, h); railing('z', z - s/2, z + s/2, x + s/2 - .05, h);
  railing('x', x - s/2, x - .2, z + s/2 - .05, h);
  block(x, h + 2.4, z, s + .6, .2, s + .6, mat, 'metal', { tile: 2 });
  stairRun(x + .9, z + s/2 + .05, 'z', 1, 1.6, 0, h, MAT.grate);
  isleSpot(x - .6, h, z - .6, 2);
}
function isleCanopy(x, z, w, d, h, mat) {   // open-sided roof on posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(x + sx*(w/2 - .3), 0, z + sz*(d/2 - .3), .35, h, .35, MAT.metalDark, 'metal', { tile: 1 });
  block(x, h, z, w, .3, d, mat, 'metal', { tile: 2 });
}
function isleHay(x, z, rot) {   // round bale
  solid(x, z, rot ? 1.5 : 1.3, rot ? 1.3 : 1.5, 1.3, 'dirt', false, 0, { vaultOnly: false });
  const m = mesh(new THREE.CylinderGeometry(.66, .66, 1.45, 18), MI.hay, x, .66, z); m.rotation[rot ? 'x' : 'z'] = Math.PI/2;
}
function isleLogs(x, z, len, rows, axis = 'x') {   // stacked logs
  const r = .32, h = rows*r*1.8;
  axisBlock(axis, axis === 'x' ? x : z, 0, axis === 'x' ? z : x, len, h, rows*r*2 + .1, null, 'wood');
  for (let k = 0; k < rows; k++) for (let i = 0; i < rows - k; i++) {
    const off = (i - (rows - k - 1)/2)*r*2, y = r + k*r*1.75;
    const m = mesh(new THREE.CylinderGeometry(r*rand(.85, 1.05), r, len, 12), MI.log, 0, y, 0);
    if (axis === 'x') { m.rotation.z = Math.PI/2; m.position.set(x, y, z + off); } else { m.rotation.x = Math.PI/2; m.position.set(x + off, y, z); }
  }
}
// a single tree in a town or yard (planted with the rest of the forest later)
function isleTreeAt(x, z, s = 1) { (ISLE.plant || (ISLE.plant = [])).push([x, z, s]); solid(x, z, .55*s, .55*s, 4*s, 'wood'); }
function isleRock(x, z, s) {
  const gy = ISLE_T.h ? isleH(x, z) : 0;
  const m = mesh(new THREE.DodecahedronGeometry(1, 0), MI.rock, x, gy + s*.35, z); m.scale.set(s*rand(.9, 1.3), s*rand(.55, .8), s*rand(.9, 1.3)); m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  solid(x, z, s*1.3, s*1.3, s*.85, 'concrete', false, gy - .3);
  if (!ISLE_T.h) isleHard(x - s, z - s, x + s, z + s);
}
function isleCabin(x, z, flip, mat, tier = 1) {
  isleRoom({ kind: 'house', cx: x, cz: z, w: 7, d: 6, floors: 1, fh: 3, flip, ext: mat, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'pitched', roofH: 2,
    open: { s: [[0, DOOR, -1.4], [0, 'win', 1.8]], n: [[0, 'win', 0]], e: [[0, 'win', 0]], w: [[0, DOOR, .8]] } }, tier, 1.2);
}
function isleHouse(x, z, flip, mat, floors = 2, tier = 1) {
  isleRoom({ kind: 'house', balconies: floors > 1, cx: x, cz: z, w: 11, d: 9, floors, fh: 3.1, flip, ext: mat, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'pitched', roofH: 2.4,
    open: {
      s: [[0, DOOR, -3.2], [0, 'win', -.4], [0, 'win', 3.4], [1, 'win', -3.2], [1, 'win', .2], [1, 'win', 3.4]],
      n: [[0, 'win', 1.8], [0, DOOR, 4], [1, 'win', -3.2], [1, 'win', 2.6]],
      w: [[0, 'win', .8], [1, 'win', .8]], e: [[0, 'win', -1.4], [0, 'win', 1.8], [1, 'win', -1.4], [1, 'win', 1.8]],
    },
    inner: [['z', -3.6, 3.6, 1.4, [[0, DOOR, 1.6], [1, DOOR, 1.6]]]],
    stairs: { lx: -5.0, lz: -3.25, axis: 'x', dir: 1, width: 1.5 },
  }, tier);
}
// ---- the areas ----
function isleTown() {
  isleRoad(-46, 0, 46, 0, 8, 1); isleRoad(0, -46, 0, 46, 8, 1);
  // plaza with a fountain where the two main streets cross
  islePlane(22, 22, MI.pave, 0, .02, 0, 3);
  isleHard(-11, -11, 11, 11);
  block(0, 0, 0, 5.4, .62, 5.4, MI.stone, 'concrete', { tile: 1.5, vaultOnly: true });
  mesh(new THREE.CylinderGeometry(2.3, 2.3, .1, 32), MAT.water, 0, .56, 0, scene, false);
  block(0, .62, 0, .9, 2.4, .9, MI.stone, 'concrete', { tile: 1 });
  mesh(new THREE.SphereGeometry(.55, 16, 12), MAT.metal, 0, 3.5, 0);
  for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) isleTreeAt(x, z, .9);
  for (const [x, z, r] of [[-6.5, -9.5, 0], [6.5, 9.5, 2], [-9.5, 6.5, 3], [9.5, -6.5, 1]]) {   // benches
    block(x, 0, z, r % 2 ? .6 : 2, .5, r % 2 ? 2 : .6, MI.plank, 'wood', { tile: 1, vaultOnly: true });
  }
  // sidewalks and lamps
  for (const s of [-1, 1]) {
    for (const [a, b] of [[-46, -11], [11, 46]]) {
      block((a + b)/2, 0, s*5, b - a, .14, 1.6, MAT.concrete, 'concrete', { tile: 1.5 });
      block(s*5, 0, (a + b)/2, 1.6, .14, b - a, MAT.concrete, 'concrete', { tile: 1.5 });
    }
    for (let t = -40; t <= 40; t += 13) if (Math.abs(t) > 12) { lampPost(t, s*5.6, s > 0 ? Math.PI : 0); lampPost(s*5.6, t + 6, s > 0 ? -Math.PI/2 : Math.PI/2); }
  }
  // NW: town hall with roof access, a house, a shop
  isleRoom({ kind: 'office', cx: -20, cz: -18, w: 16, d: 10, floors: 2, fh: 3.3, ext: MI.stone, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'flat', parapet: MAT.concreteDark, surface: 'concrete',
    open: { s: [[0, GATE(2.4, 2.6), 0], [0, 'win', -5.2], [0, 'win', 5.2], [1, 'win', -5.2], [1, 'win', -1.8], [1, 'win', 1.8], [1, 'win', 5.2]],
      n: [[0, DOOR, -4], [0, 'win', 3], [1, 'win', -4], [1, 'win', 3]], w: [[0, 'win', 0], [1, 'win', 0]], e: [[0, DOOR, 1.5], [1, 'win', 0]] },
    inner: [['z', -4.7, 4.7, -2.5, [[0, DOOR, 2], [1, DOOR, 2]]]],
    stairs: { lx: 1, lz: -3.9, axis: 'x', dir: 1, width: 1.5 }, roofGaps: [['w', -3.6, 1.6]],
    extStairs: [{ lx: -8.75, lz: 6.3, axis: 'z', dir: -1, width: 1.4 }] }, 1, 1.2);
  { const s = mesh(new THREE.BoxGeometry(5, 1.1, .12), MI.sign('TOWN HALL'), -20, 5.2, -12.9); s.castShadow = false; }
  isleHouse(-38, -15, false, MI.blue);
  isleRoom({ kind: 'shop', cx: -14, cz: -34, w: 10, d: 8, floors: 1, fh: 3.4, ext: MI.cream, trim: MAT.trim, floorMat: MAT.walk, roof: 'flat', parapet: MAT.trim,
    open: { s: [[0, GATE(2.2, 2.5), -2], [0, 'win', 2.5]], n: [[0, DOOR, 2]], e: [[0, 'win', 0]], w: [[0, 'win', -1], [0, 'win', 2]] } }, 1, 1.4);
  // NE: church and bell tower, a house
  isleRoom({ kind: 'church', cx: 24, cz: -19, w: 10, d: 16, floors: 1, fh: 6, ext: MI.stone, trim: MAT.concreteDark, floorMat: MAT.walk, roof: 'pitched', roofH: 4,
    open: { s: [[0, GATE(2.4, 3.2), 0]], n: [[0, DOOR, 2.5]], e: [[0, 'win', -4], [0, 'win', 0], [0, 'win', 4]], w: [[0, 'win', -4], [0, DOOR, 0], [0, 'win', 4]] } }, 1, 1.3);
  isleTowerBell(11, -20);
  isleHouse(12, -38, true, MI.white);
  // SW: hotel (3 floors, roof access), a cottage
  isleRoom({ kind: 'hotel', balconies: true, cx: -22, cz: 20, w: 14, d: 11, floors: 3, fh: 3.1, ext: MI.red, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'flat', parapet: MAT.trim,
    open: { n: [[0, GATE(2.4, 2.5), 2], [0, 'win', -4], [1, 'win', -4], [1, 'win', 0], [1, 'win', 4], [2, 'win', -4], [2, 'win', 0], [2, 'win', 4]],
      s: [[0, DOOR, -3], [0, 'win', 2], [1, 'win', -3], [1, 'win', 2], [2, 'win', -3], [2, 'win', 2]],
      w: [[0, 'win', 0], [1, 'win', 0], [2, 'win', 0]], e: [[0, 'win', -2], [1, 'win', -2], [1, 'win', 2], [2, 'win', 2]] },
    inner: [['x', -6.7, 6.7, .8, [[0, DOOR, -3], [1, DOOR, -3], [2, DOOR, -3], [0, DOOR, 3], [1, DOOR, 3], [2, DOOR, 3]]]],
    stairs: { lx: -6.4, lz: -4.25, axis: 'x', dir: 1, width: 1.5 }, roofGaps: [['e', -4.2, 1.6]],
    extStairs: [{ lx: 7.75, lz: 9.9, axis: 'z', dir: -1, width: 1.4 }] }, 1, 1.1);
  { const s = mesh(new THREE.BoxGeometry(4.4, 1, .12), MI.sign('HOTEL'), -22, 9.4, 14.4); s.castShadow = false; }
  isleCabin(-40, 22, false, MI.green);
  // SE: diner, a house, a garage with roof access
  isleRoom({ kind: 'diner', cx: 18, cz: 14, w: 13, d: 8, floors: 1, fh: 3.3, ext: MI.white, trim: MAT.trim, floorMat: MAT.walk, roof: 'flat', parapet: MAT.carPaint[0],
    open: { n: [[0, GATE(2.2, 2.5), -3], [0, 'win', 0], [0, 'win', 2.2], [0, 'win', 4.4]], s: [[0, DOOR, 4], [0, 'win', -2]], e: [[0, 'win', 0]], w: [[0, DOOR, 1]] } }, 1, 1.4);
  { const s = mesh(new THREE.BoxGeometry(4, 1, .12), MI.sign('DINER'), 18, 4.2, 9.9); s.castShadow = false; }
  isleHouse(34, 24, true, MI.cream);
  isleRoom({ kind: 'warehouse', cx: 14, cz: 33, w: 8, d: 7, floors: 1, fh: 3, ext: MI.grey, trim: MAT.trim, floorMat: MAT.walk, roof: 'flat', parapet: MAT.trim,
    open: { n: [[0, GATE(3.2, 2.6), -1]], s: [[0, DOOR, 2]], w: [[0, 'win', 0]] }, roofGaps: [['e', 1.5, 1.6]],
    extStairs: [{ lx: 4.75, lz: -2.4, axis: 'z', dir: 1, width: 1.4 }] }, 1, 1.3);
  // street cover: parked cars, a van, barriers
  car(-24, -2.6, 'x', 0); car(-34, 2.6, 'x', 3); car(22, 2.6, 'x', 1); car(36, -2.6, 'x', 5); van(-2.8, -26, 'z', 2); car(2.7, 24, 'z', 4); car(-2.7, 36, 'z', 2);
  barrier(14, -2, 2.8, 'x'); barrier(-14, 2, 2.8, 'x');
  for (const [x, z, t] of [[-30, -26, 1], [-6, -14, 1], [30, -8, 1], [8, 20, 1], [-12, 34, 1], [26, 34, 2]]) isleCrate(x, z, 0, t, Math.random() < .5 ? 1 : 0);
  for (const [x, z] of [[-46, -30], [46, -30], [-46, 30], [46, 32], [26, 44]]) isleTreeAt(x, z, rand(.9, 1.15));
  isleStation(9.5, 9.5, 2); isleStation(-9.5, -9.5, 0);
}
function isleTowerBell(x, z) {   // stone bell tower: two floors with a lookout window up top, a belfry on the roof
  isleRoom({ furnish: false, roofGear: false, cx: x, cz: z, w: 6, d: 6.4, floors: 2, fh: 3.1, ext: MI.stone, trim: MAT.concreteDark, int: MI.stone, floorMat: MAT.wfloor, roof: 'flat', parapet: MI.stone, surface: 'concrete',
    open: { e: [[0, DOOR, 1.4], [1, 'win', 0]], n: [[1, 'win', 0]], s: [[1, 'win', 0]], w: [[0, 'win', 0], [1, 'win', 0]] },
    stairs: { lx: -2.6, lz: -2.15, axis: 'x', dir: 1, width: 1.4 } }, 2, 1);
  const top = 6.2 + .05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(.45, 2.6, .45), MI.stone, x + sx*2.6, top + 1.3, z + sz*2.8);
  mesh(new THREE.BoxGeometry(6.3, .35, 6.7), MI.stone, x, top + 2.75, z);
  mesh(new THREE.ConeGeometry(3.6, 4.2, 4), ROOF_MAT, x, top + 5.05, z).rotation.y = Math.PI/4;
  mesh(new THREE.CylinderGeometry(.35, .7, .9, 16), MAT.pipe, x, top + 1.9, z);
}
function isleHarbor() {
  islePlane(48, 66, MI.quay, 119, .02, 8, 4);
  isleHard(94, -25, 144, 42);
  // warehouses with wide doors front and back
  for (const [cz, mat] of [[-13, MAT.rustWall], [29, MI.grey]]) {
    isleRoom({ kind: 'warehouse', cx: 104, cz, w: 20, d: 12, floors: 1, fh: 6, ext: mat, trim: MAT.metalDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
      open: { n: [[0, GATE(4.6, 4.2), -4]], s: [[0, GATE(4.6, 4.2), 4]], e: [[0, DOOR, 0]], w: [[0, DOOR, 2], [0, 'win', -4]] } }, 1, 1.2);
    crateStack(100, cz - 2, 2.6, 1.4, 2.3); crateStack(108, cz + 2.5, 1.4, 2.6, 1.15); crateStack(97, cz + 3, 1.4, 1.4, 1.15);
    container(110, cz - 3, 6, 2.4, 2.6, cz > 0 ? 1 : 3);
    isleCrate(103, cz + 3.5, 0, 1, 0);
  }
  // container yard: two blocks either side of the main lane
  let ci = 0;
  for (const zs of [[-20, -14, -8], [20, 26, 32]]) for (const z of zs) for (const x of [121, 129]) {
    container(x, z, 6, 2.4, 2.6, ci++);
    if ((x + z) % 3 === 0) container(x, z, 6, 2.4, 2.6, ci++, 2.6);
  }
  for (const [x, z] of [[125.5, -16.9], [125.5, 22.9]]) crateStack(x, z, 1.4, 1.4, 1.2);
  // dock office on the lane
  isleRoom({ kind: 'office', cx: 130, cz: 9, w: 8, d: 7, floors: 2, fh: 3, ext: MI.blue, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'flat', parapet: MAT.trim,
    open: { s: [[0, DOOR, -2], [0, 'win', 1.8], [1, 'win', -2], [1, 'win', 1.8]], n: [[0, 'win', 1], [1, 'win', 1]], w: [[0, DOOR, 1], [1, 'win', 0]], e: [[0, 'win', 0], [1, 'win', 0]] },
    stairs: { lx: -3.7, lz: -2.45, axis: 'x', dir: 1, width: 1.5 } }, 1, 1.4);
  // gantry crane over the quay edge
  for (const z of [-30, 46]) for (const x of [136, 143]) block(x, 0, z, .9, 18, .9, MAT.yellow, 'metal', { tile: 2 });
  mesh(new THREE.BoxGeometry(9, 1.6, 78), MAT.yellow, 139.5, 18.8, 8); mesh(new THREE.BoxGeometry(2.2, 2.4, 3), MAT.metalDark, 139.5, 17.2, 2);
  for (let z = -18; z <= 34; z += 6.5) mesh(new THREE.CylinderGeometry(.22, .3, .55, 12), MAT.metalDark, 140.8, .27, z);
  barrels(114, 4, 2, 2, 1.2); barrels(116, 14, 2, 2, 1.2);
  for (const [x, z] of [[96, 6], [124, 16], [136, -2]]) isleCrate(x, z, 0, 1, 1);
  for (const [x, z] of [[112, -24], [112, 40]]) lampPost(x, z, 0);
  isleStation(118, 9, 1);
  // boats moored out at sea
  for (const [x, z, s, red] of [[158, -6, 1, 0], [160, 22, .8, 1], [170, 50, 1.3, 0]]) {
    const g = new THREE.Group(); g.position.set(x, -.6, z); g.rotation.y = rand(-.2, .2); scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5*s, 1.6*s, 16*s), red ? MI.hullRed : MI.hull); hull.position.y = .5*s; g.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.6*s, 2.2*s, 4*s), MI.hull); cab.position.set(0, 2.3*s, -2*s); g.add(cab);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 6*s, 6), MAT.metalDark); mast.position.set(0, 4.6*s, -2*s); g.add(mast);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; statics.push(o); } });
  }
}
function isleFort() {
  const x0 = -100, x1 = -56, z0 = -98, z1 = -56, H = 2.7;
  isleHard(x0 - 1, z0 - 1, x1 + 1, z1 + 1);
  const wall = (axis, a, b, c, gaps) => wallLine(axis, a, b, c, 0, H, .6, gaps.map(([at, w]) => ({ at, w, bottom: 0, top: H })), MI.army, { surface: 'concrete', tile: 2.5, noMantle: true });
  wall('x', x0, x1, z0, [[-78, 6]]); wall('x', x0, x1, z1, [[-90, 6], [-66, 6]]);
  wall('z', z0 + .6, z1 - .6, x0, [[-77, 6]]); wall('z', z0 + .6, z1 - .6, x1, [[-70, 6], [-88, 5]]);
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) block(x, 0, z, 1.2, H + .5, 1.2, MAT.concreteDark, 'concrete', { tile: 1, noMantle: true });
  // HQ (roof access), two barracks, a hangar
  isleRoom({ kind: 'office', cx: -68, cz: -89, w: 12, d: 9, floors: 2, fh: 3.2, ext: MI.army, trim: MAT.concreteDark, int: MAT.plaster, floorMat: MAT.walk, roof: 'flat', parapet: MAT.concreteDark, surface: 'concrete',
    open: { s: [[0, DOOR, -2], [0, 'win', 2.5], [1, 'win', -2], [1, 'win', 2.5]], w: [[0, DOOR, 1], [1, 'win', 0]], n: [[0, 'win', 0], [1, 'win', 0]], e: [[1, 'win', -1]] },
    inner: [['z', -4.2, 4.2, 1.6, [[0, DOOR, 2], [1, DOOR, 2]]]],
    stairs: { lx: -5.5, lz: -3.4, axis: 'x', dir: 1, width: 1.5 }, roofGaps: [['w', -3.4, 1.6]],
    extStairs: [{ lx: -6.75, lz: 6.2, axis: 'z', dir: -1, width: 1.4 }] }, 2, 1.3);
  for (const cz of [-88, -66]) isleRoom({ kind: 'barracks', cx: -86, cz, w: 15, d: 7, floors: 1, fh: 3, ext: MI.olive, trim: MAT.metalDark, int: MAT.plaster, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
    open: { e: [[0, DOOR, 0]], w: [[0, DOOR, 0]], n: [[0, 'win', -4], [0, 'win', 0], [0, 'win', 4]], s: [[0, 'win', -4], [0, 'win', 0], [0, 'win', 4]] } }, 2, 1.1);
  isleRoom({ kind: 'warehouse', cx: -68, cz: -66, w: 16, d: 14, floors: 1, fh: 7, ext: MAT.rustWall, trim: MAT.metalDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
    open: { w: [[0, GATE(8, 5.5), 0]], e: [[0, DOOR, 3]], n: [[0, DOOR, -4]] } }, 2, 1.2);
  // inside the hangar: an armored truck
  block(-69, 0, -66, 7, 2.2, 2.8, MI.olive, 'metal', { tile: 2 }); block(-66.4, 2.2, -66, 2, 1.2, 2.6, MI.olive, 'metal', { tile: 2 });
  for (const ox of [-2.5, 0, 2.5]) for (const s of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(.55, .55, .4, 16), MAT.tire, -69 + ox, .55, -66 + s*1.5); w.rotation.x = Math.PI/2; }
  // watchtowers, helipad, sandbags, bunkers
  isleTower(-96, -94, 4.2); isleTower(-59.5, -95, 4.2);
  { const p = mesh(new THREE.PlaneGeometry(10, 10), MI.pad, -79, .03, -76, scene, false); p.rotation.x = -Math.PI/2; }
  for (const [x, z, l, a] of [[-86, -78, 4, 'z'], [-72, -78, 4, 'z'], [-79, -84, 4, 'x'], [-79, -70, 3, 'x'], [-60, -78, 4, 'z']]) sandbags(x, z, l, a);
  bunker(-94, -77, 3, 3, 1.6); barrels(-73, -96, 2, 2, 1.2);
  for (const [x, z, t] of [[-79, -76, 2], [-96, -60, 2], [-64, -97, 2], [-64, -70, 2]]) isleCrate(x, z, 0, t, 0);
  isleStation(-52, -64, 1);
}
function isleFarm() {
  isleHard(-104, 50, -58, 98);
  // red barn with a hay loft
  isleRoom({ kind: 'warehouse', cx: -88, cz: 64, w: 12, d: 16, floors: 2, fh: 4, ext: MI.red, trim: MAT.trim, int: MI.plank, floorMat: MI.plank, roof: 'pitched', roofH: 3.4,
    open: { n: [[0, GATE(4, 3.5), 0], [1, 'win', 0]], s: [[0, GATE(4, 3.5), 0], [1, 'win', 0]], e: [[0, DOOR, -4], [0, 'win', 3]], w: [[0, 'win', -4], [0, DOOR, 4]] },
    stairs: { lx: -4.9, lz: -7.4, axis: 'z', dir: 1, width: 1.5 } }, 1, 1);
  for (const [x, z] of [[-92, 58], [-85, 70]]) isleHay(x, z, 0);
  // farmhouse
  isleHouse(-66, 84, false, MI.white);
  // silo and water tower
  tank(-99, 84, 3, 11); mesh(new THREE.SphereGeometry(3, 24, 12, 0, Math.PI*2, 0, Math.PI/2), MAT.tank, -99, 11, 84);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(-70 + sx*1.6, 0, 60 + sz*1.6, .3, 8, .3, MI.log, 'wood', { tile: 1 });
  mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.2, 20), MI.plank, -70, 9.6, 60); mesh(new THREE.ConeGeometry(2.7, 1.4, 20), MAT.metalDark, -70, 11.9, 60);
  // corn field (no collision: crouch in it to hide), fenced
  { const n = 22*14, stalk = new THREE.InstancedMesh(new THREE.ConeGeometry(.22, 1.6, 5), MI.corn, n), o = new THREE.Object3D(); let k = 0;
    for (let i = 0; i < 22; i++) for (let j = 0; j < 14; j++) { o.position.set(-96 + i*.95 + rand(-.15, .15), .8, 74 + j*1.25 + rand(-.2, .2)); o.rotation.set(rand(-.1, .1), rand(0, 6), rand(-.1, .1)); o.scale.setScalar(rand(.85, 1.15)); o.updateMatrix(); stalk.setMatrixAt(k++, o.matrix); }
    stalk.castShadow = true; stalk.receiveShadow = true; stalk.frustumCulled = false; scene.add(stalk); ISLE.corn = { x0: -96.5, x1: -75.5, z0: 73.5, z1: 91 }; }
  fence('x', -98, -91, 73); fence('x', -85, -74, 73); fence('z', 73, 92.5, -74); fence('x', -98, -86, 92.5);
  for (const [x, z, r] of [[-79, 56, 1], [-76, 60, 0], [-96, 96, 0], [-62, 72, 1], [-74, 96, 1]]) isleHay(x, z, r);
  // tractor
  block(-75, 0, 68, 3.2, 1.6, 1.8, MAT.carPaint[4], 'metal', { tile: 0 }); block(-75.8, 1.6, 68, 1.4, 1.2, 1.5, MAT.glassDark, 'metal', { tile: 0 });
  for (const s of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(.85, .85, .5, 18), MAT.tire, -76.2, .85, 68 + s*1.1); w.rotation.x = Math.PI/2; const f = mesh(new THREE.CylinderGeometry(.5, .5, .4, 16), MAT.tire, -73.8, .5, 68 + s*1); f.rotation.x = Math.PI/2; }
  for (const [x, z, t] of [[-80, 60, 1], [-64, 76, 1], [-100, 64, 1]]) isleCrate(x, z, 0, t, 1);
  isleStation(-60, 64, 1);
}
function isleRefinery() {
  isleHard(57, -100, 102, -54);
  for (const [x, z, r, h] of [[64, -92, 4.2, 8], [74, -94, 3.4, 7], [96, -64, 4.4, 9], [98, -86, 3.6, 7]]) tank(x, z, r, h);
  // derrick with a catwalk to the control room
  const cx = 80, cz = -76, DY = 4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(cx + sx*3, 0, cz + sz*3, .4, DY - .25, .4, MAT.yellow, 'metal', { tile: 1 });
  block(cx, DY - .25, cz, 6.6, .25, 6.6, MAT.grate, 'metal', { tile: 1.5 });
  railing('x', cx - 3.3, cx + 3.3, cz - 3.25, DY); railing('z', cz - 3.3, cz + 3.3, cx - 3.25, DY); railing('x', cx - 3.3, cx + 1.4, cz + 3.25, DY);
  stairRun(cx + 2.4, cz + 3.4, 'z', 1, 1.6, 0, DY, MAT.grate);
  block(cx, DY, cz - 2, .6, 9, .6, MAT.yellow, 'metal', { tile: 1 });
  for (let y = DY + 1; y < DY + 9; y += 1.2) mesh(new THREE.BoxGeometry(1.6, .08, .08), MAT.yellow, cx, y, cz - 2);
  isleSpot(cx - 1.5, DY, cz + 1, 1); isleSpot(cx + 1.5, DY, cz - .5, 1);
  isleRoom({ kind: 'office', cx: 94, cz: -76, w: 8, d: 7, floors: 1, fh: 4, ext: MAT.concrete, trim: MAT.concreteDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.concreteDark, surface: 'concrete',
    open: { w: [[0, DOOR, 2]], s: [[0, DOOR, 0], [0, 'win', -2.6]], n: [[0, 'win', 0]], e: [[0, 'win', 0]] },
    roofGaps: [['w', 0, 1.6]] }, 1, 1.4);
  block(cx + 6.95, DY - .25, cz, 7.3, .25, 1.6, MAT.grate, 'metal', { tile: 1.5 });
  railing('x', cx + 3.3, cx + 10.6, cz - .83, DY); railing('x', cx + 3.3, cx + 10.6, cz + .83, DY);
  for (const x of [cx + 5.5, cx + 8.5]) block(x, 0, cz, .3, DY - .25, .3, MAT.yellow, 'metal', { tile: 1 });
  pipeRun('z', -98, -80, 86); pipeRun('x', 60, 76, -66); pipeRun('x', 84, 100, -98.5);
  container(66, -76, 2.4, 6, 2.6, 2); crateStack(66, -78, 1.4, 1.4, 1.2, 2.6); stairRun(64.2, -72.6, 'z', -1, 1.4, 0, 2.6, MAT.grate); isleSpot(66, 2.6, -75, 1);
  barrels(88, -60, 2, 2, 1.2); barrels(70, -60, 2, 2, 1.2);
  for (const [x, z, l, a] of [[74, -84, 4, 'x'], [90, -88, 3, 'z']]) sandbags(x, z, l, a);
  // flare stack
  block(58, 0, -60, 1, 14, 1, MAT.metalDark, 'metal', { tile: 1 }); ISLE.flare = V(58, 14.6, -60);
  for (const [x, z, t] of [[80, -70, 1], [96, -70, 1], [64, -82, 1]]) isleCrate(x, z, 0, t, 0);
  isleStation(72, -60, 0);
}
function isleRadio() {
  isleHard(-16, -126, 16, -96);
  // lookout platform with the radio mast rising from it
  const x = 0, z = -112, h = 5;
  isleTower(x, z, h, MAT.concreteDark);
  const mast = new THREE.Group(); mast.position.set(x, h + 2.6, z); scene.add(mast);
  for (let i = 0; i < 4; i++) { const a = i*Math.PI/2 + Math.PI/4, leg = new THREE.Mesh(new THREE.CylinderGeometry(.06, .12, 30, 6), MAT.metalDark); leg.position.set(Math.cos(a)*.7, 15, Math.sin(a)*.7); leg.rotation.set(Math.sin(a)*.02, 0, -Math.cos(a)*.02); mast.add(leg); }
  for (let y = 1; y < 30; y += 2.2) { const r = new THREE.Mesh(new THREE.TorusGeometry(.8 - y*.012, .03, 4, 4), MAT.metalDark); r.position.y = y; r.rotation.set(Math.PI/2, 0, Math.PI/4); mast.add(r); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), MAT.redLight); lamp.position.y = 30.3; mast.add(lamp); ISLE.mastLamp = lamp;
  mast.traverse(o => { if (o.isMesh && o !== lamp) { o.castShadow = true; statics.push(o); } });
  isleRoom({ kind: 'office', cx: 10, cz: -103, w: 9, d: 7, floors: 1, fh: 3.2, ext: MI.white, trim: MAT.trim, floorMat: MAT.walk, roof: 'flat', parapet: MAT.trim,
    open: { s: [[0, DOOR, -2], [0, 'win', 2]], w: [[0, DOOR, 0]], n: [[0, 'win', 0]], e: [[0, 'win', 0]] } }, 2, 1.4);
  isleRoom({ kind: 'warehouse', cx: -10, cz: -120, w: 6, d: 5, floors: 1, fh: 2.8, ext: MAT.rustWall, trim: MAT.metalDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
    open: { e: [[0, DOOR, 0]], n: [[0, 'win', 0]] } }, 2, 1.4);
  // satellite dish
  { const d = mesh(new THREE.SphereGeometry(2.4, 20, 10, 0, Math.PI*2, 0, Math.PI*.32), MAT.metal, -9, 3.4, -102); d.rotation.set(-1.1, .6, 0); block(-9, 0, -102, .6, 2.6, .6, MAT.metalDark, 'metal', { tile: 1 }); }
  for (const [x2, z2, l, a] of [[6, -116, 4, 'z'], [-6, -106, 3, 'x']]) sandbags(x2, z2, l, a);
  for (const [x2, z2, t] of [[6, -110, 2], [-4, -118, 2]]) isleCrate(x2, z2, 0, t, 1);
}
function isleLumber() {
  isleHard(-2, 86, 38, 124);
  isleCanopy(16, 106, 18, 10, 5, MAT.rustWall);
  block(16, 0, 106, 6, 1.2, 1.6, MAT.metalDark, 'metal', { tile: 1 }); mesh(new THREE.CylinderGeometry(.9, .9, .08, 28), MAT.chrome, 16, 1.55, 106).rotation.x = Math.PI/2;
  isleLogs(12, 109.5, 6, 2); isleSpot(10, 0, 103, 1); isleSpot(22, 0, 109, 1); isleSpot(20, 0, 102, 1);
  isleLogs(0, 98, 8, 3); isleLogs(32, 116, 7, 3, 'z'); isleLogs(4, 116, 9, 2);
  for (const [x, z] of [[26, 96], [30, 100]]) crateStack(x, z, 2.6, 1.4, 1.15);
  isleCabin(34, 92, false, MI.green); isleCabin(-2, 108, true, MI.cream);
  isleRoom({ kind: 'house', cx: 4, cz: 92, w: 8, d: 7, floors: 2, fh: 3, ext: MI.plank, trim: MAT.trim, int: MI.plank, floorMat: MAT.wfloor, roof: 'pitched', roofH: 2,
    open: { s: [[0, DOOR, 1.5], [1, 'win', 1.5]], n: [[0, 'win', -1], [1, 'win', -1]], e: [[0, 'win', 0], [1, 'win', 0]], w: [[0, DOOR, 1], [1, 'win', 0]] },
    stairs: { lx: -3.7, lz: -2.45, axis: 'x', dir: 1, width: 1.5 } }, 1, 1.3);
  for (const [x, z, t] of [[22, 112, 1], [8, 100, 1]]) isleCrate(x, z, 0, t, 0);
  isleStation(26, 104, 3);
}
function isleMotel() {
  isleHard(-128, -24, -94, 16);
  // gas station: canopy over the pumps, a shop
  isleCanopy(-100, -14, 11, 7, 4.4, MAT.carPaint[0]);
  for (const x of [-103, -97]) block(x, 0, -14, .8, 1.5, .6, MAT.metal, 'metal', { tile: 1, vaultOnly: true });
  isleRoom({ kind: 'shop', cx: -114, cz: -16, w: 10, d: 8, floors: 1, fh: 3.2, ext: MI.white, trim: MAT.carPaint[0], floorMat: MAT.walk, roof: 'flat', parapet: MAT.carPaint[0],
    open: { e: [[0, GATE(2.2, 2.5), 0], [0, 'win', -2.5], [0, 'win', 2.5]], w: [[0, 'win', 0]], n: [[0, DOOR, 2]], s: [[0, 'win', 0]] } }, 1, 1.5);
  { const s = mesh(new THREE.BoxGeometry(.12, 1, 3.6), MI.sign('GAS'), -108.9, 4, -16); s.castShadow = false; }
  // motel: five rooms side by side, each with its own door and window
  const mx = -112, mz = 6, w = 26, d = 7, fh = 3;
  isleRoom({ kind: 'hotel', cx: mx, cz: mz, w, d, floors: 1, fh, ext: MI.cream, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'flat', parapet: MAT.trim,
    open: { n: [-10.4, -5.2, 0, 5.2, 10.4].flatMap(x => [[0, DOOR, x - 1], [0, 'win', x + 1.2]]), s: [[0, 'win', -7.8], [0, 'win', 7.8]], e: [[0, 'win', 0]], w: [[0, 'win', 0]] },
    inner: [-7.8, -2.6, 2.6, 7.8].map(c => ['z', -3.2, 3.2, c, []]),
    roofGaps: [['e', 1.5, 1.6]], extStairs: [{ lx: 13.75, lz: -2.4, axis: 'z', dir: 1, width: 1.4 }] }, 1, 1.2);
  { const pole = block(-96, 0, 2, .4, 7, .4, MAT.metalDark, 'metal', { tile: 1 }); const s = mesh(new THREE.BoxGeometry(.2, 1.6, 4.4), MI.sign('PINE MOTEL'), -96, 7.4, 2); s.castShadow = true; }
  car(-104, -4, 'x', 2); car(-118, -2, 'x', 1); van(-122, -14, 'z', 3);
  for (const [x, z, t] of [[-106, -20, 1], [-104, 12, 1]]) isleCrate(x, z, 0, t, 1);
  isleStation(-100, -6, 2);
}
function isleSite() {
  isleHard(58, 56, 102, 100);
  // unfinished concrete frame: three open floors, stairs between them
  const cx = 78, cz = 76, w = 16, d = 12, fh = 3.6, floors = 3;
  for (let f = 0; f < floors; f++) {
    const y = f*fh;
    for (const ox of [-w/2 + .3, -w/6, w/6, w/2 - .3]) for (const oz of [-d/2 + .3, 0, d/2 - .3]) block(cx + ox, y, cz + oz, .5, fh - .3, .5, MAT.concrete, 'concrete', { tile: 1 });
    // the floor above (a gap over the stairs)
    { const top = (f + 1)*fh - .3;   // the slab above, with a hole over the stairs
      block(cx - .8, top, cz, w - 1.6, .3, d, MAT.concrete, 'concrete', { tile: 2 });
      block(cx + w/2 - .8, top, cz - d/2 + 3.1, 1.6, .3, 6.2, MAT.concrete, 'concrete', { tile: 2 }); }
    stairRun(cx + w/2 - .8, cz + d/2 - .4, 'z', -1, 1.5, y, fh, MAT.concreteDark);
    if (f > 0) { railing('x', cx - w/2, cx + w/2 - 1.7, cz - d/2 + .05, y); railing('z', cz - d/2, cz + d/2, cx - w/2 + .05, y); }
    for (let i = 0; i < 3; i++) isleSpot(cx + rand(-6, 4), y, cz + rand(-4.5, 4.5), 2);
    if (f === 1) wallLine('x', cx - 7, cx + 1, cz + d/2 - .2, y, fh - .3, .3, [opening('win', cx - 5), opening('win', cx - 1)], MAT.concrete, { surface: 'concrete', tile: 2 });
  }
  block(cx - 4, 3*fh - .3 + .3, cz - 2, 2.4, 1.2, 1.4, MAT.crate[0], 'wood', { tile: 1 });
  // tower crane
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(92 + sx*1.2, 0, 64 + sz*1.2, .3, 26, .3, MAT.yellow, 'metal', { tile: 1 });
  mesh(new THREE.BoxGeometry(1.4, 1.4, 34), MAT.yellow, 92, 26.7, 72); mesh(new THREE.BoxGeometry(3, 2.4, 3), MAT.yellow, 92, 25, 64);
  block(92, 0, 56.5, 3, 2.4, 3, MAT.concrete, 'concrete', { tile: 1 });
  // site offices, sand piles, concrete pipes, scaffold
  container(64, 90, 6, 2.4, 2.6, 4); crateStack(66, 90, 1.4, 1.4, 1.2, 2.6); stairRun(60.3, 88, 'x', 1, 1.4, 0, 2.6, MAT.grate); isleSpot(62.5, 2.6, 90, 2);
  container(96, 92, 2.4, 6, 2.6, 1);
  for (const [x, z, r] of [[98, 82, 2.6], [70, 96, 2]]) { const m = mesh(new THREE.ConeGeometry(r, r*.9, 14), MI.hay, x, r*.45, z); m.material = MAT.sandbag; solid(x, z, r*1.3, r*1.3, r*.7, 'dirt'); }
  for (const [x, z] of [[88, 84], [88, 88]]) { const p = mesh(new THREE.CylinderGeometry(.9, .9, 2.4, 18, 1, true), MAT.concrete, x, .9, z); p.rotation.z = Math.PI/2; p.material = MAT.concrete; solid(x, z, 2.4, 1.8, 1.8, 'concrete', false, 0, { vaultOnly: false }); }
  for (const [x, z, l, a] of [[68, 78, 3, 'z'], [94, 76, 4, 'z']]) barrier(x, z, l, a);
  for (const [x, z, t] of [[66, 82, 2], [90, 70, 2], [cx - 2, cz + 2, 2]]) isleCrate(x, z, 0, t, 0);
  isleStation(62, 74, 1);
}
// the Gulag: an offshore prison yard, walled in so nobody gets out except by winning
function isleGulag() {
  const G = ISLE.gulag, { x, z, w, d } = G, H = 8;
  block(x, -2.2, z, w + 6, 2.2, d + 6, MAT.concreteDark, 'concrete', { tile: 3, noMantle: true });
  { const f = mesh(new THREE.PlaneGeometry(w, d), MAT.tiles, x, .015, z, scene, false); f.rotation.x = -Math.PI/2; }
  for (const [ax, a, b, c] of [['x', x - w/2 - .5, x + w/2 + .5, z - d/2 - .25], ['x', x - w/2 - .5, x + w/2 + .5, z + d/2 + .25], ['z', z - d/2, z + d/2, x - w/2 - .25], ['z', z - d/2, z + d/2, x + w/2 + .25]])
    axisBlock(ax, (a + b)/2, 0, c, b - a, H, .5, MAT.concrete, 'concrete', { tile: 2.5, noMantle: true });
  // a catwalk roof grid so nothing can be thrown in or out
  block(x, H, z, w + 1, .2, d + 1, null, 'metal', { noMantle: true });
  for (let i = -w/2; i <= w/2; i += 2.6) mesh(new THREE.BoxGeometry(.12, .12, d + 1), MAT.metalDark, x + i, H + .1, z);
  for (const [ox, oz] of [[-w/2, -d/2], [w/2, -d/2], [-w/2, d/2], [w/2, d/2]]) { mesh(new THREE.BoxGeometry(.4, .3, .4), MAT.lampOn, x + ox*.9, H - .4, z + oz*.9, scene, false); }
  // cover: mirrored so neither end has the edge
  for (const s of [-1, 1]) {
    block(x + s*6, 0, z, 1.2, 1.1, 4, MAT.concreteDark, 'concrete', { tile: 1, vaultOnly: true });
    block(x + s*3, 0, z + s*5, 2.4, 1.6, 1.2, MAT.crate[0], 'wood', { tile: 1 });
    block(x + s*3, 0, z - s*5, 1.4, 2.2, 1.4, MAT.crate[1], 'wood', { tile: 1 });
    block(x + s*9.5, 0, z + s*4.5, 1, 2.4, 3, MAT.concrete, 'concrete', { tile: 1 });
  }
  block(x, 0, z, 1.2, 2.4, 1.2, MAT.concrete, 'concrete', { tile: 1 });
  G.spawns = [[x - w/2 + 1.6, z], [x + w/2 - 1.6, z]]; G.flag = { x, z: z - 6.5 };
}
// ---- ground, coast, sea, roads, trees, grass ----
function isleGround() {
  isleMats();
  const sea = mesh(new THREE.PlaneGeometry(7000, 7000), MI.sea, 0, -.75, 0, scene, false); sea.rotation.x = -Math.PI/2; sea.receiveShadow = false;
  // the shoreline is a wall nobody sees: an unbroken ring of small blocks just inside the water's edge
  for (let a = -Math.PI; a < Math.PI; a += 2/isleCoast(a)) {
    const dx = Math.cos(a), dz = Math.sin(a), r = (isleCoast(a) - 1.2)/isleNorm(dx, dz);
    const b = solid(dx*r, dz*r, 2.4, 2.4, 9, 'dirt', true, 0, { noMantle: true }); b.coast = true;
  }
}
// a strip lying on the ground: `ux, uz` along it, w wide, cut into 1 m pieces that follow the hills
function isleStrip(x0, z0, x1, z1, w, mat, lift, tile) {
  const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0)/len, uz = (z1 - z0)/len, n = Math.max(1, Math.ceil(len)), wn = Math.max(1, Math.ceil(w/2));
  const g = new THREE.PlaneGeometry(w, len, wn, n); g.rotateX(-Math.PI/2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i), b = -p.getZ(i), x = (x0 + x1)/2 + ux*b - uz*a, z = (z0 + z1)/2 + uz*b + ux*a;   // (a rotation: a mirror would turn the strip face-down)
    p.setXYZ(i, x, isleH(x, z) + lift, z); uv.setXY(i, (a + w/2)/tile, (b + len/2)/tile);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); statics.push(m);
  return m;
}
function isleRoadsDrape() {
  for (const r of ISLE.roads) {
    const { x0, z0, x1, z1, w, asph } = r, len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0)/len, uz = (z1 - z0)/len, e = w*.25;
    isleStrip(x0 - ux*e, z0 - uz*e, x1 + ux*e, z1 + uz*e, w, asph ? MI.road : MI.dirtRoad, asph ? .05 : .04, 6);
    if (!asph) continue;
    for (let t = 3; t < len - 2; t += 5) { const cx = x0 + ux*t, cz = z0 + uz*t; isleStrip(cx - ux*1.1, cz - uz*1.1, cx + ux*1.1, cz + uz*1.1, .16, MAT.paintY, .07, 2); }   // dashed center line
    for (const sd of [-1, 1]) { const ox = -uz*(w/2 - .35)*sd, oz = ux*(w/2 - .35)*sd; isleStrip(x0 + ox, z0 + oz, x1 + ox, z1 + oz, .12, MAT.paintW, .065, 2); }   // edge lines
  }
}
const isleRoadDist = (x, z) => {
  let best = Infinity;
  for (const r of ISLE.roads) {
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0, L2 = dx*dx + dz*dz, t = clamp(((x - r.x0)*dx + (z - r.z0)*dz)/L2, 0, 1);
    best = Math.min(best, Math.hypot(x - r.x0 - dx*t, z - r.z0 - dz*t) - r.w/2);
  }
  return best;
};
const isleHardAt = (x, z, m = 0) => ISLE.hard.some(([a, b, c, d]) => x > a - m && x < c + m && z > b - m && z < d + m);
// wrapped grass: a fixed patch of blades that slides with the camera, kept off roads, floors and sand by a mask
const isleGrassMask = { tex: null };
function isleGrass() {
  const M = 2048, W0 = -ISLE_T.O, sc = M/(2*W0);
  const c = mk(M, 0, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, M, M);
    const img = g.getImageData(0, 0, M, M), d = img.data;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = i/sc - W0, z = j/sc - W0;
      if (isleInF(x, z) > ISLE_BEACH + 1.5) { const o = (j*M + i)*4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = '#000';
    for (const [a, b, cc, dd] of ISLE.hard) g.fillRect((a + W0)*sc, (b + W0)*sc, (cc - a)*sc, (dd - b)*sc);
    for (const r of ISLE.roads) { g.strokeStyle = '#000'; g.lineWidth = (r.w + 1)*sc; g.lineCap = 'round'; g.beginPath(); g.moveTo((r.x0 + W0)*sc, (r.z0 + W0)*sc); g.lineTo((r.x1 + W0)*sc, (r.z1 + W0)*sc); g.stroke(); }
    for (const b of boxes) { if (b.coast) continue; const gy = isleH((b.minX + b.maxX)/2, (b.minZ + b.maxZ)/2); if (b.minY < gy + .5 && b.maxY > gy + .3) g.fillRect((b.minX + W0)*sc - 1, (b.minZ + W0)*sc - 1, (b.maxX - b.minX)*sc + 2, (b.maxZ - b.minZ)*sc + 2); }
  });
  const mask = T(c, 1, 1, false); mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping; mask.flipY = false; isleGrassMask.tex = mask;
  const W = 64, N = Math.round((EXTREME ? 9000 : HIGH ? 6000 : 2500));
  const geo = new THREE.PlaneGeometry(.6, .42); geo.translate(0, .21, 0);
  const g2 = geo.clone(); g2.rotateY(Math.PI/2); const g3 = geo.clone(); g3.rotateY(Math.PI/4);
  const merged = mergeGeos([geo, g2, g3]);
  { const n = merged.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }
  const mat = new THREE.MeshLambertMaterial({ map: T(C.blade), alphaTest: .5, side: THREE.DoubleSide });
  mat.onBeforeCompile = s => {
    s.uniforms.grassAmb = grassAmb; s.uniforms.time = grassTime; s.uniforms.grassFar = grassFar; s.uniforms.camPos = grassCam; s.uniforms.gMask = { value: mask }; s.uniforms.gH = { value: ISLE_T.tex };
    s.fragmentShader = 'uniform vec3 grassAmb;\n' + s.fragmentShader.replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse += grassAmb * diffuseColor.rgb;\n#include <aomap_fragment>');
    s.vertexShader = `uniform float time, grassFar; uniform vec3 camPos; uniform sampler2D gMask, gH; varying float vKeep;
      float hAt(vec2 p) { return max(0., texture2D(gH, (p - ${ISLE_T.O.toFixed(1)} + .5) / ${ISLE_T.N.toFixed(1)}).r); }
` + s.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 base = instanceMatrix[3].xz;
        vec2 wpos = camPos.xz + mod(base - camPos.xz + ${(W/2).toFixed(1)}, ${W.toFixed(1)}) - ${(W/2).toFixed(1)};
        vec2 shift = wpos - base; float gy = hAt(wpos);
        float keep = texture2D(gMask, (wpos - ${ISLE_T.O.toFixed(1)}) / ${(-2*ISLE_T.O).toFixed(1)}).r;
        float sway = uv.y * uv.y;
        transformed *= step(.5, keep) * (1. - smoothstep(grassFar - 9., grassFar, distance(wpos, camPos.xz)));
        transformed.x += sin(time*1.9 + wpos.x*.45 + wpos.y*.3) * .09 * sway;
        transformed.z += cos(time*1.5 + wpos.y*.4) * .06 * sway;`)
      .replace('#include <project_vertex>', `vec4 mvPosition = vec4(transformed, 1.0);
        mvPosition = instanceMatrix * mvPosition; mvPosition.xz += shift; mvPosition.y += gy;
        mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `vec4 worldPosition = instanceMatrix * vec4(transformed, 1.0); worldPosition.xz += shift; worldPosition.y += gy; worldPosition = modelMatrix * worldPosition;`);
  };
  mat.customProgramCacheKey = () => 'isleGrass';
  const im = new THREE.InstancedMesh(merged, mat, N), o = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    o.position.set(rand(-W/2, W/2), 0, rand(-W/2, W/2)); o.rotation.y = rand(0, 6.28); o.scale.set(rand(.7, 1.4), rand(.6, 1.5), rand(.7, 1.4)); o.updateMatrix();
    im.setMatrixAt(i, o.matrix); im.setColorAt(i, col.setHSL(rand(.2, .27), rand(.35, .6), rand(.55, .85)));
  }
  im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
  return im;
}
// =====================================================================
// Building the big island: each area is built at the origin height and then lifted (and, for the original
// areas, moved) into place by isleAt, which shifts everything it created: meshes, colliders, loot spots,
// supply boxes, buy stations, level pads and roads.
// =====================================================================
function isleUnbin(b) {
  for (let i = Math.floor(b.minX/BIN); i <= Math.floor(b.maxX/BIN); i++) for (let j = Math.floor(b.minZ/BIN); j <= Math.floor(b.maxZ/BIN); j++) {
    const l = bins.get(binKey(i, j)); if (!l) continue; const k = l.indexOf(b); if (k >= 0) l.splice(k, 1);
  }
}
function isleAt(dx, dy, dz, fn) {
  const nc = scene.children.length, nb = boxes.length, plant = ISLE.plant || (ISLE.plant = []);
  const n0 = { spots: ISLE.spots.length, crates: ISLE.crates.length, stations: ISLE.stations.length, hard: ISLE.hard.length, roads: ISLE.roads.length, plant: plant.length };
  const corn = ISLE.corn, flare = ISLE.flare;
  fn();
  for (let i = n0.hard; i < ISLE.hard.length; i++) { const h = ISLE.hard[i]; h[0] += dx; h[2] += dx; h[1] += dz; h[3] += dz; h[4] = (h[4] || 0) + dy; }
  if (!dx && !dy && !dz) return;
  for (let i = nc; i < scene.children.length; i++) { const o = scene.children[i]; o.position.x += dx; o.position.y += dy; o.position.z += dz; }
  for (let i = nb; i < boxes.length; i++) { const b = boxes[i]; isleUnbin(b); b.minX += dx; b.maxX += dx; b.minY += dy; b.maxY += dy; b.minZ += dz; b.maxZ += dz; binBox(b); }
  for (let i = n0.spots; i < ISLE.spots.length; i++) { const s = ISLE.spots[i]; s.x += dx; s.y += dy; s.z += dz; }
  for (let i = n0.crates; i < ISLE.crates.length; i++) { const s = ISLE.crates[i]; s.x += dx; s.y += dy; s.z += dz; }
  for (let i = n0.stations; i < ISLE.stations.length; i++) { const s = ISLE.stations[i]; s.x += dx; s.z += dz; s.kx += dx; s.kz += dz; s.ky += dy; }
  for (let i = n0.roads; i < ISLE.roads.length; i++) { const r = ISLE.roads[i]; r.x0 += dx; r.x1 += dx; r.z0 += dz; r.z1 += dz; }
  for (let i = n0.plant; i < plant.length; i++) { plant[i][0] += dx; plant[i][1] += dz; }
  if (ISLE.corn && ISLE.corn !== corn) { const c = ISLE.corn; c.x0 += dx; c.x1 += dx; c.z0 += dz; c.z1 += dz; }
  if (ISLE.flare && ISLE.flare !== flare) ISLE.flare.add(V(dx, dy, dz));
}
function isleRoad(x0, z0, x1, z1, w, asph) { ISLE.roads.push({ x0, z0, x1, z1, w, asph }); }
function isleRoadPath(pts, w, asph) { for (let i = 0; i < pts.length - 1; i++) isleRoad(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, asph); }
// ---- materials for the new areas ----
function isleMats2() {
  if (MI.glass) return;
  const wall = (c, tex = C.plaster, n = 1.2) => heightAO(stdMat(tex, 1, { color: lin(c), roughness: .9, normal: n, rough: [1, -.15] }));
  MI.stucco = [0xe6dccb, 0xd9c7a8, 0xc9d3d6, 0xe8d5c0, 0xbfc6b2, 0xd8b9a0].map(c => wall(c));
  MI.brickRed = heightAO(stdMat(C.brick, 1, { color: lin(0xc89a88), roughness: .9, normal: -4.5, rough: [.95, -.15] }));
  MI.brickDark = heightAO(stdMat(C.brick, 1, { color: lin(0x8a7a72), roughness: .9, normal: -4.5, rough: [.95, -.15] }));
  MI.office = heightAO(stdMat(C.concrete, 1, { color: lin(0xd6d4cf), roughness: .85, normal: 2, rough: [1, -.3] }));
  // curtain-wall glass for the towers: one tile is one floor of one bay
  const fac = (glass, frame, lit) => mk(128, 128, (g, w, h) => {
    g.fillStyle = frame; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, glass[0]); gr.addColorStop(.55, glass[1]); gr.addColorStop(1, glass[2]);
    g.fillStyle = gr; g.fillRect(6, 22, w - 12, h - 28);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(6, 22); g.lineTo(60, 22); g.lineTo(20, h - 6); g.lineTo(6, h - 6); g.fill();
    g.fillStyle = frame; g.fillRect(w/2 - 2, 22, 4, h - 28);
    if (lit) { g.fillStyle = 'rgba(255,236,190,.22)'; g.fillRect(10, 26, w/2 - 14, h - 36); }
  });
  const facMat = (c, rough, metal) => { const t = T(c, 1); t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: metal, envMapIntensity: 1.2 }); };
  MI.glass = [facMat(fac(['#2b3c4e', '#45627c', '#22303e'], '#9aa3ab'), .18, .55), facMat(fac(['#3b4a44', '#5d736a', '#2a3632'], '#c9c5bc'), .2, .5), facMat(fac(['#2a3446', '#3c4b66', '#1e2532'], '#2c3138', 1), .16, .6)];
  MI.turf = (() => { const t = T(mk(256, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#3f7a32' : '#4a8a3a'; g.fillRect(0, i*32, w, 32); } for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(${20 + Math.random()*40},${60 + Math.random()*60},20,.25)`; g.fillRect(Math.random()*w, Math.random()*h, 1, 2); } }), 1); t.wrapS = t.wrapT = THREE.RepeatWrapping; const m = new THREE.MeshStandardMaterial({ map: t, roughness: .95 }); m.polygonOffset = true; m.polygonOffsetFactor = -1; return m; })();
  MI.seat = [0x2f5fa8, 0xc23a3a, 0xe8e4dc].map(c => new THREE.MeshStandardMaterial({ color: lin(c), roughness: .6 }));
  MI.white = MI.white || MI.stucco[0];
  MI.red2 = new THREE.MeshStandardMaterial({ color: lin(0xb3322a), roughness: .6 }); MI.white2 = new THREE.MeshStandardMaterial({ color: lin(0xf0eee8), roughness: .6 });
  MI.steelRed = new THREE.MeshStandardMaterial({ color: lin(0xb8402e), roughness: .55, metalness: .4 });
  MI.cool = heightAO(stdMat(C.concrete, 1, { color: lin(0xc9c4b8), roughness: .95, normal: 2, rough: [1, -.3] }));
  MI.wire = new THREE.LineBasicMaterial({ color: 0x2a2c30 });
  MI.hedge = new THREE.MeshStandardMaterial({ color: lin(0x3d6a2c), roughness: .95 });
  MI.score = new THREE.MeshBasicMaterial({ map: T(mk(512, 192, (g, w, h) => {
    g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffcf4a'; g.font = '700 46px Rajdhani, sans-serif'; g.fillText('CRESTFALL FC', w/2, 38);
    g.fillStyle = '#f2f2f2'; g.font = '700 96px Rajdhani, sans-serif'; g.fillText('2 - 1', w/2, 122); g.font = '700 30px Rajdhani, sans-serif'; g.fillStyle = '#5ad86f'; g.fillText("78'", w/2, 172);
  })), color: new THREE.Color(1.6, 1.6, 1.6) });
  MI.pool = new THREE.MeshStandardMaterial({ color: lin(0x2a8fb8), roughness: .05, envMapIntensity: 1.2 });
}
// ---- one generated building: windows in bays, doors on the street sides, stairs, an inner wall or two ----
// front: sides facing a street ('n' 's' 'w' 'e'), shop: big ground-floor windows, roofUp: outside stairs to the roof
function isleGenBuilding(cx, cz, w, d, floors, o = {}) {
  const fh = o.fh || 3.3, t = .3, open = { n: [], s: [], w: [], e: [] }, front = o.front || ['s'];
  const stairLen = Math.round(fh/.2)*.3, st = floors > 1 ? { lx: -w/2 + t + .15, lz: -d/2 + t + .8, axis: 'x', dir: 1, width: 1.5 } : null;
  const roofUp = o.roofUp && floors <= 3 && d >= 10 ? Math.round((floors*fh + .05)/.2)*.3 : 0;
  for (const side of ['n', 's', 'w', 'e']) {
    const L = side === 'n' || side === 's' ? w : d, bays = Math.max(1, Math.floor((L - 2)/3.3)), step = (L - 2)/bays;
    const mid = Math.floor(bays/2), isFront = front.includes(side);
    for (let f = 0; f < floors; f++) for (let k = 0; k < bays; k++) {
      const at = -L/2 + 1 + step*(k + .5);
      if (side === 'n' && st && at < -w/2 + t + stairLen + 1.4 && f === 0) continue;                 // no openings behind the stairs
      if (side === 'w' && roofUp && f === 0) continue;                                              // nor behind the outside stairs
      if (f === 0 && isFront && (k === mid || (bays > 5 && k === bays - 2))) open[side].push([0, o.gate ? GATE(2.4, 2.6) : DOOR, at]);
      else if (f === 0 && isFront && o.shop && step > 2.4) open[side].push([0, { w: step - .7, bottom: .55, top: 2.7 }, at]);
      else if (o.big) open[side].push([f, { w: Math.min(2.4, step - .8), bottom: .9, top: 2.6 }, at]);
      else open[side].push([f, 'win', at]);
    }
  }
  if (!front.some(sd => open[sd].some(q => q[0] === 0 && q[1] !== 'win' && q[1].bottom === 0))) open[front[0]].push([0, DOOR, 0]);
  const inner = [];
  if (w >= 13) {   // a wall across the middle with a door on every floor
    const doors = []; for (let f = 0; f < floors; f++) { if (d > 12) doors.push([f, DOOR, -d/4], [f, DOOR, d/4]); else doors.push([f, DOOR, d/2 - 2.2]); }
    inner.push(['z', -d/2 + t, d/2 - t, w > 22 ? -w/6 : 1.2, doors]);
    if (w > 22) inner.push(['z', -d/2 + t, d/2 - t, w/4 + 1, doors.map(q => [q[0], q[1], -q[2]])]);
  }
  const b = { cx, cz, w, d, floors, fh, ext: o.ext || MI.stucco[0], trim: o.trim || MAT.trim, int: MAT.plaster, floorMat: o.floorMat || MAT.wfloor, roof: o.roof || 'flat', roofH: o.roofH,
    parapet: o.parapet || MAT.concreteDark, surface: o.surface || 'concrete', kind: o.kind || 'office', balconies: o.balconies, open, inner, flip: !!o.flip, roofGear: o.roofGear };
  if (st) b.stairs = st;
  if (roofUp) { b.extStairs = [{ lx: -w/2 - .75, lz: d/2 + 1.3, axis: 'z', dir: -1, width: 1.4 }]; b.roofGaps = [['w', d/2 + 1.3 - roofUp + .2, 1.6]]; }
  isleRoom(b, o.tier || 1, o.per || 1);
  return b;
}
// a tower: a real lobby on the ground floor and glass storeys above (closed), a roof with a mast
function isleSkyscraper(cx, cz, w, d, floors, gi = 0) {
  const lobby = isleGenBuilding(cx, cz, w, d, 1, { fh: 4.6, front: ['n', 's', 'e', 'w'], big: true, ext: MI.office, kind: 'office', tier: 2, roof: 'flat', roofGear: false });
  const y0 = 4.6, H = (floors - 1)*3.4;
  block(cx, y0 + .05, cz, w, H, d, MI.glass[gi % MI.glass.length], 'concrete', { tile: 3.4, noMantle: true });
  for (let k = 1; k < floors - 1; k += 4) { const y = y0 + k*3.4; mesh(new THREE.BoxGeometry(w + .3, .35, d + .3), MI.office, cx, y, cz, scene, false); }
  block(cx, y0 + H + .05, cz, w + .4, .8, d + .4, MI.office, 'concrete', { tile: 2, noMantle: true });
  mesh(new THREE.BoxGeometry(w*.5, 2.4, d*.5), MAT.metalDark, cx, y0 + H + 2, cz);
  mesh(new THREE.CylinderGeometry(.12, .2, 12, 8), MAT.metalDark, cx + w*.15, y0 + H + 7, cz - d*.1);
  const lamp = mesh(new THREE.SphereGeometry(.25, 10, 8), MAT.redLight, cx + w*.15, y0 + H + 13.1, cz - d*.1, scene, false);
  return lobby;
}
// ---- street furniture ----
function isleSidewalk(x0, z0, x1, z1) { block((x0 + x1)/2, 0, (z0 + z1)/2, Math.abs(x1 - x0), .14, Math.abs(z1 - z0), MAT.concrete, 'concrete', { tile: 1.5 }); }
function isleBench(x, z, axis) { block(x, 0, z, axis === 'x' ? 1.9 : .6, .48, axis === 'x' ? .6 : 1.9, MI.plank, 'wood', { tile: 1, vaultOnly: true }); }
function isleBusStop(x, z, axis) {
  const L = 3.6, ax = axis === 'x';
  block(x, 0, z, ax ? L : .1, 2.4, ax ? .1 : L, MAT.glassDark, 'metal', { tile: 0 });
  mesh(new THREE.BoxGeometry(ax ? L + .3 : 1.6, .12, ax ? 1.6 : L + .3), MAT.metalDark, x + (ax ? 0 : .7), 2.5, z + (ax ? .7 : 0));
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(.08, 2.5, .08), MAT.metalDark, x + (ax ? s*L/2 : 1.4), 1.25, z + (ax ? 1.4 : s*L/2));
  isleBench(x + (ax ? 0 : .35), z + (ax ? .35 : 0), axis);
}
function isleTrafficLight(x, z, rot) {
  mesh(new THREE.CylinderGeometry(.08, .1, 5, 8), MAT.metalDark, x, 2.5, z); solid(x, z, .25, .25, 5, 'metal', true);
  const ax = Math.sin(rot), az = Math.cos(rot);
  mesh(new THREE.BoxGeometry(Math.abs(ax) > .5 ? 3 : .08, .08, Math.abs(az) > .5 ? 3 : .08), MAT.metalDark, x + ax*1.5, 4.9, z + az*1.5);
  const hx = x + ax*2.6, hz = z + az*2.6;
  mesh(new THREE.BoxGeometry(.34, .9, .34), MAT.metalDark, hx, 4.4, hz);
  for (const [y, c] of [[4.7, 0x401010], [4.4, 0x403810], [4.1, 0x40ff60]]) mesh(new THREE.BoxGeometry(.36, .2, .36), c === 0x40ff60 ? MAT.lampOn : MAT.metalDark, hx, y, hz, scene, false);
}
function isleHydrant(x, z) { mesh(new THREE.CylinderGeometry(.14, .17, .7, 10), MAT.carPaint[0], x, .35, z); solid(x, z, .3, .3, .7, 'metal', true); }
function isleCrosswalk(x, z, axis, width) {
  for (let k = -width/2 + .5; k < width/2; k += 1.1) { const p = mesh(new THREE.PlaneGeometry(axis === 'x' ? 3 : .6, axis === 'x' ? .6 : 3), MAT.paintW, axis === 'x' ? x : x + k, .085, axis === 'x' ? z + k : z, scene, false); p.rotation.x = -Math.PI/2; }
}
function isleParkedCars(x0, z0, x1, z1, axis, n) {
  for (let i = 0; i < n; i++) { const t = (i + .5)/n + rand(-.08, .08)/n; if (Math.random() < .3) continue; const x = x0 + (x1 - x0)*t, z = z0 + (z1 - z0)*t; Math.random() < .15 ? van(x, z, axis, Math.floor(Math.random()*6)) : car(x, z, axis, Math.floor(Math.random()*6)); }
}
// ---- Crestfall City: a grid of avenues, mid-rise blocks, a plaza, three towers ----
function isleCity(P) {
  const A = [-96, -48, 0, 48, 96], E = 104, half = a => a === 0 ? 6 : 4.5;
  for (const a of A) { isleRoad(a, -E, a, E, half(a)*2, 1); isleRoad(-E, a, E, a, half(a)*2, 1); }
  isleHard(-E, -E, E, E);
  // sidewalks around every block, crosswalks at the junctions, lamps, lights, trees
  for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < A.length - 1; j++) {
    const x0 = A[i] + half(A[i]), x1 = A[i + 1] - half(A[i + 1]), z0 = A[j] + half(A[j]), z1 = A[j + 1] - half(A[j + 1]);
    isleSidewalk(x0, z0, x1, z0 + 2.6); isleSidewalk(x0, z1 - 2.6, x1, z1); isleSidewalk(x0, z0 + 2.6, x0 + 2.6, z1 - 2.6); isleSidewalk(x1 - 2.6, z0 + 2.6, x1, z1 - 2.6);
    for (let t = x0 + 6; t < x1 - 4; t += 13) { lampPost(t, z0 + 1, 0); lampPost(t + 6, z1 - 1, Math.PI); }
    for (let t = z0 + 8; t < z1 - 4; t += 15) { isleTreeAt(x0 + 1.3, t, .8); isleTreeAt(x1 - 1.3, t + 4, .8); }
    if ((i + j) % 2 === 0) isleHydrant(x0 + 3.2, z0 + 1.3);
    isleCityBlock(i, j, x0 + 2.6, z0 + 2.6, x1 - 2.6, z1 - 2.6);
  }
  for (const a of A) for (const b of A) { isleCrosswalk(a + half(a) + 1.6, b, 'x', half(b)*2); isleCrosswalk(a, b + half(b) + 1.6, 'z', half(a)*2); if (Math.abs(a) < 60 && Math.abs(b) < 60) isleTrafficLight(a + half(a) + .6, b + half(b) + .6, Math.PI/2); }
  // parked cars along the avenues
  for (const a of [-48, 48]) { isleParkedCars(a - half(a) + 1.2, -90, a - half(a) + 1.2, -54, 'z', 4); isleParkedCars(a + half(a) - 1.2, 54, a + half(a) - 1.2, 90, 'z', 4); isleParkedCars(-90, a + half(a) - 1.2, -54, a + half(a) - 1.2, 'x', 4); isleParkedCars(54, a - half(a) + 1.2, 90, a - half(a) + 1.2, 'x', 4); }
  for (const [x, z, ax] of [[-30, -6.8, 'x'], [30, 6.8, 'x'], [6.8, -72, 'z'], [-6.8, 72, 'z']]) isleBusStop(x, z, ax);
  barrier(0, -20, 3, 'z'); barrier(-20, 2.5, 3, 'x'); van(3, 30, 'z', 1); car(-2.6, -36, 'z', 3); car(36, -2.4, 'x', 2); car(-70, 2.4, 'x', 5);
}
function isleCityBlock(i, j, x0, z0, x1, z1) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1)/2, cz = (z0 + z1)/2, fr = [];
  const key = i*4 + j;
  // the four blocks around the middle: a plaza, city hall, a hotel, the main tower
  if (key === 5) return isleCityPlaza(cx, cz, w, d);
  if (key === 10) { isleGenBuilding(cx, cz, w - 4, d - 8, 3, { front: ['n', 'w'], ext: MI.stucco[1], trim: MAT.trim, kind: 'office', tier: 2, gate: true, parapet: MAT.trim, roofUp: true, per: 1.1 }); const s = mesh(new THREE.BoxGeometry(6, 1.1, .12), MI.sign('CITY HALL'), cx, 8.2, cz - (d - 8)/2 - .1); s.castShadow = false; isleStation(cx + w/2 - 2, cz + d/2 - 2, 2); return; }
  if (key === 6) { isleGenBuilding(cx, cz, w - 6, d - 6, 5, { front: ['n', 'e'], ext: MI.brickRed, kind: 'hotel', balconies: true, tier: 2, shop: true }); const s = mesh(new THREE.BoxGeometry(5, 1.1, .12), MI.sign('GRAND HOTEL'), cx, 4.2, cz - (d - 6)/2 - .1); s.castShadow = false; return; }
  if (key === 9) { isleSkyscraper(cx, cz, w - 10, d - 10, 18, 0); isleBench(cx - w/2 + 2, cz, 'z'); isleBench(cx + w/2 - 2, cz, 'z'); return; }
  if (key === 0) { isleSkyscraper(cx, cz, w - 12, d - 12, 13, 2); return; }
  if (key === 15) { isleSkyscraper(cx, cz, w - 12, d - 12, 15, 1); return; }
  if (key === 3 || key === 12) return isleParkingLot(cx, cz, w, d);
  if (key === 7) { isleStation(cx, cz + d/2 - 2, 2); }
  // the rest: two or four buildings
  const facing = (bx, bz) => { const f = []; if (bz < cz) f.push('n'); else f.push('s'); if (bx < cx) f.push('w'); else f.push('e'); return f; };
  const style = () => { const r = Math.random(); return r < .3 ? { ext: MI.brickRed } : r < .45 ? { ext: MI.brickDark } : r < .6 ? { ext: MI.office, big: true } : { ext: MI.stucco[Math.floor(Math.random()*MI.stucco.length)] }; };
  if (key === 4 || key === 11 || key === 13) {
    const bw = (w - 3)/2, bd = (d - 3)/2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const bx = cx + sx*(bw/2 + .75), bz = cz + sz*(bd/2 + .75);
      isleGenBuilding(bx, bz, bw - 1, bd - 1, 2 + Math.floor(Math.random()*3), Object.assign(style(), { front: facing(bx, bz), shop: Math.random() < .5, kind: Math.random() < .5 ? 'shop' : 'house', roofUp: Math.random() < .5 }));
    }
  } else {
    const alongX = key % 2 === 0, bw = alongX ? w : (w - 4)/2, bd = alongX ? (d - 4)/2 : d;
    for (const s of [-1, 1]) {
      const bx = alongX ? cx : cx + s*(bw/2 + 1), bz = alongX ? cz + s*(bd/2 + 1) : cz;
      isleGenBuilding(bx, bz, bw - 1.5, bd - 1, 2 + Math.floor(Math.random()*4), Object.assign(style(), { front: facing(bx, bz), shop: Math.random() < .6, kind: ['office', 'hotel', 'shop'][Math.floor(Math.random()*3)], balconies: Math.random() < .4, roofUp: Math.random() < .4 }));
    }
    for (const [x, z, t] of [[cx, cz, 1]]) isleCrate(x + rand(-2, 2), z + rand(-1, 1), 0, t, 0);
  }
}
function isleCityPlaza(cx, cz, w, d) {
  islePlane(w, d, MI.pave, cx, .02, cz, 3);
  block(cx, 0, cz, 7, .7, 7, MI.stone, 'concrete', { tile: 1.5, vaultOnly: true });
  mesh(new THREE.CylinderGeometry(3, 3, .1, 32), MAT.water, cx, .64, cz, scene, false);
  block(cx, .7, cz, 1.4, 3.2, 1.4, MI.stone, 'concrete', { tile: 1 });
  mesh(new THREE.SphereGeometry(.8, 16, 12), MAT.chrome, cx, 4.7, cz);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { isleTreeAt(cx + sx*w*.32, cz + sz*d*.32, 1.1); isleBench(cx + sx*w*.2, cz + sz*d*.36, 'x'); }
  for (const s of [-1, 1]) { block(cx + s*w*.36, 0, cz, 1.2, .9, d*.4, MI.hedge, 'dirt', { tile: 1, vaultOnly: true }); }
  isleCrate(cx + 5, cz - 6, 0, 2, 1); isleCrate(cx - 6, cz + 5, 0, 1, 0);
  isleStation(cx - w/2 + 3, cz - d/2 + 3, 0);
}
function isleParkingLot(cx, cz, w, d) {
  islePlane(w, d, MI.road, cx, .03, cz, 6);
  for (let x = cx - w/2 + 3; x < cx + w/2 - 2; x += 3) for (const s of [-1, 1]) { const p = mesh(new THREE.PlaneGeometry(.12, 5), MAT.paintW, x, .045, cz + s*d*.27, scene, false); p.rotation.x = -Math.PI/2; }
  for (let x = cx - w/2 + 4.5; x < cx + w/2 - 3; x += 3) for (const s of [-1, 1]) if (Math.random() < .45) car(x, cz + s*d*.27, 'z', Math.floor(Math.random()*6));
  lampPost(cx, cz, 0); lampPost(cx - w/2 + 1, cz, Math.PI/2);
  isleCrate(cx + 4, cz, 0, 1, 1);
}
// ---- Maple Heights: streets of family houses with yards, fences, driveways ----
function isleSuburb(P) {
  const X = [P.x - 58, P.x, P.x + 58], Zs = [P.z - 44, P.z, P.z + 44];
  for (const z of Zs) isleRoad(X[0] - 8, z, X[2] + 8, z, 7, 1);
  for (const x of X) isleRoad(x, Zs[0] - 8, x, Zs[2] + 8, 7, 1);
  isleRoad(P.x, Zs[2] + 8, P.x, 2, 7, 1);
  isleHard(X[0] - 8, Zs[0] - 26, X[2] + 8, Zs[2] + 26);
  const cols = [MI.white, MI.blue, MI.cream, MI.green, MI.red, MI.grey];
  let k = 0;
  for (const z of Zs) for (const side of [-1, 1]) {
    if ((z === Zs[0] && side < 0) || (z === Zs[2] && side > 0)) continue;   // the outer edges face the woods: houses only inward
    for (let seg = 0; seg < 2; seg++) for (let h = 0; h < 2; h++) {
      const x = X[seg] + 15 + h*27, hz = z + side*11, kind = Math.random();
      const flip = side > 0;   // the front door (south wall) faces the street
      if (kind < .62) isleHouse(x, hz, flip, cols[k % cols.length], 2, 1);
      else if (kind < .85) isleRanch(x, hz, flip, cols[(k + 2) % cols.length]);
      else isleCabin(x, hz, flip, cols[(k + 4) % cols.length]);
      isleHard(x - 7, hz - 6, x + 7, hz + 6);
      // driveway, a car, a mailbox, a fence along the back of the lot
      islePlane(3.2, 8, MI.pave, x + 8.6, .025, z + side*8, 2);
      if (Math.random() < .55) car(x + 8.6, z + side*8.4, 'z', k);
      block(x - 6.8, 0, z + side*4.4, .25, 1.1, .25, MAT.metalDark, 'metal', { tile: 0, vaultOnly: true });
      fence('x', x - 12.5, x + 12.5, z + side*21.4);
      if (Math.random() < .5) isleTreeAt(x - 9.5, z + side*18.5, rand(.9, 1.2));
      if (Math.random() < .3) { const px = x + 2, pz = z + side*18.6; mesh(new THREE.BoxGeometry(5, .05, 2.6), MI.pool, px, .06, pz, scene, false); block(px, 0, pz + side*1.5, 5.4, .3, .3, MAT.concrete, 'concrete', { tile: 1, vaultOnly: true }); }
      if (Math.random() < .35) isleCrate(x + rand(-4, 4), z + side*19.5, 0, 1, Math.random() < .5 ? 1 : 0);
      k++;
    }
  }
  for (let t = X[0]; t <= X[2]; t += 24) for (const z of Zs) lampPost(t + 4, z + 4.6, Math.PI);
  isleStation(P.x + 4.5, P.z + 5, 2); isleStation(X[0] - 4.5, Zs[2] - 5, 1);
}
// a single-storey house with a garage
function isleRanch(x, z, flip, mat) {
  isleRoom({ kind: 'house', cx: x, cz: z, w: 13, d: 8.5, floors: 1, fh: 3, flip, ext: mat, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'pitched', roofH: 2,
    open: { s: [[0, DOOR, -2.5], [0, 'win', 0], [0, GATE(2.8, 2.3), 4.2]], n: [[0, 'win', -3], [0, DOOR, 1.5], [0, 'win', 4]], w: [[0, 'win', 0]], e: [[0, 'win', -1.5]] },
    inner: [['z', -3.95, 3.95, 2.4, [[0, DOOR, -1.5]]]] }, 1, 1.1);
}
// ---- Crestfall Mall: two floors of shops around a central hall, a car park in front ----
function isleMall(P) {
  const cx = P.x, cz = P.z - 10, w = 66, d = 36, fh = 4.4;
  const shops = [-20, -8, 4, 16];
  const mk2 = (f) => [[f, DOOR, -26], [f, DOOR, -14], [f, DOOR, -2], [f, DOOR, 10], [f, DOOR, 24]];
  isleRoom({ kind: 'shop', cx, cz, w, d, floors: 2, fh, ext: MI.office, trim: MAT.metalDark, int: MAT.plaster, floorMat: MAT.tiles, roof: 'flat', parapet: MAT.metalDark, surface: 'concrete',
    open: {
      s: [[0, GATE(5, 3.4), 0], ...[-28, -20, -12, 12, 20, 28].map(x => [0, { w: 5, bottom: .5, top: 3.4 }, x]), ...[-26, -16, -6, 6, 16, 26].map(x => [1, { w: 4, bottom: .9, top: 3.2 }, x])],
      n: [[0, GATE(4, 3.4), -16], [0, GATE(4, 3.4), 16], ...[-28, -4, 4, 28].map(x => [0, 'win', x]), ...[-24, -12, 0, 12, 24].map(x => [1, 'win', x])],
      w: [[0, GATE(4, 3.4), 0], [1, { w: 3, bottom: .9, top: 3.2 }, 0], [0, 'win', -12], [0, 'win', 12]], e: [[0, GATE(4, 3.4), 0], [1, { w: 3, bottom: .9, top: 3.2 }, 0], [0, 'win', -12], [0, 'win', 12]] },
    inner: [['x', -32.7, 32.7, -6, [...mk2(0), ...mk2(1)]], ['x', -32.7, 32.7, 6, [[0, GATE(3, 3.2), 0], ...mk2(0).filter(q => q[2] !== -2), ...mk2(1)]],
      ...shops.map(x => ['z', -17.7, -6, x, []]), ...shops.map(x => ['z', 6, 17.7, x + 2, []])],
    stairs: { lx: -5, lz: 0, axis: 'x', dir: 1, width: 2.2, open: 1.1 }, roofGaps: [['w', 2.9, 1.6]],
    extStairs: [{ lx: -33.75, lz: 16, axis: 'z', dir: -1, width: 1.4 }] }, 2, .4);
  { const s = mesh(new THREE.BoxGeometry(12, 1.8, .2), MI.sign('CRESTFALL MALL'), cx, 10.2, cz + d/2 + .15); s.castShadow = false; }
  // car park
  const pz = cz + d/2 + 18; isleParkingLot(cx, pz, 70, 26);
  isleRoad(cx - 40, pz, P.x - 54, pz, 7, 1);
  // loading dock behind
  for (const x of [-20, -8]) container(cx + x, cz - d/2 - 6, 6, 2.4, 2.6, Math.floor(Math.random()*5));
  van(cx + 8, cz - d/2 - 5, 'x', 2); crateStack(cx + 20, cz - d/2 - 4, 2.6, 1.4, 2.3);
  isleCrate(cx - 14, cz - d/2 - 3, 0, 2, 0);
  isleStation(cx + 30, cz + d/2 + 3, 2);
  isleHard(cx - 36, cz - d/2 - 10, cx + 36, pz + 14);
}
// ---- the Stadium: a pitch inside four stands, floodlights, a roof over the main stand ----
function isleStadium(P) {
  const cx = P.x, cz = P.z, FW = 68, FD = 44, rows = 9, rise = .42, deep = .85;
  isleHard(cx - FW/2 - 14, cz - FD/2 - 14, cx + FW/2 + 14, cz + FD/2 + 14);
  { const p = islePlane(FW, FD, MI.turf, cx, .025, cz, 8); }
  const line = (w, d, x, z) => { const p = mesh(new THREE.PlaneGeometry(w, d), MAT.paintW, x, .04, z, scene, false); p.rotation.x = -Math.PI/2; };
  line(FW - 4, .15, cx, cz - FD/2 + 2); line(FW - 4, .15, cx, cz + FD/2 - 2); line(.15, FD - 4, cx - FW/2 + 2, cz); line(.15, FD - 4, cx + FW/2 - 2, cz); line(.15, FD - 4, cx, cz);
  for (const s of [-1, 1]) { block(cx + s*(FW/2 - 1), 0, cz, .15, 2.4, 7.3, MAT.trim, 'metal', { tile: 0 }); mesh(new THREE.BoxGeometry(.15, .15, 7.3), MAT.trim, cx + s*(FW/2 - 1), 2.4, cz); }
  // stands: rows of seats stepping up and away from the pitch, open at the corners
  const stand = (axis, side, len) => {
    const c0 = axis === 'x' ? cz + side*(FD/2 + 1.5) : cx + side*(FW/2 + 1.5);
    for (let r = 0; r < rows; r++) {
      const c = c0 + side*(r + .5)*deep, y = (r + 1)*rise;
      axisBlock(axis, axis === 'x' ? cx : cz, 0, c, len, y, deep, MAT.concrete, 'concrete', { tile: 2 });
      axisBox(axis, axis === 'x' ? cx : cz, y + .17, c - side*.2, len, .34, .4, MI.seat[(r < 3 ? 0 : r < 6 ? 1 : 2)], false);
    }
    const cTop = c0 + side*(rows*deep + 1);
    axisBlock(axis, axis === 'x' ? cx : cz, 0, cTop, len, rows*rise, 2, MAT.concrete, 'concrete', { tile: 2 });
    axisBlock(axis, axis === 'x' ? cx : cz, rows*rise, cTop + side*1.1, len, 1.2, .3, MAT.concreteDark, 'concrete', { tile: 2, noMantle: true });
    for (let k = 0; k < 4; k++) isleSpot((axis === 'x' ? cx + rand(-len/2 + 2, len/2 - 2) : cTop), rows*rise, axis === 'x' ? cTop : cz + rand(-len/2 + 2, len/2 - 2), 1);
  };
  stand('x', -1, FW - 6); stand('x', 1, FW - 6); stand('z', -1, FD - 8); stand('z', 1, FD - 8);
  // roof over the north stand
  const rz = cz - FD/2 - 1.5 - rows*deep/2;
  for (let x = -FW/2 + 6; x <= FW/2 - 6; x += 14) block(cx + x, 0, cz - FD/2 - 1.5 - rows*deep - 2.6, .5, 9, .5, MAT.metalDark, 'metal', { tile: 1 });
  block(cx, 9, rz - 1, FW - 4, .3, rows*deep + 5, MAT.rustWall, 'metal', { tile: 3 });
  // floodlights at the corners, a scoreboard
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = cx + sx*(FW/2 + 9), z = cz + sz*(FD/2 + 9);
    block(x, 0, z, .8, 26, .8, MAT.metalDark, 'metal', { tile: 1 });
    const panel = mesh(new THREE.BoxGeometry(4, 2.6, .5), MAT.metalDark, x, 26.8, z); panel.lookAt(cx, 0, cz);
    const glow = mesh(new THREE.BoxGeometry(3.6, 2.2, .1), MAT.lampOn, x - sx*.3, 26.8, z - sz*.3, scene, false); glow.lookAt(cx, 0, cz);
  }
  { const sb = mesh(new THREE.BoxGeometry(12, 5, .6), MAT.metalDark, cx, 9, cz + FD/2 + 1.5 + rows*deep + 3); const sc = mesh(new THREE.PlaneGeometry(11, 4.2), MI.score, cx, 9, cz + FD/2 + 1.5 + rows*deep + 2.65, scene, false); sc.rotation.y = Math.PI; for (const s of [-1, 1]) block(cx + s*4, 0, cz + FD/2 + 1.5 + rows*deep + 3, .4, 6.5, .4, MAT.metalDark, 'metal', { tile: 1 }); }
  // dugouts and goals as cover on the pitch
  for (const s of [-1, 1]) { block(cx + s*10, 0, cz + FD/2 - .8, 6, 1.1, 1.2, MAT.concreteDark, 'concrete', { tile: 1, vaultOnly: true }); }
  for (const [x, z, t] of [[cx, cz, 2], [cx - 20, cz + 8, 1], [cx + 22, cz - 6, 1]]) isleCrate(x, z, 0, t, 1);
  for (let i = 0; i < 10; i++) isleSpot(cx + rand(-FW/2 + 3, FW/2 - 3), 0, cz + rand(-FD/2 + 3, FD/2 - 3), 1);
  // ticket booths outside
  for (const s of [-1, 1]) isleRoom({ kind: 'office', cx: cx + s*(FW/2 + 9), cz: cz + 8, w: 5, d: 4, floors: 1, fh: 3, ext: MI.stucco[2], trim: MAT.trim, floorMat: MAT.walk, roof: 'flat', parapet: MAT.trim, open: { n: [[0, DOOR, 0]], s: [[0, 'win', 0]], e: [[0, 'win', 0]], w: [[0, 'win', 0]] }, roofGear: false }, 1, 1.5);
  isleStation(cx - FW/2 - 9, cz - 4, 1);
}
// ---- the Airfield: a runway, a taxiway, hangars, a control tower, a terminal and parked planes ----
function isleAirfield(P) {
  const rz = P.z + 22, x0 = P.x - 136, x1 = P.x + 92;
  isleHard(x0 - 6, rz - 15, x1 + 6, rz + 15); isleHard(P.x - 124, P.z - 74, P.x + 100, rz);
  islePlane(x1 - x0, 24, MI.road, (x0 + x1)/2, .035, rz, 8);
  const paint = (w, d, x, z) => { const p = mesh(new THREE.PlaneGeometry(w, d), MAT.paintW, x, .05, z, scene, false); p.rotation.x = -Math.PI/2; };
  for (let x = x0 + 30; x < x1 - 30; x += 18) paint(9, .5, x, rz);
  for (const s of [-1, 1]) paint(x1 - x0 - 4, .35, (x0 + x1)/2, rz + s*11.2);
  for (const e of [x0 + 6, x1 - 6]) for (let k = -9; k <= 9; k += 2.6) paint(10, 1.1, e, rz + k);
  // taxiway and apron
  islePlane(18, 26, MI.road, P.x, .03, rz - 24, 8);
  islePlane(140, 40, MI.quay, P.x, .025, P.z - 26, 4);
  for (let x = -60; x <= 60; x += 30) paint(.3, 30, P.x + x, P.z - 26);
  // hangars along the back of the apron
  for (const [hx, m] of [[-48, MAT.rustWall], [-18, MI.grey], [12, MAT.rustWall]]) {
    isleRoom({ kind: 'warehouse', cx: P.x + hx, cz: P.z - 58, w: 24, d: 20, floors: 1, fh: 8, ext: m, trim: MAT.metalDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
      open: { s: [[0, GATE(13, 6.5), 0]], n: [[0, DOOR, -6], [0, DOOR, 6]], e: [[0, DOOR, 4], [0, 'win', -4]], w: [[0, 'win', 0]] } }, 2, 1);
  }
  // a small plane in a hangar and two on the apron
  isleSmallPlane(P.x - 48, P.z - 56, 0); isleSmallPlane(P.x - 30, P.z - 20, .4); isleSmallPlane(P.x + 34, P.z - 30, -.3);
  // control tower: four floors, glass all round at the top
  const tx = P.x + 46, tz = P.z - 58;
  isleRoom({ kind: 'office', cx: tx, cz: tz, w: 8, d: 8, floors: 4, fh: 3.2, ext: MI.white2 || MI.white, trim: MAT.metalDark, int: MAT.plaster, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark,
    open: { s: [[0, DOOR, 1.6], [1, 'win', 1.6], [2, 'win', 1.6], [3, { w: 6, bottom: .9, top: 2.8 }, 0]], n: [[3, { w: 6, bottom: .9, top: 2.8 }, 0], [1, 'win', 0]], e: [[3, { w: 6, bottom: .9, top: 2.8 }, 0], [2, 'win', 0]], w: [[3, { w: 6, bottom: .9, top: 2.8 }, 0], [0, 'win', 1]] },
    stairs: { lx: -3.55, lz: -2.65, axis: 'x', dir: 1, width: 1.5 } }, 2, 1.2);
  mesh(new THREE.CylinderGeometry(.06, .06, 6, 6), MAT.metalDark, tx + 2.5, 15.9, tz + 2.5);
  { const dish = mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI*2, 0, Math.PI*.3), MAT.metal, tx - 2, 14.3, tz - 2); dish.rotation.set(-1, .4, 0); }
  // terminal with a roof terrace
  isleGenBuilding(P.x + 80, P.z - 60, 34, 12, 2, { front: ['n', 's'], big: true, ext: MI.office, kind: 'office', tier: 2, roofUp: true });
  // fuel tanks, a cargo plane by the runway, fences, a windsock
  tank(P.x - 80, P.z - 66, 3.2, 6); tank(P.x - 80, P.z - 54, 3.2, 6);
  isleCargoPlane(P.x - 92, rz - 34, Math.PI/2);
  { const pole = mesh(new THREE.CylinderGeometry(.06, .08, 7, 6), MAT.metalDark, x1 - 10, 3.5, rz + 18); const sock = mesh(new THREE.ConeGeometry(.5, 2.6, 10, 1, true), new THREE.MeshStandardMaterial({ color: lin(0xe8642c), side: THREE.DoubleSide }), x1 - 8.8, 6.6, rz + 18); sock.rotation.z = Math.PI/2; }
  for (const [x, z, l, a] of [[P.x - 20, P.z - 8, 4, 'x'], [P.x + 20, P.z - 40, 4, 'z']]) sandbags(x, z, l, a);
  for (const [x, z, t] of [[P.x, P.z - 30, 2], [P.x - 60, P.z - 40, 1], [P.x + 50, P.z - 20, 2]]) isleCrate(x, z, 0, t, 0);
  isleStation(P.x + 60, P.z - 34, 3);
  for (let i = 0; i < 8; i++) isleSpot(P.x + rand(-60, 60), 0, P.z - 26 + rand(-16, 16), 1);
}
function isleSmallPlane(x, z, rot) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  const body = new THREE.MeshStandardMaterial({ color: lin(0xf2f0ea), roughness: .35, metalness: .2 }), stripe = MAT.carPaint[1];
  const f = new THREE.Mesh(new THREE.CylinderGeometry(.75, .45, 8, 14), body); f.rotation.x = Math.PI/2; f.position.y = 1.6; g.add(f);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.75, 14, 10), body); nose.position.set(0, 1.6, 4); nose.scale.z = 1.3; g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, .15, 1.6), body); wing.position.set(0, 2.2, .8); g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.6, 1.2), stripe); tail.position.set(0, 2.5, -3.6); g.add(tail);
  const hs = new THREE.Mesh(new THREE.BoxGeometry(3.6, .1, .9), body); hs.position.set(0, 1.8, -3.6); g.add(hs);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, .55, 1.6), MAT.glassDark); cab.position.set(0, 2.4, 1.8); g.add(cab);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.76, .7, 1.2, 14), stripe); band.rotation.x = Math.PI/2; band.position.set(0, 1.6, -1); g.add(band);
  for (const s of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .2, 12), MAT.tire); wh.rotation.z = Math.PI/2; wh.position.set(s*1.3, .3, 1); g.add(wh); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; statics.push(o); } });
  const c = Math.cos(rot), s2 = Math.sin(rot);
  solid(x, z, Math.abs(c)*1.6 + Math.abs(s2)*8, Math.abs(s2)*1.6 + Math.abs(c)*8, 2.4, 'metal');
  solid(x + s2*.8, z + c*.8, Math.abs(c)*11 + Math.abs(s2)*1.6, Math.abs(s2)*11 + Math.abs(c)*1.6, .25, 'metal', false, 2.1, { vaultOnly: true });
}
function isleCargoPlane(x, z, rot) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  const body = new THREE.MeshStandardMaterial({ color: lin(0x7c8574), roughness: .55, metalness: .3 });
  const f = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 30, 18), body); f.rotation.x = Math.PI/2; f.position.y = 3.4; g.add(f);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 12), body); nose.position.set(0, 3.4, 15); nose.scale.z = 1.4; g.add(nose);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(2.4, .8, 9, 18), body); tail.rotation.x = -Math.PI/2; tail.position.set(0, 4.4, -19.4); g.add(tail);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(38, .5, 4.4), body); wing.position.set(0, 5.6, 1); g.add(wing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(.4, 7, 4), body); fin.position.set(0, 9, -21); g.add(fin);
  const hs = new THREE.Mesh(new THREE.BoxGeometry(13, .35, 3), body); hs.position.set(0, 7.2, -21); g.add(hs);
  for (const s of [-1, 1]) for (const e of [6, 12]) { const en = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 3.6, 14), MAT.metalDark); en.rotation.x = Math.PI/2; en.position.set(s*e, 4.9, 2.8); g.add(en); }
  const cock = new THREE.Mesh(new THREE.BoxGeometry(2.6, .8, 1.8), MAT.glassDark); cock.position.set(0, 5, 16.4); g.add(cock);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; statics.push(o); } });
  const c = Math.abs(Math.cos(rot)), s2 = Math.abs(Math.sin(rot));
  solid(x, z, c*4.8 + s2*36, s2*4.8 + c*36, 5.8, 'metal', false, 1);
  solid(x, z, c*38 + s2*4.4, s2*38 + c*4.4, .5, 'metal', false, 5.35, { vaultOnly: true });
  for (const sx of [-1, 1]) solid(x + (s2 ? 0 : sx*1.6), z + (s2 ? sx*1.6 : 0), 1, 1, 1.2, 'metal');
  isleSpot(x, 0, z + (s2 ? 0 : 4), 2);
}
// ---- the Power Plant: two cooling towers you can walk into, a turbine hall, a tall stack, pylons ----
function islePower(P) {
  const cx = P.x, cz = P.z;
  isleHard(cx - 46, cz - 44, cx + 46, cz + 40);
  for (const [x, z] of [[cx - 22, cz - 16], [cx + 18, cz - 22]]) isleCoolingTower(x, z);
  isleRoom({ kind: 'warehouse', cx: cx + 4, cz: cz + 20, w: 42, d: 18, floors: 1, fh: 10, ext: MI.cool, trim: MAT.metalDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'concrete',
    open: { n: [[0, GATE(6, 5), -10], [0, DOOR, 12]], s: [[0, GATE(6, 5), 8], [0, DOOR, -14]], w: [[0, DOOR, 0]], e: [[0, DOOR, 3]] } }, 2, .9);
  // turbines inside the hall
  for (const x of [-10, 4, 18]) { block(cx + x, 0, cz + 20, 9, 3.2, 4, MI.steelRed, 'metal', { tile: 2 }); mesh(new THREE.CylinderGeometry(1.6, 1.6, 9, 18), MI.steelRed, cx + x, 3.2, cz + 20).rotation.z = Math.PI/2; }
  // stack
  const sx = cx + 38, sz = cz + 6;
  block(sx, 0, sz, 4, 2, 4, MAT.concreteDark, 'concrete', { tile: 1 });
  for (let k = 0; k < 8; k++) mesh(new THREE.CylinderGeometry(1.7 - k*.08, 1.75 - k*.08, 6, 18), k % 2 ? MI.red2 : MI.white2, sx, 2 + 3 + k*6, sz);
  solid(sx, sz, 3.4, 3.4, 50, 'concrete');
  // transformer yard
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { block(cx - 32 + i*6, 0, cz + 22 + j*6, 2.6, 2.8, 2, MAT.metalDark, 'metal', { tile: 1 }); mesh(new THREE.BoxGeometry(.3, 1.4, .3), MAT.metal, cx - 32 + i*6, 3.5, cz + 22 + j*6); }
  fence('x', cx - 40, cx - 18, cz + 16, 2.2, true); fence('x', cx - 40, cx - 18, cz + 34, 2.2, true); fence('z', cz + 16, cz + 34, cx - 40, 2.2, true);
  pipeRun('x', cx - 14, cx + 14, cz + 6); pipeRun('z', cz - 6, cz + 10, cx + 30);
  isleGenBuilding(cx - 30, cz - 36, 14, 9, 2, { front: ['n', 'e'], ext: MI.office, kind: 'office', tier: 2, roofUp: true });
  for (const [x, z, t] of [[cx, cz, 2], [cx - 22, cz - 16, 2], [cx + 18, cz - 22, 1], [cx + 30, cz + 32, 1]]) isleCrate(x, z, 0, t, 0);
  isleStation(cx + 2, cz + 6, 0);
  ISLE.pylonFrom = [cx - 44, cz - 6];
}
function isleCoolingTower(x, z) {
  const pts = []; for (let k = 0; k <= 16; k++) { const t = k/16, y = 4 + t*32, r = 10 + 5.2*Math.pow(Math.abs(t - .7)/.7, 1.6)*(t < .7 ? 1 : .55); pts.push(new THREE.Vector2(r, y)); }
  const g = new THREE.LatheGeometry(pts, 40);
  const outer = new THREE.Mesh(g, MI.cool); outer.position.set(x, 0, z); outer.castShadow = true; outer.receiveShadow = true; scene.add(outer); statics.push(outer);
  const inner = new THREE.Mesh(g.clone().scale(.97, 1, .97), MI.cool); inner.material = MI.cool.clone(); inner.material.side = THREE.BackSide; inner.position.set(x, 0, z); scene.add(inner); statics.push(inner);
  // legs around the base (walk in between them), the shell above
  for (let k = 0; k < 20; k++) { const a = k/20*Math.PI*2, r = 15; block(x + Math.cos(a)*r, 0, z + Math.sin(a)*r, .6, 4.1, .6, MI.cool, 'concrete', { tile: 1 }); }
  for (let k = 0; k < 28; k++) {
    const a = k/28*Math.PI*2, r0 = 13.4, ca = Math.cos(a), sa = Math.sin(a), L = 2*Math.PI*r0/28 + .4;
    const w = Math.abs(ca) > Math.abs(sa) ? 1.2 : L, d = Math.abs(ca) > Math.abs(sa) ? L : 1.2;
    solid(x + ca*r0, z + sa*r0, w, d, 30, 'concrete', false, 4.6, { noMantle: true });
  }
  block(x, 0, z, 6, 1.2, 6, MAT.concreteDark, 'concrete', { tile: 1, vaultOnly: true });
  for (let i = 0; i < 3; i++) isleSpot(x + rand(-7, 7), 0, z + rand(-7, 7), 2);
}
// pylons carrying power lines from the plant across the island toward the city
function islePylons(pts) {
  const wires = [];
  let prev = null;
  for (const [x, z] of pts) {
    const gy = isleH(x, z), g = new THREE.Group(); g.position.set(x, gy, z); scene.add(g);
    const dir = prev ? Math.atan2(x - prev[0], z - prev[1]) : 0; g.rotation.y = dir;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.25, 24, .25), MAT.metalDark); leg.position.set(sx*1.3, 12, sz*1.3); leg.rotation.set(-sz*.05, 0, sx*.05); g.add(leg); }
    for (let y = 3; y < 24; y += 3) for (const r of [0, 1]) { const br = new THREE.Mesh(new THREE.BoxGeometry(r ? .1 : 2.8 - y*.07, .1, r ? 2.8 - y*.07 : .1), MAT.metalDark); br.position.y = y; g.add(br); }
    for (const y of [18, 23]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(9, .3, .3), MAT.metalDark); arm.position.y = y; g.add(arm); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; statics.push(o); } });
    solid(x, z, 2.8, 2.8, 24, 'metal', true, gy);
    const c = Math.cos(dir), s = Math.sin(dir), att = [[-4.3, 18], [4.3, 18], [-4.3, 23], [4.3, 23]].map(([a, y]) => V(x + c*a, gy + y - .5, z - s*a));
    if (prev) for (let k = 0; k < 4; k++) {
      const A = prev[2][k], B = att[k], pts2 = [];
      for (let t = 0; t <= 12; t++) { const u = t/12; pts2.push(new THREE.Vector3(A.x + (B.x - A.x)*u, A.y + (B.y - A.y)*u - Math.sin(u*Math.PI)*3.2, A.z + (B.z - A.z)*u)); }
      wires.push(...pts2.slice(0, -1).flatMap((p, i) => [p, pts2[i + 1]]));
    }
    prev = [x, z, att];
  }
  const geo = new THREE.BufferGeometry().setFromPoints(wires), lines = new THREE.LineSegments(geo, MI.wire); lines.frustumCulled = false; scene.add(lines);
}
// ---- the Container Port: a straight quay, stacks of containers, ship-to-shore cranes, a ship alongside ----
function islePort(P, qz) {
  const cx = P.x, cz = P.z, x0 = cx - 70, x1 = cx + 66;
  isleHard(x0, cz - 72, x1, qz - 1);
  islePlane(x1 - x0, qz - (cz - 46) + 6, MI.quay, (x0 + x1)/2, .025, (cz - 46 + qz + 6)/2, 4);
  // container rows (lanes between them), some stacked two or three high
  let ci = 0;
  for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
    const x = x0 + 12 + col*16, z = cz - 36 + row*12;
    if ((row === 2 && col === 3) || Math.random() < .12) continue;
    const hgt = Math.random() < .35 ? 3 : Math.random() < .6 ? 2 : 1;
    for (let k = 0; k < hgt; k++) container(x, z, 12, 2.4, 2.6, ci++, k*2.6);
    if (Math.random() < .5) container(x, z + 3, 12, 2.4, 2.6, ci++);
    if (hgt > 1 && Math.random() < .5) { stairRun(x - 7.2, z, 'x', 1, .9, 0, 2.6, MAT.grate); }
  }
  // cranes on the quay edge
  for (const x of [cx - 40, cx, cx + 40]) isleSTSCrane(x, qz - 6);
  for (let x = x0 + 4; x < x1; x += 9) mesh(new THREE.CylinderGeometry(.25, .32, .6, 12), MAT.metalDark, x, .3, qz - 1.6);
  // warehouse, office, a gate
  isleRoom({ kind: 'warehouse', cx: cx - 52, cz: cz - 60, w: 30, d: 16, floors: 1, fh: 7, ext: MI.grey, trim: MAT.metalDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
    open: { s: [[0, GATE(6, 4.6), -6], [0, GATE(6, 4.6), 8]], n: [[0, DOOR, 0]], e: [[0, DOOR, 2]], w: [[0, 'win', 0]] } }, 1, 1);
  isleGenBuilding(cx + 50, cz - 58, 14, 10, 3, { front: ['s', 'w'], ext: MI.stucco[2], kind: 'office', tier: 1, roofUp: true });
  { block(cx + 14, 0, cz - 62, .6, 1.4, .6, MAT.yellow, 'metal', { tile: 1 }); mesh(new THREE.BoxGeometry(8, .2, .2), MAT.hazard, cx + 18, 1.2, cz - 62); }
  // the ship alongside
  isleShip(cx, qz + 14, Math.PI/2, 1.25);
  for (const [x, z, t] of [[cx - 30, cz - 8, 1], [cx + 30, cz + 6, 2], [cx, cz - 40, 1], [cx - 60, cz + 10, 1]]) isleCrate(x, z, 0, t, 1);
  isleStation(cx + 10, cz - 44, 0);
  for (let i = 0; i < 12; i++) isleSpot(x0 + rand(6, x1 - x0 - 6), 0, cz - 42 + rand(0, 4)*12, 1);
}
function isleSTSCrane(x, z) {
  const m = MAT.yellow, H = 26;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(x + sx*7, 0, z + sz*5, 1, H, 1, m, 'metal', { tile: 2 });
  for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(15, 1, 1), m, x, 8, z + sz*5);
  mesh(new THREE.BoxGeometry(2.2, 2, 58), m, x, H + 1, z + 14);
  mesh(new THREE.BoxGeometry(4, 3, 4), m, x, H - 1, z + 8);
  for (const sz of [-1, 1]) { const st = mesh(new THREE.BoxGeometry(.3, .3, 20), MAT.metalDark, x, H + 7, z + sz*7); st.rotation.x = sz*.55; }
  mesh(new THREE.BoxGeometry(1.2, 9, 1.2), m, x, H + 5, z - 2);
}
// ---- Fisher's Cove: cottages on a lane down to the water, a fish market, piers and boats ----
function isleVillage(P, qx) {
  const cx = P.x, cz = P.z;
  isleHard(qx + 2, cz - 40, cx + 36, cz + 40);
  isleRoad(cx + 36, cz, qx + 10, cz, 5, 0);
  const cols = [MI.white, MI.blue, MI.cream, MI.green, MI.red];
  for (const [x, z, f] of [[cx + 24, cz - 14, 1], [cx + 8, cz - 15, 1], [cx - 8, cz - 14, 1], [cx + 22, cz + 14, 0], [cx + 6, cz + 15, 0]]) isleCabin(x, z, !!f, cols[Math.floor(Math.random()*5)], 1);
  isleHouse(cx - 12, cz + 18, false, MI.white, 2, 1);
  // fish market by the water
  isleCanopy(qx + 14, cz, 12, 8, 3.6, MAT.rustWall);
  for (const [x, z] of [[qx + 12, cz - 2], [qx + 16, cz + 2]]) crateStack(x, z, 1.4, 1.4, 1.15);
  barrels(qx + 18, cz - 3, 2, 2, 1.2);
  // piers on posts out over the sea, rowing boats and a trawler
  for (const pz of [cz - 24, cz + 26]) {
    const L = 26;
    for (let k = 0; k < L; k += 1.2) mesh(new THREE.BoxGeometry(1.1, .12, 3), MI.plank, qx - k, .35, pz, scene, true);
    for (let k = 2; k < L; k += 4) for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(.14, .14, 3, 8), MI.log, qx - k, -.9, pz + s*1.4);
  }
  for (const [x, z, s] of [[qx - 14, cz - 19, .5], [qx - 20, cz + 31, .45]]) { const g = new THREE.Group(); g.position.set(x, -.65, z); g.rotation.y = Math.PI/2; scene.add(g); const hull = new THREE.Mesh(new THREE.BoxGeometry(5*s, 1.6*s, 16*s), MI.hull); hull.position.y = .5*s; g.add(hull); const cab = new THREE.Mesh(new THREE.BoxGeometry(3.6*s, 2.2*s, 4*s), MI.hull); cab.position.set(0, 2.3*s, -2*s); g.add(cab); g.traverse(o => { if (o.isMesh) { o.castShadow = true; statics.push(o); } }); }
  for (const [x, z, t] of [[cx, cz, 1], [qx + 20, cz + 6, 1], [cx + 30, cz + 2, 2]]) isleCrate(x, z, 0, t, 0);
  isleStation(cx + 30, cz - 4, 3);
  for (let i = 0; i < 6; i++) isleSpot(cx + rand(-20, 30), 0, cz + rand(-6, 6), 1);
}
// ---- Lighthouse Point ----
function isleLightPoint(P) {
  const x = P.x, z = P.z;
  isleHard(x - 18, z - 18, x + 18, z + 18);
  block(x, 0, z, 6.4, 1, 6.4, MAT.concreteDark, 'concrete', { tile: 1 });
  for (let k = 0; k < 7; k++) mesh(new THREE.CylinderGeometry(2.7 - k*.12, 2.8 - k*.12, 3.6, 20), k % 2 ? MI.red2 : MI.white2, x, 1 + 1.8 + k*3.6, z);
  solid(x, z, 5, 5, 27, 'concrete', false, 0, { noMantle: true });
  mesh(new THREE.CylinderGeometry(1.8, 1.8, 2.4, 14), MAT.glassDark, x, 27.4, z);
  mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.4, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 3) }), x, 27.4, z, scene, false);
  mesh(new THREE.ConeGeometry(2.2, 1.8, 14), MI.red2, x, 29.5, z);
  isleHouse(x + 12, z + 6, true, MI.white, 2, 1);
  isleCabin(x - 10, z + 10, false, MI.grey, 1);
  for (const [x2, z2] of [[x - 12, z - 8], [x + 4, z - 12], [x - 4, z + 14]]) isleCrate(x2, z2, 0, 1, 0);
}
// ---- the countryside: lone cabins, farmsteads and gas stations along the roads ----
function isleCountry() {
  const pads = [], free = (x, z, r) => isleIn(x, z) > ISLE_BEACH + r + 4 && !ISLE_POIS.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r + 18) && isleRoadDist(x, z) > r + 2 && !isleHardAt(x, z, r + 2) && pads.every(([a, b, c]) => Math.hypot(a - x, b - z) > c + r + 30);
  const cols = [MI.green, MI.red, MI.cream, MI.blue, MI.grey, MI.white];
  // farmsteads: a barn, a farmhouse, a silo, crop rows
  for (let tries = 0, n = 0; n < 5 && tries < 400; tries++) {
    const x = rand(-400, 400), z = rand(-400, 400); if (!free(x, z, 30)) continue;
    pads.push([x, z, 30]); n++;
    isleAt(0, isleLevel(x, z), 0, () => {
      isleRoom({ kind: 'warehouse', cx: x - 8, cz: z, w: 12, d: 14, floors: 1, fh: 6, ext: MI.red, trim: MAT.trim, floorMat: MI.plank, roof: 'pitched', roofH: 3.4,
        open: { n: [[0, GATE(4, 3.5), 0]], s: [[0, GATE(4, 3.5), 0]], e: [[0, DOOR, -3]], w: [[0, 'win', 2]] } }, 1, 1);
      isleHouse(x + 12, z + 4, Math.random() < .5, cols[n % cols.length], 2, 1);
      tank(x - 20, z + 10, 2.4, 9); isleHay(x + 2, z - 12, 1); isleHay(x - 2, z - 14, 0);
      fence('x', x - 26, x + 22, z - 22); fence('x', x - 26, x + 22, z + 22);
      isleHard(x - 28, z - 24, x + 24, z + 24);
      isleCrate(x - 8, z + 9, 0, 1, 1);
    });
  }
  // cabins in the woods and the fields
  for (let tries = 0, n = 0; n < 34 && tries < 3000; tries++) {
    const x = rand(-420, 420), z = rand(-420, 420); if (!free(x, z, 7)) continue;
    pads.push([x, z, 7]); n++;
    isleAt(0, isleLevel(x, z), 0, () => {
      const f = Math.random() < .5;
      if (n % 5 === 0) isleHouse(x, z, f, cols[n % cols.length], 2, 1); else isleCabin(x, z, f, cols[n % cols.length], 1);
      isleHard(x - 7, z - 6.5, x + 7, z + 6.5);
      isleCrate(x + (f ? -6.5 : 6.5), z + 1, 0, 1, 1);
    });
  }
  // gas stations
  for (const [x, z] of ISLE.gasAt || []) isleAt(0, isleLevel(x, z), 0, () => {
    isleCanopy(x, z, 12, 8, 4.4, MAT.carPaint[1]);
    for (const dx of [-3, 3]) block(x + dx, 0, z, .8, 1.5, .6, MAT.metal, 'metal', { tile: 1, vaultOnly: true });
    isleRoom({ kind: 'shop', cx: x, cz: z - 12, w: 10, d: 7, floors: 1, fh: 3.2, ext: MI.white, trim: MAT.carPaint[1], floorMat: MAT.walk, roof: 'flat', parapet: MAT.carPaint[1],
      open: { s: [[0, GATE(2.2, 2.5), 0], [0, 'win', -3], [0, 'win', 3]], n: [[0, DOOR, 2]], e: [[0, 'win', 0]], w: [[0, 'win', 0]] } }, 1, 1.5);
    islePlane(24, 18, MI.road, x, .03, z - 3, 6);
    isleHard(x - 13, z - 17, x + 13, z + 7);
    car(x - 3, z + 1.6, 'x', 3); isleCrate(x + 7, z - 6, 0, 1, 0); isleStation(x + 7, z + 3, 3);
  });
}
// ---- the whole island ----
function buildIsland() {
  isleMats(); isleMats2();
  // where things go: the harbor's quay on the straight east coast, every area at the height of its land
  const H = islePoi('harbor'); H.x = 114 + (ISLE_QUAYS[0].c - 147);
  for (const p of ISLE_POIS) p.y = isleLevel(p.x, p.z, p.coast);
  // the original areas, moved out from the middle and lifted onto their ground
  const legacy = [['town', 0, 0, isleTown], ['harbor', 114, 8, isleHarbor], ['fort', -78, -77, isleFort], ['farm', -80, 74, isleFarm], ['refinery', 80, -76, isleRefinery],
    ['radio', 0, -110, isleRadio], ['lumber', 16, 106, isleLumber], ['motel', -110, -4, isleMotel], ['site', 80, 78, isleSite]];
  for (const [id, ox, oz, fn] of legacy) { const p = islePoi(id); isleAt(p.x - ox, p.y, p.z - oz, fn); }
  // the new areas, built where they stand
  const at = (id, fn) => { const p = islePoi(id); isleAt(0, p.y, 0, () => fn(p)); };
  at('city', isleCity); at('suburb', isleSuburb); at('mall', isleMall); at('stadium', isleStadium); at('airfield', isleAirfield); at('power', islePower);
  at('port', p => islePort(p, ISLE_QUAYS[1].c)); at('village', p => isleVillage(p, -ISLE_QUAYS[2].c)); at('light', isleLightPoint);
  isleNetwork();
  isleCountry();
  isleGulag();
  isleTerrainBuild(); isleSplat();
  isleRoadsDrape();
  islePylons([[290, 250], [228, 252], [166, 246], [124, 200], [112, 140]]);
  isleForest();
  isleLand();
  isleHorizon();
  ISLE.pois = ISLE_POIS;
}
// the roads between the areas: main roads are asphalt, the back roads dirt
function isleNetwork() {
  const hx = islePoi('harbor').x - 114;
  const R = (pts, w = 7, asph = 1) => isleRoadPath(pts, w, asph);
  R([[104, 0], [200, 2], [300, 4], [94 + hx, 7]], 9);                          // the east road to the harbor
  R([[-104, 0], [-150, -18], [-192, -34]], 8);                                  // west to Old Town
  R([[0, -104], [0, -276], [0, -380]], 8);                                      // north past the airfield up Radio Hill
  R([[0, 104], [0, 230]], 8); R([[0, 230], [-40, 340]], 7); R([[0, 230], [122, 370]], 7);
  R([[104, 96], [152, 202]]);                                                   // to the mall
  R([[241, 202], [288, 262]]);                                                  // mall to the power plant
  R([[334, 218], [400, 130], [88 + hx, 46]], 6);                                // power plant to the harbor
  R([[178, -78], [104, -48]]);                                                  // Maple Heights to the city
  R([[310, -122], [318, -176]], 6);                                             // Maple Heights to the refinery
  R([[0, -160], [152, -230]], 6);                                               // to Skyline Site
  R([[-238, -80], [-262, -200], [-274, -285]]);                                 // Old Town to the fort
  R([[-284, -34], [-390, 53]]);                                                 // Old Town to the motel
  R([[-238, 12], [-200, 120], [-168, 160]]);                                    // Old Town to the stadium
  R([[-216, 196], [-290, 272]], 6);                                             // stadium to the farm
  R([[-288, 304], [-200, 360], [-130, 380]], 6);                                // farm to the port
  R([[0, -276], [-42, -276]]);                                                  // the airfield apron
  R([[-104, 48], [-140, 150]], 6);                                              // city to the stadium
  R([[314, -206], [300, -332]], 5, 0);                                          // refinery to the lighthouse
  R([[-308, -271], [-364, -176]], 5, 0);                                        // fort to the village
  R([[-394, 34], [-372, -120], [-364, -176]], 5, 0);                            // motel to the village
  R([[144, 384], [230, 340], [290, 300]], 5, 0);                                // lumber mill to the power plant
  R([[-14, -396], [-150, -372], [-280, -310]], 5, 0);                           // over the mountains from Radio Hill to the fort
  ISLE.gasAt = [[160, -22], [-150, -44], [24, 182]];
}
// =====================================================================
// Terrain: rolling hills between the towns. Every town, road and building pad stays perfectly level (so the
// buildings sit right and play the same); the hills rise from them no steeper than you can walk, and fade out
// toward the beaches. A 1 m height grid drives the ground mesh, the grass, physics, line of sight and bots.
// =====================================================================
const ISLE_T = { N: 1025, O: -512, h: null, e: null, max: 0, tex: null, splat: null, ao: { value: (() => { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; })() } };
// walking trails (painted on, they follow the ground)
const ISLE_TRAILS = [];
const _f32h = new Float32Array(1), _u32h = new Uint32Array(_f32h.buffer);
function isleHalf(v) { _f32h[0] = v; const x = _u32h[0], sign = (x >> 16) & 0x8000, e = ((x >> 23) & 0xff) - 112; if (e <= 0) return sign; if (e >= 31) return sign | 0x7c00; return sign | (e << 10) | ((x & 0x7fffff) >> 13); }
function isleTerrainBuild() {
  const { N, O } = ISLE_T, NN = N*N, h = new Float32Array(NN), fix = new Uint8Array(NN), F = new Float32Array(NN), E = new Float32Array(NN);
  // how far inside the coast every metre of the map is (used everywhere below and by the grass and the forest)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) E[j*N + i] = isleIn(O + i, O + j);
  ISLE_T.e = E;
  // 1) what has to stay level, and at what height: towns, building pads, buy stations; the beach at sea level
  const mark = (x, z, y) => { const i = Math.round(x - O), j = Math.round(z - O); if (i >= 0 && j >= 0 && i < N && j < N) { fix[j*N + i] = 1; F[j*N + i] = y; } };
  for (const p of ISLE_POIS) { const r = p.r + 3; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i*i + j*j <= r*r) mark(p.x + i, p.z + j, p.y); }
  for (const [a0, b0, a1, b1, y] of ISLE.hard) for (let z = Math.floor(b0 - 3); z <= b1 + 3; z++) for (let x = Math.floor(a0 - 3); x <= a1 + 3; x++) mark(x, z, y || 0);
  for (const s of ISLE.stations) for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) mark(s.kx + x, s.kz + z, s.ky || 0);
  for (let k = 0; k < NN; k++) if (E[k] < ISLE_BEACH + 2) { fix[k] = 1; F[k] = 0; }
  // 2) the natural land everywhere else
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j*N + i; h[k] = fix[k] ? F[k] : isleNat(O + i, O + j, E[k]); }
  // 3) no slope steeper than ~17°: bounds spreading out from the level ground, then a limiter both ways
  const s1 = .3, s2 = .3*Math.SQRT2, U = new Float32Array(NN), L = new Float32Array(NN);
  for (let k = 0; k < NN; k++) { U[k] = fix[k] ? F[k] : 1e4; L[k] = fix[k] ? F[k] : -1e4; }
  for (let rep = 0; rep < 2; rep++) {
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const k = j*N + i; U[k] = Math.min(U[k], U[k - 1] + s1, U[k - N] + s1, U[k - N - 1] + s2, U[k - N + 1] + s2); L[k] = Math.max(L[k], L[k - 1] - s1, L[k - N] - s1, L[k - N - 1] - s2, L[k - N + 1] - s2); }
    for (let j = N - 2; j > 0; j--) for (let i = N - 2; i > 0; i--) { const k = j*N + i; U[k] = Math.min(U[k], U[k + 1] + s1, U[k + N] + s1, U[k + N + 1] + s2, U[k + N - 1] + s2); L[k] = Math.max(L[k], L[k + 1] - s1, L[k + N] - s1, L[k + N + 1] - s2, L[k + N - 1] - s2); }
  }
  for (let k = 0; k < NN; k++) if (!fix[k]) h[k] = Math.min(Math.max(h[k], L[k]), U[k]);
  for (let rep = 0; rep < 2; rep++) {
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const k = j*N + i; if (fix[k]) continue; const lo = Math.max(h[k - 1], h[k - N]) - s1, hi = Math.min(h[k - 1], h[k - N]) + s1; h[k] = Math.min(Math.max(h[k], lo), hi); }
    for (let j = N - 2; j > 0; j--) for (let i = N - 2; i > 0; i--) { const k = j*N + i; if (fix[k]) continue; const lo = Math.max(h[k + 1], h[k + N]) - s1, hi = Math.min(h[k + 1], h[k + N]) + s1; h[k] = Math.min(Math.max(h[k], lo), hi); }
  }
  // 4) soften the creases, keep the level ground level
  const t = new Float32Array(NN);
  for (let rep = 0; rep < 2; rep++) {
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const k = j*N + i; t[k] = (h[k]*4 + h[k - 1] + h[k + 1] + h[k - N] + h[k + N])/8; }
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const k = j*N + i; if (!fix[k]) h[k] = t[k]; }
  }
  let mx = 0; for (let k = 0; k < NN; k++) mx = Math.max(mx, h[k]);
  ISLE_T.h = h; ISLE_T.max = mx + .1;
  // for the GPU: height (with the sea floor dropping away off the beach) and distance inside the coast, as half floats
  const g = new Uint16Array(NN*4);   // (three r128 has no two-channel half-float textures: RGBA, two spare)
  for (let k = 0; k < NN; k++) { const e = E[k]; g[k*4] = isleHalf(e >= 0 ? h[k] : Math.max(-8, e*1.1 - .3)); g[k*4 + 1] = isleHalf(clamp(e, -60, 60)); }
  const tex = new THREE.DataTexture(g, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
  ISLE_T.tex = tex;
}
// ground height anywhere on the island (bilinear from the grid; 0 off the grid)
function isleH(x, z) {
  const h = ISLE_T.h; if (!h) return 0;
  const fx = x - ISLE_T.O, fz = z - ISLE_T.O, N = ISLE_T.N;
  if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return 0;
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j*N + i;
  return (h[k]*(1 - u) + h[k + 1]*u)*(1 - v) + (h[k + N]*(1 - u) + h[k + N + 1]*u)*v;
}
// distance inside the coast from the cached grid (fast; exact enough for placing things)
function isleInF(x, z) {
  const E = ISLE_T.e; if (!E) return isleIn(x, z);
  const i = Math.round(x - ISLE_T.O), j = Math.round(z - ISLE_T.O), N = ISLE_T.N;
  return i < 0 || j < 0 || i >= N || j >= N ? -99 : E[j*N + i];
}
function isleNormal(x, z, out) { const e = .5, dx = isleH(x + e, z) - isleH(x - e, z), dz = isleH(x, z + e) - isleH(x, z - e); return out.set(-dx, 2*e, -dz).normalize(); }
// does the segment a→b pass under the ground? (hills block sight and bullets)
function isleBlocks(ax, ay, az, bx, by, bz) {
  if (!ISLE_T.h || (ay > ISLE_T.max && by > ISLE_T.max)) return false;
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d/1.5);
  for (let s = 1; s < n; s++) { const k = s/n, y = ay + (by - ay)*k; if (y < ISLE_T.max && y < isleH(ax + (bx - ax)*k, az + (bz - az)*k) - .05) return true; }
  return false;
}
// first point where a ray dips under the ground (Infinity if it doesn't within `far`)
function isleRay(o, d, far) {
  if (!ISLE_T.h) return Infinity;
  if (d.y >= 0 && o.y > ISLE_T.max) return Infinity;
  let t0 = 0; const step = 1;
  if (o.y > ISLE_T.max && d.y < 0) t0 = (o.y - ISLE_T.max)/-d.y;   // skip straight down to hill height
  let prev = t0;
  for (let t = t0; t <= far; t += step) {
    const x = o.x + d.x*t, y = o.y + d.y*t, z = o.z + d.z*t;
    if (y < isleH(x, z)) {
      let a = prev, b = t;
      for (let k = 0; k < 6; k++) { const m = (a + b)/2; if (o.y + d.y*m < isleH(o.x + d.x*m, o.z + d.z*m)) b = m; else a = m; }
      return b;
    }
    if (y > ISLE_T.max && d.y >= 0) return Infinity;
    prev = t;
  }
  return Infinity;
}
// painted ground: dry grass, dirt (trails, slopes, around buildings), rock (steep bits), from a splat map (1 px per metre)
function isleSplat() {
  const S = 1024, k = S/(ISLE_T.N - 1), O = ISLE_T.O, data = new Uint8Array(S*S*4), dirt = new Float32Array(S*S), h = ISLE_T.h, N = ISLE_T.N;
  const px = x => (x - O)*k;
  for (const p of ISLE_TRAILS) for (let q = 0; q < p.length - 1; q++) {
    const [x0, z0] = p[q], [x1, z1] = p[q + 1], dx = x1 - x0, dz = z1 - z0, L2 = dx*dx + dz*dz;
    for (let j = Math.max(0, Math.floor(px(Math.min(z0, z1) - 4))); j <= Math.min(S - 1, px(Math.max(z0, z1) + 4)); j++)
      for (let i = Math.max(0, Math.floor(px(Math.min(x0, x1) - 4))); i <= Math.min(S - 1, px(Math.max(x0, x1) + 4)); i++) {
        const x = i/k + O, z = j/k + O, t = clamp(((x - x0)*dx + (z - z0)*dz)/L2, 0, 1), d = Math.hypot(x - x0 - dx*t, z - z0 - dz*t) + vnoise(x*.35, z*.35)*1.2;
        dirt[j*S + i] = Math.max(dirt[j*S + i], 1 - smooth(d, .6, 1.7));
      }
  }
  for (const [a0, b0, a1, b1] of ISLE.hard) {
    for (let j = Math.max(0, Math.floor(px(b0 - 3))); j <= Math.min(S - 1, px(b1 + 3)); j++) for (let i = Math.max(0, Math.floor(px(a0 - 3))); i <= Math.min(S - 1, px(a1 + 3)); i++) {
      const x = i/k + O, z = j/k + O, out = Math.max(a0 - x, x - a1, b0 - z, z - b1);
      if (out > -.5) dirt[j*S + i] = Math.max(dirt[j*S + i], .5*(1 - smooth(out, 0, 3))*vnoise(x*.4, z*.4)*1.6);
    }
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = i/k + O, z = j/k + O, o = (j*S + i)*4;
    const gi = clamp(Math.round(x - O), 1, N - 2), gj = clamp(Math.round(z - O), 1, N - 2), g = gj*N + gi;
    const slope = Math.hypot(h[g + 1] - h[g - 1], h[g + N] - h[g - N])/2, hh = h[g];
    const dry = clamp(smooth(vnoise(x*.016 + 5, z*.016 - 2), .45, .75) + hh/80, 0, 1);
    const d = Math.max(dirt[j*S + i], smooth(slope, .24, .31)*.3*vnoise(x*.2 + 1, z*.2));
    // bare rock only in patches on the steep upper slopes and the summits
    const rock = smooth(slope, .27, .31)*smooth(vnoise(x*.05 + 4, z*.05), .55, .72)*smooth(hh, 8, 18)*.85 + smooth(hh, 36, 50)*smooth(vnoise(x*.09, z*.09 + 3), .4, .6)*.5;
    data[o] = dry*255; data[o + 1] = d*255; data[o + 2] = clamp(rock, 0, 1)*255; data[o + 3] = vnoise(x*.008 + 9, z*.008 + 4)*255;
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  ISLE_T.splat = tex;
}
const _isleN = new THREE.Vector3();
// a rock texture for slopes and boulders
function isleRockTex() {
  return mk(256, 0, (g, s) => {
    const img = g.createImageData(s, s), d = img.data;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const x = i/s*8, y = j/s*8, n = vnoise(x, y)*.5 + vnoise(x*2.3, y*2.3)*.3 + vnoise(x*6, y*6)*.2;
      const cr = Math.abs(vnoise(x*1.3 + 7, y*1.3) - .5) < .02 ? .55 : 1, v = (.42 + n*.45)*cr*255, o = (j*s + i)*4;
      d[o] = v*1.02; d[o + 1] = v; d[o + 2] = v*.94; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
// The land: nested square grids around the camera (1 m cells near you, 2, 4 and 8 m further out), lifted in the
// vertex shader from the height texture and blended into each other so there are no seams. Normals come from the
// height texture per pixel, so even the far hills keep their shape in the light. Painted from the splat map.
function isleLand() {
  const N = ISLE_T.N, O = ISLE_T.O, rockC = isleRockTex();
  const mat = stdMat(C.grass, 1, { roughness: .95, bumpScale: .04, normal: 1.1, rough: [1, -.1] });
  const sandTex = T_(C.sand), rockTex = T_(rockC), dirtTex = T_(C.sand);
  function T_(c) { const t = T(c, 1); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
  const G = 256, LV = 4, morph = [[80, 116], [170, 244], [380, 500], [1e5, 1e5]];
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tH: { value: ISLE_T.tex }, tSplat: { value: ISLE_T.splat }, tSand: { value: sandTex }, tRock: { value: rockTex }, tDirt: { value: dirtTex }, tAO: ISLE_T.ao });
    sh.vertexShader = `uniform sampler2D tH; varying vec3 vWp;
      vec2 hAt(vec2 p) { return texture2D(tH, (p - ${O.toFixed(1)} + .5) / ${N.toFixed(1)}).rg; }
` + sh.vertexShader
      .replace('#include <uv_vertex>', `
        float cell = modelMatrix[0][0];
        vec2 gc = position.xz, ctr = vec2(modelMatrix[3][0], modelMatrix[3][2]);
        vec2 wp0 = ctr + gc * cell;
        float cd = max(abs(wp0.x - cameraPosition.x), abs(wp0.y - cameraPosition.z));
        vec2 mr = cell < 1.5 ? vec2(${morph[0]}) : cell < 3. ? vec2(${morph[1]}) : cell < 6. ? vec2(${morph[2]}) : vec2(1e5, 2e5);
        float mk = smoothstep(mr.x, mr.y, cd);
        gc -= fract(gc * .5) * 2. * mk;
        vec2 wxz = ctr + gc * cell;
        vec3 wPos = vec3(wxz.x, hAt(wxz).r, wxz.y);
        vWp = wPos;
        #ifdef USE_UV
          vUv = (uvTransform * vec3(wxz / 5., 1.)).xy;
        #endif`)
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(wPos, 1.); gl_Position = projectionMatrix * mvPosition;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(wPos, 1.);');
    sh.fragmentShader = `uniform sampler2D tH, tSplat, tSand, tRock, tDirt, tAO; varying vec3 vWp;
      vec2 hAt(vec2 p) { return texture2D(tH, (p - ${O.toFixed(1)} + .5) / ${N.toFixed(1)}).rg; }
` + sh.fragmentShader
      .replace('#include <normal_fragment_begin>', `
        vec3 nW = normalize(vec3(hAt(vWp.xz - vec2(1., 0.)).r - hAt(vWp.xz + vec2(1., 0.)).r, 2., hAt(vWp.xz - vec2(0., 1.)).r - hAt(vWp.xz + vec2(0., 1.)).r));
        float faceDirection = gl_FrontFacing ? 1. : -1.;
        vec3 normal = normalize((viewMatrix * vec4(nW, 0.)).xyz);
        vec3 geometryNormal = normal;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec2 tuv = (vWp.xz - ${O.toFixed(1)}) / ${(N - 1).toFixed(1)};
      vec4 sp = texture2D(tSplat, tuv);
      float coast = hAt(vWp.xz).g, sandK = 1. - clamp((coast - ${(ISLE_BEACH - 2.5).toFixed(1)}) / 4., 0., 1.);
      vec3 g = diffuseColor.rgb;
      vec3 dry = g * vec3(1.32, 1.08, .55) + vec3(.03, .02, 0.);
      vec3 dirt = sRGBToLinear(texture2D(tDirt, vWp.xz * .21)).rgb * vec3(.66, .5, .36);
      vec3 rock = sRGBToLinear(texture2D(tRock, vWp.xz * .11)).rgb * vec3(.46, .42, .37);
      vec3 sand = sRGBToLinear(texture2D(tSand, vWp.xz * .17)).rgb * vec3(1.08, 1., .9);
      vec3 c = mix(g, dry, sp.r * .85);
      c *= .84 + .3 * sp.a;                                  // big soft patches so the grass never looks tiled
      c = mix(c, dirt, sp.g);
      c = mix(c, rock, sp.b);
      c = mix(c, sand * (coast < 0. ? .8 : 1.), smoothstep(0., 1., sandK));
      c *= 1. - texture2D(tAO, tuv).a * .75;                  // contact shadows around buildings and props
      diffuseColor.rgb = c;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, .8, sp.b);');
  };
  mat.customProgramCacheKey = () => 'isleClip';
  const meshes = [];
  for (let L = 0; L < LV; L++) {
    // a (G+1)² grid of vertices in cell units; levels past the first leave out the middle (the finer level is there)
    const pos = new Float32Array((G + 1)*(G + 1)*3), idx = [];
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const k = (j*(G + 1) + i)*3; pos[k] = i - G/2; pos[k + 1] = 0; pos[k + 2] = j - G/2; }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      if (L > 0 && i >= G/4 && i < G*3/4 && j >= G/4 && j < G*3/4) continue;
      const a = j*(G + 1) + i, b = a + 1, c = a + G + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((G + 1)*(G + 1)*3).fill(0).map((v, i) => i % 3 === 1 ? 1 : 0), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((G + 1)*(G + 1)*2), 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat), cell = 1 << L;
    m.scale.set(cell, 1, cell); m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false; m.renderOrder = 1;
    m.onBeforeRender = (r, s, cam) => { const S = 8; m.position.set(Math.round(cam.position.x/S)*S, 0, Math.round(cam.position.z/S)*S); m.updateMatrixWorld(); };
    scene.add(m); meshes.push(m);
  }
  ISLE_T.land = meshes;
}
// =====================================================================
// Vegetation: a small library of hand-shaped trees (smooth clumped canopies, layered pines, birches), bushes
// and boulders, each built once and instanced hundreds of times (a handful of draw calls for the whole island).
// Colour lives in the vertices (darker underneath and inside the canopy), with a per-tree tint on top.
// =====================================================================
const n3 = (x, y, z) => (vnoise(x + z*.71, y - z*.37) + vnoise(y*1.13 + x*.29, z + 5.3))*.5;
// merge geometries that carry vertex colours
function isleMerge(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv*3), nor = new Float32Array(nv*3), col = new Float32Array(nv*3), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo*3); nor.set(g.attributes.normal.array, vo*3);
    if (g.attributes.color) col.set(g.attributes.color.array, vo*3); else col.fill(1, vo*3, (vo + c)*3);
    if (g.index) for (const i of g.index.array) idx[io++] = i + vo; else for (let i = 0; i < c; i++) idx[io++] = vo + i;
    vo += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere();
  return out;
}
// paint vertex colours: f(x, y, z, nx, ny, nz) -> [r, g, b] (linear)
function islePaint(g, f) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count*3);
  for (let i = 0; i < p.count; i++) { const v = f(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); c[i*3] = v[0]; c[i*3 + 1] = v[1]; c[i*3 + 2] = v[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const isleLin = h => { const c = new THREE.Color(h).convertSRGBToLinear(); return [c.r, c.g, c.b]; };
// a lumpy, smooth leaf clump
function isleClump(cx, cy, cz, r, seed, amp = .2, lo = false) {
  const g = lo ? new THREE.SphereGeometry(1, 6, 4) : new THREE.SphereGeometry(1, 13, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = 1 + (n3(x*1.7 + seed, y*1.7, z*1.7) - .5)*2*amp + (n3(x*4 + seed, y*4, z*4) - .5)*amp*(lo ? .5 : .9) + (lo ? 0 : (n3(x*9 + seed, y*9, z*9) - .5)*amp*.35);
    p.setXYZ(i, cx + x*r*d, cy + y*r*d*.86, cz + z*r*d);
  }
  g.computeVertexNormals();
  return g;
}
function isleTrunk(h, r0, r1, bend, seed, lo = false) {
  const g = lo ? new THREE.CylinderGeometry(r1, r0, h, 5, 1, true) : new THREE.CylinderGeometry(r1, r0, h, 8, 4, true); g.translate(0, h/2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = y/h, flare = 1 + Math.max(0, .25 - k)*1.6; p.setXYZ(i, p.getX(i)*flare + Math.sin(k*2.4 + seed)*bend*k, y, p.getZ(i)*flare + Math.cos(k*1.7 + seed)*bend*k*.6); }
  g.computeVertexNormals();
  return g;
}
function isleBranch(x0, y0, z0, x1, y1, z1, r) {
  const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0), g = new THREE.CylinderGeometry(r*.55, r, L, 5, 1, true);
  g.translate(0, L/2, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize())));
  g.translate(x0, y0, z0); return g;
}
// ---- foliage textures: leaf clusters (four variations in a 2x2 atlas, solid in the middle) and pine needles ----
const ISLE_FOL = {};
function isleFoliageTex() {
  if (ISLE_FOL.leaf) return ISLE_FOL;
  const leaf = mk(512, 512, (g, W) => {
    g.clearRect(0, 0, W, W);
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2)*256, oy = (cell >> 1)*256, cx = ox + 128, cy = oy + 128;
      g.fillStyle = 'rgb(150,165,120)'; g.beginPath(); g.arc(cx, cy, 52, 0, 7); g.fill();   // the solid heart of the cluster
      for (let k = 0; k < 1300; k++) {
        const a = Math.random()*6.283, r = Math.pow(Math.random(), .62)*112, x = cx + Math.cos(a)*r, y = cy + Math.sin(a)*r;
        const L = 4 + Math.random()*6, Wd = L*(.4 + Math.random()*.2), v = 160 + Math.random()*95, y2 = .85 + Math.random()*.25;
        g.save(); g.translate(x, y); g.rotate(a + (Math.random() - .5)*1.6);
        g.fillStyle = `rgb(${Math.round(v*.86)},${Math.round(v*y2)},${Math.round(v*.62)})`;
        g.beginPath(); g.ellipse(0, 0, L, Wd, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(40,60,20,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L*.8, 0); g.lineTo(L*.8, 0); g.stroke();
        g.restore();
      }
    }
  });
  const needle = mk(256, 256, (g, W) => {
    g.clearRect(0, 0, W, W);
    g.fillStyle = 'rgb(120,140,100)'; g.fillRect(0, 0, W, W*.62);                                  // the dense upper part of each tier
    for (let k = 0; k < 2600; k++) {
      const x = Math.random()*W, y = Math.random()*W*.97, len = 8 + Math.random()*16, a = Math.PI/2 + (Math.random() - .5)*.9;
      const v = 140 + Math.random()*100;
      g.strokeStyle = `rgb(${Math.round(v*.78)},${Math.round(v*.95)},${Math.round(v*.7)})`; g.lineWidth = 1 + Math.random();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a)*len, y + Math.sin(a)*len); g.stroke();
    }
  });
  const tex = (c, rep) => { const t = T(c, 1); t.wrapS = rep ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; return t; };
  ISLE_FOL.leaf = tex(leaf, false); ISLE_FOL.needle = tex(needle, true);
  return ISLE_FOL;
}
// a clump of leaf cards around a solid core: ragged and leafy at the edges, never see-through in the middle
function isleCards(cx, cy, cz, r, n, seed, lo = false) {
  const geos = [], c = V(cx, cy, cz), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let k = 0; k < n; k++) {
    const a = Math.random()*6.283, b = Math.acos(Math.random()*2 - 1), d = Math.pow(Math.random(), .5)*r*.55;
    const p = V(Math.sin(b)*Math.cos(a)*d, Math.cos(b)*d*.8, Math.sin(b)*Math.sin(a)*d).add(c), s = r*(.85 + Math.random()*.4)*(lo ? 1.35 : 1);
    const g = new THREE.PlaneGeometry(s*2, s*2);
    q.setFromEuler(e.set(Math.random()*6.283, Math.random()*6.283, Math.random()*6.283)); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)); g.translate(p.x, p.y, p.z);
    const cell = Math.floor(Math.random()*4), u0 = (cell % 2)*.5, v0 = (cell >> 1)*.5, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i)*.5, v0 + uv.getY(i)*.5);
    geos.push(g);
  }
  const core = new THREE.IcosahedronGeometry(1, lo ? 0 : 1); core.scale(r*.66, r*.58, r*.66); core.translate(cx, cy, cz);
  const cuv = new Float32Array(core.attributes.position.count*2).fill(.25); core.setAttribute('uv', new THREE.BufferAttribute(cuv, 2));
  geos.push(core);
  // normals round from the clump's middle (soft, volumetric light on the whole cluster)
  for (const g of geos) { const p = g.attributes.position, nr = g.attributes.normal; for (let i = 0; i < p.count; i++) { const v = V(p.getX(i) - cx, (p.getY(i) - cy)*1.2 + r*.35, p.getZ(i) - cz).normalize(); nr.setXYZ(i, v.x, v.y, v.z); } }
  return isleMergeUV(geos);
}
// merge geometries keeping their uv (isleMerge drops it)
function isleMergeUV(list) {
  const out = isleMerge(list), uv = new Float32Array(out.attributes.position.count*2); let o = 0;
  for (const g of list) { const n = g.attributes.position.count; if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n*2), o*2); o += n; }
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out;
}
// broadleaf: trunk with a few limbs and 5-7 clumps; leaf colour darker at the bottom and the core
function isleOak(seed, leaf, lo = false) {
  const H = 3.2 + (seed % 3)*.4, R = 2.1, base = isleLin(leaf), barkC = isleLin(0x5b4330);
  const wood = [isleTrunk(H, .3, .17, .25, seed, lo)];
  const clumps = [isleCards(0, H + R*.75, 0, R*(lo ? 1.15 : .95), lo ? 7 : 18, seed, lo)];
  const n = lo ? 3 : 5 + (seed % 3);
  for (let k = 0; k < n; k++) {
    const a = k/n*6.283 + seed, rr = R*(lo ? .7 : rand(.75, 1.05)), y = H + R*(lo ? .45 : rand(.15, .75)), x = Math.cos(a)*rr, z = Math.sin(a)*rr;
    clumps.push(isleCards(x, y, z, R*(lo ? .85 : rand(.55, .78)), lo ? 4 : 13, seed + k*3.1, lo));
    if (k % 2 === 0 && !lo) wood.push(isleBranch(0, H*.75, 0, x*.6, y - .3, z*.6, .1));
  }
  const top = H + R*1.75;
  const canopy = islePaint(isleMergeUV(clumps), (x, y, z, nx, ny, nz) => {
    const ao = clamp(.5 + .32*ny + (y - H)/(top - H)*.35 + Math.hypot(x, z)/R*.12, .35, 1.12), v = .92 + n3(x*.8 + seed, y*.8, z*.8)*.18;
    return [base[0]*ao*v, base[1]*ao*v, base[2]*ao*v*.95];
  });
  const trunk = islePaint(isleMerge(wood), (x, y) => { const k = .75 + .3*vnoise(y*3, x*5 + seed); return [barkC[0]*k, barkC[1]*k, barkC[2]*k]; });
  return { canopy, trunk, h: top };
}
// pine: tall trunk and 6-7 drooping, ragged tiers
function islePine(seed, leaf, lo = false) {
  const H = 8 + (seed % 3)*1.3, base = isleLin(leaf), barkC = isleLin(0x4e3826), tiers = [];
  const n = lo ? 3 : 6 + (seed % 2);
  for (let k = 0; k < n; k++) {
    const t = k/n, r = (2.5*(1 - t*.82) + .35)*(lo ? 1.08 : 1), h = 2.3*(1 - t*.35)*(lo ? 1.7 : 1), y0 = 1.9 + t*(H - 2.6);
    const g = lo ? new THREE.ConeGeometry(r, h, 7, 1, true) : new THREE.ConeGeometry(r, h, 18, 3, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rim = (h/2 - y)/h, a = Math.atan2(z, x);
      const jag = 1 + (vnoise(a*2.2 + k*7 + seed, k) - .5)*.35*rim + (Math.sin(a*6 + k) > .4 ? .12*rim : 0);
      p.setXYZ(i, x*jag, y0 + y + h/2 - rim*rim*.55, z*jag);   // tips droop
    }
    g.computeVertexNormals();
    { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*Math.max(3, Math.round(r*2.6)), .02 + uv.getY(i)*.96); }
    tiers.push(g);
    if (lo) continue;
    const under = new THREE.CircleGeometry(r*.8, 12); under.rotateX(Math.PI/2); under.translate(0, y0 - .2, 0);
    { const uv = under.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, .5, .9); }
    tiers.push(under);
  }
  const canopy = islePaint(isleMergeUV(tiers), (x, y, z, nx, ny) => {
    const ao = clamp(.55 + .35*ny + y/H*.3 + Math.hypot(x, z)*.08, .32, 1.1), v = .9 + vnoise(x*2 + seed, y*2 + z)*.2;
    return [base[0]*ao*v, base[1]*ao*v, base[2]*ao*v];
  });
  const trunk = islePaint(isleTrunk(H, .26, .08, .1, seed, lo), (x, y) => { const k = .7 + .3*vnoise(y*4, x*6 + seed); return [barkC[0]*k, barkC[1]*k, barkC[2]*k]; });
  return { canopy, trunk, h: H + 1.4 };
}
// birch: slim pale trunk with dark marks, light airy canopy
function isleBirch(seed, lo = false) {
  const H = 3.4, base = isleLin(0x86a843), clumps = [];
  for (let k = 0; k < (lo ? 3 : 6); k++) { const a = k*2.2 + seed; clumps.push(isleCards(Math.cos(a)*1.1, H + .3 + k*(lo ? .8 : .42), Math.sin(a)*1.1, lo ? 1.45 : rand(1.05, 1.4), lo ? 4 : 11, seed + k, lo)); }
  const canopy = islePaint(isleMergeUV(clumps), (x, y, z, nx, ny) => { const ao = clamp(.55 + .35*ny + (y - H)/3*.3, .4, 1.15); return [base[0]*ao, base[1]*ao, base[2]*ao]; });
  const trunk = islePaint(isleTrunk(H + 2, .15, .07, .18, seed, lo), (x, y, z) => { const mark = vnoise(y*7, Math.atan2(z, x)*2 + seed) > .6 ? .15 : 1; return [.52*mark, .5*mark, .45*mark]; });
  return { canopy, trunk, h: H + 3 };
}
function isleBushGeo(seed, lo = false) {
  const base = isleLin(0x4a7a2c), list = [];
  for (let k = 0; k < (lo ? 2 : 3); k++) { const a = k*2.1 + seed; list.push(isleCards(Math.cos(a)*.45, .55 + k*.12, Math.sin(a)*.45, lo ? .72 : rand(.55, .75), lo ? 3 : 9, seed + k, lo)); }
  return islePaint(isleMergeUV(list), (x, y, z, nx, ny) => { const ao = clamp(.45 + .4*ny + y*.25, .3, 1.1); return [base[0]*ao, base[1]*ao, base[2]*ao]; });
}
function isleBoulderGeo(seed) {
  const g = new THREE.SphereGeometry(1, 12, 9), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = 1 + (n3(x*1.3 + seed, y*1.3, z*1.3) - .5)*.55 + (n3(x*3.5 + seed, y*3.5, z*3.5) - .5)*.18;
    p.setXYZ(i, x*d*1.15, Math.max(-.25, y*d*.72), z*d);
  }
  g.computeVertexNormals();
  const stone = isleLin(0x8d8a82), moss = isleLin(0x5d7a34);
  return islePaint(g, (x, y, z, nx, ny) => { const m = clamp((ny - .55)*3, 0, 1)*vnoise(x*3 + seed, z*3); const v = .8 + n3(x*2, y*2, z*2)*.35; return [(stone[0]*(1 - m) + moss[0]*m)*v, (stone[1]*(1 - m) + moss[1]*m)*v, (stone[2]*(1 - m) + moss[2]*m)*v]; });
}
// the ground under trees: less grass, more leaf litter and shade (written into the splat map's dirt and macro channels)
function isleForestFloor(spots) {
  const tex = ISLE_T.splat, S = tex.image.width, d = tex.image.data, k = S/(ISLE_T.N - 1), O = ISLE_T.O;
  for (const [x, z, s] of spots) {
    const cx = (x - O)*k, cz = (z - O)*k, r = 4.5*s*k;
    for (let j = Math.max(0, Math.floor(cz - r)); j <= Math.min(S - 1, cz + r); j++) for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(S - 1, cx + r); i++) {
      const q = 1 - Math.hypot(i - cx, j - cz)/r; if (q <= 0) continue;
      const o = (j*S + i)*4; d[o + 1] = Math.max(d[o + 1], Math.min(255, q*140)); d[o] = Math.max(0, d[o] - q*60); d[o + 3] = Math.max(0, d[o + 3] - q*70);
    }
  }
  tex.needsUpdate = true;
}
// one kind of plant drawn two ways: the detailed model for the ones within R metres (at most cap of them), a light one beyond
function isleLodSet(mine, mats, cols, hiGeo, loGeo, mat, hiTrunk, loTrunk, trunkMat, R, capN) {
  const n = mine.length, cap = Math.min(n, capN);
  const mk2 = (geo, m, c, cast) => { if (!geo) return null; const im = new THREE.InstancedMesh(geo, m, c); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c*3), 3); im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; im.count = 0; scene.add(im); return im; };
  return { mine, mats, cols, R2: R*R, cap, hiC: mk2(hiGeo, mat, cap, true), hiT: mk2(hiTrunk, trunkMat, cap, true), loC: mk2(loGeo, mat, n, false), loT: mk2(loTrunk, trunkMat, n, false) };
}
// plant the island: forests on the hills and in big patches, groves and single trees in the fields, bushes and
// boulders between. Thousands of trees: the ones within ~150 m use the detailed models (and cast shadows), the
// rest a light version of the same tree; which is which is sorted again as you move.
function isleForest() {
  const F = isleFoliageTex();
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: 0, map: F.leaf, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide });
  const needleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: 0, map: F.needle, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide });
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 });
  const kinds = [
    ['oak', isleOak(1, 0x4c7a2a), isleOak(1, 0x4c7a2a, true)], ['oak', isleOak(2, 0x5d8030), isleOak(2, 0x5d8030, true)], ['oak', isleOak(3, 0x3f6b2a), isleOak(3, 0x3f6b2a, true)],
    ['pine', islePine(1, 0x2f5a2c), islePine(1, 0x2f5a2c, true)], ['pine', islePine(2, 0x3a6331), islePine(2, 0x3a6331, true)], ['pine', islePine(3, 0x284f27), islePine(3, 0x284f27, true)],
    ['birch', isleBirch(5), isleBirch(5, true)],
  ];
  const near = [], W = -ISLE_T.O - 8, poiNear = (x, z) => ISLE_POIS.some(p => Math.hypot(p.x - x, p.z - z) < p.r*.72);
  const spots = [], grid = new Map(), key = (x, z) => Math.floor(x/8)*4096 + Math.floor(z/8);
  const tooClose = (x, z, sep) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get(key(x + i*8, z + j*8)); if (l) for (const s of l) if ((s[0] - x)**2 + (s[1] - z)**2 < sep*sep) return true; } return false; };
  const ok = (x, z, sep) => isleInF(x, z) > ISLE_BEACH + 3 && !tooClose(x, z, sep) && isleRoadDist(x, z) > 3 && !isleHardAt(x, z, 3) && !poiNear(x, z) && !queryBoxes(x - 1, z - 1, x + 1, z + 1, near).length;
  // one try per 5 m cell: the chance of a tree depends on forest patches, the hills and the fields
  for (let gz = -W; gz < W; gz += 5) for (let gx = -W; gx < W; gx += 5) {
    const x = gx + rand(0, 5), z = gz + rand(0, 5), e = isleInF(x, z); if (e < ISLE_BEACH + 3) continue;
    const hh = isleH(x, z), patch = smooth(vnoise(x*.0055 + 3.1, z*.0055 - 7.7), .5, .62), hill = smooth(hh, 6, 16);
    const p = Math.max(patch*.62, hill*.5, .025) * (e < 40 ? .5 : 1);
    if (Math.random() > p || !ok(x, z, 3.4)) continue;
    const pineArea = vnoise(x*.012 + 3, z*.012) > .5 || hh > 20, kind = Math.random() < .1 ? 6 : pineArea ? 3 + Math.floor(Math.random()*3) : Math.floor(Math.random()*3);
    const s = [x, z, rand(.8, 1.3), kind]; spots.push(s);
    const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s);
  }
  const planted = (ISLE.plant || []).map(([x, z, sc]) => [x, z, sc, Math.floor(Math.random()*3), true]);
  const all = spots.concat(planted), o = new THREE.Object3D(), col = new THREE.Color(), lod = [];
  kinds.forEach(([type, hi, lo], ki) => {
    const mine = all.filter(s => s[3] === ki); if (!mine.length) return;
    const n = mine.length, mats = new Float32Array(n*16), cols = new Float32Array(n*3);
    mine.forEach(([x, z, s], i) => {
      const gy = isleH(x, z);
      o.position.set(x, gy - .1, z); o.rotation.set(0, rand(0, 6.28), 0); o.scale.set(s, s*rand(.9, 1.12), s); o.updateMatrix();
      o.matrix.toArray(mats, i*16); col.setRGB(rand(.86, 1.08), rand(.92, 1.08), rand(.8, 1.05)).toArray(cols, i*3);
      if (!mine[i][4]) { const r = (type === 'pine' ? .5 : type === 'birch' ? .32 : .6)*s; solid(x, z, r, r, 4*s, 'wood', false, gy - .2); }
    });
    lod.push(isleLodSet(mine, mats, cols, hi.canopy, lo.canopy, type === 'pine' ? needleMat : leafMat, hi.trunk, lo.trunk, barkMat, 110, 700));
  });
  ISLE.trees = spots;
  isleForestFloor(spots);
  // bushes: detailed within 70 m
  const bushG = [[isleBushGeo(1), isleBushGeo(1, true)], [isleBushGeo(4), isleBushGeo(4, true)]], bushes = [[], []];
  for (let tries = 0, n = 0; n < 2400 && tries < 40000; tries++) {
    const x = rand(-W, W), z = rand(-W, W);
    if (isleInF(x, z) < ISLE_BEACH + 2 || isleRoadDist(x, z) < 1.5 || isleHardAt(x, z, 1.5)) continue;
    const forest = isleH(x, z) > 6 || tooClose(x, z, 6);
    if (!forest && Math.random() > .25) continue;
    bushes[n % 2].push([x, z, rand(.7, 1.3)]); n++;
  }
  bushes.forEach((list, k) => {
    const mats = new Float32Array(list.length*16), cols = new Float32Array(list.length*3);
    list.forEach(([x, z, s], i) => { o.position.set(x, isleH(x, z) - .15, z); o.rotation.set(0, rand(0, 6), 0); o.scale.set(s*1.2, s, s*1.2); o.updateMatrix(); o.matrix.toArray(mats, i*16); col.setRGB(rand(.85, 1.1), rand(.9, 1.1), rand(.8, 1)).toArray(cols, i*3); });
    lod.push(isleLodSet(list, mats, cols, bushG[k][0], bushG[k][1], leafMat, null, null, null, 70, 600));
  });
  // sort them into near (detailed) and far (light) whenever the camera has moved a few metres
  let lx = 1e9, lz = 1e9;
  const sort = (cx, cz) => {
    for (const L of lod) {
      let h = 0, l = 0;
      const put = (im, k, i) => { if (!im) return; im.instanceMatrix.array.set(L.mats.subarray(i*16, i*16 + 16), k*16); im.instanceColor.array.set(L.cols.subarray(i*3, i*3 + 3), k*3); };
      for (let i = 0; i < L.mine.length; i++) {
        const s = L.mine[i], d2 = (s[0] - cx)**2 + (s[1] - cz)**2;
        if (d2 < L.R2 && h < L.cap) { put(L.hiC, h, i); put(L.hiT, h, i); h++; } else { put(L.loC, l, i); put(L.loT, l, i); l++; }
      }
      for (const [im, c] of [[L.hiC, h], [L.hiT, h], [L.loC, l], [L.loT, l]]) if (im) { im.count = c; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
    }
  };
  ISLE.treeLod = cam => { if ((cam.x - lx)**2 + (cam.z - lz)**2 < 64) return; lx = cam.x; lz = cam.z; sort(cam.x, cam.z); };
  if (lod.length) lod[0].loC.onBeforeRender = (r, s, cam) => { if (cam.isPerspectiveCamera && cam.far > 100) ISLE.treeLod(cam.position); };
  sort(0, 0);
  const rockG = [isleBoulderGeo(1), isleBoulderGeo(7), isleBoulderGeo(13)], rocks = [[], [], []];
  for (let tries = 0, n = 0; n < 520 && tries < 20000; tries++) {
    const x = rand(-W, W), z = rand(-W, W);
    if (isleInF(x, z) < ISLE_BEACH + 1 || isleRoadDist(x, z) < 3 || isleHardAt(x, z, 4) || tooClose(x, z, 3)) continue;
    const hh = isleH(x, z), big = hh > 4 && Math.random() < .45, s = big ? rand(1.8, 3.6) : rand(.6, 1.4);
    if (hh < 2 && Math.random() < .6) continue;
    rocks[n % 3].push([x, z, s]); n++;
    if (s > .9) solid(x, z, s*1.6, s*1.4, s*1.15, 'concrete', false, hh - .3);
  }
  rocks.forEach((list, k) => {
    const m = new THREE.InstancedMesh(rockG[k], stoneMat, list.length);
    list.forEach(([x, z, s], i) => { o.position.set(x, isleH(x, z) - .1*s, z); o.rotation.set(0, rand(0, 6), 0); o.scale.setScalar(s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); const v = rand(.34, .5); m.setColorAt(i, col.setRGB(v*1.04, v, v*.9)); });
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
  });
}
// =====================================================================
// The world beyond the island: mainland mountains on the horizon with a coastal city at their feet, smaller islands
// with forest and a lighthouse, wind turbines on the far hills and ships at anchor. Nothing to collide with; the far
// pieces fade into the sky's haze on their own (their own haze, not the game's fog, so they stay visible as shapes).
// =====================================================================
const ISLE_FAR = { turbines: [], haze: null };
function isleHazeMat(o) {
  const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, fog: false }, o || {}));
  const haze = ISLE_FAR.haze || (ISLE_FAR.haze = { value: lin(MAPDEF.fog[0]) });
  m.onBeforeCompile = sh => {
    sh.uniforms.hazeCol = haze;
    sh.vertexShader = 'varying vec3 vFarW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarW = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = 'uniform vec3 hazeCol;\nvarying vec3 vFarW;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `
      { float d = length(vFarW.xz - cameraPosition.xz), k = clamp((d - 500.) / 2600., 0., .58) + clamp(.1 - vFarW.y * .0004, 0., .1);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeCol, clamp(k, 0., .68)); }`);
  };
  m.customProgramCacheKey = () => 'isleHaze';
  return m;
}
// a polar band of terrain (mountains): from angle a0 to a1, from radius r0 outward `depth` metres
function isleRange(a0, a1, r0, depth, peak, seed) {
  const na = Math.ceil((a1 - a0)*r0/9), nr = 14, g = new THREE.BufferGeometry(), pos = [], col = [], idx = [];
  const forest = isleLin(0x3e5c2e), rock = isleLin(0x7a756c), snow = isleLin(0xf2f4f6), grass = isleLin(0x6d8a45);
  for (let i = 0; i <= na; i++) for (let j = 0; j <= nr; j++) {
    const a = a0 + (a1 - a0)*i/na, t = j/nr, r = r0 + depth*t;
    const edge = Math.min(1, Math.min(i, na - i)/(na*.12));                                          // ranges taper at their ends
    const ridge = 1 - Math.abs(vnoise(a*9 + seed, t*2.5)*2 - 1), big = vnoise(a*3.1 + seed*2, 1.7);
    const prof = Math.sin(Math.min(1, t*1.25)*Math.PI)*(t < .1 ? t*10 : 1);
    const y = -3 + prof*edge*(peak*(.35 + .65*big)*(.55 + .45*ridge) + vnoise(a*40 + seed, t*9)*6);
    pos.push(Math.cos(a)*r, y, Math.sin(a)*r);
    const hk = y/peak, c = hk < .22 ? (hk < .05 ? grass : forest) : hk < .62 ? rock : snow, v = .85 + vnoise(a*60, t*20)*.3;
    col.push(c[0]*v, c[1]*v, c[2]*v);
  }
  for (let i = 0; i < na; i++) for (let j = 0; j < nr; j++) { const a = i*(nr + 1) + j, b = a + nr + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, isleHazeMat()); m.frustumCulled = false; scene.add(m);
  return m;
}
// a coastal city at the foot of the mountains: blocks of towers with lit windows
function isleFarCity(a0, a1, r0) {
  const win = mk(64, 128, (g, w, h) => {
    g.fillStyle = '#6f7884'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 10) for (let x = 5; x < w; x += 11) { g.fillStyle = Math.random() < .25 ? '#e9dcb0' : Math.random() < .5 ? '#3a4652' : '#56626e'; g.fillRect(x, y, 7, 6); }
  });
  const tex = T(win, 1, 1); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const mat = isleHazeMat({ vertexColors: false, map: tex });
  const geos = [];
  for (let a = a0; a < a1; a += .009) {
    if (Math.random() < .25) continue;
    const r = r0 + rand(0, 70), w = rand(16, 36), d = rand(16, 36), tall = Math.random() < .15 ? rand(80, 150) : rand(20, 60) * (1 - Math.abs((a - (a0 + a1)/2)/(a1 - a0))*1.2);
    const g = new THREE.BoxGeometry(w, Math.max(8, tall), d), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*w/12, uv.getY(i)*tall/18);
    g.translate(Math.cos(a)*r, Math.max(8, tall)/2 - 1, Math.sin(a)*r); g.rotateY(0);
    geos.push(g);
  }
  const m = new THREE.Mesh(mergeGeos(geos), mat); m.frustumCulled = false; scene.add(m);
}
// a small offshore island with a pine forest
function isleIslet(cx, cz, R, seed, pines) {
  const n = 40, g = new THREE.CircleGeometry(R, n, 0, Math.PI*2); g.rotateX(-Math.PI/2);
  const geo = new THREE.PlaneGeometry(R*2.4, R*2.4, 30, 30); geo.rotateX(-Math.PI/2);
  const p = geo.attributes.position, col = [];
  const sand = isleLin(0xd8c79c), grass = isleLin(0x5e7f3a), rock = isleLin(0x837d72);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z)/R + (vnoise(x*.05 + seed, z*.05) - .5)*.5;
    const y = d < 1 ? (1 - d*d)*R*.35*(.6 + vnoise(x*.03 + seed, z*.03)*.8) : -6;
    p.setY(i, y); const c = y < 1.2 ? sand : y > R*.22 ? rock : grass; col.push(c[0], c[1], c[2]);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, isleHazeMat()); m.position.set(cx, -.6, cz); scene.add(m);
  if (pines) {
    const cone = new THREE.ConeGeometry(1, 1, 7), inst = new THREE.InstancedMesh(cone, isleHazeMat({ vertexColors: false, color: lin(0x2f5a2c) }), pines), o = new THREE.Object3D();
    let k = 0;
    for (let t = 0; t < pines*4 && k < pines; t++) {
      const a = rand(0, 6.283), r = Math.sqrt(Math.random())*R*.75, x = Math.cos(a)*r, z = Math.sin(a)*r, d = r/R;
      const y = (1 - d*d)*R*.35*(.6 + vnoise(x*.03 + seed, z*.03)*.8); if (y < 1.5) continue;
      const s = rand(2.2, 3.6); o.position.set(cx + x, y + s*1.5 - .6, cz + z); o.scale.set(s, s*3.4, s); o.updateMatrix(); inst.setMatrixAt(k++, o.matrix);
    }
    inst.count = k; inst.frustumCulled = false; scene.add(inst);
  }
  return m;
}
function isleLighthouse(x, z, y0) {
  const g = new THREE.Group(); g.position.set(x, y0, z); scene.add(g);
  const white = new THREE.MeshStandardMaterial({ color: lin(0xf0eee8), roughness: .6 }), red = new THREE.MeshStandardMaterial({ color: lin(0xb3322a), roughness: .6 });
  for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(2.2 - k*.22, 2.4 - k*.22, 4, 16), k % 2 ? red : white); c.position.y = 2 + k*4; g.add(c); }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 3) })); lamp.position.y = 21; g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.6, 12), red); cap.position.y = 22.8; g.add(cap);
}
function isleTurbine(x, z, y0, s) {
  const g = new THREE.Group(); g.position.set(x, y0, z); g.scale.setScalar(s); scene.add(g);
  const m = isleHazeMat({ vertexColors: false, color: lin(0xe8ecef) });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.6, 60, 10), m); tower.position.y = 30; g.add(tower);
  const hub = new THREE.Group(); hub.position.set(0, 61, 1.6); g.add(hub);
  hub.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 5), m));
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 26, .4), m); b.position.y = 13; const p = new THREE.Group(); p.rotation.z = k*2.094; p.add(b); hub.add(p); }
  hub.rotation.z = rand(0, 6); g.rotation.y = rand(-.4, .4);
  ISLE_FAR.turbines.push(hub);
}
function isleShip(x, z, rotY, s) {
  const g = new THREE.Group(); g.position.set(x, -.7, z); g.rotation.y = rotY; g.scale.setScalar(s); scene.add(g);
  const hull = new THREE.MeshStandardMaterial({ color: lin(0x26364a), roughness: .7, metalness: .2 }), deck = new THREE.MeshStandardMaterial({ color: lin(0x9a3a2a), roughness: .7 });
  const h = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 70), hull); h.position.y = 1.8; g.add(h);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 5, 3, 1, false, 0, Math.PI), hull); bow.rotation.y = Math.PI/2; bow.position.set(0, 1.8, 35); bow.scale.set(1, 1, .5); g.add(bow);
  const br = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 8), new THREE.MeshStandardMaterial({ color: lin(0xe9e6df), roughness: .6 })); br.position.set(0, 8.5, -28); g.add(br);
  for (let k = 0; k < 7; k++) for (let l = 0; l < 2; l++) { const c = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.6, 6), MAT.container[(k + l) % MAT.container.length]); c.position.set(l ? 3 : -3, 5.6 + ((k + l) % 3 === 0 ? 2.6 : 0), -16 + k*6.6); g.add(c); }
  { const dk = new THREE.Mesh(new THREE.BoxGeometry(14.2, .4, 70.2), deck); dk.position.y = 4.4; g.add(dk); }
}
function isleHorizon() {
  // mainland ranges to the north-west, north and east, with gaps of open sea between them
  isleRange(-2.95, -1.2, 1360, 440, 300, 1);
  isleRange(-1.05, -.2, 1440, 380, 220, 2);
  isleRange(.35, 1.55, 1400, 420, 270, 3);
  isleRange(2.2, 2.9, 1480, 300, 170, 4);
  isleFarCity(-2.55, -2.05, 1300);
  isleFarCity(.55, .8, 1340);
  // offshore islands (the lighthouse one is closest)
  isleIslet(-640, 560, 70, 3, 180); isleIslet(720, -560, 56, 5, 120); isleIslet(780, 640, 40, 7, 70); isleIslet(-800, -320, 50, 9, 90);
  isleLighthouse(-652, 580, 12);
  for (const [a, r, s] of [[-1.9, 1420, 1.7], [-1.75, 1450, 1.7], [-1.6, 1430, 1.7], [.9, 1440, 1.5], [1.05, 1460, 1.5]]) { const x = Math.cos(a)*r, z = Math.sin(a)*r; isleTurbine(x, z, 40, s); }
  isleShip(620, 300, .4, 1.3); isleShip(-420, -760, 2.1, 1.1); isleShip(880, -140, -.9, 1.2); isleShip(-260, 820, 1.2, 1);
}
// =====================================================================
// Building detail (Crestfall only): building() calls decorateBuilding(o) once its walls, floors and roof
// exist. Outside: a plinth, corner boards, floor bands, window headers and shutters, doors swung open, porch
// canopies, gutters and downspouts, chimneys, roof coping and rooftop units, shop awnings, balconies.
// Inside (o.furnish): ceilings, baseboards, ceiling lights and furniture that suits the building, kept clear
// of doors, stairs, walls and each other. Furniture you can vault has vault-only colliders, the rest is solid.
// =====================================================================
const DM = {};
function dmMats() {
  if (DM.ok) return;
  DM.ok = true;
  const std = (c, o = {}) => heightAO(new THREE.MeshStandardMaterial(Object.assign({ color: lin(c), roughness: .8, metalness: 0 }, o)));
  DM.plinth = std(0x6b6a66, { roughness: .95 }); DM.gutter = std(0xd9d7d0, { roughness: .5, metalness: .3 }); DM.metal = std(0x9aa0a6, { roughness: .45, metalness: .6 });
  DM.shutter = [std(0x2f4f3a), std(0x2a3a55), std(0x5a2b25), std(0x3a3a3a), std(0xe8e4dc)];
  DM.door = [std(0x6b4a30), std(0x2f3b4a), std(0x7a2a24), std(0x3d5a3a)];
  DM.ceil = std(0xf1efe9, { roughness: .95 }); DM.base = std(0x4a3d33); DM.light = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.6) });
  DM.fabric = [std(0x6d7d8c), std(0x8a5a44), std(0x4f6a4a), std(0x7a6f8f), std(0xa8957a)];
  DM.wood = std(0x8a6644, { roughness: .7 }); DM.woodDark = std(0x4f3a2a, { roughness: .7 }); DM.white = std(0xe9e7e2, { roughness: .6 }); DM.black = std(0x222326, { roughness: .5 });
  DM.steel = std(0x7d848c, { roughness: .4, metalness: .7 }); DM.olive = std(0x55603d, { roughness: .7 }); DM.cardboard = std(0xb08a5a, { roughness: .95 });
  DM.awning = ['#b03a2e', '#2f6690', '#2e7d4f', '#6c4a8a'].map(c => new THREE.MeshStandardMaterial({ map: T(mk(64, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#efe9dc' : c; g.fillRect(i*8, 0, 8, h); } })), roughness: .9, side: THREE.DoubleSide }));
  DM.screen = new THREE.MeshBasicMaterial({ color: new THREE.Color(.25, .5, 1.1) });
  DM.mattress = std(0xe6e2d8, { roughness: 1 }); DM.blanket = [std(0x3f5f8a), std(0x8a3f3f), std(0x5f7a4a)];
}
const dmBox = (w, h, d, mat, x, y, z, cast = true) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, scene, cast);
const dmHash = (x, z) => Math.abs(Math.floor(Math.sin(x*12.9898 + z*78.233)*43758.5453));
function decorateBuilding(o) {
  dmMats();
  const { cx, cz, w, d, floors = 1, fh = 3.1, t = .3, flip = false } = o, s = flip ? -1 : 1, X = lx => cx + s*lx, Z = lz => cz + s*lz, hw = w/2, hd = d/2, top = floors*fh;
  const hsh = dmHash(cx, cz), trim = o.trim || MAT.trim, pitched = o.roof === 'pitched', kind = o.kind || 'house', house = pitched && kind === 'house', near = [];
  // the four outside faces: [side, along axis, wall line, outward normal x, z, from, to] (from/to in local coords)
  const sides = [['n', 'x', Z(-hd), 0, -s, -hw, hw], ['s', 'x', Z(hd), 0, s, -hw, hw], ['w', 'z', X(-hw), -s, 0, -hd, hd], ['e', 'z', X(hw), s, 0, -hd, hd]];
  const ops = (side, f) => (o.open[side] || []).filter(q => q[0] === f).map(q => opening(q[1], q[2]));
  // world point `off` meters out from a wall at local position a along it
  const at = (ax, a, c, off, nx, nz) => ax === 'x' ? [X(a), c + nz*off] : [c + nx*off, Z(a)];
  const along = (ax, x, z) => ax === 'x' ? x : z, across = (ax, x, z) => ax === 'x' ? z : x;
  const box = (ax, x, z, y, L, h, T, mat) => axisBox(ax, along(ax, x, z), y, across(ax, x, z), L, h, T, mat, false);
  // plinth and floor bands
  for (const [, ax, c, nx, nz, a0, a1] of sides) {
    const [px, pz] = at(ax, (a0 + a1)/2, c, .04, nx, nz), L = a1 - a0 + .12;
    box(ax, px, pz, .2, L, .4, .12, DM.plinth);
    for (let f = 1; f < floors; f++) box(ax, px, pz, f*fh - .06, L, .14, .1, trim);
  }
  for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) dmBox(.18, top, .18, trim, X(lx), top/2, Z(lz), false);
  // windows and doors
  const shut = DM.shutter[hsh % DM.shutter.length], doorM = DM.door[hsh % DM.door.length];
  o._leaves = [];
  for (const [side, ax, c, nx, nz, a0, a1] of sides) for (let f = 0; f < floors; f++) {
    const list = ops(side, f), lo = Math.min(a0, a1), hi = Math.max(a0, a1), y0 = f*fh;
    const free = (a, half) => a - half > lo + .25 && a + half < hi - .25 && list.every(q => Math.abs(q.at - a) > q.w/2 + half + .05);
    for (const op of list) {
      const isDoor = op.bottom <= .01, oh = op.top - op.bottom;
      const [hx, hz] = at(ax, op.at, c, .05, nx, nz);
      if (op.w < 5) box(ax, hx, hz, y0 + op.top + .08, op.w + .3, .16, .12, trim);   // header
      if (!isDoor && house && op.w < 2) for (const sd of [-1, 1]) {   // shutters
        const a = op.at + sd*(op.w/2 + .27); if (!free(a, .23)) continue;
        const [sx, sz] = at(ax, a, c, .06, nx, nz);
        box(ax, sx, sz, y0 + op.bottom + oh/2, .46, oh, .05, shut);
      }
      if (isDoor && op.w < 2.5) {
        // the door itself, swung open flat against the inside wall when nothing is in the way
        const lw = op.w - .08, a = op.at - op.w/2 - lw/2;
        if (a - lw/2 > lo + .35 && list.every(q => q === op || Math.abs(q.at - a) > (q.w + lw)/2 + .05)) {
          const [dx, dz] = at(ax, a, c, -(t + .045), nx, nz), ex = ax === 'x' ? lw/2 : .06, ez = ax === 'x' ? .06 : lw/2;
          if (!queryBoxes(dx - ex, dz - ez, dx + ex, dz + ez, near).some(b => b.minY < y0 + 2 && b.maxY > y0 + .1 && b.maxX > dx - ex && b.minX < dx + ex && b.maxZ > dz - ez && b.minZ < dz + ez)) {
            box(ax, dx, dz, y0 + (op.top - .04)/2, lw, op.top - .04, .05, doorM);
            o._leaves.push([dx - ex - .5, dz - ez - .5, dx + ex + .5, dz + ez + .5, y0]);
          }
        }
        if (f === 0 && house) {   // a little canopy over the outside door
          const [px, pz] = at(ax, op.at, c, .55, nx, nz);
          box(ax, px, pz, op.top + .45, op.w + .9, .1, 1.1, trim);
          for (const sd of [-1, 1]) { const [bx, bz] = at(ax, op.at + sd*(op.w/2 + .3), c, .45, nx, nz); dmBox(.06, .5, .06, trim, bx, op.top + .2, bz, false); }
        }
      }
    }
  }
  // shop fronts: striped awnings over the big ground-floor openings, sloping down away from the wall
  if (kind === 'shop' || kind === 'diner') for (const [side, ax, c, nx, nz] of sides) for (const op of ops(side, 0)) if (op.w >= 1.3) {
    const [px, pz] = at(ax, op.at, c, .65, nx, nz);
    const m = mesh(new THREE.BoxGeometry(ax === 'x' ? op.w + .6 : 1.25, .05, ax === 'x' ? 1.25 : op.w + .6), DM.awning[hsh % 4], px, op.top + .5, pz, scene, false);
    if (ax === 'x') m.rotation.x = nz*.32; else m.rotation.z = -nx*.32;
  }
  if (pitched) {
    // gutters along the eaves (the roof slopes down toward ±x), downspouts at the corners, maybe a chimney
    const rh = o.roofH || 2.2;
    for (const sx of [-1, 1]) {
      const g = mesh(new THREE.BoxGeometry(.14, .12, d + .9), DM.gutter, cx + sx*(hw + .42), top + .02, cz, scene, false);
      for (const sz of [-1, 1]) {
        dmBox(.08, top, .08, DM.gutter, cx + sx*(hw + .08), top/2, cz + sz*(hd - .3), false);
        dmBox(.34, .07, .07, DM.gutter, cx + sx*(hw + .25), top - .02, cz + sz*(hd - .3), false);
      }
    }
    if (hsh % 3 !== 0 && kind === 'house') {
      const chx = cx + (hsh % 2 ? 1 : -1)*hw*.45, chz = cz + hd*.25, base = top + rh*.4;
      dmBox(.7, rh*.45 + 1.1, .7, MAT.brick, chx, base + (rh*.45 + 1.1)/2, chz, true);
      dmBox(.84, .12, .84, DM.plinth, chx, base + rh*.45 + 1.16, chz, false);
    }
  } else if (o.roof !== 'none') {
    // coping along the parapet and rooftop units to hide behind
    for (const [, ax, c, nx, nz, a0, a1] of sides) { const [px, pz] = at(ax, (a0 + a1)/2, c, -.12, nx, nz); box(ax, px, pz, top + .05 + .95, a1 - a0 + .1, .1, .42, DM.plinth); }
    if (o.roofGear !== false && w > 6 && d > 6) {
      const y = top + .05, n = Math.min(4, Math.floor(w*d/45));
      for (let k = 0, tries = 0; k < n && tries < 30; tries++) {
        const x = X(rand(-hw + 1.6, hw - 1.6)), z = Z(rand(-hd + 1.6, hd - 1.6));
        if (queryBoxes(x - 1, z - 1, x + 1, z + 1, near).some(b => b.maxY > y + .1 && b.minY < y + 1.6 && b.maxX > x - 1 && b.minX < x + 1 && b.maxZ > z - 1 && b.minZ < z + 1)) continue;
        if ((o.roofGaps || []).length || o.extStairs) { /* stay off the way up */
          let bad = false;
          for (const [sd, a] of (o.roofGaps || [])) { const [gx, gz] = sd === 'n' ? [X(a), Z(-hd)] : sd === 's' ? [X(a), Z(hd)] : sd === 'w' ? [X(-hw), Z(a)] : [X(hw), Z(a)]; if (Math.hypot(gx - x, gz - z) < 3.2) bad = true; }
          if (bad) continue;
        }
        if (k % 2 === 0) { block(x, y, z, 1.2, .9, 1, DM.metal, 'metal', { tile: 1 }); mesh(new THREE.CylinderGeometry(.34, .34, .05, 16), DM.black, x, y + .93, z, scene, false); }
        else { block(x, y, z, .6, 1.1, .6, DM.metal, 'metal', { tile: 1 }); mesh(new THREE.CylinderGeometry(.4, .4, .14, 12), DM.metal, x, y + 1.17, z); }
        k++;
      }
    }
  }
  if (o.balconies) balconies(o, sides, at);
  if (o.furnish) furnish(o);
}
// balconies outside some upper-floor windows: vault out of the window onto them
function balconies(o, sides, at) {
  const { floors = 1, fh = 3.1 } = o;
  for (const [side, ax, c, nx, nz] of sides) for (let f = 1; f < floors; f++) for (const q of (o.open[side] || []).filter(q => q[0] === f)) {
    const op = opening(q[1], q[2]); if (op.bottom < .5 || Math.round(q[2]*7 + f) % 2) continue;
    const y = f*fh, bw = op.w + 1, [bx, bz] = at(ax, op.at, c, .65, nx, nz), [rx, rz] = at(ax, op.at, c, 1.24, nx, nz);
    block(bx, y - .18, bz, ax === 'x' ? bw : 1.3, .18, ax === 'x' ? 1.3 : bw, MAT.concreteDark, 'concrete', { tile: 1 });
    const A = ax === 'x' ? rx : rz, C = ax === 'x' ? rz : rx;
    railing(ax, A - bw/2, A + bw/2, C, y);
    const other = ax === 'x' ? 'z' : 'x', w0 = ax === 'x' ? c : c, w1 = ax === 'x' ? rz : rx;
    for (const sd of [-1, 1]) railing(other, Math.min(w0, w1), Math.max(w0, w1), A + sd*(bw/2 - .04), y);
  }
}
// ---- furniture ----
// [width along the wall, depth into the room, height, build(x, y, z, rotY, k), collider: 'solid' | 'vault']
const FURN = {
  bed: [1.55, 2.05, .6, (x, y, z, r, k) => { const g = dmGroup(x, y, z, r); dmPart(g, 1.5, .3, 2.0, DM.woodDark, 0, .15, 0); dmPart(g, 1.4, .2, 1.9, DM.mattress, 0, .4, 0); dmPart(g, 1.42, .08, 1.3, DM.blanket[k % 3], 0, .53, .28); dmPart(g, 1.5, .9, .08, DM.woodDark, 0, .45, -1); dmPart(g, .5, .14, .3, DM.white, -.35, .56, -.75); dmPart(g, .5, .14, .3, DM.white, .35, .56, -.75); return g; }, 'vault'],
  sofa: [2.1, .95, .85, (x, y, z, r, k) => { const g = dmGroup(x, y, z, r), m = DM.fabric[k % 5]; dmPart(g, 2.1, .42, .9, m, 0, .21, 0); dmPart(g, 2.1, .5, .22, m, 0, .62, -.34); dmPart(g, .22, .3, .9, m, -.94, .52, 0); dmPart(g, .22, .3, .9, m, .94, .52, 0); return g; }, 'vault'],
  table: [1.6, 1.0, .76, (x, y, z, r) => { const g = dmGroup(x, y, z, r); dmPart(g, 1.6, .06, .9, DM.wood, 0, .74, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) dmPart(g, .06, .72, .06, DM.woodDark, sx*.72, .36, sz*.38); return g; }, 'vault'],
  kitchen: [2.6, .65, .92, (x, y, z, r) => { const g = dmGroup(x, y, z, r); dmPart(g, 2.6, .88, .6, DM.white, 0, .44, 0); dmPart(g, 2.64, .05, .64, DM.black, 0, .9, 0); dmPart(g, .5, .02, .4, DM.steel, -.6, .93, 0); dmPart(g, 2.6, .7, .35, DM.white, 0, 2.0, -.12); return g; }, 'vault'],
  fridge: [.8, .75, 1.85, (x, y, z, r) => { const g = dmGroup(x, y, z, r); dmPart(g, .8, 1.85, .72, DM.white, 0, .93, 0); dmPart(g, .04, .5, .03, DM.steel, .3, 1.2, .37); return g; }, 'solid'],
  shelf: [1.7, .45, 1.95, (x, y, z, r, k) => { const g = dmGroup(x, y, z, r); dmPart(g, 1.7, 1.95, .05, DM.woodDark, 0, .98, -.2); for (let i = 0; i < 4; i++) { dmPart(g, 1.7, .04, .42, DM.wood, 0, .1 + i*.6, 0); for (let j = 0; j < 4; j++) if ((i + j + k) % 3) dmPart(g, .3, .25 + ((i*j) % 3)*.05, .28, [DM.cardboard, DM.fabric[(i + j) % 5], DM.white][(i + j) % 3], -.6 + j*.4, .25 + i*.6, 0); } return g; }, 'solid'],
  desk: [1.5, .75, .76, (x, y, z, r) => { const g = dmGroup(x, y, z, r); dmPart(g, 1.5, .05, .72, DM.white, 0, .74, 0); dmPart(g, .05, .72, .7, DM.steel, -.7, .36, 0); dmPart(g, .4, .7, .65, DM.steel, .5, .36, 0); dmPart(g, .55, .35, .04, DM.black, 0, 1.0, -.22); dmPart(g, .5, .3, .01, DM.screen, 0, 1.0, -.199); return g; }, 'vault'],
  lockers: [1.6, .5, 1.9, (x, y, z, r) => { const g = dmGroup(x, y, z, r); dmPart(g, 1.6, 1.9, .5, DM.olive, 0, .95, 0); for (let i = 0; i < 4; i++) dmPart(g, .02, 1.7, .01, DM.black, -.6 + i*.4, .95, .255); return g; }, 'solid'],
  bunk: [1.0, 2.0, 1.7, (x, y, z, r, k) => { const g = dmGroup(x, y, z, r); for (const yy of [.35, 1.25]) { dmPart(g, .95, .12, 1.95, DM.steel, 0, yy, 0); dmPart(g, .9, .15, 1.9, DM.blanket[k % 3], 0, yy + .13, 0); } for (const sx of [-1, 1]) for (const sz of [-1, 1]) dmPart(g, .05, 1.7, .05, DM.steel, sx*.46, .85, sz*.95); return g; }, 'solid'],
  rack: [2.6, 1.1, 2.6, (x, y, z, r, k) => { const g = dmGroup(x, y, z, r); for (const sx of [-1, 1]) for (const sz of [-1, 1]) dmPart(g, .08, 2.6, .08, DM.metal, sx*1.25, 1.3, sz*.5); for (let i = 0; i < 3; i++) { dmPart(g, 2.6, .06, 1.05, DM.metal, 0, .15 + i*1.05, 0); for (let j = 0; j < 3; j++) if ((i + j + k) % 4) dmPart(g, .7, .55, .8, j % 2 ? DM.cardboard : DM.olive, -.85 + j*.85, .48 + i*1.05, 0); } return g; }, 'solid'],
  aisle: [2.4, .9, 1.6, (x, y, z, r, k) => { const g = dmGroup(x, y, z, r); dmPart(g, 2.4, 1.6, .06, DM.white, 0, .8, 0); for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) { dmPart(g, 2.4, .04, .4, DM.white, 0, .25 + i*.55, sd*.22); for (let j = 0; j < 5; j++) dmPart(g, .32, .22, .25, DM.fabric[(i + j + k) % 5], -.95 + j*.48, .38 + i*.55, sd*.22); } return g; }, 'solid'],
  counter: [2.2, .7, 1.05, (x, y, z, r) => { const g = dmGroup(x, y, z, r); dmPart(g, 2.2, 1.0, .65, DM.wood, 0, .5, 0); dmPart(g, 2.25, .05, .7, DM.black, 0, 1.03, 0); dmPart(g, .35, .25, .3, DM.black, .5, 1.18, 0); return g; }, 'vault'],
  pallet: [1.3, 1.1, 1.2, (x, y, z, r, k) => { const g = dmGroup(x, y, z, r); dmPart(g, 1.25, .14, 1.05, DM.wood, 0, .07, 0); dmPart(g, 1.1, .95, .95, k % 2 ? DM.cardboard : DM.olive, 0, .62, 0); return g; }, 'vault'],
  pew: [2.6, .7, .9, (x, y, z, r) => { const g = dmGroup(x, y, z, r); dmPart(g, 2.6, .08, .45, DM.woodDark, 0, .45, 0); dmPart(g, 2.6, .5, .06, DM.woodDark, 0, .75, -.22); return g; }, 'vault'],
};
function dmGroup(x, y, z, r) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = r; scene.add(g); return g; }
function dmPart(g, w, h, d, m, x, y, z) { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); p.position.set(x, y, z); p.castShadow = h > .1; p.receiveShadow = true; g.add(p); statics.push(p); return p; }
// what goes in each kind of building, per floor (the last list repeats for higher floors)
const FURN_SETS = {
  house: [['sofa', 'table', 'kitchen', 'fridge', 'shelf', 'sofa'], ['bed', 'shelf', 'bed', 'desk', 'sofa']],
  hotel: [['counter', 'sofa', 'table', 'shelf', 'sofa'], ['bed', 'desk', 'bed', 'shelf', 'sofa']],
  shop: [['aisle', 'counter', 'aisle', 'shelf', 'aisle']], office: [['desk', 'shelf', 'desk', 'lockers', 'desk', 'table']],
  barracks: [['bunk', 'lockers', 'bunk', 'bunk', 'lockers', 'table']], warehouse: [['rack', 'pallet', 'rack', 'pallet', 'rack']],
  church: [['pew', 'pew', 'pew', 'pew', 'pew', 'pew']], diner: [['counter', 'table', 'kitchen', 'table', 'fridge', 'table']],
};
function furnish(o) {
  const { cx, cz, w, d, floors = 1, fh = 3.1, t = .3, flip = false } = o, s = flip ? -1 : 1, X = lx => cx + s*lx, Z = lz => cz + s*lz, hw = w/2 - t, hd = d/2 - t;
  const set = FURN_SETS[o.kind || 'house'] || FURN_SETS.house, near = [], hsh = dmHash(cx, cz);
  for (let f = 0; f < floors; f++) {
    const y = f*fh, list = set[Math.min(f, set.length - 1)], doors = [];
    // every doorway on this floor (outside and inner walls) keeps a clear path
    for (const side of ['n', 's', 'w', 'e']) for (const q of (o.open[side] || [])) if (q[0] === f) {
      const op = opening(q[1], q[2]); if (op.bottom > .5) continue;
      doors.push(side === 'n' ? [X(op.at), Z(-hd)] : side === 's' ? [X(op.at), Z(hd)] : side === 'w' ? [X(-hw), Z(op.at)] : [X(hw), Z(op.at)]);
    }
    for (const [ax, , , c, iops] of (o.inner || [])) for (const q of iops) if (q[0] === f) { const op = opening(q[1], q[2]); doors.push(ax === 'x' ? [X(op.at), Z(c)] : [X(c), Z(op.at)]); }
    if (o.stairs) {   // the foot of the stairs on this floor and the top of the flight arriving from below
      const st = o.stairs, L = Math.round(fh/.2)*.3*st.dir;
      if (f < floors - 1) doors.push([X(st.lx), Z(st.lz)]);
      if (f > 0) doors.push(st.axis === 'x' ? [X(st.lx + L), Z(st.lz)] : [X(st.lx), Z(st.lz + L)]);
    }
    const floorAt = (x, z) => f === 0 || queryBoxes(x - .05, z - .05, x + .05, z + .05, near).some(b => Math.abs(b.maxY - y) < .06 && b.minX <= x && b.maxX >= x && b.minZ <= z && b.maxZ >= z);
    // a ceiling under the roof, lights, a baseboard
    const ceilY = (f + 1)*fh - .26;
    if (f === floors - 1 && o.roof !== 'none') { const pl = mesh(new THREE.PlaneGeometry(w - 2*t, d - 2*t), DM.ceil, cx, ceilY, cz, scene, false); pl.rotation.x = Math.PI/2; }
    const nl = Math.max(1, Math.round(w*d/30));
    for (let k = 0; k < nl; k++) { const lx = cx + ((k + .5)/nl*2 - 1)*hw*.8; dmBox(.6, .04, .6, DM.light, lx, ceilY - .02, cz, false); }
    for (const [ax, c, L] of [['x', Z(-hd + .02), w - 2*t], ['x', Z(hd - .02), w - 2*t], ['z', X(-hw + .02), d - 2*t], ['z', X(hw - .02), d - 2*t]])
      axisBox(ax, ax === 'x' ? cx : cz, y + .07, c, L, .14, .03, DM.base, false);
    // furniture backed against the walls
    let placed = 0;
    const want = Math.min(list.length, Math.max(2, Math.round((w - 2*t)*(d - 2*t)/13)));
    for (let tries = 0; tries < 70 && placed < want; tries++) {
      const kind = list[(placed + hsh + (tries >> 2)) % list.length], [fw, fd, fH, build, col] = FURN[kind];
      const side = (tries + hsh + f) % 4, half = (side < 2 ? hw : hd) - fw/2 - .15;
      if (half < 0 || (side < 2 ? hd : hw)*2 < fd + 1.4) continue;
      const pos = rand(-half, half), inset = fd/2 + .05;
      let x, z, rot;
      if (side === 0) { x = X(pos); z = Z(-hd + inset); rot = flip ? Math.PI : 0; }
      else if (side === 1) { x = X(pos); z = Z(hd - inset); rot = flip ? 0 : Math.PI; }
      else if (side === 2) { x = X(-hw + inset); z = Z(pos); rot = flip ? -Math.PI/2 : Math.PI/2; }
      else { x = X(hw - inset); z = Z(pos); rot = flip ? Math.PI/2 : -Math.PI/2; }
      const ex = (side < 2 ? fw : fd)/2, ez = (side < 2 ? fd : fw)/2;
      if (doors.some(([dx, dz]) => Math.abs(dx - x) < ex + 1.25 && Math.abs(dz - z) < ez + 1.25)) continue;
      if (o._leaves.some(([a, b, c2, d2, ly]) => Math.abs(ly - y) < .5 && x + ex > a && x - ex < c2 && z + ez > b && z - ez < d2)) continue;
      // nothing else in the way at this floor's height (walls, stairs, other furniture)
      if (queryBoxes(x - ex - .05, z - ez - .05, x + ex + .05, z + ez + .05, near).some(b => b.maxY > y + .05 && b.minY < y + fH + .3 && b.maxX > x - ex && b.minX < x + ex && b.maxZ > z - ez && b.minZ < z + ez)) continue;
      if (![[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => floorAt(x + a*ex*.9, z + b*ez*.9))) continue;
      build(x, y, z, rot, placed + hsh);
      solid(x, z, ex*2 - .06, ez*2 - .06, fH, 'wood', false, y, { vaultOnly: col === 'vault' });
      placed++;
    }
  }
}
// =====================================================================
// Drawing only what you can see the detail of: after the world is merged, every merged piece of furniture and
// interior trim is drawn only within 70 m, and small outside details (gutters, shutters, cars, crates, road
// paint, lamps) within 230 m. Walls, roofs, floors and anything big always draw.
// =====================================================================
const ISLE_CULL = { list: [], k: 0 };
function isleCullSetup() {
  const cat = new Map(), put = (d, ...ms) => { for (const m of ms.flat()) if (m && m.isMaterial) cat.set(m, d); };
  put(70, DM.fabric, DM.white, DM.black, DM.steel, DM.wood, DM.woodDark, DM.cardboard, DM.olive, DM.blanket, DM.mattress, DM.screen, DM.ceil, DM.base, DM.light, DM.door);
  put(230, DM.gutter, DM.plinth, DM.shutter, DM.awning, DM.metal, MAT.paintY, MAT.paintW, MAT.lampOn, MAT.carPaint, MAT.tire, MAT.chrome, MAT.headlight, MAT.taillight, MAT.crate, MAT.fence,
    MAT.grate, MAT.sandbag, MI.plank, MI.hay, MI.hedge, MI.pool, MAT.water, MAT.trim, MAT.redLight, MAT.hazard, MAT.pipe);
  const sph = new THREE.Sphere();
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.frustumCulled === false) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material, d = cat.get(m); if (!d) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    ISLE_CULL.list.push({ o, x: sph.center.x, y: sph.center.y, z: sph.center.z, d: d + sph.radius });
  });
}
// a sixth of the list each frame (and all of it when the camera jumps)
function isleCull(cam) {
  const L = ISLE_CULL.list, n = L.length; if (!n) return;
  const jump = ISLE_CULL.lx === undefined || (cam.x - ISLE_CULL.lx)**2 + (cam.z - ISLE_CULL.lz)**2 > 400;
  const cnt = jump ? n : Math.ceil(n/6);
  for (let i = 0; i < cnt; i++) {
    const e = L[ISLE_CULL.k = (ISLE_CULL.k + 1) % n];
    e.o.visible = (e.x - cam.x)**2 + (e.y - cam.y)**2*.25 + (e.z - cam.z)**2 < e.d*e.d;
  }
  ISLE_CULL.lx = cam.x; ISLE_CULL.lz = cam.z;
}
