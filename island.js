// =====================================================================
// Crestfall Island: the Battle Royale map, about 300 m across, ringed by sea.
// index.html calls buildIsland() while it builds the world (only when the island is the current map), so
// everything here can use the world helpers (block, building, container, stairRun, …). Building the island
// also records where loot lies, where the supply boxes and buy stations stand, the named areas and the
// Gulag, for br.js.
// =====================================================================
const ISLE = {
  P: 2.6, pois: [], spots: [], crates: [], stations: [], roads: [], trees: [], noTree: [], hard: [],
  gulag: { x: 129, z: -129, w: 26, d: 18, spawns: [], flag: null },
};
// the shoreline: a rounded square with a wobbly coast
const isleNorm = (x, z) => Math.pow(Math.pow(Math.abs(x), ISLE.P) + Math.pow(Math.abs(z), ISLE.P), 1/ISLE.P);
const isleCoast = a => 140 + 5*Math.sin(3*a + .7) + 3*Math.sin(7*a + 2.1) + 1.5*Math.sin(13*a + .4);
// how far inside the shoreline a point is (negative: out at sea)
const isleIn = (x, z) => isleCoast(Math.atan2(z, x)) - isleNorm(x, z);
const ISLE_BEACH = 7;
// Named areas. tier 2 areas have better loot; hot = how many bots like to land there
const ISLE_POIS = [
  { id: 'town', name: 'Old Town', x: 0, z: 0, r: 40, tier: 1, hot: 4 },
  { id: 'harbor', name: 'Harbor', x: 114, z: 8, r: 28, tier: 1, hot: 3 },
  { id: 'fort', name: 'Fort Ironside', x: -78, z: -77, r: 28, tier: 2, hot: 3 },
  { id: 'farm', name: 'Hollow Farm', x: -80, z: 74, r: 24, tier: 1, hot: 2 },
  { id: 'refinery', name: 'Refinery', x: 80, z: -76, r: 24, tier: 1, hot: 2 },
  { id: 'radio', name: 'Radio Hill', x: 0, z: -110, r: 18, tier: 2, hot: 1 },
  { id: 'lumber', name: 'Lumber Mill', x: 16, z: 106, r: 20, tier: 1, hot: 1 },
  { id: 'motel', name: 'Pine Motel', x: -110, z: -4, r: 20, tier: 1, hot: 2 },
  { id: 'site', name: 'Skyline Site', x: 80, z: 78, r: 22, tier: 2, hot: 2 },
];
// [x0, z0, x1, z1, width, asphalt?]
const ISLE_ROADS = [
  [-46, 0, 46, 0, 8, 1], [0, -46, 0, 46, 8, 1],
  [46, 0, 94, 7, 7, 1], [-46, 0, -96, -3, 7, 1], [0, -46, 0, -94, 7, 1], [0, 46, 12, 92, 7, 1],
  [-31, -31, -60, -58, 6, 1], [31, -31, 64, -62, 6, 1], [31, 31, 64, 62, 6, 1], [-31, 31, -64, 60, 6, 0],
  [-100, -22, -92, -54, 5, 0], [-104, 16, -96, 54, 5, 0], [-62, 92, -7, 100, 5, 0], [34, 106, 62, 94, 5, 0],
  [98, 62, 108, 30, 5, 0], [108, -14, 98, -54, 5, 0], [60, -92, 14, -106, 5, 0], [-14, -110, -58, -94, 5, 0],
];
const MI = {};
function isleMats() {
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
  MI.dirtRoad = stdMat(C.sand, 1, { color: lin(0xa58462), roughness: 1, normal: 2, rough: [1, -.1] });
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
function isleHard(x0, z0, x1, z1) { ISLE.hard.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); }
// a building with loot spots on every floor (and on the roof when there's a way up)
function isleRoom(o, tier = 1, per = 1) {
  building(o);
  const { cx, cz, w, d, floors = 1, fh = 3.1, t = .3 } = o;
  isleHard(cx - w/2 - .5, cz - d/2 - .5, cx + w/2 + .5, cz + d/2 + .5);
  for (let f = 0; f < floors; f++) {
    const n = Math.max(2, Math.round(w*d/22*per));
    for (let i = 0; i < n; i++) isleSpot(cx + rand(-w/2 + t + .7, w/2 - t - .7), f*fh, cz + rand(-d/2 + t + .7, d/2 - t - .7), tier);
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
  ISLE.stations.push({ x: x + fx*1.3, z: z + fz*1.3, kx: x, kz: z, rot });
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
function isleRock(x, z, s) {
  const m = mesh(new THREE.DodecahedronGeometry(1, 0), MI.rock, x, s*.35, z); m.scale.set(s*rand(.9, 1.3), s*rand(.55, .8), s*rand(.9, 1.3)); m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  solid(x, z, s*1.3, s*1.3, s*.85, 'concrete');
  isleHard(x - s, z - s, x + s, z + s);
}
function isleCabin(x, z, flip, mat, tier = 1) {
  isleRoom({ cx: x, cz: z, w: 7, d: 6, floors: 1, fh: 3, flip, ext: mat, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'pitched', roofH: 2,
    open: { s: [[0, DOOR, -1.4], [0, 'win', 1.8]], n: [[0, 'win', 0]], e: [[0, 'win', 0]], w: [[0, DOOR, .8]] } }, tier, 1.2);
}
function isleHouse(x, z, flip, mat, floors = 2, tier = 1) {
  isleRoom({ cx: x, cz: z, w: 11, d: 9, floors, fh: 3.1, flip, ext: mat, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'pitched', roofH: 2.4,
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
  // plaza with a fountain where the two main streets cross
  islePlane(22, 22, MI.pave, 0, .02, 0, 3);
  isleHard(-11, -11, 11, 11);
  block(0, 0, 0, 5.4, .62, 5.4, MI.stone, 'concrete', { tile: 1.5, vaultOnly: true });
  mesh(new THREE.CylinderGeometry(2.3, 2.3, .1, 32), MAT.water, 0, .56, 0, scene, false);
  block(0, .62, 0, .9, 2.4, .9, MI.stone, 'concrete', { tile: 1 });
  mesh(new THREE.SphereGeometry(.55, 16, 12), MAT.metal, 0, 3.5, 0);
  for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { tree(x, z, 1.05); }
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
  isleRoom({ cx: -20, cz: -18, w: 16, d: 10, floors: 2, fh: 3.3, ext: MI.stone, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'flat', parapet: MAT.concreteDark, surface: 'concrete',
    open: { s: [[0, GATE(2.4, 2.6), 0], [0, 'win', -5.2], [0, 'win', 5.2], [1, 'win', -5.2], [1, 'win', -1.8], [1, 'win', 1.8], [1, 'win', 5.2]],
      n: [[0, DOOR, -4], [0, 'win', 3], [1, 'win', -4], [1, 'win', 3]], w: [[0, 'win', 0], [1, 'win', 0]], e: [[0, DOOR, 1.5], [1, 'win', 0]] },
    inner: [['z', -4.7, 4.7, -2.5, [[0, DOOR, 2], [1, DOOR, 2]]]],
    stairs: { lx: 1, lz: -3.9, axis: 'x', dir: 1, width: 1.5 }, roofGaps: [['w', -3.6, 1.6]],
    extStairs: [{ lx: -8.75, lz: 6.3, axis: 'z', dir: -1, width: 1.4 }] }, 1, 1.2);
  { const s = mesh(new THREE.BoxGeometry(5, 1.1, .12), MI.sign('TOWN HALL'), -20, 5.2, -12.9); s.castShadow = false; }
  isleHouse(-38, -15, false, MI.blue);
  isleRoom({ cx: -14, cz: -34, w: 10, d: 8, floors: 1, fh: 3.4, ext: MI.cream, trim: MAT.trim, floorMat: MAT.walk, roof: 'flat', parapet: MAT.trim,
    open: { s: [[0, GATE(2.2, 2.5), -2], [0, 'win', 2.5]], n: [[0, DOOR, 2]], e: [[0, 'win', 0]], w: [[0, 'win', -1], [0, 'win', 2]] } }, 1, 1.4);
  // NE: church and bell tower, a house
  isleRoom({ cx: 24, cz: -19, w: 10, d: 16, floors: 1, fh: 6, ext: MI.stone, trim: MAT.concreteDark, floorMat: MAT.walk, roof: 'pitched', roofH: 4,
    open: { s: [[0, GATE(2.4, 3.2), 0]], n: [[0, DOOR, 2.5]], e: [[0, 'win', -4], [0, 'win', 0], [0, 'win', 4]], w: [[0, 'win', -4], [0, DOOR, 0], [0, 'win', 4]] } }, 1, 1.3);
  isleTowerBell(11, -20);
  isleHouse(12, -38, true, MI.white);
  // SW: hotel (3 floors, roof access), a cottage
  isleRoom({ cx: -22, cz: 20, w: 14, d: 11, floors: 3, fh: 3.1, ext: MI.red, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'flat', parapet: MAT.trim,
    open: { n: [[0, GATE(2.4, 2.5), 2], [0, 'win', -4], [1, 'win', -4], [1, 'win', 0], [1, 'win', 4], [2, 'win', -4], [2, 'win', 0], [2, 'win', 4]],
      s: [[0, DOOR, -3], [0, 'win', 2], [1, 'win', -3], [1, 'win', 2], [2, 'win', -3], [2, 'win', 2]],
      w: [[0, 'win', 0], [1, 'win', 0], [2, 'win', 0]], e: [[0, 'win', -2], [1, 'win', -2], [1, 'win', 2], [2, 'win', 2]] },
    inner: [['x', -6.7, 6.7, .8, [[0, DOOR, -3], [1, DOOR, -3], [2, DOOR, -3], [0, DOOR, 3], [1, DOOR, 3], [2, DOOR, 3]]]],
    stairs: { lx: -6.4, lz: -4.25, axis: 'x', dir: 1, width: 1.5 }, roofGaps: [['e', -4.2, 1.6]],
    extStairs: [{ lx: 7.75, lz: 9.9, axis: 'z', dir: -1, width: 1.4 }] }, 1, 1.1);
  { const s = mesh(new THREE.BoxGeometry(4.4, 1, .12), MI.sign('HOTEL'), -22, 9.4, 14.4); s.castShadow = false; }
  isleCabin(-40, 22, false, MI.green);
  // SE: diner, a house, a garage with roof access
  isleRoom({ cx: 18, cz: 14, w: 13, d: 8, floors: 1, fh: 3.3, ext: MI.white, trim: MAT.trim, floorMat: MAT.walk, roof: 'flat', parapet: MAT.carPaint[0],
    open: { n: [[0, GATE(2.2, 2.5), -3], [0, 'win', 0], [0, 'win', 2.2], [0, 'win', 4.4]], s: [[0, DOOR, 4], [0, 'win', -2]], e: [[0, 'win', 0]], w: [[0, DOOR, 1]] } }, 1, 1.4);
  { const s = mesh(new THREE.BoxGeometry(4, 1, .12), MI.sign('DINER'), 18, 4.2, 9.9); s.castShadow = false; }
  isleHouse(34, 24, true, MI.cream);
  isleRoom({ cx: 14, cz: 33, w: 8, d: 7, floors: 1, fh: 3, ext: MI.grey, trim: MAT.trim, floorMat: MAT.walk, roof: 'flat', parapet: MAT.trim,
    open: { n: [[0, GATE(3.2, 2.6), -1]], s: [[0, DOOR, 2]], w: [[0, 'win', 0]] }, roofGaps: [['e', 1.5, 1.6]],
    extStairs: [{ lx: 4.75, lz: -2.4, axis: 'z', dir: 1, width: 1.4 }] }, 1, 1.3);
  // street cover: parked cars, a van, barriers
  car(-24, -2.6, 'x', 0); car(-34, 2.6, 'x', 3); car(22, 2.6, 'x', 1); car(36, -2.6, 'x', 5); van(-2.8, -26, 'z', 2); car(2.7, 24, 'z', 4); car(-2.7, 36, 'z', 2);
  barrier(14, -2, 2.8, 'x'); barrier(-14, 2, 2.8, 'x');
  for (const [x, z, t] of [[-30, -26, 1], [-6, -14, 1], [30, -8, 1], [8, 20, 1], [-12, 34, 1], [26, 34, 2]]) isleCrate(x, z, 0, t, Math.random() < .5 ? 1 : 0);
  for (const [x, z] of [[-46, -30], [46, -30], [-46, 30], [46, 32], [26, 44]]) tree(x, z, rand(1, 1.25));
  isleStation(9.5, 9.5, 2); isleStation(-9.5, -9.5, 0);
}
function isleTowerBell(x, z) {   // stone bell tower: two floors with a lookout window up top, a belfry on the roof
  isleRoom({ cx: x, cz: z, w: 6, d: 6.4, floors: 2, fh: 3.1, ext: MI.stone, trim: MAT.concreteDark, int: MI.stone, floorMat: MAT.wfloor, roof: 'flat', parapet: MI.stone, surface: 'concrete',
    open: { e: [[0, DOOR, 1.4], [1, 'win', 0]], n: [[1, 'win', 0]], s: [[1, 'win', 0]], w: [[0, 'win', 0], [1, 'win', 0]] },
    stairs: { lx: -2.6, lz: -2.15, axis: 'x', dir: 1, width: 1.4 } }, 2, 1);
  const top = 6.2 + .05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(.45, 2.6, .45), MI.stone, x + sx*2.6, top + 1.3, z + sz*2.8);
  mesh(new THREE.BoxGeometry(6.3, .35, 6.7), MI.stone, x, top + 2.75, z);
  mesh(new THREE.ConeGeometry(3.6, 4.2, 4), ROOF_MAT, x, top + 5.05, z).rotation.y = Math.PI/4;
  mesh(new THREE.CylinderGeometry(.35, .7, .9, 16), MAT.pipe, x, top + 1.9, z);
}
function isleHarbor() {
  const P = ISLE_POIS[1];
  islePlane(48, 66, MI.quay, 119, .02, 8, 4);
  isleHard(94, -25, 144, 42);
  // warehouses with wide doors front and back
  for (const [cz, mat] of [[-13, MAT.rustWall], [29, MI.grey]]) {
    isleRoom({ cx: 104, cz, w: 20, d: 12, floors: 1, fh: 6, ext: mat, trim: MAT.metalDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
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
  isleRoom({ cx: 130, cz: 9, w: 8, d: 7, floors: 2, fh: 3, ext: MI.blue, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'flat', parapet: MAT.trim,
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
  isleRoom({ cx: -68, cz: -89, w: 12, d: 9, floors: 2, fh: 3.2, ext: MI.army, trim: MAT.concreteDark, int: MAT.plaster, floorMat: MAT.walk, roof: 'flat', parapet: MAT.concreteDark, surface: 'concrete',
    open: { s: [[0, DOOR, -2], [0, 'win', 2.5], [1, 'win', -2], [1, 'win', 2.5]], w: [[0, DOOR, 1], [1, 'win', 0]], n: [[0, 'win', 0], [1, 'win', 0]], e: [[1, 'win', -1]] },
    inner: [['z', -4.2, 4.2, 1.6, [[0, DOOR, 2], [1, DOOR, 2]]]],
    stairs: { lx: -5.5, lz: -3.4, axis: 'x', dir: 1, width: 1.5 }, roofGaps: [['w', -3.4, 1.6]],
    extStairs: [{ lx: -6.75, lz: 6.2, axis: 'z', dir: -1, width: 1.4 }] }, 2, 1.3);
  for (const cz of [-88, -66]) isleRoom({ cx: -86, cz, w: 15, d: 7, floors: 1, fh: 3, ext: MI.olive, trim: MAT.metalDark, int: MAT.plaster, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
    open: { e: [[0, DOOR, 0]], w: [[0, DOOR, 0]], n: [[0, 'win', -4], [0, 'win', 0], [0, 'win', 4]], s: [[0, 'win', -4], [0, 'win', 0], [0, 'win', 4]] } }, 2, 1.1);
  isleRoom({ cx: -68, cz: -66, w: 16, d: 14, floors: 1, fh: 7, ext: MAT.rustWall, trim: MAT.metalDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
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
  isleRoom({ cx: -88, cz: 64, w: 12, d: 16, floors: 2, fh: 4, ext: MI.red, trim: MAT.trim, int: MI.plank, floorMat: MI.plank, roof: 'pitched', roofH: 3.4,
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
  isleRoom({ cx: 94, cz: -76, w: 8, d: 7, floors: 1, fh: 4, ext: MAT.concrete, trim: MAT.concreteDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.concreteDark, surface: 'concrete',
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
  isleRoom({ cx: 10, cz: -103, w: 9, d: 7, floors: 1, fh: 3.2, ext: MI.white, trim: MAT.trim, floorMat: MAT.walk, roof: 'flat', parapet: MAT.trim,
    open: { s: [[0, DOOR, -2], [0, 'win', 2]], w: [[0, DOOR, 0]], n: [[0, 'win', 0]], e: [[0, 'win', 0]] } }, 2, 1.4);
  isleRoom({ cx: -10, cz: -120, w: 6, d: 5, floors: 1, fh: 2.8, ext: MAT.rustWall, trim: MAT.metalDark, floorMat: MAT.walk, roof: 'flat', parapet: MAT.metalDark, surface: 'metal',
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
  isleRoom({ cx: 4, cz: 92, w: 8, d: 7, floors: 2, fh: 3, ext: MI.plank, trim: MAT.trim, int: MI.plank, floorMat: MAT.wfloor, roof: 'pitched', roofH: 2,
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
  isleRoom({ cx: -114, cz: -16, w: 10, d: 8, floors: 1, fh: 3.2, ext: MI.white, trim: MAT.carPaint[0], floorMat: MAT.walk, roof: 'flat', parapet: MAT.carPaint[0],
    open: { e: [[0, GATE(2.2, 2.5), 0], [0, 'win', -2.5], [0, 'win', 2.5]], w: [[0, 'win', 0]], n: [[0, DOOR, 2]], s: [[0, 'win', 0]] } }, 1, 1.5);
  { const s = mesh(new THREE.BoxGeometry(.12, 1, 3.6), MI.sign('GAS'), -108.9, 4, -16); s.castShadow = false; }
  // motel: five rooms side by side, each with its own door and window
  const mx = -112, mz = 6, w = 26, d = 7, fh = 3;
  isleRoom({ cx: mx, cz: mz, w, d, floors: 1, fh, ext: MI.cream, trim: MAT.trim, int: MAT.plaster, floorMat: MAT.wfloor, roof: 'flat', parapet: MAT.trim,
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
  const N = 220, S = 440, geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI/2);
  const p = geo.attributes.position, sand = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), e = isleIn(x, z);
    p.setY(i, e >= 0 ? 0 : Math.max(-6, e*.4 - .05));
    sand[i] = 1 - clamp((e - ISLE_BEACH + 2.5)/4, 0, 1);
  }
  geo.setAttribute('sandW', new THREE.BufferAttribute(sand, 1));
  geo.computeVertexNormals();
  const gm = stdMat(C.grass, S/5, { roughness: .95, bumpScale: .04, normal: 1.1, rough: [1, -.1] });
  const sandTex = T(C.sand, S/6);
  gm.onBeforeCompile = sh => {
    sh.uniforms.sandMap = { value: sandTex };
    sh.vertexShader = 'attribute float sandW;\nvarying float vSand;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSand = sandW;');
    sh.fragmentShader = 'uniform sampler2D sandMap;\nvarying float vSand;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec4 sTex = texture2D(sandMap, vUv * 1.2);
      diffuseColor.rgb = mix(diffuseColor.rgb, sTex.rgb * vec3(1.08, 1.0, .9), smoothstep(.0, 1., vSand));`);
  };
  gm.customProgramCacheKey = () => 'isleGround';
  mesh(geo, gm, 0, 0, 0, scene, false);
  const sea = mesh(new THREE.PlaneGeometry(2400, 2400), MI.sea, 0, -.75, 0, scene, false); sea.rotation.x = -Math.PI/2; sea.receiveShadow = false;
  // the shoreline is a wall nobody sees: an unbroken ring of small blocks just inside the water's edge
  for (let a = 0; a < Math.PI*2; a += .0105) {
    const dx = Math.cos(a), dz = Math.sin(a), r = (isleCoast(a) - 1.2)/isleNorm(dx, dz);
    const b = solid(dx*r, dz*r, 2.4, 2.4, 9, 'dirt', true, 0, { noMantle: true }); b.coast = true;
  }
}
function isleRoadsBuild() {
  for (const [x0, z0, x1, z1, w, asph] of ISLE_ROADS) {
    const len = Math.hypot(x1 - x0, z1 - z0), mat = asph ? MI.road : MI.dirtRoad;
    const g = new THREE.PlaneGeometry(w, len + w*.5); g.rotateX(-Math.PI/2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*w/6, uv.getY(i)*(len + w*.5)/6);
    const m = mesh(g, mat, (x0 + x1)/2, asph ? .013 : .011, (z0 + z1)/2, scene, false); m.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    ISLE.roads.push({ x0, z0, x1, z1, w });
    if (asph) for (let t = 3; t < len - 2; t += 5) {   // dashed center line
      const k = t/len, d = mesh(new THREE.PlaneGeometry(.16, 2.2).rotateX(-Math.PI/2), MAT.paintY, x0 + (x1 - x0)*k, .02, z0 + (z1 - z0)*k, scene, false); d.rotation.y = m.rotation.y;
    }
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
function isleTrees() {
  // instanced: hundreds of trees for a handful of draw calls (each still blocks bullets with its trunk)
  const spots = [], near = [];
  for (let tries = 0; spots.length < 330 && tries < 9000; tries++) {
    // forests: most trees cluster around a few centers, the rest dot the fields
    let x, z;
    if (Math.random() < .72) { const c = ISLE_FORESTS[Math.floor(Math.random()*ISLE_FORESTS.length)], a = rand(0, 6.283), r = Math.sqrt(Math.random())*c[2]; x = c[0] + Math.cos(a)*r; z = c[1] + Math.sin(a)*r; }
    else { x = rand(-140, 140); z = rand(-140, 140); }
    if (isleIn(x, z) < ISLE_BEACH + 3 || isleRoadDist(x, z) < 2.5 || isleHardAt(x, z, 3) || ISLE_POIS.some(p => Math.hypot(p.x - x, p.z - z) < p.r*.75)) continue;
    if (spots.some(s => (s[0] - x)**2 + (s[1] - z)**2 < 12)) continue;
    if (queryBoxes(x - 1, z - 1, x + 1, z + 1, near).length) continue;
    spots.push([x, z, rand(.85, 1.5), Math.random() < .55]);
  }
  const N = spots.length, o = new THREE.Object3D(), col = new THREE.Color();
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .32, 1, 7), MAT.bark, N);
  const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), MI.pine, N*3);
  const blob = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), MI.pine, N*3);
  let ci = 0, bi = 0;
  spots.forEach(([x, z, s, pine], i) => {
    o.position.set(x, 1.3*s, z); o.rotation.set(0, 0, 0); o.scale.set(s, 2.6*s, s); o.updateMatrix(); trunk.setMatrixAt(i, o.matrix);
    solid(x, z, .55*s, .55*s, 3.4*s, 'wood');
    for (let k = 0; k < 3; k++) {
      if (pine) {
        o.position.set(x, (2.4 + k*1.55)*s, z); o.scale.set((2.5 - k*.65)*s, 2.7*s, (2.5 - k*.65)*s); o.rotation.set(0, rand(0, 6), 0); o.updateMatrix();
        cone.setMatrixAt(ci, o.matrix); cone.setColorAt(ci++, col.setHSL(rand(.27, .34), rand(.35, .5), rand(.15, .23)));
      } else {
        o.position.set(x + rand(-.8, .8)*s, (3.1 + rand(0, 1.6))*s, z + rand(-.8, .8)*s); o.scale.setScalar(rand(1.3, 2)*s); o.rotation.set(rand(0, 6), rand(0, 6), 0); o.updateMatrix();
        blob.setMatrixAt(bi, o.matrix); blob.setColorAt(bi++, col.setHSL(rand(.18, .28), rand(.4, .6), rand(.2, .31)));
      }
    }
  });
  cone.count = ci; blob.count = bi;
  for (const m of [trunk, cone, blob]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  ISLE.trees = spots;
  // bushes and rocks between the trees
  const bushN = 160, bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), MAT.leafDark, bushN);
  let k = 0;
  for (let tries = 0; k < bushN && tries < 3000; tries++) {
    const x = rand(-138, 138), z = rand(-138, 138);
    if (isleIn(x, z) < ISLE_BEACH + 2 || isleRoadDist(x, z) < 1.5 || isleHardAt(x, z, 1.5)) continue;
    const r = rand(.5, 1); o.position.set(x, r*.55, z); o.rotation.set(0, rand(0, 6), 0); o.scale.set(r*1.2, r, r*1.2); o.updateMatrix(); bush.setMatrixAt(k++, o.matrix);
  }
  bush.count = k; bush.castShadow = true; bush.receiveShadow = true; bush.frustumCulled = false; scene.add(bush);
  for (let i = 0, tries = 0; i < 26 && tries < 2000; tries++) {
    const x = rand(-135, 135), z = rand(-135, 135);
    if (isleIn(x, z) < ISLE_BEACH + 4 || isleRoadDist(x, z) < 3 || isleHardAt(x, z, 4)) continue;
    isleRock(x, z, rand(1.2, 2.6)); i++;
  }
}
const ISLE_FORESTS = [[-40, -60, 22], [46, -40, 18], [-48, 48, 20], [52, 44, 16], [-120, 40, 14], [40, 132, 10], [-30, 112, 16], [120, -40, 14], [-40, -122, 14], [60, -120, 12], [-126, -56, 12], [126, 56, 12]];
// wrapped grass: a fixed patch of blades that slides with the camera, kept off roads, floors and sand by a mask
const isleGrassMask = { tex: null };
function isleGrass() {
  const M = 1024, sc = M/300;
  const c = mk(M, 0, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, M, M);
    const img = g.getImageData(0, 0, M, M), d = img.data;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = i/sc - 150, z = j/sc - 150;
      if (isleIn(x, z) > ISLE_BEACH + 1.5) { const o = (j*M + i)*4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = '#000';
    for (const [a, b, cc, dd] of ISLE.hard) g.fillRect((a + 150)*sc, (b + 150)*sc, (cc - a)*sc, (dd - b)*sc);
    for (const r of ISLE.roads) { g.strokeStyle = '#000'; g.lineWidth = (r.w + 1)*sc; g.lineCap = 'round'; g.beginPath(); g.moveTo((r.x0 + 150)*sc, (r.z0 + 150)*sc); g.lineTo((r.x1 + 150)*sc, (r.z1 + 150)*sc); g.stroke(); }
    for (const b of boxes) if (!b.coast && b.minY < .5 && b.maxY > .3) g.fillRect((b.minX + 150)*sc - 1, (b.minZ + 150)*sc - 1, (b.maxX - b.minX)*sc + 2, (b.maxZ - b.minZ)*sc + 2);
  });
  const mask = T(c, 1, 1, false); mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping; mask.flipY = false; isleGrassMask.tex = mask;
  const W = 64, N = Math.round((EXTREME ? 9000 : HIGH ? 6000 : 2500));
  const geo = new THREE.PlaneGeometry(.6, .42); geo.translate(0, .21, 0);
  const g2 = geo.clone(); g2.rotateY(Math.PI/2); const g3 = geo.clone(); g3.rotateY(Math.PI/4);
  const merged = mergeGeos([geo, g2, g3]);
  { const n = merged.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }
  const mat = new THREE.MeshLambertMaterial({ map: T(C.blade), alphaTest: .5, side: THREE.DoubleSide });
  mat.onBeforeCompile = s => {
    s.uniforms.grassAmb = grassAmb; s.uniforms.time = grassTime; s.uniforms.grassFar = grassFar; s.uniforms.camPos = grassCam; s.uniforms.gMask = { value: mask };
    s.fragmentShader = 'uniform vec3 grassAmb;\n' + s.fragmentShader.replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse += grassAmb * diffuseColor.rgb;\n#include <aomap_fragment>');
    s.vertexShader = 'uniform float time, grassFar; uniform vec3 camPos; uniform sampler2D gMask; varying float vKeep;\n' + s.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 base = instanceMatrix[3].xz;
        vec2 wpos = camPos.xz + mod(base - camPos.xz + ${(W/2).toFixed(1)}, ${W.toFixed(1)}) - ${(W/2).toFixed(1)};
        vec2 shift = wpos - base;
        float keep = texture2D(gMask, (wpos + 150.) / 300.).r;
        float sway = uv.y * uv.y;
        transformed *= step(.5, keep) * (1. - smoothstep(grassFar - 9., grassFar, distance(wpos, camPos.xz)));
        transformed.x += sin(time*1.9 + wpos.x*.45 + wpos.y*.3) * .09 * sway;
        transformed.z += cos(time*1.5 + wpos.y*.4) * .06 * sway;`)
      .replace('#include <project_vertex>', `vec4 mvPosition = vec4(transformed, 1.0);
        mvPosition = instanceMatrix * mvPosition; mvPosition.xz += shift;
        mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `vec4 worldPosition = instanceMatrix * vec4(transformed, 1.0); worldPosition.xz += shift; worldPosition = modelMatrix * worldPosition;`);
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
// ---- the whole island ----
function buildIsland() {
  isleMats();
  isleRoadsBuild();
  isleTown(); isleHarbor(); isleFort(); isleFarm(); isleRefinery(); isleRadio(); isleLumber(); isleMotel(); isleSite();
  // lone cabins and sheds along the roads
  for (const [x, z, f, m] of [[52, 18, 0, MI.green], [-56, -18, 1, MI.red], [-58, 28, 0, MI.cream], [40, -64, 1, MI.blue], [-30, -78, 0, MI.grey], [-28, 84, 1, MI.green], [58, -22, 0, MI.white], [-82, 18, 1, MI.blue], [96, 40, 0, MI.cream], [26, -84, 1, MI.red]]) {
    isleCabin(x, z, !!f, m); isleHard(x - 4.5, z - 4, x + 4.5, z + 4);
    isleCrate(x + (f ? -5 : 5), z + 1, 0, 1, 1);
  }
  isleStation(-38, 58, 1); isleStation(50, -30, 3);
  isleGulag();
  isleTrees();
  // POIs and fallback spawn points for br.js
  ISLE.pois = ISLE_POIS;
}
