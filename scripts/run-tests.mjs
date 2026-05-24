#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fullTestPath = path.join(root, 'test', 'run-tests.mjs');

if (!existsSync(fullTestPath)) {
  console.error(`Test entrypoint not found: ${fullTestPath}`);
  process.exitCode = 2;
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
