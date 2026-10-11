// Boom Arena online server. It serves the game and runs every online match itself (see game.js), so
// nobody can cheat by editing their copy of the game. Players are put into rooms automatically: up to
// 8 per match, with bots filling the empty places and stepping aside when people join.
//
// Run it with `node server.js` (or `npm start`). It needs no packages, just Node.js 18 or newer.
// On a host like Render it reads the PORT it's given; locally it uses 8080.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os'), zlib = require('zlib');
const { Room, MODES, WORLDS, cleanName } = require('./game.js');
const { NET_VERSION } = require('./shared.js');

const PORT = +process.env.PORT || 8080, ROOT = __dirname, TICK = 1/30;
const LIM = {
  perIp: 8,           // connections from one address (a household, a school…)
  total: 400,         // connections on this server
  rooms: 60,          // matches running at once
  humans: 8,          // people per match
  msgBytes: 4096,     // largest message a player may send
  rate: 100, burst: 160,   // messages per second (the game sends ~45)
  grace: 30000,       // ms a dropped player keeps their place for a reconnect
  silent: 20000,      // ms without hearing from a connection before it's closed
};
const log = msg => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

// =====================================================================
// Web pages: only the game's own files, compressed and cached
// =====================================================================
const PUBLIC = { '/': 'index.html', '/index.html': 'index.html', '/shared.js': 'shared.js', '/soldier.js': 'soldier.js', '/island.js': 'island.js', '/br.js': 'br.js',
  // installing the game as an app: the manifest, the offline cache and the icons
  '/manifest.webmanifest': 'manifest.webmanifest', '/sw.js': 'sw.js' };
for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-64.png']) PUBLIC['/icons/' + f] = 'icons/' + f;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.glb': 'model/gltf-binary', '.json': 'application/json' };
// operator models (soldier bodies) live in operators/: a list (operators.json) and one .glb per operator
const publicFile = url => PUBLIC[url] || (/^\/operators\/[a-z0-9_-]+\.(glb|json)$/.test(url) ? url.slice(1) : null);
const fileCache = new Map();
function loadFile(name) {
  const file = path.join(ROOT, name), st = fs.statSync(file), c = fileCache.get(name);
  if (c && c.mtime === st.mtimeMs) return c;
  const data = fs.readFileSync(file), gz = zlib.gzipSync(data, { level: 9 });
  const entry = { mtime: st.mtimeMs, data, gz, etag: '"' + crypto.createHash('sha1').update(data).digest('base64url').slice(0, 20) + '"', type: TYPES[path.extname(name)] };
  fileCache.set(name, entry);
  return entry;
}
// ---- On your own computer only: Mixamo characters dropped into characters/ (FBX) are turned into operators by the
// game itself, which sends the finished model back here to save in operators/. Never available on a public host. ----
const DEV = !process.env.RENDER && process.env.NODE_ENV !== 'production';
const fromThisMac = req => /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '') && !req.headers['x-forwarded-for'];
const slug = n => String(n).toLowerCase().replace(/\.fbx$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'operator';
const pretty = n => String(n).replace(/\.fbx$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Operator';
function devRoute(req, res, url) {
  const CH = path.join(ROOT, 'characters'), OPD = path.join(ROOT, 'operators'), LIST = path.join(OPD, 'operators.json');
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  if (req.method === 'GET' && url === '/dev/characters') {
    const files = fs.existsSync(CH) ? fs.readdirSync(CH).filter(f => /\.fbx$/i.test(f)) : [];
    return send(200, JSON.stringify(files.map(f => {
      const id = slug(f), glb = path.join(OPD, id + '.glb'), st = fs.statSync(path.join(CH, f));
      return { file: f, id, name: pretty(f), size: st.size, converted: fs.existsSync(glb) && fs.statSync(glb).mtimeMs >= st.mtimeMs };
    })));
  }
  const m = url.match(/^\/dev\/characters\/([^/]+\.fbx)$/i);
  if (req.method === 'GET' && m) {
    const f = path.join(CH, path.basename(decodeURIComponent(m[1])));
    if (!f.startsWith(CH + path.sep) || !fs.existsSync(f)) return send(404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    return fs.createReadStream(f).pipe(res);
  }
  if (req.method === 'POST' && url === '/dev/operator') {
    const q = new URL(req.url, 'http://x').searchParams, id = slug(q.get('id') || ''), name = pretty(q.get('name') || id);
    const parts = []; let n = 0;
    req.on('data', d => { n += d.length; if (n > 60e6) { req.destroy(); return; } parts.push(d); });
    req.on('end', () => {
      const buf = Buffer.concat(parts);
      if (buf.length < 1000 || buf.toString('ascii', 0, 4) !== 'glTF') return send(400, '{"ok":false}');
      fs.mkdirSync(OPD, { recursive: true });
      fs.writeFileSync(path.join(OPD, id + '.glb'), buf);
      let list = []; try { list = JSON.parse(fs.readFileSync(LIST, 'utf8')); } catch (e) {}
      list = list.filter(o => o.id !== id); list.push({ id, name, file: id + '.glb' });
      fs.writeFileSync(LIST, JSON.stringify(list, null, 2));
      log(`operator ready: ${name} (operators/${id}.glb, ${(buf.length/1e6).toFixed(1)} MB)`);
      send(200, '{"ok":true}');
    });
    return;
  }
  send(404, 'Not found', 'text/plain');
}
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (url.startsWith('/dev/')) { if (DEV && fromThisMac(req)) return devRoute(req, res, url); res.writeHead(404); return res.end(); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ players: conns.size, rooms: [...rooms.values()].map(r => ({ mode: r.mode, map: r.mapId, people: r.humans.length })) }));
  }
  const name = publicFile(url);
  if (!name || !fs.existsSync(path.join(ROOT, name))) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  let f;
  try { f = loadFile(name); } catch (e) { res.writeHead(500); return res.end(); }
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, { ETag: f.etag }); return res.end(); }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && !name.endsWith('.png'), body = gzip ? f.gz : f.data;   // (PNGs are already compressed)
  res.writeHead(200, { 'Content-Type': f.type, 'Content-Length': body.length, ETag: f.etag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding', ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(req.method === 'HEAD' ? undefined : body);
});

