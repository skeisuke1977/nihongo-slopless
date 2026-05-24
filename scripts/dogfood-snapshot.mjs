#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const LOCAL_DIR = path.join(REPO_ROOT, '.local');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, '.local', 'dogfood-history');
const PROFILE = 'general';
const TARGETS = ['HANDOFF.md', 'VISION.md', 'ROADMAP.md', 'README.md'];
const ENV_TIMESTAMP = 'DOGFOOD_SNAPSHOT_TIMESTAMP';
const ENV_OUT_DIR = 'DOGFOOD_SNAPSHOT_OUT_DIR';

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

function normalizePathForDisplay(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/gu, '/');
}

function parseArgs(argv) {
  const options = {
    outDir: process.env[ENV_OUT_DIR] || null,
    timestamp: process.env[ENV_TIMESTAMP] || null,
  };
  const args = [...argv];
  const readValue = name => {
    const value = args.shift();
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${name} requires a value.`);
    }
    return value;
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--out-dir') options.outDir = readValue('--out-dir');
    else if (arg === '--timestamp') options.timestamp = readValue('--timestamp');
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return options;
}

function resolveOutputDir(rawOutDir) {
  const resolved = rawOutDir
    ? path.resolve(REPO_ROOT, rawOutDir)
    : DEFAULT_OUT_DIR;
  const relativeToLocal = path.relative(LOCAL_DIR, resolved);
  if (
    relativeToLocal === '..'
    || relativeToLocal.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToLocal)
  ) {
    throw new Error(`Output directory must stay inside .local: ${rawOutDir}`);
  }
  return resolved;
}

function resolveSnapshotTime(rawTimestamp) {
  if (!rawTimestamp) return new Date();
  const date = new Date(rawTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${rawTimestamp}`);
  }
  return date;
}

function runLintDocs() {
  const args = [
    path.join(REPO_ROOT, 'bin', 'nihongo-slopless.mjs'),
    ...TARGETS,
    '--profile',
    PROFILE,
    '--pretty',
    '--fail-on',
    'off',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => {
      resolve({ status, stdout, stderr, args });
    });
  });
}

function buildSummary(report) {
  const files = Array.isArray(report.files) ? report.files : [];
  const base = report.summary && typeof report.summary === 'object' ? report.summary : {};
  const findings = Number.isInteger(base.findings)
    ? base.findings
    : files.reduce((sum, file) => sum + (Array.isArray(file.messages) ? file.messages.length : 0), 0);

  return {
    profile: PROFILE,
    files: Number.isInteger(base.files) ? base.files : files.length,
    findings,
    byRule: base.byRule ?? {},
    bySeverity: base.bySeverity ?? {},
    byProfile: {
      [PROFILE]: findings,
    },
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
    return;
  }

  let outDir;
  let snapshotTime;
  try {
    outDir = resolveOutputDir(options.outDir);
    snapshotTime = resolveSnapshotTime(options.timestamp);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
    return;
  }

  const hasTimestampOverride = Boolean(options.timestamp);
  const startedAt = hasTimestampOverride ? snapshotTime : new Date();
  const result = await runLintDocs();
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    process.stderr.write(result.stderr);
    process.stderr.write(`lint:docs JSON output could not be parsed: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stderr.write(`lint:docs exited with status ${result.status}\n`);
    process.exitCode = result.status ?? 2;
    return;
  }

  const finishedAt = hasTimestampOverride ? snapshotTime : new Date();

  await mkdir(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${timestampForFilename(finishedAt)}.json`);
  const snapshot = {
    tool: 'nihongo-slopless-dogfood-snapshot',
    version: 1,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    command: {
      name: 'node',
      args: result.args.map(arg => path.isAbsolute(arg) ? normalizePathForDisplay(arg) : arg),
      cwd: normalizePathForDisplay(REPO_ROOT),
    },
    targets: TARGETS,
    summary: buildSummary(report),
    report,
  };
  snapshot.command.cwd = snapshot.command.cwd || '.';

  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  process.stdout.write(`${normalizePathForDisplay(outputPath)}\n`);
}

await main();
