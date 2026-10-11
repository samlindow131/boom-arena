// Boom Arena online match simulation. The server runs the real game here: bots, hit detection (with lag
// compensation), damage and armor, grenades, claymores, airstrikes, killstreaks and the Mini Warzone gas.
// Players' games report where they are and what they do; this file decides what actually happens.
// Collision data comes from maps.json (exported from the game) and the numbers from shared.js, so the
// server and the game always agree.
'use strict';
const { WEAPONS, EQUIP, ATT_SLOTS, ATT_INFO, BOTS, GREN, NADE_G, NR, PLATE_TIME, WZ, STREAK_N, DIFF, PEN_SURF, mapHash } = require('./shared.js');
const MAPS = require('./maps.json');
const WID = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));

const rand = (a, b) => a + Math.random()*(b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (a, b, k) => a + wrap(b - a)*Math.min(1, k);
const r2 = v => Math.round(v*100)/100;
const fin = v => typeof v === 'number' && isFinite(v);
const tag = v => typeof v === 'string' && /^[a-z0-9_-]{1,24}$/.test(v) ? v : '';   // operator / skin ids (cosmetic)
// gun camos someone has equipped: { weaponIndex: camoId } (cosmetic; at most the two guns they carry)
const camos = v => { const o = {}; if (v && typeof v === 'object') for (const k of Object.keys(v).slice(0, 2)) if (/^[0-6]$/.test(k) && tag(v[k])) o[k] = v[k]; return o; };
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  distanceToSquared(v) { const a = this.x - v.x, b = this.y - v.y, c = this.z - v.z; return a*a + b*b + c*c; }
  arr() { return [r2(this.x), r2(this.y), r2(this.z)]; }
}

// =====================================================================
// World: collision boxes, physics and bot navigation (ported from the game)
// =====================================================================
const SURF = ['concrete', 'metal', 'wood', 'dirt', 'flesh', 'scorch'];
const BIN = 4, binKey = (i, j) => (i + 512)*1024 + (j + 512);
const STEP = .45, STAND_H = 1.8, BOT_REACH = 1.55, R = .4;
// hit zones by stance (0 stand, 1 crouch, 2 slide): head sphere height and body cylinder height
const HEAD_Y = [1.62, 1.12, .82], BODY_H = [1.45, 1.0, .72], EYE_Y = [1.55, 1.0, .75];

