#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fullTestPath = path.join(root, 'test', 'run-tests.mjs');
const gitDir = path.join(root, '.git');
const smokeArgs = [
  path.join(root, 'bin', 'nihongo-slopless.mjs'),
  path.join(root, 'examples', 'sloppy.md'),
  '--pretty',
  '--fail-on',
  'off',
];

if (!existsSync(fullTestPath)) {
  if (existsSync(gitDir)) {
    console.error(`Test entrypoint not found in source checkout: ${fullTestPath}`);
    process.exitCode = 2;
    process.exit();
  }

  console.log('Full source tests are not included in this npm package; running CLI smoke check instead.');
  const smoke = spawnSync(process.execPath, smokeArgs, {
    cwd: root,
    stdio: 'inherit',
  });
  if (smoke.error) {
    console.error(smoke.error);
    process.exitCode = 2;
  } else {
    process.exitCode = smoke.status ?? 0;
  }
  process.exit();
}

const result = spawnSync(process.execPath, [fullTestPath], {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exitCode = 2;
} else {
  process.exitCode = result.status ?? 0;
}