// =====================================================================
// Connections (WebSocket, RFC 6455; text messages only)
// =====================================================================
const conns = new Set(), perIp = new Map(), rooms = new Map(), resume = new Map();
let connSeq = 1;
function clientIp(req) {
  const h = req.headers;
  return String(h['cf-connecting-ip'] || h['true-client-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
}
function frame(text, op = 1) {
  const payload = Buffer.from(text), n = payload.length;
  let head;
  if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
  else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  head[0] = 0x80 | op;
  return Buffer.concat([head, payload]);
}
class Conn {
  constructor(socket, ip) {
    Object.assign(this, { id: connSeq++, socket, ip, buf: Buffer.alloc(0), frags: [], fragLen: 0, closed: false, tokens: LIM.burst, refill: Date.now(), over: 0,
      room: null, fighter: null, token: crypto.randomBytes(12).toString('hex'), rtt: .1, pingSeq: 0, pingAt: 0, heard: Date.now() });
  }
  sendJSON(obj) {
    if (this.closed) return;
    const s = this.socket;
    if (s.writableLength > 1 << 20) return this.close('too slow');   // a connection that can't keep up at all
    if (obj.t === 's' && s.writableLength > 1 << 17) return;          // skip a snapshot rather than queue them up
    s.write(frame(JSON.stringify(obj)));
  }
  close(why) {
    if (this.closed) return;
    this.closed = true; conns.delete(this);
    const n = (perIp.get(this.ip) || 1) - 1; if (n > 0) perIp.set(this.ip, n); else perIp.delete(this.ip);
    try { this.socket.end(frame('', 8)); } catch (e) {}
    setTimeout(() => { try { this.socket.destroy(); } catch (e) {} }, 1000);
    leaveRoom(this, why === 'leave');
  }
}
server.on('upgrade', (req, socket) => {
  const reject = code => { try { socket.end(`HTTP/1.1 ${code}\r\n\r\n`); } catch (e) {} };
  if ((req.url || '').split('?')[0] !== '/ws' || !req.headers['sec-websocket-key'] || (req.headers.upgrade || '').toLowerCase() !== 'websocket') return reject('400 Bad Request');
  const ip = clientIp(req);
  if (conns.size >= LIM.total) return reject('503 Service Unavailable');
  if ((perIp.get(ip) || 0) >= LIM.perIp) return reject('429 Too Many Requests');
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const c = new Conn(socket, ip);
  conns.add(c); perIp.set(ip, (perIp.get(ip) || 0) + 1);
  socket.on('data', d => { if (c.closed) return; c.buf = c.buf.length ? Buffer.concat([c.buf, d]) : d; readFrames(c); });
  socket.on('close', () => c.close());
  socket.on('error', () => c.close());
});
function readFrames(c) {
  while (!c.closed && c.buf.length >= 2) {
    const b0 = c.buf[0], b1 = c.buf[1], op = b0 & 15, fin = b0 & 128, masked = b1 & 128;
    let len = b1 & 127, off = 2;
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
    else if (len === 127) return c.close('huge frame');
    if (!masked || len > LIM.msgBytes) return c.close('bad frame');   // browsers always mask; the game never sends big messages
    const need = off + 4 + len;
    if (c.buf.length < need) return;
    const mask = c.buf.subarray(off, off + 4), data = Buffer.from(c.buf.subarray(off + 4, need));
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    c.buf = c.buf.subarray(need);
    c.heard = Date.now();
    if (op === 8) return c.close();
    if (op === 9) { c.socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data.subarray(0, 125)])); continue; }
    if (op === 10) continue;
    if (op !== 1 && op !== 0) return c.close('binary');
    c.frags.push(data); c.fragLen += data.length;
    if (c.fragLen > LIM.msgBytes) return c.close('message too big');
    if (!fin) continue;
    const text = c.frags.length === 1 ? data.toString('utf8') : Buffer.concat(c.frags).toString('utf8');
    c.frags = []; c.fragLen = 0;
    // flood control: a token bucket; a connection that keeps flooding gets closed
    const now = Date.now();
    c.tokens = Math.min(LIM.burst, c.tokens + (now - c.refill)*LIM.rate/1000); c.refill = now;
    if (c.tokens < 1) { if (++c.over > 400) return c.close('flooding'); continue; }
    c.tokens--;
    let m; try { m = JSON.parse(text); } catch (e) { continue; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') continue;
    try { onMessage(c, m); } catch (e) { log(`message error (${m.t}): ${e.stack || e}`); }
  }
}

