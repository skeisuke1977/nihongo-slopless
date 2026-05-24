#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { VERSION } from '../src/version.mjs';

const SARIF_VERSION = '2.1.0';

function printHelp() {
  process.stdout.write(`validate-sarif ${VERSION}

Validate the minimum SARIF shape emitted by nihongo-slopless.

Usage:
  node scripts/validate-sarif.mjs <sarifPath> [--json] [--for-publish]

Options:
  --json         Emit a machine-readable validation summary
  --for-publish  Reject local/private artifact URIs before publishing
  --help         Show this help
  --version      Show this script version

This script checks SARIF structure for local review routing. It does not score
writing quality, and it does not treat the number of results as better or worse.
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    inputPath: null,
    json: false,
    forPublish: false,
    help: false,
    version: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--for-publish') options.forPublish = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else if (!options.inputPath) options.inputPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }

  return options;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function pushError(errors, pathName, message) {
  errors.push({ path: pathName, message });
}

function hasForbiddenPublishPrefix(uri) {
  const forbiddenPrefixes = ['.local', 'reports/open-corpus', 'private_corpus'];
  return forbiddenPrefixes.some(prefix => uri === prefix || uri.startsWith(`${prefix}/`));
}

function publishArtifactUriError(uri) {
  const normalized = uri.replace(/\\/gu, '/');
  const comparable = normalized.toLowerCase();
  const relativeComparable = comparable.replace(/^(?:\.\/)+/u, '');

  if (comparable.startsWith('file:')) {
    return 'artifactLocation.uri must not be a file: URI in --for-publish mode';
  }
  if (/^[a-z]:\//iu.test(normalized) || normalized.startsWith('//')) {
    return 'artifactLocation.uri must not be a Windows absolute path in --for-publish mode';
  }
  if (normalized.startsWith('/')) {
    return 'artifactLocation.uri must not be a Unix absolute path in --for-publish mode';
  }
  if (hasForbiddenPublishPrefix(relativeComparable)) {
    return 'artifactLocation.uri must not point to local/private corpus paths in --for-publish mode';
  }
  return null;
}

function validateSarif(log, { forPublish = false } = {}) {
  const errors = [];
  const stats = {
    version: isObject(log) && typeof log.version === 'string' ? log.version : null,
    runs: 0,
    rules: 0,
    results: 0,
    locations: 0,
    artifactUris: new Set(),
  };

  if (!isObject(log)) {
    pushError(errors, '$', 'SARIF root must be an object');
    return { ok: false, errors, stats };
  }

  if (log.version !== SARIF_VERSION) {
    pushError(errors, '$.version', `Expected SARIF version ${SARIF_VERSION}`);
  }

  if (!Array.isArray(log.runs)) {
    pushError(errors, '$.runs', 'runs must be an array');
    return { ok: errors.length === 0, errors, stats };
  }

  if (log.runs.length === 0) {
    pushError(errors, '$.runs', 'runs must contain at least one run');
  }
  stats.runs = log.runs.length;

  log.runs.forEach((run, runIndex) => {
    const runPath = `$.runs[${runIndex}]`;
    if (!isObject(run)) {
      pushError(errors, runPath, 'run must be an object');
      return;
    }

    const driver = run.tool?.driver;
    if (!isObject(driver)) {
      pushError(errors, `${runPath}.tool.driver`, 'tool.driver must be an object');
    }

    const rules = driver?.rules;
    if (!Array.isArray(rules)) {
      pushError(errors, `${runPath}.tool.driver.rules`, 'tool.driver.rules must be an array');
    } else {
      stats.rules += rules.length;
      if (rules.length === 0) {
        pushError(errors, `${runPath}.tool.driver.rules`, 'tool.driver.rules must contain rule descriptors');
      }
      rules.forEach((rule, ruleIndex) => {
        const rulePath = `${runPath}.tool.driver.rules[${ruleIndex}]`;
        if (!isObject(rule)) {
          pushError(errors, rulePath, 'rule descriptor must be an object');
          return;
        }
        if (!isNonEmptyString(rule.id)) {
          pushError(errors, `${rulePath}.id`, 'rule descriptor id must be a non-empty string');
        }
      });
    }

    if (!Array.isArray(run.results)) {
      pushError(errors, `${runPath}.results`, 'results must be an array');
      return;
    }

    run.results.forEach((result, resultIndex) => {
      stats.results += 1;
      const resultPath = `${runPath}.results[${resultIndex}]`;
      if (!isObject(result)) {
        pushError(errors, resultPath, 'result must be an object');
        return;
      }
      if (!isNonEmptyString(result.ruleId)) {
        pushError(errors, `${resultPath}.ruleId`, 'result ruleId must be a non-empty string');
      }
      if (!isObject(result.message) || typeof result.message.text !== 'string') {
        pushError(errors, `${resultPath}.message.text`, 'result message.text must be a string');
      }
      if (!Array.isArray(result.locations)) {
        pushError(errors, `${resultPath}.locations`, 'result locations must be an array');
        return;
      }
      if (result.locations.length === 0) {
        pushError(errors, `${resultPath}.locations`, 'result locations must contain at least one location');
      }

      result.locations.forEach((location, locationIndex) => {
        stats.locations += 1;
        const locationPath = `${resultPath}.locations[${locationIndex}]`;
        const artifactLocation = location?.physicalLocation?.artifactLocation;
        if (!isObject(artifactLocation)) {
          pushError(errors, `${locationPath}.physicalLocation.artifactLocation`, 'artifactLocation must be an object');
          return;
        }
        if (!isNonEmptyString(artifactLocation.uri)) {
          pushError(errors, `${locationPath}.physicalLocation.artifactLocation.uri`, 'artifactLocation.uri must be a non-empty string');
          return;
        }
        stats.artifactUris.add(artifactLocation.uri);
        if (forPublish) {
          const publishError = publishArtifactUriError(artifactLocation.uri);
          if (publishError) {
            pushError(errors, `${locationPath}.physicalLocation.artifactLocation.uri`, publishError);
          }
        }
      });
    });
  });

  return { ok: errors.length === 0, errors, stats };
}

function serializeStats(stats) {
  return {
    version: stats.version,
    runs: stats.runs,
    rules: stats.rules,
    results: stats.results,
    locations: stats.locations,
    artifactUris: stats.artifactUris.size,
  };
}

function writeHumanSummary({ inputPath, validation }) {
  const label = validation.ok ? 'SARIF OK' : 'SARIF INVALID';
  process.stdout.write(`${label}: ${inputPath}\n`);
  const stats = serializeStats(validation.stats);
  process.stdout.write(`- version: ${stats.version ?? '(missing)'}\n`);
  process.stdout.write(`- runs: ${stats.runs}\n`);
  process.stdout.write(`- rules: ${stats.rules}\n`);
  process.stdout.write(`- results: ${stats.results}\n`);
  process.stdout.write(`- locations: ${stats.locations}\n`);
  process.stdout.write(`- artifact URIs: ${stats.artifactUris}\n`);
  process.stdout.write('- note: result count is for routing inspection only, not a writing quality score.\n');
  if (validation.forPublish) {
    process.stdout.write('- publish mode: checked artifact URIs for local/private paths.\n');
  }

  if (!validation.ok) {
    process.stdout.write('\nErrors:\n');
    for (const error of validation.errors) {
      process.stdout.write(`- ${error.path}: ${error.message}\n`);
    }
  }
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

  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (options.help || !options.inputPath) {
    printHelp();
    if (!options.help) process.exitCode = 2;
    return;
  }

  const inputPath = path.resolve(process.cwd(), options.inputPath);
  let log;
  try {
    const body = await readFile(inputPath, 'utf8');
    log = JSON.parse(body);
  } catch (error) {
    const payload = {
      ok: false,
      file: inputPath,
      errors: [{ path: '$', message: `Could not read or parse SARIF JSON: ${error.message}` }],
    };
    if (options.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      process.stderr.write(`${payload.errors[0].message}\n`);
    }
    process.exitCode = 2;
    return;
  }

  const validation = validateSarif(log, { forPublish: options.forPublish });
  validation.forPublish = options.forPublish;
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      ok: validation.ok,
      file: inputPath,
      forPublish: options.forPublish,
      stats: serializeStats(validation.stats),
      errors: validation.errors,
      note: 'Result count is for routing inspection only, not a writing quality score.',
    }, null, 2)}\n`);
  } else {
    writeHumanSummary({ inputPath, validation });
  }

  process.exitCode = validation.ok ? 0 : 1;
}

await main();
