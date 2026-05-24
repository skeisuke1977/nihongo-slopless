#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const goldsetPath = path.join(root, 'validation', 'goldset.example.jsonl');
const fullTestPath = path.join(root, 'test', 'run-tests.mjs');
const gitDir = path.join(root, '.git');

if (!existsSync(goldsetPath)) {
  if (existsSync(gitDir) || existsSync(fullTestPath)) {
    console.error(`Evaluation goldset not found in source checkout: ${goldsetPath}`);
    process.exitCode = 2;
    process.exit();
  }

  console.log('Evaluation goldset is not included in this npm package; skip source-checkout evaluation.');
  process.exitCode = 0;
  process.exit();
}

const args = [
  path.join(root, 'scripts', 'evaluate-corpus.mjs'),
  goldsetPath,
  '--pretty',
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exitCode = 2;
} else {
  process.exitCode = result.status ?? 0;
}