class World {
  constructor(id, def) {
    this.id = id; this.arena = def.arena; this.groundSurface = def.ground; this.spawns = def.spawns; this.hash = mapHash(def.boxes);
    this.boxes = def.boxes.map(a => ({ minX: a[0], minY: a[1], minZ: a[2], maxX: a[3], maxY: a[4], maxZ: a[5], pass: !!(a[6] & 1), noMantle: !!(a[6] & 2), noDecal: !!(a[6] & 4), surface: SURF[a[7]] || 'concrete', _q: 0, _r: 0 }));
    this.bins = new Map();
    for (const b of this.boxes) for (let i = Math.floor(b.minX/BIN); i <= Math.floor(b.maxX/BIN); i++) for (let j = Math.floor(b.minZ/BIN); j <= Math.floor(b.maxZ/BIN); j++) {
      const k = binKey(i, j); if (!this.bins.has(k)) this.bins.set(k, []); this.bins.get(k).push(b);
    }
    this.boxTop = this.boxes.reduce((m, b) => Math.max(m, b.maxY), 0);
    this.qStamp = 0; this.rayStamp = 0; this.rayHit = { box: null, nx: 0, ny: 0, nz: 0 };
    this.hit = { t: Infinity, surface: '', noDecal: false, n: new V3() };
    this._qa = []; this._qb = []; this._qc = []; this._qd = []; this._qn = [];
    this.buildNav();
  }
  queryBoxes(x0, z0, x1, z1, out) {
    this.qStamp++; out.length = 0;
    for (let i = Math.floor(x0/BIN); i <= Math.floor(x1/BIN); i++) for (let j = Math.floor(z0/BIN); j <= Math.floor(z1/BIN); j++) {
      const list = this.bins.get(binKey(i, j)); if (!list) continue;
      for (const b of list) if (b._q !== this.qStamp) { b._q = this.qStamp; out.push(b); }
    }
    return out;
  }
  collide(p, r, H = STAND_H) {
    for (const b of this.queryBoxes(p.x - r, p.z - r, p.x + r, p.z + r, this._qa)) {
      if (b.maxY <= p.y + STEP || b.minY >= p.y + H) continue;
      const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ), dx = p.x - cx, dz = p.z - cz, d2 = dx*dx + dz*dz;
      if (d2 >= r*r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x += dx/d*(r - d); p.z += dz/d*(r - d); }
      else {
        const o = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z], m = Math.min(...o);
        if (m === o[0]) p.x = b.minX - r; else if (m === o[1]) p.x = b.maxX + r; else if (m === o[2]) p.z = b.minZ - r; else p.z = b.maxZ + r;
      }
    }
  }
  groundAt(p, r = .28) {
    let g = 0;
    for (const b of this.queryBoxes(p.x - r, p.z - r, p.x + r, p.z + r, this._qb))
      if (b.maxY <= p.y + STEP && b.maxY > g && p.x > b.minX - r && p.x < b.maxX + r && p.z > b.minZ - r && p.z < b.maxZ + r) g = b.maxY;
    return g;
  }
  ceilingAt(p, r, fromY) {
    let c = Infinity;
    for (const b of this.queryBoxes(p.x - r, p.z - r, p.x + r, p.z + r, this._qb))
      if (b.minY >= fromY - .01 && b.minY < c && p.x > b.minX - r && p.x < b.maxX + r && p.z > b.minZ - r && p.z < b.maxZ + r) c = b.minY;
    return c;
  }
  surfaceBelow(x, z, maxY, pad = .05) {
    let g = 0;
    for (const b of this.queryBoxes(x - pad, z - pad, x + pad, z + pad, this._qc))
      if (b.maxY <= maxY + 1e-3 && b.maxY > g && x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) g = b.maxY;
    return g;
  }
  clearAt(x, z, y0, y1, pad = .25) {
    for (const b of this.queryBoxes(x - pad, z - pad, x + pad, z + pad, this._qd))
      if (b.minY < y1 && b.maxY > y0 + 1e-3 && x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return false;
    return true;
  }
  startMantle(f, m) {
    const from = f.pos.clone(), up = Math.max(0, m.top - from.y);
    const peak = Math.min(m.top + (m.type === 'vault' ? .3 : .05), (m.ceil || Infinity) - 1.0);
    f.vx = f.vz = 0;
    f.mantle = { t: 0, dur: m.type === 'vault' ? .36 + up*.07 + from.distanceTo(m.to)*.04 : .4 + up*.13, from, to: m.to.clone(), top: m.top, peak: Math.max(peak, m.top + .02), type: m.type };
    f.velY = 0;
  }
  stepMantle(f, dt) {
    const M = f.mantle; M.t += dt;
    const u = Math.min(1, M.t/M.dur);
    if (M.type === 'climb') {
      const k = Math.min(1, u/.55), e = 1 - (1 - k)*(1 - k);
      f.pos.y = M.from.y + (M.top + .02 - M.from.y)*e;
      const h = u < .55 ? u/.55*.25 : .25 + (u - .55)/.45*.75;
      f.pos.x = M.from.x + (M.to.x - M.from.x)*h; f.pos.z = M.from.z + (M.to.z - M.from.z)*h;
    } else {
      const h = u*u*(3 - 2*u), yc = 2*M.peak - (M.from.y + M.to.y)/2;
      f.pos.x = M.from.x + (M.to.x - M.from.x)*h; f.pos.z = M.from.z + (M.to.z - M.from.z)*h;
      f.pos.y = (1 - u)*(1 - u)*M.from.y + 2*u*(1 - u)*yc + u*u*M.to.y;
    }
    if (u >= 1) { f.mantle = null; f.velY = 0; f.pos.y = Math.max(f.pos.y, this.groundAt(f.pos)); }
  }
  stepPhysics(f, dt, H) {
    const wasGround = f.onGround;
    f.velY -= 24*dt; f.pos.y += f.velY*dt;
    if (f.velY > 0) { const c = this.ceilingAt(f.pos, .3, f.pos.y + H*.4); if (f.pos.y + H > c) { f.pos.y = c - H; f.velY = 0; } }
    this.collide(f.pos, R, H);
    const g = this.groundAt(f.pos);
    if (f.pos.y <= g || (wasGround && f.velY <= 0 && f.pos.y - g < STEP)) { f.pos.y = g; f.velY = 0; f.onGround = true; }
    else f.onGround = false;
  }
  // ray casts walk only the 4 m bins the ray crosses (2D DDA) and slab-test the boxes in them
  rayBoxes(ox, oy, oz, dx, dy, dz, far) {
    this.rayStamp++; const rh = this.rayHit; rh.box = null;
    let best = far, ax = -1, sg = 0;
    const ix = 1/dx, iy = 1/dy, iz = 1/dz, si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    let i = Math.floor(ox/BIN), j = Math.floor(oz/BIN);
    let tx = dx !== 0 ? ((si > 0 ? i + 1 : i)*BIN - ox)*ix : Infinity, tz = dz !== 0 ? ((sj > 0 ? j + 1 : j)*BIN - oz)*iz : Infinity;
    const stx = dx !== 0 ? BIN*Math.abs(ix) : Infinity, stz = dz !== 0 ? BIN*Math.abs(iz) : Infinity;
    for (let guard = 0; guard < 400; guard++) {
      const list = this.bins.get(binKey(i, j));
      if (list) for (let k = 0; k < list.length; k++) {
        const b = list[k]; if (b._r === this.rayStamp) continue; b._r = this.rayStamp;
        let t0 = 0, t1 = best, a = -1, s = 0, p, q;
        if (dx !== 0) { p = (b.minX - ox)*ix; q = (b.maxX - ox)*ix; if (p < q) { if (p > t0) { t0 = p; a = 0; s = -1; } if (q < t1) t1 = q; } else { if (q > t0) { t0 = q; a = 0; s = 1; } if (p < t1) t1 = p; } } else if (ox <= b.minX || ox >= b.maxX) continue;
        if (dy !== 0) { p = (b.minY - oy)*iy; q = (b.maxY - oy)*iy; if (p < q) { if (p > t0) { t0 = p; a = 1; s = -1; } if (q < t1) t1 = q; } else { if (q > t0) { t0 = q; a = 1; s = 1; } if (p < t1) t1 = p; } } else if (oy <= b.minY || oy >= b.maxY) continue;
        if (dz !== 0) { p = (b.minZ - oz)*iz; q = (b.maxZ - oz)*iz; if (p < q) { if (p > t0) { t0 = p; a = 2; s = -1; } if (q < t1) t1 = q; } else { if (q > t0) { t0 = q; a = 2; s = 1; } if (p < t1) t1 = p; } } else if (oz <= b.minZ || oz >= b.maxZ) continue;
        if (a < 0 || t0 > t1) continue;
        best = t0; ax = a; sg = s; rh.box = b;
      }
      const tn = Math.min(tx, tz);
      if (tn >= best) break;
      if (dy > 0 && oy + dy*tn > this.boxTop) break;
      if (tx < tz) { i += si; tx += stx; } else { j += sj; tz += stz; }
    }
    if (!rh.box) return Infinity;
    rh.nx = ax === 0 ? sg : 0; rh.ny = ax === 1 ? sg : 0; rh.nz = ax === 2 ? sg : 0;
    return best;
  }
  rayWorld(o, d, far) {
    let t = this.rayBoxes(o.x, o.y, o.z, d.x, d.y, d.z, far); const h = this.hit;
    h.box = null;
    if (t < Infinity) { h.box = this.rayHit.box; h.surface = h.box.surface; h.noDecal = h.box.noDecal; h.n.set(this.rayHit.nx, this.rayHit.ny, this.rayHit.nz); }
    if (d.y < 0 && o.y > 0) {
      const tg = -o.y/d.y;
      if (tg < Math.min(t, far) && Math.abs(o.x + d.x*tg) <= this.arena && Math.abs(o.z + d.z*tg) <= this.arena) { t = tg; h.box = null; h.surface = this.groundSurface; h.noDecal = false; h.n.set(0, 1, 0); }
    }
    return h.t = t;
  }
  // where a ray that went into box b comes out the other side
  boxExit(b, o, d) {
    let t = Infinity;
    if (d.x) t = Math.min(t, ((d.x > 0 ? b.maxX : b.minX) - o.x)/d.x);
    if (d.y) t = Math.min(t, ((d.y > 0 ? b.maxY : b.minY) - o.y)/d.y);
    if (d.z) t = Math.min(t, ((d.z > 0 ? b.maxZ : b.minZ) - o.z)/d.z);
    return t;
  }
  clearLine(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-4) return true;
    return this.rayBoxes(a.x, a.y, a.z, dx/dist, dy/dist, dz/dist, dist) === Infinity;
  }
  // ---- nav grid of walkable surfaces linked by walk / climb / drop / vault edges ----
  buildNav() {
    const NAV = this.nav = { cs: .5, n: 0, half: 0, cells: null, nodes: [], edges: [] };
    const cs = NAV.cs, half = this.arena - .25, n = Math.ceil(half*2/cs);
    NAV.n = n; NAV.half = half; NAV.cells = new Array(n*n);
    const near = [], rr = .28;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -half + (i + .5)*cs, z = -half + (j + .5)*cs, list = [];
      this.queryBoxes(x - cs/2, z - cs/2, x + cs/2, z + cs/2, near);
      const cands = [{ y: 0, pass: false, nm: false }];
      for (const b of near) if (b.minX < x + cs/2 && b.maxX > x - cs/2 && b.minZ < z + cs/2 && b.maxZ > z - cs/2) cands.push({ y: b.maxY, pass: b.pass, nm: b.noMantle });
      cands.sort((a, b) => a.y - b.y);
      for (const c of cands) {
        if (list.length && Math.abs(list[list.length - 1].y - c.y) < .05) { const last = list[list.length - 1]; last.pass = last.pass && c.pass; last.nm = last.nm || c.nm; continue; }
        if (c.nm || c.y > 8) continue;
        let low = false, bad = false;
        for (const b of near) {
          if (b.minY >= c.y + 1.75 || b.maxY <= c.y + STEP*.9) continue;
          const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
          if ((x - cx)**2 + (z - cz)**2 >= rr*rr) continue;
          if (b.minY - c.y >= 1.0) low = true; else { bad = true; break; }
        }
        if (bad) continue;
        const node = { x, z, y: c.y, i, j, pass: low || c.pass, id: NAV.nodes.length };
        NAV.nodes.push(node); list.push(node);
      }
      NAV.cells[i*n + j] = list;
    }
    const at = (i, j) => (i < 0 || j < 0 || i >= n || j >= n) ? [] : NAV.cells[i*n + j];
    const flat = (i, j, y) => at(i, j).some(m => !m.pass && Math.abs(m.y - y) <= .5);
    for (const A of NAV.nodes) {
      const E = [];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const diag = di && dj, dist = cs*(diag ? 1.414 : 1);
        for (const B of at(A.i + di, A.j + dj)) {
          const dy = B.y - A.y;
          if (!A.pass && !B.pass) {
            if (Math.abs(dy) <= .5) { if (!diag || (flat(A.i + di, A.j, A.y) && flat(A.i, A.j + dj, A.y))) E.push({ to: B.id, c: dist + Math.abs(dy)*.5, t: 0 }); }
            else if (dy > .5 && dy <= BOT_REACH && !diag) E.push({ to: B.id, c: dist + 1.5, t: 1 });
            else if (dy < -.5 && dy >= -6 && !diag) E.push({ to: B.id, c: dist + .5 - dy*.15, t: 2 });
          } else if (!A.pass && B.pass) { if (dy > -.1 && dy <= BOT_REACH && !diag) E.push({ to: B.id, c: dist + 1.5, t: 1 }); }
          else if (A.pass && !B.pass) { if (dy <= .5 && dy >= -6 && !diag) E.push({ to: B.id, c: dist + .3, t: dy < -.5 ? 2 : 0 }); }
          else if (Math.abs(dy) <= .1 && !diag) E.push({ to: B.id, c: dist + 2.5, t: 0 });
        }
      }
      NAV.edges[A.id] = E;
    }
    const comp = new Int32Array(NAV.nodes.length).fill(-1);
    let best = -1, bestSize = 0, cid = 0;
    for (const s of NAV.nodes) {
      if (comp[s.id] >= 0) continue;
      const stack = [s.id]; comp[s.id] = cid; let size = 0;
      while (stack.length) { const k = stack.pop(); size++; for (const e of NAV.edges[k]) if (comp[e.to] < 0) { comp[e.to] = cid; stack.push(e.to); } }
      if (size > bestSize) { bestSize = size; best = cid; }
      cid++;
    }
    NAV.main = comp; NAV.mainId = best;
    // weighted A* with a typed-array binary heap
    const N = NAV.nodes.length, g = new Float32Array(N), came = new Int32Array(N), open = new Uint32Array(N), closed = new Uint32Array(N), cap = N*6, hF = new Float32Array(cap), hId = new Int32Array(cap);
    let stamp = 0, hLen = 0;
    const push = (id, f) => { if (hLen >= cap) return; let i = hLen++; while (i > 0) { const p = (i - 1) >> 1; if (hF[p] <= f) break; hF[i] = hF[p]; hId[i] = hId[p]; i = p; } hF[i] = f; hId[i] = id; };
    const pop = () => { const top = hId[0], lf = hF[--hLen], lid = hId[hLen]; let i = 0; for (;;) { const l = i*2 + 1; if (l >= hLen) break; const r = l + 1, m = r < hLen && hF[r] < hF[l] ? r : l; if (hF[m] >= lf) break; hF[i] = hF[m]; hId[i] = hId[m]; i = m; } hF[i] = lf; hId[i] = lid; return top; };
    this.astar = (s, t, maxIter = 14000) => {
      stamp++; hLen = 0;
      const nodes = NAV.nodes, T = nodes[t], tx = T.x, ty = T.y, tz = T.z;
      const h = id => { const a = nodes[id]; return Math.hypot(a.x - tx, a.z - tz) + Math.abs(a.y - ty); };
      g[s] = 0; open[s] = stamp; came[s] = -1; push(s, h(s));
      let it = 0;
      while (hLen > 0 && it++ < maxIter) {
        const k = pop();
        if (closed[k] === stamp) continue;
        closed[k] = stamp;
        if (k === t) {
          const path = [], types = []; let c = t;
          while (c !== -1) { path.push(c); c = came[c]; }
          path.reverse();
          for (let i = 0; i < path.length; i++) types.push(i === 0 ? 0 : NAV.edges[path[i - 1]].find(e => e.to === path[i]).t);
          return { nodes: path, types };
        }
        const E = NAV.edges[k], gk = g[k];
        for (let i = 0; i < E.length; i++) {
          const e = E[i], to = e.to;
          if (closed[to] === stamp) continue;
          const ng = gk + e.c;
          if (open[to] !== stamp || ng < g[to]) { open[to] = stamp; g[to] = ng; came[to] = k; push(to, ng + 1.6*h(to)); }
        }
      }
      return null;
    };
  }
  navCell(x, z) {
    const N = this.nav, i = Math.floor((x + N.half)/N.cs), j = Math.floor((z + N.half)/N.cs);
    return (i < 0 || j < 0 || i >= N.n || j >= N.n) ? [] : N.cells[i*N.n + j];
  }
  nearestNode(x, y, z) {
    const N = this.nav; let best = -1, bd = Infinity;
    for (let r = 0; r <= 4 && best < 0; r++) {
      const ci = Math.floor((x + N.half)/N.cs), cj = Math.floor((z + N.half)/N.cs);
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= N.n || j >= N.n) continue;
        for (const nd of N.cells[i*N.n + j]) {
          if (nd.pass || N.main[nd.id] !== N.mainId) continue;
          const d = (nd.x - x)**2 + (nd.z - z)**2 + ((nd.y - y)*2)**2 + (nd.y > y + .6 ? 4 : 0);
          if (d < bd) { bd = d; best = nd.id; }
        }
      }
    }
    return best;
  }
  navLine(x0, z0, x1, z1, y) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d/.25);
    for (let k = 1; k <= n; k++) {
      const x = x0 + (x1 - x0)*k/n, z = z0 + (z1 - z0)*k/n;
      if (!this.navCell(x, z).some(nd => !nd.pass && Math.abs(nd.y - y) < .3)) return false;
    }
    return true;
  }
  nadeSolid(x, y, z) {
    if (y < NR) return true;
    for (const b of this.queryBoxes(x - NR, z - NR, x + NR, z + NR, this._qn))
      if (y > b.minY - NR && y < b.maxY + NR && x > b.minX - NR && x < b.maxX + NR && z > b.minZ - NR && z < b.maxZ + NR) return true;
    return false;
  }
}
const WORLDS = {};
for (const id in MAPS) WORLDS[id] = new World(id, MAPS[id]);

// weapon stats with a player's attachments applied (the same effects as the game's gunsmith)
function weaponStats(wid, att) {
  const w = WEAPONS[wid], s = { ...w, range: [...w.range] }, slots = ATT_SLOTS[w.model] || {};
  for (const slot in slots) {
    const id = att && att[slot];
    if (!id || !slots[slot].includes(id)) continue;
    const fx = ATT_INFO[id] && ATT_INFO[id].fx; if (!fx) continue;
    for (const k in fx) {
      if (k === 'range') s.range = s.range.map(r => r*fx.range);
      else if (k === 'mag') s.mag = Math.round(s.mag*fx.mag);
      else if (s[k] !== undefined) s[k] *= fx[k];
    }
    if (id === 'supp') s.supp = true;
  }
  return s;
}
const falloff = (w, dist) => { const [a, b] = w.range; return dist <= a ? 1 : Math.max(w.minDmg, 1 - (dist - a)/(b - a)*(1 - w.minDmg)); };

