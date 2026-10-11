// tiny test helper: ok(condition, message) prints PASS / FAIL and remembers failures
let fails = 0, passes = 0;
exports.ok = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (cond) passes++; else fails++; };
exports.done = name => { console.log(`${name}: ${passes} passed, ${fails} failed\n`); process.exitCode = fails ? 1 : 0; };