// =====================================================================
// Matchmaking: join the busiest room that fits, or open a new one
// =====================================================================
// (`prefer` is the map the player's game already has loaded: used to break ties and for a new room,
// so a player who starts a room doesn't have to load a different map first)
function findRoom(mode, map, prefer) {
  let best = null, bs = -1;
  for (const r of rooms.values()) {
    if (r.mode !== mode || (map !== 'any' && r.mapId !== map) || r.dead) continue;
    const n = r.humans.length;
    if (n >= LIM.humans) continue;
    const score = n*2 + (r.mapId === prefer ? 1 : 0);
    if (score > bs) { bs = score; best = r; }
  }
  if (best) return best;
  if (rooms.size >= LIM.rooms) return null;
  const ids = Object.keys(WORLDS), r = new Room(mode, map !== 'any' ? map : WORLDS[prefer] ? prefer : ids[Math.floor(Math.random()*ids.length)]);
  r.errors = 0; rooms.set(r.id, r);
  log(`room ${r.id} opened: ${MODES[mode].name} on ${r.mapId} (${rooms.size} running)`);
  return r;
}
function welcome(c, room, f, resumed) {
  c.room = room; c.fighter = f; f.conn = c; f.rtt = c.rtt; f.token = c.token;
  c.sendJSON({ t: 'welcome', id: f.id, token: c.token, room: room.id, mode: room.mode, map: room.mapId, now: +room.now.toFixed(3), team: f.team, resumed: resumed ? 1 : 0,
    roster: room.fighters.map(o => room.rosterEntry(o)), full: room.fullState(f) });
}
function onMessage(c, m) {
  if (m.t === 'pong') {
    if (m.i === c.pingSeq && c.pingAt) { const rtt = (Date.now() - c.pingAt)/1000; c.rtt = c.rtt*.7 + Math.min(1, rtt)*.3; c.pingAt = 0; if (c.fighter) c.fighter.rtt = c.rtt; }
    return;
  }
  if (m.t === 'hello') {
    if (c.room) return;
    if (m.v !== NET_VERSION) { c.sendJSON({ t: 'full', m: 'A new version of Boom Arena is out. Refresh the page to play online.' }); return c.close(); }
    // the game's walls should match the server's copy (maps.json); if not, hits near walls would disagree
    if (WORLDS[m.prefer] && typeof m.mh === 'string' && m.mh !== WORLDS[m.prefer].hash && !WORLDS[m.prefer].warned) {
      WORLDS[m.prefer].warned = true;
      log(`WARNING: the game's ${m.prefer} map doesn't match maps.json. Re-export it (exportMapData() in the browser console).`);
    }
    // coming back after a dropped connection: take your place again
    const back = typeof m.token === 'string' && resume.get(m.token);
    if (back && rooms.get(back.room.id) === back.room && back.room.fighters.includes(back.f) && !back.f.conn) {
      resume.delete(m.token); clearTimeout(back.timer);
      c.token = m.token;
      welcome(c, back.room, back.f, true);
      log(`${back.f.name} reconnected to ${back.room.id}`);
      return;
    }
    const mode = MODES[m.mode] ? m.mode : 'ffa', map = WORLDS[m.map] ? m.map : 'any';
    const room = findRoom(mode, map, m.prefer);
    if (!room) { c.sendJSON({ t: 'full', m: 'All servers are busy right now. Try again in a minute.' }); return c.close(); }
    const f = room.addHuman(c, cleanName(m.name), m.lo, { op: m.op, sk: m.sk, lv: m.lv, gc: m.gc });
    welcome(c, room, f, false);
    log(`${f.name} joined ${room.id} (${room.humans.length} people, ${conns.size} online)`);
    return;
  }
  if (m.t === 'leave') return c.close('leave');
  if (c.room && c.fighter) {
    c.room.handle(c.fighter, m);
    // hit markers and damage go out straight away instead of waiting for the next snapshot
    for (const f of c.room.fighters) if (!f.isBot && f.out.length && f.conn) { f.conn.sendJSON({ t: 'p', pe: f.out }); f.out = []; }
  }
}
function leaveRoom(c, now) {
  const room = c.room, f = c.fighter;
  if (!room || !f) return;
  c.room = null; c.fighter = null; f.conn = null;
  if (now || room.dead) { room.dropHuman(f); log(`${f.name} left ${room.id}`); return; }
  // keep their place for a little while in case they're just reconnecting
  const timer = setTimeout(() => {
    resume.delete(c.token);
    if (!f.conn && room.fighters.includes(f)) { room.dropHuman(f); log(`${f.name} timed out of ${room.id}`); }
  }, LIM.grace);
  resume.set(c.token, { room, f, timer });
}

