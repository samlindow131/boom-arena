// The real server over real WebSockets: joining, matchmaking, hits, anti-cheat, reconnects, flood limits.
// Needs Node 22+ (for the built-in WebSocket client).
const { spawn } = require('child_process'), path = require('path');
const { ok, done } = require('./check.js');
const { WORLDS } = require('../game.js'), { NET_VERSION } = require('../shared.js');
const PORT = 20000 + Math.floor(Math.random()*20000), URL = `ws://localhost:${PORT}/ws`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } return false; };
function client(hello) {
  const ws = new WebSocket(URL), c = { ws, ev: [], pe: [], snap: null, welcome: null, closed: false, pos: null, life: 0 };
  ws.onopen = () => ws.send(JSON.stringify({ v: NET_VERSION, ...hello }));
  ws.onclose = () => { c.closed = true; }; ws.onerror = () => {};
  ws.onmessage = e => {
    const m = JSON.parse(e.data), pe = m.t === 'p' ? m.pe : m.pe || [];
    if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', i: m.i }));
    if (m.t === 'welcome') { c.welcome = m; ws.send(JSON.stringify({ t: 'ready' })); if (m.full.me) { c.pos = m.full.me.p; c.life = m.full.me.l; } }
    if (m.t === 's') { c.snap = m; c.ev.push(...m.ev); if (c.welcome && m.ev.some(e => e.t === 'kill' && e.v === c.welcome.id)) ws.send(JSON.stringify({ t: 'spawn' })); }
    if (m.t === 'full') c.full = m.m;
    for (const p of pe) { c.pe.push(p); if (p.t === 'spawn') { c.pos = p.p; c.life = p.l; } if (p.t === 'fix') c.pos = p.p; }
  };
  c.send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
  return c;
}
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}/health`); break; } catch (e) { await sleep(100); } }   // wait for it to start
    const html = await fetch(`http://localhost:${PORT}/`, { headers: { 'accept-encoding': 'gzip' } });
    ok(html.status === 200 && html.headers.get('content-encoding') === 'gzip', 'serves the game, compressed');
    for (const u of ['/server.js', '/game.js', '/maps.json', '/../server.js', '/tests/check.js', '/icons/../server.js']) ok((await fetch(`http://localhost:${PORT}${u}`)).status === 404, `won't serve ${u}`);
    for (const [u, type] of [['/manifest.webmanifest', 'application/manifest+json'], ['/sw.js', 'text/javascript'], ['/icons/icon-512.png', 'image/png']]) { const r = await fetch(`http://localhost:${PORT}${u}`); ok(r.status === 200 && (r.headers.get('content-type') || '').startsWith(type), `serves ${u} for installing the app`); }
    ok((await fetch(`http://localhost:${PORT}/dev/characters`, { headers: { 'x-forwarded-for': '1.2.3.4' } })).status === 404, 'character tools are off for anyone coming through a proxy (the public host)');
    ok((await fetch(`http://localhost:${PORT}/operators/../server.js`)).status === 404 && (await fetch(`http://localhost:${PORT}/operators/x.exe`)).status === 404, 'operators folder only serves model files');
    const A = client({ t: 'hello', name: 'Fuckface', mode: 'ffa', map: 'yard', lo: { p: 0, s: 5 } });
    ok(await until(() => A.welcome && A.snap && A.pos), 'joins, spawns and receives snapshots');
    ok(A.welcome.roster.length === 8, 'room is topped up to 8 with bots');
    ok(A.welcome.roster.find(r => r[0] === A.welcome.id)[1].startsWith('Player'), 'rude name replaced');
    const me = A.welcome.id, W = WORLDS[A.welcome.map];
    let hits = 0, t0 = Date.now();
    while (Date.now() - t0 < 12000 && !A.ev.some(e => e.t === 'kill' && e.k === me)) {
      A.send({ t: 'in', l: A.life, p: A.pos, y: 0, pt: 0, st: 0, a: 1, w: 0 });
      const eye = { x: A.pos[0], y: A.pos[1] + 1.55, z: A.pos[2] }; let tgt = null, bd = 1e9;
      for (const r of A.snap.f) { if (r[0] === me || !(r[6] & 1)) continue; const c = { x: r[1], y: r[2] + 1.1, z: r[3] }, d = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z); if (d < 45 && d < bd && W.clearLine(eye, c)) { bd = d; tgt = c; } }
      if (tgt) { const d = [tgt.x - eye.x, tgt.y - eye.y, tgt.z - eye.z]; A.send({ t: 'fire', w: 0, o: [eye.x, eye.y, eye.z], a: d, d: [d], rt: A.snap.n }); }
      await sleep(95); hits = A.pe.filter(p => p.t === 'hm').length;
      if (A.pe.some(p => p.t === 'spawn' && p.l > A.life)) {}
    }
    ok(hits > 0, `server-confirmed hits (${hits})`);
    ok(A.ev.some(e => e.t === 'kill' && e.k === me), 'server-credited kill');
    A.pe.length = 0; A.send({ t: 'in', l: A.life, p: [A.pos[0] + 40, A.pos[1], A.pos[2]], y: 0, pt: 0, st: 0, a: 0, w: 0 });
    ok(await until(() => A.pe.some(p => p.t === 'fix'), 2000), 'teleport refused with a position fix');
    const B = client({ t: 'hello', name: 'Sam', mode: 'ffa', map: 'yard' });
    ok(await until(() => B.welcome) && B.welcome.room === A.welcome.room, 'second player matched into the same room');
    ok(B.welcome.roster.length === 8 && B.welcome.roster.filter(r => !r[2]).length === 2, 'a bot made room: still 8, two of them people');
    A.ws.close(); await until(() => A.closed); await sleep(200);
    const A2 = client({ t: 'hello', name: 'x', mode: 'ffa', map: 'yard', token: A.welcome.token });
    ok(await until(() => A2.welcome) && A2.welcome.resumed === 1 && A2.welcome.id === me, 'dropped player reconnects into their own place');
    const C = client({ t: 'hello', name: 'Spam', mode: 'tdm', map: 'any' });
    await until(() => C.welcome);
    ok(C.welcome && C.welcome.mode === 'tdm', `team deathmatch room opened on ${C.welcome && C.welcome.map}`);
    for (let i = 0; i < 2000; i++) C.send({ t: 'in', l: 1, p: [0, 0, 0] });
    ok(await until(() => C.closed, 3000), 'message flood gets disconnected');
    const D = client({ t: 'hello', name: 'Big', mode: 'wz', map: 'any' });
    ok(await until(() => D.welcome && D.snap && D.snap.g), 'Mini Warzone room sends gas state');
    D.send({ t: 'in', junk: 'x'.repeat(10000) });
    ok(await until(() => D.closed, 2000), 'oversized message gets disconnected');
    const old = new WebSocket(URL); let oldMsg = '';
    old.onopen = () => old.send(JSON.stringify({ t: 'hello', v: NET_VERSION - 1, name: 'Old' })); old.onmessage = e => { oldMsg = JSON.parse(e.data).m || ''; };
    ok(await until(() => /Refresh/.test(oldMsg), 2000), 'an outdated copy of the game is asked to refresh');
    const many = Array.from({ length: 10 }, () => client({ t: 'hello', name: 'x', mode: 'ffa' }));
    await sleep(800);
    ok(many.filter(m => m.closed).length >= 3, `per-address connection limit (${many.filter(m => m.closed).length} of 10 extra refused)`);
    for (const m of [...many, A2, B]) try { m.ws.close(); } catch (e) {}
  } finally { srv.kill(); }
  done('protocol');
  setTimeout(() => process.exit(process.exitCode), 200);
})();