// =====================================================================
// A room: one match on one map with up to 8 fighters (players plus bots filling the empty places)
// =====================================================================
const MODES = {
  ffa: { name: 'Free-for-all', limit: 30, time: 8*60 },
  tdm: { name: 'Team Deathmatch', limit: 75, time: 8*60, teams: true },
  wz: { name: 'Mini Warzone', limit: 999, time: 0 },
};
const BOT_ROSTER = [...BOTS, ['Ghost', 0xd8dde6], ['Blaze', 0xff5fa2], ['Echo', 0x9be15d]];
const MAX_FIGHTERS = 8, BOT_PICKS = ['ar', 'ar', 'ar', 'smg', 'smg', 'shotgun', 'sniper', 'lmg', 'lmg', 'dmr'];
const PROFANITY = /\b(fuck|shit|cunt|nigg|fag|bitch|whore|slut|retard|kys|nazi|hitler|rape)/i;
function cleanName(raw) {
  let n = String(raw || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  if (!n || PROFANITY.test(n.replace(/[^a-z]/gi, ''))) n = 'Player' + Math.floor(rand(100, 999));
  return n;
}

let roomSeq = 1;
class Room {
  constructor(mode, mapId) {
    this.id = 'r' + (roomSeq++).toString(36);
    this.mode = mode; this.mapId = mapId; this.world = WORLDS[mapId];
    this.fighters = []; this.nextId = 1; this.now = 0;
    this.grenades = []; this.claymores = []; this.smokes = []; this.strikes = []; this.loot = []; this.timers = [];
    this.ev = []; this.gidSeq = 1; this.lootSeq = 1; this.clSeq = 1;
    this.teamScore = [0, 0]; this.cuav = {}; this.botUav = {};
    this.gas = { cx: 0, cz: 0, r: 0, fromX: 0, fromZ: 0, fromR: 0, toX: 0, toZ: 0, toR: 0, phase: 0, state: 'wait', t0: 0, R0: 0, respawnsOff: false };
    this.state = 'playing'; this.endAt = 0; this.nextMatchAt = 0; this.firstBlood = false;
    this.navBudget = 2;
    for (let i = 0; i < MAX_FIGHTERS; i++) this.addBot();
    this.startMatch();
  }
  get humans() { return this.fighters.filter(f => !f.isBot); }
  later(sec, fn) { this.timers.push({ at: this.now + sec, fn }); }
  enemies(a, b) { return a !== b && (!MODES[this.mode].teams || a.team !== b.team); }
  emit(e) { this.ev.push(e); }
  sendTo(f, e) { if (!f.isBot) f.out.push(e); }

  // ---- fighters ----
  newFighter(name, isBot) {
    return { id: this.nextId++, name, isBot, team: 0, pos: new V3(), velY: 0, onGround: true, mantle: null, yaw: 0, pitch: 0, stance: 0, wid: WID.ar, ads: false,
      alive: false, hp: 100, armor: 0, plates: 0, kills: 0, deaths: 0, assists: 0, streak: 0, respawnAt: 0, lastHurt: -10, lastShot: -10, dmgBy: null, speed: 0,
      hist: [], life: 0, blindUntil: 0, out: [] };
  }
  addBot() {
    const used = new Set(this.fighters.map(f => f.name));
    const pick = BOT_ROSTER.find(b => !used.has(b[0])) || BOT_ROSTER[this.nextId % BOT_ROSTER.length];
    const b = this.newFighter(pick[0], true);
    Object.assign(b, { color: pick[1], wid: WID[BOT_PICKS[Math.floor(Math.random()*BOT_PICKS.length)]], acc: .42 + Math.random()*.18,
      bodyYaw: 0, aimYaw: 0, target: null, sees: false, think: 0, reactAt: 0, nextShot: 0, strafeDir: 1, strafeChange: 0, burstLeft: 0,
      detour: null, detourUntil: 0, detourSpeed: 0, stuckCheck: 0, lastPos: new V3(), vx: 0, vz: 0, path: null, pi: 0, repathAt: 0, pathTo: null,
      nades: 1, nadeAt: 0, nadeKind: 'frag', meleeAt: 0, lastSeenT: -10, lastSeenPos: new V3(), lastSeenF: null, heard: null, heardAt: -10,
      fleeCheck: 0, alertAt: 0, goal: new V3(), hasGoal: false, goalKey: '', urgent: false, wander: null, wzPhase: '', wzSpot: null });
    this.assignTeam(b);
    this.fighters.push(b);
    if (this.state === 'playing') this.respawn(b, true);
    return b;
  }
  assignTeam(f) {
    if (!MODES[this.mode].teams) { f.team = f.id; return; }
    const n0 = this.fighters.filter(o => o !== f && o.team === 0).length, n1 = this.fighters.filter(o => o !== f && o.team === 1).length;
    const h0 = this.fighters.filter(o => o !== f && !o.isBot && o.team === 0).length, h1 = this.fighters.filter(o => o !== f && !o.isBot && o.team === 1).length;
    f.team = f.isBot ? (n0 <= n1 ? 0 : 1) : (h0 < h1 ? 0 : h1 < h0 ? 1 : n0 <= n1 ? 0 : 1);
  }
  // a player joins: they take the place of a bot (preferably a dead or low-scoring one)
  addHuman(conn, name, loadout, look) {
    const f = this.newFighter(name, false);
    f.op = tag(look && look.op); f.sk = tag(look && look.sk); f.gc = camos(look && look.gc); f.lv = look && typeof look.lv === 'string' && /^[pm0-9-]{1,9}$/.test(look.lv) ? look.lv : '';
    Object.assign(f, { conn, rtt: .1, loadout: this.cleanLoadout(loadout), ammo: {}, reload: null, fireTok: 3, lastFireT: 0, lethal: 0, tactical: 0, ksReady: {}, uavUntil: 0,
      plating: false, platingSince: 0, lastInT: 0, airT: 0, fixes: 0, token: conn.token, dcAt: 0, place: 0, ready: false, respawnAt: 0, spawnReq: true });
    if (this.fighters.length >= MAX_FIGHTERS) {
      const bots = this.fighters.filter(b => b.isBot).sort((a, b) => (a.alive - b.alive) || (a.kills - b.kills));
      if (bots.length) this.removeFighter(bots[0]);
    }
    this.assignTeam(f);
    this.fighters.push(f);
    if (MODES[this.mode].teams) this.rebalanceBots();
    this.emitRoster();
    if (this.state === 'playing' && this.mode === 'wz' && this.gas.respawnsOff) f.respawnAt = Infinity;   // too late to drop in: spectate until the next round
    return f;   // they spawn on the next tick after their game says it's ready
  }
  removeFighter(f) {
    const i = this.fighters.indexOf(f); if (i < 0) return;
    this.fighters.splice(i, 1);
    for (const o of this.fighters) { if (o.target === f) o.target = null; if (o.heard === f) o.heard = null; if (o.lastSeenF === f) o.lastSeenF = null; }
    this.claymores = this.claymores.filter(c => { if (c.owner === f) { this.emit({ t: 'cl-', id: c.id }); return false; } return true; });
  }
  dropHuman(f) {
    this.removeFighter(f);
    if (this.fighters.length < MAX_FIGHTERS) this.addBot();
    if (MODES[this.mode].teams) this.rebalanceBots();
    this.emitRoster();
  }
  rebalanceBots() {
    // keep the teams even by moving bots across
    for (let k = 0; k < 4; k++) {
      const t0 = this.fighters.filter(f => f.team === 0), t1 = this.fighters.filter(f => f.team === 1);
      if (Math.abs(t0.length - t1.length) <= 1) break;
      const big = t0.length > t1.length ? t0 : t1, bot = big.find(f => f.isBot);
      if (!bot) break;
      bot.team = 1 - bot.team;
    }
  }
  cleanLoadout(lo) {
    lo = lo || {};
    const prim = WEAPONS[lo.p] && WEAPONS[lo.p].slot === 0 ? lo.p : WID.ar, sec = WEAPONS[lo.s] && WEAPONS[lo.s].slot === 1 ? lo.s : WID.pistol;
    const att = {};
    for (const wid of [prim, sec]) {
      const a = lo.att && lo.att[WEAPONS[wid].id], out = {};
      if (a && typeof a === 'object') for (const slot in ATT_SLOTS[WEAPONS[wid].model] || {}) if (typeof a[slot] === 'string') out[slot] = a[slot];
      att[wid] = out;
    }
    return { p: prim, s: sec, att, le: EQUIP[lo.le] && EQUIP[lo.le].slot === 'lethal' ? lo.le : 'frag', ta: EQUIP[lo.ta] && EQUIP[lo.ta].slot === 'tactical' ? lo.ta : 'flash',
      stats: { [prim]: weaponStats(prim, att[prim]), [sec]: weaponStats(sec, att[sec]) } };
  }
  emitRoster() { this.emit({ t: 'roster', f: this.fighters.map(f => this.rosterEntry(f)) }); }
  rosterEntry(f) { return [f.id, f.name, f.isBot ? 1 : 0, f.team, f.color || 0, f.kills, f.deaths, f.op || '', f.sk || '', f.lv || '', f.gc || null]; }

  // ---- spawning ----
  pickSpawn(self) {
    const W = this.world, eye = new V3(), sp = new V3();
    let best = W.spawns[0], bs = -Infinity;
    for (const s of W.spawns) {
      let md = 1e9, seen = 0, mate = 0;
      sp.set(s[0], (s[2] || 0) + 1.5, s[1]);
      for (const f of this.fighters) {
        if (f === self || !f.alive) continue;
        const d = Math.hypot(f.pos.x - s[0], f.pos.z - s[1]);
        if (!this.enemies(self, f)) { if (d > 3 && d < 24) mate = 10; continue; }
        md = Math.min(md, d);
        if (d < 60 && W.clearLine(eye.set(f.pos.x, f.pos.y + EYE_Y[f.stance || 0], f.pos.z), sp)) seen++;
      }
      let score = Math.min(md, 35) - seen*18 + mate + Math.random()*6;
      if (this.mode === 'wz' && Math.hypot(s[0] - this.gas.cx, s[1] - this.gas.cz) > this.gas.r - 3) score -= 200;
      if (score > bs) { bs = score; best = s; }
    }
    return best;
  }
  respawn(f, quiet) {
    const s = this.pickSpawn(f);
    f.pos.set(s[0] + rand(-.4, .4), s[2] || 0, s[1] + rand(-.4, .4)); this.world.collide(f.pos, R);
    Object.assign(f, { alive: true, hp: 100, velY: 0, onGround: true, mantle: null, lastHurt: -10, dmgBy: null, streak: 0, stance: 0, blindUntil: 0, hist: [], life: f.life + 1, speed: 0 });
    f.yaw = Math.atan2(f.pos.x, f.pos.z);
    if (this.mode === 'wz') { f.armor = this.state === 'playing' && this.now - this.matchStart < 1 ? 150 : 100; f.plates = Math.max(f.plates || 0, 2); } else { f.armor = 0; f.plates = 0; }
    if (f.isBot) {
      Object.assign(f, { target: null, reactAt: this.now + .6, think: this.now + Math.random()*.5, path: null, wander: null, nades: 1, nadeAt: this.now + rand(10, 20),
        nadeKind: Math.random() < .3 ? 'flash' : 'frag', hasGoal: false, goalKey: '', urgent: false, detourUntil: 0, vx: 0, vz: 0, ammo: undefined, reloadUntil: 0 });
      f.bodyYaw = f.aimYaw = Math.atan2(-f.pos.x, -f.pos.z); f.lastPos.copy(f.pos);
    } else {
      if (f.nextLoadout) { f.loadout = f.nextLoadout; f.nextLoadout = null; }
      const lo = f.loadout;
      f.wid = lo.p; f.ammo = { [lo.p]: lo.stats[lo.p].mag, [lo.s]: lo.stats[lo.s].mag }; f.reload = null; f.fireTok = 3;
      f.lethal = EQUIP[lo.le].count; f.tactical = EQUIP[lo.ta].count; f.plating = false; f.airT = 0; f.lastInT = this.now;
      this.sendTo(f, { t: 'spawn', p: f.pos.arr(), y: r2(f.yaw), l: f.life, ar: f.armor, pl: f.plates });
    }
  }

  // ---- match flow ----
  startMatch() {
    this.state = 'playing'; this.matchStart = this.now; this.firstBlood = false; this.teamScore = [0, 0];
    this.grenades.length = 0; this.claymores.length = 0; this.smokes.length = 0; this.strikes.length = 0; this.loot.length = 0; this.timers.length = 0;
    this.cuav = {}; this.botUav = {};
    const M = MODES[this.mode];
    this.endAt = M.time ? this.now + M.time : 0;
    for (const f of this.fighters) { f.kills = f.deaths = f.assists = f.streak = 0; f.place = 0; if (!f.isBot) { f.ksReady = {}; f.uavUntil = 0; } f.plates = 0; }
    if (this.mode === 'wz') this.wzSetup();
    for (const f of this.fighters) if (f.isBot || f.ready) this.respawn(f, true); else { f.respawnAt = 0; f.spawnReq = true; }
    this.emit({ t: 'match', mode: this.mode, limit: M.limit, end: this.endAt ? r2(this.endAt) : 0, now: r2(this.now) });
    this.emitRoster();
  }
  endMatch(winner) {
    if (this.state !== 'playing') return;
    this.state = 'over'; this.nextMatchAt = this.now + 12;
    const st = [...this.fighters].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).map(f => [f.id, f.kills, f.deaths]);
    this.emit({ t: 'over', w: winner ? winner.id : -1, team: MODES[this.mode].teams ? (this.teamScore[0] > this.teamScore[1] ? 0 : this.teamScore[1] > this.teamScore[0] ? 1 : -1) : -1, ts: this.teamScore, st });
  }
  checkWin(a) {
    if (this.state !== 'playing') return;
    const M = MODES[this.mode];
    if (this.mode === 'wz') return;
    if (M.teams) { if (this.teamScore[0] >= M.limit || this.teamScore[1] >= M.limit) this.endMatch(null); }
    else if (a && a.kills >= M.limit) this.endMatch(a);
  }

  // ---- damage ----
  damage(v, amt, a, head, how) {
    if (!v.alive || this.state !== 'playing') return;
    if (a && a !== v && !this.enemies(a, v)) return;
    let armorHit = false; const raw = amt;
    if (this.mode === 'wz' && v.armor > 0 && how !== 'Gas') { const soak = Math.min(v.armor, amt); v.armor -= soak; amt -= soak; armorHit = true; }
    v.hp -= amt; v.lastHurt = this.now;
    if (a && a !== v) {
      (v.dmgBy || (v.dmgBy = new Map())).set(a, (v.dmgBy.get(a) || 0) + amt);
      if (MODES[this.mode].teams) a.hurtAllyT = this.now;
    }
    if (v.isBot && a && a !== v && (!v.sees || Math.random() < .5)) { v.target = a; v.reactAt = Math.min(v.reactAt, this.now + .25); }
    const killed = v.hp <= 0;
    if (!v.isBot) this.sendTo(v, { t: 'hurt', a: a ? a.id : -1, d: r2(amt), r: r2(raw), how: how || '', hp: Math.max(0, Math.ceil(v.hp)), ar: Math.ceil(v.armor || 0) });
    if (a && !a.isBot && a !== v) this.sendTo(a, { t: 'hm', v: v.id, h: head ? 1 : 0, ar: armorHit ? 1 : 0, k: killed ? 1 : 0, d: r2(raw) });
    if (killed) this.kill(v, a, head, how);
  }
  kill(v, a, head, how) {
    v.alive = false; v.hp = 0; v.deaths++; v.plating = false; v.spawnReq = false;
    const self = !a || a === v, vStreak = v.streak; v.streak = 0;
    if (!self) {
      a.kills++; a.streak++;
      if (!a.isBot) for (const k in STREAK_N) if (a.streak === STREAK_N[k] && !a.ksReady[k]) { a.ksReady[k] = true; this.sendTo(a, { t: 'ks', id: k }); }
      if (a.isBot) this.botStreak(a);
      if (this.mode === 'tdm') this.teamScore[a.team]++;
    }
    const killer = a || v;
    if (v.dmgBy) for (const [att, d] of v.dmgBy) if (att !== killer && att !== v && d >= 20 && this.enemies(att, v)) { att.assists++; if (!att.isBot) this.sendTo(att, { t: 'assist', v: v.id }); }
    v.dmgBy = null;
    this.emit({ t: 'kill', k: killer.id, v: v.id, how: how || '', h: head ? 1 : 0, w: killer.isBot ? killer.wid : (killer.wid ?? -1), vs: vStreak, fb: !self && !this.firstBlood ? 1 : 0, kk: killer.kills, vd: v.deaths, ks: self ? 0 : killer.streak });
    if (!self) this.firstBlood = true;
    if (this.mode === 'wz') {
      this.dropLoot(v);
      v.respawnAt = this.gas.respawnsOff ? Infinity : this.now + 5;
      this.wzCheckEnd();
    } else v.respawnAt = this.now + 3;
    this.checkWin(killer);
  }

  // ---- player messages ----
  handle(f, m) {
    switch (m.t) {
      case 'in': return this.onState(f, m);
      case 'fire': return this.onFire(f, m);
      case 'reload': return this.onReload(f, m);
      case 'ready': f.ready = true; return;
      case 'spawn': f.spawnReq = true; return;
      case 'melee': return this.onMelee(f, m);
      case 'nade': return this.onNade(f, m);
      case 'clay': return this.onClay(f, m);
      case 'plate': f.plating = !!m.on && this.mode === 'wz'; f.platingSince = this.now; return;
      case 'useks': return this.onStreak(f, m);
      case 'lo': {   // takes effect on the next respawn; a new look shows straight away
        f.nextLoadout = this.cleanLoadout(m.lo);   // guns and equipment switch when they next spawn, as in their game
        const op = tag(m.op), sk = tag(m.sk), gc = camos(m.gc);
        if ((op && op !== f.op) || (sk && sk !== f.sk) || JSON.stringify(gc) !== JSON.stringify(f.gc)) { f.op = op || f.op; f.sk = sk || f.sk; f.gc = gc; this.emitRoster(); }
        return;
      }
    }
  }
  // movement is simulated on the player's machine (so it feels instant) and checked here:
  // no faster than the fastest legal move, no walking through walls, no flying
  onState(f, m) {
    if (!f.alive || m.l !== f.life) return;
    const p = m.p; if (!vec3(p)) return;
    const W = this.world, dtS = clamp(this.now - f.lastInT, .016, 1); f.lastInT = this.now;
    const dx = p[0] - f.pos.x, dz = p[2] - f.pos.z, dist = Math.hypot(dx, dz);
    let ok = dist <= 15*dtS + .8 && Math.abs(p[0]) < W.arena + 1 && Math.abs(p[2]) < W.arena + 1 && p[1] > -2 && p[1] < 30;
    if (ok && dist > .05) {
      const t = W.rayBoxes(f.pos.x, f.pos.y + (m.st || f.stance ? .55 : 1.2), f.pos.z, dx/dist, 0, dz/dist, dist);
      if (t < Infinity && !W.rayHit.box.pass && W.rayHit.box.maxY > Math.max(f.pos.y, p[1]) + 2.3) ok = false;
    }
    if (ok) {
      const g = W.groundAt({ x: p[0], y: p[1], z: p[2] });
      if (p[1] > g + 2.8) { f.airT += dtS; if (f.airT > 1.6) ok = false; } else f.airT = 0;
    }
    if (!ok) { f.fixes++; this.sendTo(f, { t: 'fix', p: f.pos.arr() }); return; }
    f.speed = dist/dtS;
    f.pos.set(p[0], p[1], p[2]);
    if (fin(m.y)) f.yaw = wrap(m.y);
    if (fin(m.pt)) f.pitch = clamp(m.pt, -1.6, 1.6);
    f.stance = m.st === 1 || m.st === 2 ? m.st : 0;
    f.ads = !!m.a;
    if ((m.w === f.loadout.p || m.w === f.loadout.s) && m.w !== f.wid) { f.wid = m.w; if (f.reload && f.reload.wid !== m.w) f.reload = null; }   // switching guns cancels a reload
  }
  eyeOf(f, out) { return out.set(f.pos.x, f.pos.y + (f.isBot ? 1.55 : EYE_Y[f.stance || 0]), f.pos.z); }
  // where a fighter was `t` seconds into the room clock (for lag compensation)
  posAt(f, t, out) {
    const H = f.hist;
    if (!H.length || t >= H[H.length - 1][0]) { out.st = f.stance || 0; return out.copy(f.pos); }
    for (let i = H.length - 1; i > 0; i--) {
      const a = H[i - 1], b = H[i];
      if (t >= a[0]) { const k = (t - a[0])/Math.max(1e-4, b[0] - a[0]); out.st = k < .5 ? a[4] : b[4]; return out.set(a[1] + (b[1] - a[1])*k, a[2] + (b[2] - a[2])*k, a[3] + (b[3] - a[3])*k); }
    }
    out.st = H[0][4]; return out.set(H[0][1], H[0][2], H[0][3]);
  }
  // first fighter a ray hits (head sphere + body cylinder), using positions as the shooter saw them
  rayFighters(shooter, o, d, far, rewindT) {
    let best = far, hitF = null, head = false;
    const p = this._rp || (this._rp = new V3());
    for (const f of this.fighters) {
      if (f === shooter || !f.alive || !this.enemies(shooter, f)) continue;
      this.posAt(f, rewindT, p); const st = f.isBot ? 0 : p.st;
      const hx = p.x - o.x, hy = p.y + HEAD_Y[st] - o.y, hz = p.z - o.z, tc = hx*d.x + hy*d.y + hz*d.z;
      if (tc < -1 || tc > best + 1) continue;
      const rr = .2*.2, d2 = hx*hx + hy*hy + hz*hz - tc*tc;
      if (d2 < rr) { const t = tc - Math.sqrt(rr - d2); if (t > 0 && t < best) { best = t; hitF = f; head = true; } }
      const cx = o.x - p.x, cz = o.z - p.z, A = d.x*d.x + d.z*d.z;
      if (A > 1e-6) {
        const B = cx*d.x + cz*d.z, C = cx*cx + cz*cz - .34*.34, disc = B*B - A*C;
        if (disc > 0) { const t = (-B - Math.sqrt(disc))/A, y = o.y + d.y*t - p.y; if (t > 0 && t < best && y > 0 && y < BODY_H[st]) { best = t; hitF = f; head = false; } }
      }
    }
    return hitF ? { f: hitF, t: best, head } : null;
  }
  onFire(f, m) {
    if (!f.alive || this.state !== 'playing' || f.plating) return;
    const wid = m.w; if (wid !== f.loadout.p && wid !== f.loadout.s) return;
    const w = f.loadout.stats[wid];
    // fire rate: a small token bucket so network jitter doesn't eat shots, but nobody fires faster than the gun
    const nowT = this.now;
    f.fireTok = Math.min(3, f.fireTok + (nowT - f.lastFireT)/w.rate); f.lastFireT = nowT;
    if (f.fireTok < .85) return;
    f.fireTok -= 1;
    if (f.reload) { if (f.reload.wid !== wid || (WEAPONS[wid].shellReload && f.ammo[wid] > 0)) f.reload = null; else return; }
    if ((f.ammo[wid] || 0) <= 0) return;
    f.ammo[wid]--;
    f.wid = wid; f.lastShot = nowT;
    const o = m.o, aim = m.a, pel = m.d;
    if (!vec3(o) || !vec3(aim) || !Array.isArray(pel)) return;
    const origin = new V3(o[0], o[1], o[2]), eye = this.eyeOf(f, new V3());
    if (origin.distanceTo(eye) > 1.4 + f.speed*.12) origin.copy(eye);   // shots come from where you are
    const al = Math.hypot(aim[0], aim[1], aim[2]) || 1, A = { x: aim[0]/al, y: aim[1]/al, z: aim[2]/al };
    const maxCone = WEAPONS[wid].spread*6 + .02, rewind = this.rewindFor(f, m);
    const W = this.world, dealt = new Map();
    let firstEnd = null, firstSurf = '', firstN = null;
    for (let i = 0; i < Math.min(pel.length, WEAPONS[wid].pellets); i++) {
      const p = pel[i]; if (!vec3(p)) continue;
      const pl = Math.hypot(p[0], p[1], p[2]) || 1, d = { x: p[0]/pl, y: p[1]/pl, z: p[2]/pl };
      if (Math.acos(clamp(d.x*A.x + d.y*A.y + d.z*A.z, -1, 1)) > maxCone) continue;
      let tw = W.rayWorld(origin, d, 250), fh = this.rayFighters(f, origin, d, Math.min(tw, 250), rewind), mult = 1;
      // through thin wood or metal, the same way the game draws it
      const box = W.hit.box, sm = box && !fh && !box.noMantle && w.pen ? PEN_SURF[box.surface] : 0;
      if (sm) {
        const exitT = W.boxExit(box, origin, d), thick = exitT - tw;
        if (thick > 0 && thick <= w.pen) {
          const o2 = new V3(origin.x + d.x*(exitT + .01), origin.y + d.y*(exitT + .01), origin.z + d.z*(exitT + .01));
          const tw2 = W.rayWorld(o2, d, 250 - exitT), fh2 = this.rayFighters(f, o2, d, Math.min(tw2, 250 - exitT), rewind);
          mult = sm*(1 - .35*thick/w.pen);
          tw = tw2 < Infinity ? exitT + .01 + tw2 : Infinity;
          if (fh2) fh = { f: fh2.f, t: fh2.t + exitT + .01, head: fh2.head };
        }
      }
      const tEnd = fh ? fh.t : tw < Infinity ? tw : 150;
      if (i === 0) { firstEnd = new V3(origin.x + d.x*tEnd, origin.y + d.y*tEnd, origin.z + d.z*tEnd); firstSurf = fh ? 'flesh' : tw < Infinity ? W.hit.surface : ''; firstN = !fh && tw < Infinity ? W.hit.n.arr() : null; }
      if (fh) {
        const yHit = origin.y + d.y*fh.t, legs = !fh.head && yHit - fh.f.pos.y < .8;
        const dmg = w.dmg*(fh.head ? w.hs : legs ? .85 : 1)*falloff(w, fh.t)*mult;
        const e = dealt.get(fh.f) || { d: 0, head: false }; e.d += dmg; e.head = e.head || fh.head; dealt.set(fh.f, e);
      }
    }
    if (firstEnd) this.emit({ t: 'sh', i: f.id, o: origin.arr(), e: firstEnd.arr(), s: firstSurf, n: firstN, w: wid, sup: w.supp ? 1 : 0 });
    for (const [v, e] of dealt) this.damage(v, e.d, f, e.head);
    this.alertBots(f, w.supp ? 12 : WEAPONS[wid].id === 'sniper' || WEAPONS[wid].pellets > 1 ? 60 : 45, this.cuavOn(f) ? .25 : .7);
  }
  onReload(f, m) {
    if (!f.alive) return;
    if (m.w === f.loadout.p || m.w === f.loadout.s) f.wid = m.w;
    const wid = f.wid, w = f.loadout.stats[wid]; if (!w || f.reload || f.ammo[wid] >= w.mag) return;
    const empty = f.ammo[wid] === 0;
    f.reload = { wid, shell: !!WEAPONS[wid].shellReload, next: this.now + (WEAPONS[wid].shellReload ? w.reload : (empty && w.reloadEmpty ? w.reloadEmpty : w.reload))*.8 };
  }
  // lag compensation: judge a shot against where everyone was at the moment the shooter's screen showed
  // (the game sends that moment, `rt`); never more than 0.4 s back, so a laggy or lying client can't reach far
  rewindFor(f, m) {
    if (fin(m.rt)) return clamp(m.rt, this.now - .4, this.now);
    return this.now - clamp(f.rtt + .1, 0, .4);
  }
  onMelee(f, m) {
    if (!f.alive || this.state !== 'playing' || this.now < (f.meleeAt || 0)) return;
    f.meleeAt = this.now + .7;
    const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw), rewind = this.rewindFor(f, m), p = new V3();
    let best = null, bd = 2.7;
    for (const v of this.fighters) {
      if (!v.alive || !this.enemies(f, v)) continue;
      this.posAt(v, rewind, p);
      if (Math.abs(p.y - f.pos.y) > 1.3) continue;
      const dx = p.x - f.pos.x, dz = p.z - f.pos.z, d = Math.hypot(dx, dz);
      if (d > bd || d < 1e-3 || (dx*fx + dz*fz)/d < (d < 1.2 ? .3 : .7)) continue;
      if (!this.world.clearLine(this.eyeOf(f, new V3()), new V3(p.x, p.y + 1.4, p.z))) continue;
      best = v; bd = d;
    }
    if (best) this.later(.1, () => { if (best.alive && f.alive) this.damage(best, 150, f, false, 'Melee'); });
  }
  onNade(f, m) {
    if (!f.alive || this.state !== 'playing') return;
    const kind = m.k, lo = f.loadout;
    if (!['frag', 'flash', 'smoke'].includes(kind)) return;
    if (kind === 'frag' ? (lo.le !== 'frag' || f.lethal <= 0) : (lo.ta !== kind || f.tactical <= 0)) return;
    const o = m.o, v = m.v; if (!vec3(o) || !vec3(v)) return;
    const origin = new V3(o[0], o[1], o[2]); if (origin.distanceTo(this.eyeOf(f, new V3())) > 1.5) origin.copy(this.eyeOf(f, new V3()));
    const vel = new V3(v[0], v[1], v[2]), sp = Math.hypot(vel.x, vel.y, vel.z); if (sp > 24) { vel.x *= 24/sp; vel.y *= 24/sp; vel.z *= 24/sp; }
    if (kind === 'frag') f.lethal--; else f.tactical--;
    const fuse = kind === 'frag' ? clamp(num(m.f, GREN.fuse), .05, GREN.fuse) : kind === 'flash' ? 1.4 : 1.2;
    this.spawnGrenade(origin, vel, fuse, f, kind, num(m.lid, 0));
  }
  onClay(f, m) {
    if (!f.alive || this.state !== 'playing' || f.loadout.le !== 'claymore' || f.lethal <= 0) return;
    const p = m.p; if (!vec3(p)) return;
    const pos = new V3(p[0], p[1], p[2]); if (Math.hypot(pos.x - f.pos.x, pos.z - f.pos.z) > 2.2 || Math.abs(pos.y - f.pos.y) > 1.5) return;
    f.lethal--;
    this.addClaymore(pos, num(m.y, f.yaw), f);
  }
  onStreak(f, m) {
    const id = m.id; if (!f.alive || !f.ksReady[id]) return;
    if (id === 'air') {
      const p = m.p; if (!vec3(p)) return;
      const t = new V3(clamp(p[0], -this.world.arena, this.world.arena), clamp(p[1], 0, 30), clamp(p[2], -this.world.arena, this.world.arena));
      if (Math.hypot(t.x - f.pos.x, t.z - f.pos.z) > 170) return;
      f.ksReady.air = false; this.callAirstrike(t, f); return;
    }
    f.ksReady[id] = false;
    if (id === 'uav') { if (this.uavJammed(f)) { this.sendTo(f, { t: 'msg', m: 'UAV JAMMED BY ENEMY COUNTER-UAV' }); return; } f.uavUntil = this.now + 25; this.sendTo(f, { t: 'uav', d: 25 }); }
    if (id === 'cuav') {
      this.cuav[this.teamKey(f)] = this.now + 25;
      for (const o of this.fighters) if (!o.isBot && this.enemies(f, o) && o.uavUntil > this.now) { o.uavUntil = this.now; this.sendTo(o, { t: 'uav', d: 0, jam: 1 }); }
      this.sendTo(f, { t: 'cuav', d: 25 });
      for (const o of this.fighters) if (!o.isBot && this.enemies(f, o)) this.sendTo(o, { t: 'msg', m: 'ENEMY COUNTER-UAV ACTIVE' });
    }
  }
  teamKey(f) { return MODES[this.mode].teams ? 't' + f.team : 'f' + f.id; }
  cuavOn(f) { for (const k in this.cuav) if (this.cuav[k] > this.now && k !== this.teamKey(f)) return true; return false; }   // an enemy counter-UAV is up
  uavJammed(f) { return this.cuavOn(f); }

  // ---- grenades ----
  spawnGrenade(p, v, fuse, owner, kind, lid) {
    const g = { id: this.gidSeq++, p: p.clone(), v: v.clone(), fuse, owner, kind, age: 0 };
    this.grenades.push(g);
    this.emit({ t: 'nade', id: g.id, by: owner.id, k: kind, o: p.arr(), v: [r2(v.x), r2(v.y), r2(v.z)], f: r2(fuse), lid: lid || 0 });
  }
  stepNade(g, h) {
    const W = this.world, p = g.p, v = g.v;
    v.y -= NADE_G*h;
    p.x += v.x*h; if (W.nadeSolid(p.x, p.y, p.z)) { p.x -= v.x*h; v.x *= -.4; v.y *= .8; v.z *= .8; }
    p.z += v.z*h; if (W.nadeSolid(p.x, p.y, p.z)) { p.z -= v.z*h; v.z *= -.4; v.x *= .8; v.y *= .8; }
    p.y += v.y*h;
    if (W.nadeSolid(p.x, p.y, p.z)) {
      p.y -= v.y*h;
      if (v.y < 0) { p.y = W.surfaceBelow(p.x, p.z, p.y + .01) + NR + .002; v.y = v.y > -2.5 ? 0 : v.y*-.33; v.x *= .75; v.z *= .75; } else v.y *= -.2;
    }
    if (v.y <= 0 && W.nadeSolid(p.x, p.y - .006, p.z)) { const f = Math.max(0, 1 - 5*h); v.x *= f; v.z *= f; if (v.y > -1) v.y = 0; }
    p.x = clamp(p.x, -W.arena + .1, W.arena - .1); p.z = clamp(p.z, -W.arena + .1, W.arena - .1);
  }
  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.fuse -= dt; g.age += dt;
      if (g.fuse <= 0) {
        this.grenades.splice(i, 1);
        if (g.kind === 'flash') this.flashBang(g); else if (g.kind === 'smoke') this.popSmoke(g); else this.explode(g.p, g.owner, 'Frag', {}, g.id);
        continue;
      }
      const n = Math.max(1, Math.ceil(dt*240)), h = dt/n;
      for (let k = 0; k < n; k++) this.stepNade(g, h);
    }
  }
  explode(p, owner, how, o, gid) {
    const W = this.world, R0 = o.radius || GREN.radius, L = o.lethal || GREN.lethal, MX = o.maxDmg || GREN.maxDmg;
    this.emit({ t: 'boom', k: how === 'Claymore' ? 'clay' : how === 'Airstrike' ? 'air' : 'frag', p: p.arr(), id: gid || 0, big: o.big ? 1 : 0 });
    const src = new V3(p.x, p.y + .12, p.z), c = new V3();
    for (const f of this.fighters) {
      if (!f.alive || (owner && f !== owner && !this.enemies(owner, f))) continue;
      c.set(f.pos.x, f.pos.y + 1.1, f.pos.z);
      const d = c.distanceTo(p); if (d > R0) continue;
      let scale = 1;
      if (o.cone) {
        const ux = f.pos.x - p.x, uz = f.pos.z - p.z;
        if ((ux*o.cone.x + uz*o.cone.z)/(Math.hypot(ux, uz) || 1) < .2) { if (d > 1.2 || f === owner) continue; scale = .15; }
      }
      if (!W.clearLine(src, c) && !W.clearLine(src, c.set(f.pos.x, f.pos.y + .3, f.pos.z)) && !W.clearLine(src, c.set(f.pos.x, f.pos.y + 1.65, f.pos.z))) continue;
      const dmg = (d <= L ? MX : MX*Math.pow(1 - (d - L)/(R0 - L), 1.4))*scale;
      if (dmg >= 2) this.damage(f, dmg, owner, false, how);
    }
    if (owner && owner.alive) this.alertBots(owner, 40, .8);
  }
  flashBang(g) {
    const W = this.world, pos = new V3(g.p.x, g.p.y + .12, g.p.z), e = new V3();
    this.emit({ t: 'boom', k: 'flash', p: pos.arr(), id: g.id });
    for (const f of this.fighters) {
      if (!f.alive) continue;
      this.eyeOf(f, e); const d = e.distanceTo(pos);
      if (d > 16 || !W.clearLine(pos, e)) continue;
      const dx = (pos.x - e.x)/d, dy = (pos.y - e.y)/d, dz = (pos.z - e.z)/d;
      const facing = f.isBot ? dx*Math.sin(f.aimYaw) + dz*Math.cos(f.aimYaw) : dx*(-Math.sin(f.yaw)*Math.cos(f.pitch)) + dy*Math.sin(f.pitch) + dz*(-Math.cos(f.yaw)*Math.cos(f.pitch));
      const k = 1 - d/16, dur = (.5 + 3.5*k)*(facing > .5 ? 1 : facing > 0 ? .75 : .4);
      if (f.isBot) f.blindUntil = Math.max(f.blindUntil, this.now + dur);
      else this.sendTo(f, { t: 'flash', d: r2(dur), k: r2(k) });
      if (g.owner && !g.owner.isBot && g.owner !== f && this.enemies(g.owner, f)) this.sendTo(g.owner, { t: 'hm', v: f.id, h: 0, ar: 0, k: 0 });
    }
  }
  popSmoke(g) {
    this.smokes.push({ x: g.p.x, y: Math.max(0, g.p.y - NR), z: g.p.z, t0: this.now, until: this.now + 16, r: 1 });
    this.emit({ t: 'boom', k: 'smoke', p: g.p.arr(), id: g.id });
  }
  smokeBlocks(a, b) {
    for (const s of this.smokes) {
      if (this.now - s.t0 < .8 || this.now > s.until - 1.5) continue;
      const r = Math.min(4.6, 1 + (this.now - s.t0)*2)*.85, cx = s.x, cy = s.y + 1.3, cz = s.z, abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L2 = abx*abx + aby*aby + abz*abz;
      const t = L2 > 0 ? clamp(((cx - a.x)*abx + (cy - a.y)*aby + (cz - a.z)*abz)/L2, 0, 1) : 0;
      const dx = a.x + abx*t - cx, dy = (a.y + aby*t - cy)*.7, dz = a.z + abz*t - cz;
      if (dx*dx + dy*dy + dz*dz < r*r) return true;
    }
    return false;
  }
  los(a, b) {
    const ea = this.eyeOf(a, this._la || (this._la = new V3())), eb = this.eyeOf(b, this._lb || (this._lb = new V3()));
    return this.world.clearLine(ea, eb) && !(this.smokes.length && this.smokeBlocks(ea, eb));
  }
  // ---- claymores ----
  addClaymore(pos, yw, owner) {
    const mine = this.claymores.filter(c => c.owner === owner);
    if (mine.length >= 2) { this.claymores.splice(this.claymores.indexOf(mine[0]), 1); this.emit({ t: 'cl-', id: mine[0].id }); }
    const c = { id: this.clSeq++, x: pos.x, y: this.world.surfaceBelow(pos.x, pos.z, pos.y + .3), z: pos.z, fx: -Math.sin(yw), fz: -Math.cos(yw), yw, owner, armAt: this.now + 1, trip: 0 };
    this.claymores.push(c);
    this.emit({ t: 'cl+', id: c.id, by: owner.id, p: [r2(c.x), r2(c.y), r2(c.z)], y: r2(yw) });
  }
  updateClaymores() {
    for (let i = this.claymores.length - 1; i >= 0; i--) {
      const c = this.claymores[i];
      if (c.trip) { if (this.now >= c.trip) { this.claymores.splice(i, 1); this.emit({ t: 'cl-', id: c.id }); this.explode(new V3(c.x, c.y + .25, c.z), c.owner, 'Claymore', { cone: { x: c.fx, z: c.fz }, radius: 7, lethal: 4.5, maxDmg: 160 }); } continue; }
      if (this.now < c.armAt) continue;
      for (const f of this.fighters) {
        if (!f.alive || !this.enemies(c.owner, f) || Math.abs(f.pos.y - c.y) > 1.3) continue;
        const dx = f.pos.x - c.x, dz = f.pos.z - c.z, d = Math.hypot(dx, dz);
        if (d < 2.6 && d > .05 && (dx*c.fx + dz*c.fz)/d > .55) { c.trip = this.now + .22; this.emit({ t: 'beep', p: [r2(c.x), r2(c.y), r2(c.z)] }); break; }
      }
    }
  }
  // ---- airstrikes ----
  callAirstrike(target, owner) {
    const a = Math.random()*Math.PI*2, d = { x: Math.sin(a), z: Math.cos(a) };
    const s = { t: target, d, owner, at: this.now + 3.2, bombs: 0 };
    this.strikes.push(s);
    this.emit({ t: 'air', by: owner.id, p: target.arr(), d: [r2(d.x), r2(d.z)], at: r2(s.at) });
  }
  updateStrikes() {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]; if (this.now < s.at) continue;
      const x = (this.now - s.at)*140 - 260;
      while (s.bombs < 5 && x > -12 + s.bombs*16) {
        const off = -8 + s.bombs*4, bx = s.t.x + s.d.x*off + rand(-1, 1), bz = s.t.z + s.d.z*off + rand(-1, 1);
        if (Math.abs(bx) < this.world.arena + 4 && Math.abs(bz) < this.world.arena + 4) this.explode(new V3(bx, this.world.surfaceBelow(bx, bz, 30) + .15, bz), s.owner, 'Airstrike', { radius: 9, lethal: 4.8, maxDmg: 190, big: true });
        s.bombs++;
      }
      if (s.bombs >= 5) this.strikes.splice(i, 1);
    }
  }
  botStreak(a) {
    if (a.streak === STREAK_N.uav && !this.cuavOn(a)) this.botUav[this.teamKey(a)] = this.now + 20;
    if (a.streak === STREAK_N.air && a.target && a.target.alive) this.callAirstrike(a.target.pos.clone(), a);
  }
  botHasUav(b) { return (this.botUav[this.teamKey(b)] || 0) > this.now && !this.cuavOn(b); }
  alertBots(src, radius, chance) {
    for (const b of this.fighters) {
      if (!b.isBot || !b.alive || b === src || b.pos.distanceToSquared(src.pos) > radius*radius || Math.random() > chance) continue;
      b.heard = src; b.heardAt = this.now;
      if (!b.sees) b.think = Math.min(b.think, this.now + .2);
    }
  }

  // ---- Mini Warzone ----
  wzSetup() {
    const g = this.gas;
    Object.assign(g, { R0: this.world.arena*1.45, cx: 0, cz: 0, phase: 0, respawnsOff: false });
    g.r = g.R0; this.nextCircle(); g.state = 'wait'; g.t0 = this.now;
    for (const f of this.fighters) { f.armor = 150; f.plates = 2; }
  }
  nextCircle() {
    const g = this.gas, toR = WZ.phases[g.phase][2]*g.R0, W = this.world;
    let tx = g.cx, tz = g.cz;
    for (let k = 0; k < 40; k++) {
      const a = Math.random()*6.283, d = Math.random()*Math.max(0, g.r - toR)*.8, x = g.cx + Math.cos(a)*d, z = g.cz + Math.sin(a)*d;
      if (Math.abs(x) < W.arena - 4 && Math.abs(z) < W.arena - 4 && W.nearestNode(x, 0, z) >= 0) { tx = x; tz = z; break; }
    }
    Object.assign(g, { fromX: g.cx, fromZ: g.cz, fromR: g.r, toX: tx, toZ: tz, toR });
  }
  updateGas(dt) {
    const g = this.gas, ph = WZ.phases[g.phase], t = this.now - g.t0;
    if (g.state === 'wait' && t >= ph[0]) {
      g.state = 'close'; g.t0 = this.now;
      if (g.phase === 2 && !g.respawnsOff) { g.respawnsOff = true; this.emit({ t: 'msg', m: 'RESPAWNS DISABLED', say: 'Respawns disabled. Last one standing wins.' }); this.wzCheckEnd(); }
      else this.emit({ t: 'msg', m: 'THE GAS IS CLOSING', say: 'The gas is closing' });
    } else if (g.state === 'close') {
      const k = Math.min(1, t/ph[1]), e = k*k*(3 - 2*k);
      g.cx = g.fromX + (g.toX - g.fromX)*e; g.cz = g.fromZ + (g.toZ - g.fromZ)*e; g.r = g.fromR + (g.toR - g.fromR)*e;
      if (k >= 1 && g.phase < WZ.phases.length - 1) { g.phase++; this.nextCircle(); g.state = 'wait'; g.t0 = this.now; }
    }
    for (const f of this.fighters) {
      if (!f.alive || Math.hypot(f.pos.x - g.cx, f.pos.z - g.cz) <= g.r) { f.gasT = 0; continue; }
      f.gasT = (f.gasT || 0) + dt;
      if (f.gasT >= .5) { f.gasT -= .5; this.damage(f, WZ.dmg[g.phase]*.5, null, false, 'Gas'); }
    }
    // armor plating (players hold the key; bots plate when it's quiet)
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (f.isBot) {
        if (f.armor < 150 && f.plates > 0 && !f.sees && this.now - f.lastHurt > 1.5) { f.plateT = (f.plateT || 0) + dt; if (f.plateT >= PLATE_TIME*1.1) { f.plateT = 0; f.armor = Math.min(150, f.armor + 50); f.plates--; } }
        else f.plateT = 0;
      } else if (f.plating) {
        if (f.plates <= 0 || f.armor >= 150) f.plating = false;
        else if (this.now - f.platingSince >= PLATE_TIME*.92) { f.armor = Math.min(150, f.armor + 50); f.plates--; f.platingSince = this.now; }
      }
    }
    this.updateLoot();
  }
  wzAlive() { return this.fighters.filter(f => f.alive || (f.respawnAt < Infinity && (f.isBot || f.ready))).length; }
  wzCheckEnd() {
    if (this.state !== 'playing' || !this.gas.respawnsOff) return;
    const alive = this.wzAlive();
    for (const f of this.fighters) if (!f.isBot && !f.alive && f.respawnAt === Infinity && !f.place) { f.place = alive + 1; this.sendTo(f, { t: 'out', place: f.place, of: this.fighters.length }); }
    if (alive <= 1) { const w = this.fighters.find(f => f.alive || f.respawnAt < Infinity); if (w) w.place = 1; this.later(1, () => this.endMatch(w || null)); }
  }
  dropLoot(v) {
    const n = 1 + Math.min(2, v.plates || 0);
    if (this.loot.length >= 20) { const old = this.loot.shift(); this.emit({ t: 'lt-', id: old.id }); }
    const L = { id: this.lootSeq++, x: v.pos.x, y: v.pos.y, z: v.pos.z, n, born: this.now };
    this.loot.push(L); v.plates = 0;
    this.emit({ t: 'lt+', id: L.id, p: [r2(L.x), r2(L.y), r2(L.z)], n });
  }
  updateLoot() {
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const L = this.loot[i];
      if (this.now - L.born > 60) { this.loot.splice(i, 1); this.emit({ t: 'lt-', id: L.id }); continue; }
      for (const f of this.fighters) {
        if (!f.alive || (f.plates || 0) >= 5 || Math.abs(f.pos.y - L.y) > 1.6 || (f.pos.x - L.x)**2 + (f.pos.z - L.z)**2 > 1.5) continue;
        const take = Math.min(L.n, 5 - (f.plates || 0)); f.plates = (f.plates || 0) + take; L.n -= take;
        if (!f.isBot) this.sendTo(f, { t: 'msg', m: `+${take} ARMOR PLATE${take > 1 ? 'S' : ''}`, small: 1 });
        if (L.n <= 0) { this.loot.splice(i, 1); this.emit({ t: 'lt-', id: L.id }); }
        break;
      }
    }
  }

  // ---- bots (the same AI as offline: targets, cover, objectives, grenades, melee) ----
  planPath(b, goal) {
    if (this.navBudget <= 0) return false;
    this.navBudget--;
    b.repathAt = this.now + .8 + Math.random()*.6;
    const W = this.world, s = W.nearestNode(b.pos.x, b.pos.y, b.pos.z), g = W.nearestNode(goal.x, goal.y, goal.z);
    b.path = s >= 0 && g >= 0 ? W.astar(s, g) : null; b.pi = 1;
    return true;
  }
  followPath(b) {
    const P = b.path, W = this.world, NAV = W.nav; if (!P) return null;
    let skips = 0;
    while (b.pi < P.nodes.length) {
      const n = NAV.nodes[P.nodes[b.pi]], type = P.types[b.pi], dx = n.x - b.pos.x, dz = n.z - b.pos.z, d = Math.hypot(dx, dz);
      if (type === 1) {
        if (d < .95 && b.onGround) {
          let k = b.pi, top = n.y;
          while (k < P.nodes.length - 1 && NAV.nodes[P.nodes[k]].pass) { top = Math.max(top, NAV.nodes[P.nodes[k]].y); k++; }
          const L = NAV.nodes[P.nodes[k]], vault = n.pass || L.y < top - .3;
          W.startMantle(b, { type: vault ? 'vault' : 'climb', top: Math.max(top, L.y), to: new V3(L.x, L.y, L.z), ceil: W.ceilingAt({ x: n.x, z: n.z }, .15, top + .05) });
          b.pi = k + 1; return null;
        }
        return { x: dx, z: dz };
      }
      if (d < .35 && Math.abs(n.y - b.pos.y) < 1) { b.pi++; continue; }
      if (skips < 4 && type === 0 && b.pi + 1 < P.nodes.length && P.types[b.pi + 1] === 0) {
        const n2 = NAV.nodes[P.nodes[b.pi + 1]];
        if (!n2.pass && Math.abs(n2.y - b.pos.y) < .3 && W.navLine(b.pos.x, b.pos.z, n2.x, n2.z, b.pos.y)) { b.pi++; skips++; continue; }
      }
      return { x: dx, z: dz };
    }
    b.path = null; return null;
  }
  botObjective(b) {
    let key = '', gx = 0, gy = 0, gz = 0;
    b.urgent = false;
    if (this.mode === 'wz') {
      const g = this.gas, dNext = Math.hypot(b.pos.x - g.toX, b.pos.z - g.toZ), dNow = Math.hypot(b.pos.x - g.cx, b.pos.z - g.cz);
      b.urgent = dNow > g.r - 1;
      if (b.urgent || dNext > Math.max(2.5, g.toR*.8)) {
        if (b.wzPhase !== g.phase + g.state) { b.wzPhase = g.phase + g.state; const a = Math.random()*6.283, r = Math.sqrt(Math.random())*g.toR*.55; b.wzSpot = [g.toX + Math.cos(a)*r, g.toZ + Math.sin(a)*r]; }
        key = 'zone' + b.wzPhase; gx = b.wzSpot[0]; gz = b.wzSpot[1];
      } else if (b.plates < 5) {
        let best = null, bw = 18;
        for (const L of this.loot) { const d = Math.hypot(L.x - b.pos.x, L.z - b.pos.z) + Math.abs(L.y - b.pos.y)*2; if (d < bw && Math.hypot(L.x - g.cx, L.z - g.cz) < g.r) { bw = d; best = L; } }
        if (best) { key = 'loot' + best.id; gx = best.x; gy = best.y; gz = best.z; }
      }
    }
    b.hasGoal = !!key;
    if (key && key !== b.goalKey) b.repathAt = 0;
    b.goalKey = key;
    if (key) b.goal.set(gx, gy, gz);
  }
  botThrow(b, tp) {
    const W = this.world, from = new V3(b.pos.x, b.pos.y + 1.7, b.pos.z);
    const dx = tp.x + rand(-1.3, 1.3) - from.x, dz = tp.z + rand(-1.3, 1.3) - from.z, D = Math.hypot(dx, dz);
    const T = clamp(D/11, .6, 1.6), v = new V3(dx/T, (tp.y - from.y + .5*NADE_G*T*T)/T, dz/T);
    let a = from.clone();
    for (let k = 1; k <= 3; k++) {
      const s = k*.15, n = new V3(from.x + v.x*s, from.y + v.y*s - .5*NADE_G*s*s, from.z + v.z*s);
      if (!W.clearLine(a, n)) { b.nadeAt = this.now + 2; return; }
      a = n;
    }
    b.nades--; b.nadeAt = this.now + rand(22, 35); b.nextShot = Math.max(b.nextShot, this.now + .6);
    this.spawnGrenade(from, v, b.nadeKind === 'flash' ? 1.4 : GREN.fuse - rand(.3, 1), b, b.nadeKind || 'frag', 0);
  }
  updateBot(b, dt) {
    const now = this.now, W = this.world, D = DIFF.normal;
    if (b.alive && (b.pos.y < -6 || !isFinite(b.pos.x + b.pos.y + b.pos.z))) this.respawn(b);
    if (!b.alive) return;
    const blind = now < b.blindUntil;
    if (now > b.think && !blind) {
      b.think = now + .35 + Math.random()*.3;
      const intel = this.botHasUav(b);
      let best = null, bs = 1e9, bestVis = false;
      for (const f of this.fighters) {
        if (!f.alive || !this.enemies(b, f)) continue;
        const vis = this.los(b, f);
        let d = b.pos.distanceTo(f.pos);
        if (!vis) d += 30;
        if (f === b.target) d -= 6;
        if (f === b.heard && now - b.heardAt < 5) d -= 14;
        if (intel && !vis) d -= 12;
        if (d < bs) { bs = d; best = f; bestVis = vis; }
      }
      if (best !== b.target) { b.target = best; b.reactAt = now + Math.max(.08, .3 + Math.random()*.4 + (WEAPONS[b.wid].bot.aim || 0) + D.react); b.repathAt = 0; }
      b.sees = !!best && bestVis;
      if (b.sees) { b.lastSeenT = now; b.lastSeenPos.copy(best.pos); b.lastSeenF = best; }
      this.botObjective(b);
      if (best && b.nades > 0 && now > b.nadeAt && !b.mantle && b.onGround) {
        const hid = !b.sees && b.lastSeenF === best && now - b.lastSeenT < 3.5, tp = hid ? b.lastSeenPos : best.pos, dd = Math.hypot(tp.x - b.pos.x, tp.z - b.pos.z);
        if (dd > 7 && dd < 26 && Math.random() < (hid ? .3 : b.sees && dd > 11 ? .03 : 0)) this.botThrow(b, tp);
      }
    }
    const t = b.target && b.target.alive ? b.target : null;
    let mx = 0, mz = 0, speed = 4.6, wantMove = false;
    const ox = b.pos.x, oz = b.pos.z;
    if (b.mantle) {
      mx = b.mantle.to.x - b.mantle.from.x; mz = b.mantle.to.z - b.mantle.from.z;
      W.stepMantle(b, dt); if (!b.mantle) b.onGround = true;
    } else {
      const BP = WEAPONS[b.wid].bot;
      const close = !b.urgent && t && b.sees && Math.abs(t.pos.y - b.pos.y) < 2.2 && b.pos.distanceTo(t.pos) < BP.pref[1] + 8;
      if (this.grenades.length && now > b.fleeCheck) {
        b.fleeCheck = now + .25;
        for (const g of this.grenades) {
          if (g.kind !== 'frag' || g.age < .35 || g.fuse < .15) continue;
          const dx = b.pos.x - g.p.x, dz = b.pos.z - g.p.z, d = Math.hypot(dx, dz);
          if (d < 7 && Math.abs(b.pos.y - g.p.y) < 3 && Math.random() < .75) { b.detour = { x: dx/(d || 1), z: dz/(d || 1) }; b.detourUntil = now + Math.min(g.fuse + .2, 1.2); b.detourSpeed = 6.3; b.path = null; break; }
        }
      }
      if (blind) {
        b.sees = false;
        if (now > (b.stumbleAt || 0)) { const a = Math.random()*6.283; b.stumble = { x: Math.cos(a), z: Math.sin(a) }; b.stumbleAt = now + .5; }
        mx = b.stumble.x; mz = b.stumble.z; speed = 1.4;
      } else if (now < b.detourUntil) { mx = b.detour.x; mz = b.detour.z; speed = b.detourSpeed || speed; }
      else if (close) {
        const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, dist = Math.hypot(dx, dz) || 1, nx = dx/dist, nz = dz/dist;
        if (now > b.strafeChange) { b.strafeDir = Math.random() < .5 ? -1 : 1; b.strafeChange = now + .7 + Math.random()*1.4; }
        const hurt = b.hp < 35 && now - b.lastHurt < 3, fwd = hurt ? -1 : dist > BP.pref[1] ? 1 : dist < BP.pref[0] ? -.7 : 0, strafe = BP.longAcc ? .35 : 1;
        mx = -nz*b.strafeDir*strafe + nx*fwd; mz = nx*b.strafeDir*strafe + nz*fwd; speed = BP.longAcc ? 2.4 : b.wid === WID.lmg ? 3.1 : BP.pref[1] < 10 ? 4.4 : 3.6;
        b.path = null;
      } else {
        if (!t && (!b.wander || b.pos.distanceTo(b.wander) < 2.5)) { const s = W.spawns[Math.floor(Math.random()*W.spawns.length)]; b.wander = new V3(s[0], s[2] || 0, s[1]); b.repathAt = 0; }
        const useGoal = b.hasGoal && (!b.sees || !t || b.urgent), dest = useGoal ? b.goal : t ? t.pos : b.wander;
        if ((!b.path || now > b.repathAt || b.pathTo !== useGoal) && this.planPath(b, dest)) b.pathTo = useGoal;
        const d = this.followPath(b);
        if (d) { mx = d.x; mz = d.z; }
        else if (!b.mantle) {
          if (useGoal) { const gx = b.goal.x - b.pos.x, gz = b.goal.z - b.pos.z; if (gx*gx + gz*gz > .4) { mx = gx; mz = gz; } }
          else if (t) { mx = t.pos.x - b.pos.x; mz = t.pos.z - b.pos.z; }
        }
      }
      if (!b.mantle) {
        const len = Math.hypot(mx, mz);
        wantMove = len > .01;
        const tvx = wantMove ? mx/len*speed : 0, tvz = wantMove ? mz/len*speed : 0, kv = Math.min(1, dt*9);
        b.vx += (tvx - b.vx)*kv; b.vz += (tvz - b.vz)*kv;
        const n = Math.max(1, Math.ceil(dt*60)), h = dt/n;   // a couple of sub-steps at the server tick rate
        for (let k = 0; k < n; k++) { b.pos.x += b.vx*h; b.pos.z += b.vz*h; W.stepPhysics(b, h, STAND_H); }
      }
    }
    b.speed = b.mantle ? 4 : Math.hypot(b.pos.x - ox, b.pos.z - oz)/dt;
    if (now - b.lastHurt > 5 && b.hp < 100) b.hp = Math.min(100, b.hp + 20*dt);
    if (now > b.stuckCheck) {
      if (wantMove && b.pos.distanceTo(b.lastPos) < .5 && now >= b.detourUntil) {
        const a = Math.atan2(mz, mx) + (Math.random() < .5 ? 1 : -1)*(Math.PI/2 + Math.random()*.6);
        b.detour = { x: Math.cos(a), z: Math.sin(a) }; b.detourUntil = now + .4 + Math.random()*.4; b.detourSpeed = 0; b.repathAt = 0;
      }
      b.lastPos.copy(b.pos); b.stuckCheck = now + .7;
    }
    const moving = b.speed > .5, moveYaw = Math.atan2(mx, mz);
    const aimTarget = t && b.sees ? Math.atan2(t.pos.x - b.pos.x, t.pos.z - b.pos.z) : moving ? moveYaw : b.aimYaw;
    let bodyTarget = aimTarget;
    if (moving) { const diff = wrap(moveYaw - aimTarget); bodyTarget = Math.abs(diff) <= Math.PI*.55 ? moveYaw : moveYaw + Math.PI; }
    b.bodyYaw = approach(b.bodyYaw, bodyTarget, dt*8); b.aimYaw = approach(b.aimYaw, aimTarget, dt*10);
    // melee anyone who gets right up close
    if (t && b.sees && !blind && !b.mantle && now > b.meleeAt && now > b.reactAt) {
      const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z;
      if (dx*dx + dz*dz < 1.8*1.8 && Math.abs(t.pos.y - b.pos.y) < 1) {
        b.meleeAt = now + 1.4; b.nextShot = Math.max(b.nextShot, now + .45);
        this.emit({ t: 'bm', i: b.id });
        this.later(.12, () => { if (b.alive && t.alive && Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z) < 2.2) this.damage(t, (t.isBot ? 100 : 55)*D.dmg, b, false, 'Melee'); });
      }
    }
    // shooting: hit chance from the gun, range, the target's movement and stance
    // bots run dry and reload like anyone else (a moment to push them); with nothing to shoot they top up early
    const bwr = WEAPONS[b.wid];
    if (b.ammo === undefined) b.ammo = bwr.mag;
    if (!(b.reloadUntil > now) && (b.ammo <= 0 || (!b.sees && b.ammo < bwr.mag*.5 && now - b.lastShot > 2))) {
      const dur = (bwr.shellReload ? bwr.reload*Math.min(bwr.mag, bwr.mag - b.ammo + 1)*.75 : bwr.reloadEmpty || bwr.reload)*rand(.9, 1.1);
      b.reloadUntil = now + dur; b.ammo = bwr.mag; this.emit({ t: 'br', i: b.id, d: r2(dur) });
    }
    if (t && b.sees && !blind && !b.mantle && now > b.reactAt && now > b.nextShot && !(b.reloadUntil > now) && Math.abs(wrap(aimTarget - b.aimYaw)) < .35) {
      const dist = b.pos.distanceTo(t.pos), bw = WEAPONS[b.wid], bp = bw.bot;
      if (dist < (bp.maxRange || 55)) {
        if (b.burstLeft <= 0) b.burstLeft = Math.round(rand(bp.burst[0], bp.burst[1]));
        b.burstLeft--; b.ammo--;
        b.nextShot = now + (b.burstLeft > 0 ? bp.rate : bp.rate + rand(.3, .8))*rand(.9, 1.15); b.lastShot = now;
        if (now - b.alertAt > .6) { b.alertAt = now; this.alertBots(b, 32, .35); }
        const low = !t.isBot ? (t.stance === 2 ? .15 : t.stance === 1 ? .08 : 0) : 0;
        const chance = clamp(bp.acc + (b.acc - .5) + D.acc - dist*(bp.longAcc ? .003 : .009) - (t.speed > 1 ? .12 : 0) - low, .06, .9);
        const hit = Math.random() < chance, e = this.eyeOf(t, new V3()); e.y -= .3;
        let surf = 'flesh', n = null;
        if (!hit) {
          e.x += rand(-1, 1); e.y += rand(-.6, .6); e.z += rand(-1, 1);
          const o = new V3(b.pos.x, b.pos.y + 1.4, b.pos.z), dx = e.x - o.x, dy = e.y - o.y, dz = e.z - o.z, l = Math.hypot(dx, dy, dz) || 1, dir = { x: dx/l, y: dy/l, z: dz/l };
          if (W.rayWorld(o, dir, 120) < Infinity) { e.set(o.x + dir.x*W.hit.t, o.y + dir.y*W.hit.t, o.z + dir.z*W.hit.t); surf = W.hit.surface; n = W.hit.n.arr(); }
          else { e.set(o.x + dir.x*60, o.y + dir.y*60, o.z + dir.z*60); surf = ''; }
        }
        this.emit({ t: 'sh', i: b.id, e: e.arr(), s: surf, n, w: b.wid });
        if (hit) this.damage(t, bp.dmg*D.dmg*(bw.pellets > 1 ? falloff(bw, dist) : 1)*rand(.9, 1.1), b, false);
      }
    }
  }
  separateBots() {
    const F = this.fighters;
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
      const a = F[i], b = F[j];
      if (!a.alive || !b.alive || a.mantle || b.mantle || (!a.isBot && !b.isBot) || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d > 0 && d < R*2) {   // only bots get pushed; a player's position is theirs
        const p = R*2 - d;
        if (a.isBot && b.isBot) { a.pos.x -= dx/d*p/2; a.pos.z -= dz/d*p/2; b.pos.x += dx/d*p/2; b.pos.z += dz/d*p/2; }
        else if (a.isBot) { a.pos.x -= dx/d*p; a.pos.z -= dz/d*p; } else { b.pos.x += dx/d*p; b.pos.z += dz/d*p; }
      }
    }
  }

  // ---- the tick ----
  tick(dt) {
    this.now += dt; const now = this.now; this.navBudget = 2;
    for (let i = this.timers.length - 1; i >= 0; i--) if (now >= this.timers[i].at) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    if (this.state === 'over') { if (now >= this.nextMatchAt) this.startMatch(); }
    else {
      for (const f of this.fighters) {
        // people come back once their killcam is over (or they skip it), and at most 6 s after they could have
        if (!f.alive && f.respawnAt <= now && (f.isBot || (f.ready && (f.spawnReq || now >= f.respawnAt + 6)))) this.respawn(f);
        if (!f.isBot && f.alive && f.reload) {
          const w = f.loadout.stats[f.reload.wid];
          if (now >= f.reload.next) {
            if (f.reload.shell) { f.ammo[f.reload.wid] = Math.min(w.mag, f.ammo[f.reload.wid] + 1); f.reload.next = now + w.reload*.8; if (f.ammo[f.reload.wid] >= w.mag) f.reload = null; }
            else { f.ammo[f.reload.wid] = w.mag; f.reload = null; }
          }
        }
        if (!f.isBot && f.alive && now - f.lastHurt > 4 && f.hp < 100) f.hp = Math.min(100, f.hp + 25*dt);
      }
      for (const f of this.fighters) if (f.isBot) this.updateBot(f, dt);
      this.separateBots();
      this.updateGrenades(dt); this.updateClaymores(); this.updateStrikes();
      this.smokes = this.smokes.filter(s => now < s.until);
      if (this.mode === 'wz') this.updateGas(dt);
      if (this.endAt && now >= this.endAt) {
        const st = [...this.fighters].sort((a, b) => b.kills - a.kills);
        this.endMatch(MODES[this.mode].teams ? null : st[0]);
      }
    }
    for (const f of this.fighters) {
      if (!f.alive) continue;
      f.hist.push([now, f.pos.x, f.pos.y, f.pos.z, f.stance || 0]);
      if (f.hist.length > 24) f.hist.shift();
    }
  }
  // everything a player needs on joining (or rejoining) a match that's already going
  fullState(f) {
    const M = MODES[this.mode];
    return { st: this.state, nx: r2(this.nextMatchAt), end: this.endAt ? r2(this.endAt) : 0, limit: M.limit, ts: this.teamScore,
      cl: this.claymores.map(c => [c.id, c.owner.id, r2(c.x), r2(c.y), r2(c.z), r2(c.yw)]),
      lt: this.loot.map(L => [L.id, r2(L.x), r2(L.y), r2(L.z), L.n]),
      sm: this.smokes.map(s => [r2(s.x), r2(s.y), r2(s.z), r2(this.now - s.t0), r2(s.until - this.now)]),
      ks: f.ksReady, me: f.alive ? { p: f.pos.arr(), y: r2(f.yaw), l: f.life, ar: f.armor, pl: f.plates } : null };
  }
  // one message per player per tick: everyone's state, what happened, and their own numbers
  snapshot() {
    const rows = this.fighters.map(f => [f.id, r2(f.pos.x), r2(f.pos.y), r2(f.pos.z), r2(f.isBot ? f.aimYaw - Math.PI : f.yaw), r2(f.pitch || 0),
      (f.alive ? 1 : 0) | (f.stance === 1 ? 2 : 0) | (f.stance === 2 ? 4 : 0) | (f.ads ? 8 : 0) | (f.mantle ? 16 : 0) | (f.plating ? 32 : 0), f.wid, Math.max(0, Math.ceil(f.hp))]);
    const g = this.gas, gas = this.mode === 'wz' ? [r2(g.cx), r2(g.cz), r2(g.r), r2(g.toX), r2(g.toZ), r2(g.toR), g.phase, g.state === 'close' ? 1 : 0,
      Math.max(0, Math.ceil((g.state === 'wait' ? WZ.phases[g.phase][0] : WZ.phases[g.phase][1]) - (this.now - g.t0))), g.respawnsOff ? 1 : 0, this.wzAlive()] : null;
    const ev = this.ev; this.ev = [];
    for (const f of this.fighters) {
      if (f.isBot || !f.conn) { if (!f.isBot) f.out.length = 0; continue; }
      const msg = { t: 's', n: r2(this.now), f: rows, ev, me: [Math.max(0, Math.ceil(f.hp)), Math.ceil(f.armor || 0), f.plates || 0, f.lethal, f.tactical, f.ammo[f.wid] ?? 0], ts: MODES[this.mode].teams ? this.teamScore : undefined, g: gas };
      if (f.out.length) { msg.pe = f.out; f.out = []; }
      f.conn.sendJSON(msg);
    }
  }
}
const num = (v, d) => fin(v) ? v : d;
const vec3 = a => Array.isArray(a) && a.length === 3 && a.every(fin) && a.every(v => Math.abs(v) < 1e4);

module.exports = { Room, WORLDS, MODES, MAX_FIGHTERS, cleanName, WID };
