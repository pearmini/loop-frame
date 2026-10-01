import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const files = readdirSync('tests')
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => path.join('tests', name));

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
