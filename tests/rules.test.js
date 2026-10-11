// Player-vs-player rules, decided by the server: hits, headshots, cheating, teams, wall penetration.
const { Room, WID } = require('../game.js');
const { ok, done } = require('./check.js');
const fake = name => ({ token: name, sendJSON() {} });
function duel(mode, map = 'yard', pw = WID.ar) {
  const r = new Room(mode, map);
  const A = r.addHuman(fake('a'), 'Ann', { p: pw, s: WID.pistol }), B = r.addHuman(fake('b'), 'Ben', { p: WID.sniper, s: WID.pistol });
  A.ready = B.ready = true; if (mode === 'tdm') B.team = 1 - A.team;
  r.tick(1/30);
  for (const f of r.fighters) if (f.isBot) { f.alive = false; f.respawnAt = Infinity; }
  A.rtt = B.rtt = .08;
  return { r, A, B };
}
function place(r, A, B, a, b) { A.pos.set(a[0], 0, a[1]); B.pos.set(b[0], 0, b[1]); A.hist = []; B.hist = []; for (let i = 0; i < 6; i++) r.tick(1/30); }
function shoot(r, A, B, y = 1.1, extra = {}) {
  const o = [A.pos.x, A.pos.y + 1.55, A.pos.z], d = [B.pos.x - A.pos.x, B.pos.y + y - o[1], B.pos.z - A.pos.z];
  r.now += 1; A.fireTok = 3; A.ammo[A.wid] = 30; A.reload = null;
  r.handle(A, { t: 'fire', w: A.wid, o, a: d, d: [d], ...extra });
}
function openSpot(W, gap) {
  for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) {
    const a = { x, y: 1.55, z }, b = { x: x + gap, y: 1.55, z };
    if (W.groundAt({ x, y: 0, z }) === 0 && W.groundAt({ x: x + gap, y: 0, z }) === 0 && W.clearLine(a, b) && W.clearAt(x, z, 0, 1.8, .45) && W.clearAt(x + gap, z, 0, 1.8, .45)) return [[x, z], [x + gap, z]];
  }
}
for (const mode of ['ffa', 'tdm', 'wz']) {
  const { r, A, B } = duel(mode);
  const [pa, pb] = openSpot(r.world, 12); place(r, A, B, pa, pb);
  const hp0 = B.hp + B.armor; shoot(r, A, B);
  ok(B.hp + B.armor < hp0, `${mode}: a body shot lands (${hp0} → ${Math.round(B.hp + B.armor)})`);
  ok(A.out.some(m => m.t === 'hm' && m.d > 0), `${mode}: shooter gets a hit marker with the damage`);
  ok(B.out.some(m => m.t === 'hurt' && m.a === A.id && m.r > 0), `${mode}: victim is told who hit them and how hard`);
  const h1 = B.hp + B.armor; r.now += 1; A.fireTok = 3;
  r.handle(A, { t: 'fire', w: A.wid, o: [A.pos.x, 1.55, A.pos.z], a: [0, 0, 1], d: [[B.pos.x - A.pos.x, -.45, 0]] });
  ok(B.hp + B.armor === h1, `${mode}: a shot far outside the gun's spread is thrown out`);
  A.out.length = 0; shoot(r, A, B, 1.62);
  ok(A.out.some(m => m.t === 'hm' && m.h), `${mode}: headshot registers as a headshot`);
  r.now += 1; A.fireTok = 3; const ammo = A.ammo[A.wid] = 30;
  for (let i = 0; i < 20; i++) r.handle(A, { t: 'fire', w: A.wid, o: [A.pos.x, 1.55, A.pos.z], a: [0, 1, 0], d: [[0, 1, 0]] });
  ok(ammo - A.ammo[A.wid] <= 4, `${mode}: 20 shots in one instant: only ${ammo - A.ammo[A.wid]} allowed`);
  let n = 0; while (B.alive && n++ < 40) shoot(r, A, B);
  ok(!B.alive && A.kills === 1, `${mode}: Ben goes down and Ann gets the kill`);
  if (mode === 'tdm') {
    ok(r.teamScore[A.team] === 1, 'tdm: the kill scores for Ann\'s team');
    B.team = A.team; r.respawn(B); place(r, A, B, pa, pb); const h = B.hp; shoot(r, A, B);
    ok(B.hp === h, 'tdm: no friendly fire');
  }
}
// lag compensation: Ben is running; Ann's shot is judged where her screen showed him (`rt`)
{
  const { r, A, B } = duel('ffa'); const [pa, pb] = openSpot(r.world, 12); place(r, A, B, pa, pb);
  const seenAt = r.now, seen = B.pos.clone();
  for (let i = 0; i < 6; i++) { B.pos.z += .15; r.tick(1/30); }   // he moved 0.9 m since then
  const o = [A.pos.x, 1.55, A.pos.z], d = [seen.x - A.pos.x, 1.1 - 1.55, seen.z - A.pos.z], hp = B.hp;
  A.fireTok = 3; r.handle(A, { t: 'fire', w: A.wid, o, a: d, d: [d], rt: seenAt });
  ok(B.hp < hp, 'lag compensation: a shot at where Ben was on screen 0.2 s ago hits');
  // now he keeps running for 0.6 s: a shot at where he was back then reaches back only 0.4 s, and misses
  const seenAt2 = r.now, seen2 = B.pos.clone();
  for (let i = 0; i < 18; i++) { B.pos.z += .083; r.tick(1/30); }
  const d2 = [seen2.x - A.pos.x, 1.1 - 1.55, seen2.z - A.pos.z], hp2 = B.hp; A.fireTok = 3;
  r.handle(A, { t: 'fire', w: A.wid, o, a: d2, d: [d2], rt: seenAt2 });
  ok(B.hp === hp2, 'lag compensation: never rewinds more than 0.4 s (an old shot misses)');
}
// changing your loadout in the menu mid-life: your current gun keeps working, the new ones come with your next spawn
{
  const { r, A, B } = duel('ffa'); const [pa, pb] = openSpot(r.world, 12); place(r, A, B, pa, pb);
  r.handle(A, { t: 'lo', lo: { p: WID.smg, s: WID.pistol } });
  const hp = B.hp; shoot(r, A, B);
  ok(B.hp < hp, 'a loadout change mid-life keeps your current gun working');
  ok(A.loadout.p === WID.ar && A.nextLoadout && A.nextLoadout.p === WID.smg, 'the new loadout waits for the next spawn');
  r.respawn(A);
  ok(A.loadout.p === WID.smg && A.wid === WID.smg, 'and is what you spawn with');
}
// respawning waits for the player's killcam (or skip), with a 6 s fallback
{
  const { r, A, B } = duel('ffa'); const [pa, pb] = openSpot(r.world, 12); place(r, A, B, pa, pb);
  let n = 0; while (B.alive && n++ < 40) shoot(r, A, B);
  for (let i = 0; i < 30*4; i++) r.tick(1/30);
  ok(!B.alive, 'a dead player is not respawned while they watch their killcam');
  r.handle(B, { t: 'spawn' }); r.tick(1/30);
  ok(B.alive, 'they respawn as soon as the killcam ends or they skip it');
  n = 0; while (B.alive && n++ < 40) shoot(r, A, B);
  for (let i = 0; i < 30*9.5; i++) r.tick(1/30);
  ok(B.alive, 'and by themselves 6 s later if their game never asks');
}
// wall penetration: through a thin wooden house wall on suburbia, rifles and snipers get through, SMGs don't
{
  const r0 = new Room('ffa', 'suburbia'), W = r0.world;
  let pick = null;
  for (const b of W.boxes) {
    if (b.surface !== 'wood' || b.noMantle || b.minY > .05 || b.maxY < 2.2) continue;
    const tx = b.maxX - b.minX, tz = b.maxZ - b.minZ, thin = Math.min(tx, tz); if (thin < .2 || thin > .34 || Math.max(tx, tz) < 2) continue;
    const ax = tx < tz, cx = (b.minX + b.maxX)/2, cz = (b.minZ + b.maxZ)/2, p1 = ax ? [cx - 3, cz] : [cx, cz - 3], p2 = ax ? [cx + 2.5, cz] : [cx, cz + 2.5];
    const free = p => W.clearAt(p[0], p[1], .05, 1.9, .45) && W.groundAt({ x: p[0], y: 0, z: p[1] }) < .05;
    if (!free(p1) || !free(p2)) continue;
    const e1 = { x: p1[0], y: 1.55, z: p1[1] }, d = { x: p2[0] - p1[0], y: -.45, z: p2[1] - p1[1] }, L = Math.hypot(d.x, d.y, d.z); d.x /= L; d.y /= L; d.z /= L;
    if (W.rayBoxes(e1.x, e1.y, e1.z, d.x, d.y, d.z, L) < L && W.rayHit.box === b) {
      const ex = W.boxExit(b, e1, d);
      if (W.rayBoxes(e1.x + d.x*(ex + .01), e1.y + d.y*(ex + .01), e1.z + d.z*(ex + .01), d.x, d.y, d.z, L - ex) === Infinity) { pick = { p1, p2, thin }; break; }
    }
  }
  ok(!!pick, 'found a thin wooden wall to test on');
  const got = {};
  for (const gun of ['ar', 'sniper', 'smg']) {
    const { r, A, B } = duel('ffa', 'suburbia', WID[gun]); place(r, A, B, pick.p1, pick.p2);
    const hp = B.hp; shoot(r, A, B); got[gun] = Math.round(hp - B.hp);
  }
  ok(got.ar > 0 && got.ar < 24, `rifle through ${pick.thin.toFixed(2)} m of wood: ${got.ar} damage (24 in the open)`);
  ok(got.sniper > 40, `sniper through the wall: ${got.sniper} damage`);
  ok(got.smg === 0, `SMG is stopped by the wall: ${got.smg} damage`);
}
done('rules');
