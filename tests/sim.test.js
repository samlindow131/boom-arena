// Full bot matches on every map and mode: nothing breaks, people die, the server stays fast.
const { Room, WORLDS } = require('../game.js');
const { ok, done } = require('./check.js');
for (const mode of ['ffa', 'tdm', 'wz']) for (const map of Object.keys(WORLDS)) {
  const r = new Room(mode, map), dt = 1/30, ev = {};
  let worst = 0, sum = 0, bad = null;
  const ticks = 30*150;
  for (let i = 0; i < ticks; i++) {
    const a = process.hrtime.bigint(); r.tick(dt); const ms = Number(process.hrtime.bigint() - a)/1e6;
    sum += ms; if (i > 30) worst = Math.max(worst, ms);
    for (const e of r.ev) ev[e.t] = (ev[e.t] || 0) + 1; r.ev = [];
    for (const f of r.fighters) if (!isFinite(f.pos.x + f.pos.y + f.pos.z) || Math.abs(f.pos.x) > r.world.arena + 2 || Math.abs(f.pos.z) > r.world.arena + 2 || f.pos.y < -3) bad = `${f.name} at ${f.pos.x},${f.pos.y},${f.pos.z}`;
  }
  ok(!bad && (ev.kill || 0) >= 10 && sum/ticks < 1 && worst < 25,
    `${mode.padEnd(3)} ${map.padEnd(9)} ${String(ev.kill || 0).padStart(3)} kills, ${String(ev.nade || 0).padStart(2)} grenades, ${(sum/ticks).toFixed(3)} ms/tick (worst ${worst.toFixed(1)})${bad ? ' BAD POSITION ' + bad : ''}`);
}
done('match simulation');
