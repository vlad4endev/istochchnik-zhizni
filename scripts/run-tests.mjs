// Запускает все src/**/*.test.ts (node:assert-скрипты) через ts-node; падает, если хоть один упал.
import { execFileSync, spawnSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', 'src/**/*.test.ts'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
let failed = 0;
for (const f of files) {
  const r = spawnSync('npx', ['ts-node', '--transpile-only', f], { stdio: 'inherit' });
  if (r.status !== 0) {
    failed += 1;
    console.error(`FAIL ${f}`);
  } else {
    console.log(`PASS ${f}`);
  }
}
console.log(`${files.length - failed}/${files.length} passed`);
process.exit(failed ? 1 : 0);
