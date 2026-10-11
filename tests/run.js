// Runs every test file in this folder: npm test
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
let failed = 0;
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort()) {
  console.log(`== ${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `${failed} test file(s) failed` : 'All tests passed');
process.exit(failed ? 1 : 0);