// =====================================================================
// The game loop: every match ticks 30 times a second and sends everyone a snapshot
// =====================================================================
let last = process.hrtime.bigint(), acc = 0;
setInterval(() => {
  const t = process.hrtime.bigint(); acc += Number(t - last)/1e9; last = t;
  if (acc < TICK*.5) return;
  const steps = Math.min(4, Math.max(1, Math.round(acc/TICK))); acc = Math.max(0, acc - steps*TICK);
  if (acc > TICK*4) acc = 0;   // the machine stalled; don't try to catch up all at once
  for (const r of rooms.values()) {
    if (!r.humans.length) { r.dead = true; rooms.delete(r.id); log(`room ${r.id} closed (${rooms.size} running)`); continue; }
    try { for (let i = 0; i < steps; i++) r.tick(TICK); r.snapshot(); }
    catch (e) {
      log(`room ${r.id} error: ${e.stack || e}`);
      if (++r.errors > 20) { r.dead = true; rooms.delete(r.id); for (const f of r.humans) if (f.conn) { f.conn.sendJSON({ t: 'full', m: 'The match hit a problem. Please join again.' }); f.conn.close(); } }
    }
  }
}, 1000*TICK);
// pings measure each player's lag (used to rewind time for their shots); silent connections get closed
setInterval(() => {
  const now = Date.now();
  for (const c of conns) {
    if (now - c.heard > LIM.silent) { c.close('silent'); continue; }
    c.pingSeq++; c.pingAt = now; c.sendJSON({ t: 'ping', i: c.pingSeq });
  }
  // everyone's ping, for the scoreboard
  for (const r of rooms.values()) r.emit({ t: 'pg', p: r.humans.map(f => [f.id, f.conn ? Math.round(f.conn.rtt*1000) : -1]) });
}, 2000);

process.on('uncaughtException', e => log(`uncaught: ${e.stack || e}`));
server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && (i.family === 'IPv4' || i.family === 4) && !i.internal).map(i => i.address);
  console.log(`\nBoom Arena server is running.\n\n  This computer:         http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Friends on your Wi-Fi: http://${ip}:${PORT}`);
  console.log(`\nEveryone opens that address, then picks Play Online in the menu. Press Ctrl+C to stop.\n`);
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Is the server already running?` : e.message); process.exit(1); });
