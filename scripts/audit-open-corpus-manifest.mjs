#!/usr/bin/env node
// 公開コーパスmanifestをローカルで監査する。
// 外部取得、検索、ライセンス可否の自動判定、本文抽出は行わない。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { PROFILE_NAMES } from '../src/profiles.mjs';
import { VERSION } from '../src/version.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const DEFAULT_MANIFEST = 'validation/open-corpus-manifest.example.jsonl';
const REQUIRED_FIELDS = [
  'id',
  'origin',
  'sourceName',
  'sourceUrl',
  'license',
  'termsCheckedAt',
  'purpose',
  'validationRole',
  'storagePolicy',
  'includeText',
  'repositoryIncluded',
  'packageIncluded',
  'profile',
  'genre',
  'reviewFocus',
  'notes',
];
const ORIGINS = new Set(['external-public', 'self-authored']);
const EXTERNAL_BODY_FIELDS = new Set([
  'text',
  'body',
  'content',
  'articleText',
  'sampleText',
  'excerpt',
  'excerpts',
  'rawText',
]);
const EXTERNAL_NON_BODY_CONTEXT_FIELDS = new Set([
  'notes',
  'purpose',
]);

function printHelp() {
  process.stdout.write(`audit-open-corpus-manifest ${VERSION}

公開コーパスmanifestをローカル監査します。
検索、外部取得、本文抽出、ライセンス可否判定は行いません。

Usage:
  node scripts/audit-open-corpus-manifest.mjs [options]

Options:
  --manifest <path>  JSONL manifest (既定 ${DEFAULT_MANIFEST})
  --output <path>    Markdownレポート出力先
  --json             JSONを標準出力する
  --help             ヘルプを表示

Examples:
  node scripts/audit-open-corpus-manifest.mjs
  node scripts/audit-open-corpus-manifest.mjs --manifest validation/open-corpus-manifest.example.jsonl
  node scripts/audit-open-corpus-manifest.mjs --output reports/dispatch/open-corpus-manifest-audit.report.md
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    manifestPath: DEFAULT_MANIFEST,
    outputPath: null,
    json: false,
    help: false,
  };

  const readValue = name => {
    const value = args.shift();
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${name} には値を指定してください。`);
    }
    return value;
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--manifest') options.manifestPath = readValue('--manifest');
    else if (arg === '--output') options.outputPath = readValue('--output');
    else if (arg === '--json') options.json = true;
    else throw new Error(`未知のオプションです: ${arg}`);
  }

  return options;
}

function normalizePathForDisplay(filePath) {
  const rel = path.relative(REPO_ROOT, filePath);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join('/');
  }
  return filePath.split(path.sep).join('/');
}

function recordLabel(record, lineNo) {
  return {
    line: lineNo,
    id: typeof record?.id === 'string' && record.id ? record.id : 'id未指定',
  };
}

function addFinding(findings, level, code, record, lineNo, message) {
  const label = recordLabel(record, lineNo);
  findings.push({
    level,
    code,
    line: label.line,
    id: label.id,
    message,
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidIsoDate(value) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function appendManifestPath(basePath, segment) {
  if (typeof segment === 'number') return `${basePath}[${segment}]`;
  if (/^[A-Za-z_$][0-9A-Za-z_$]*$/u.test(segment)) {
    return basePath ? `${basePath}.${segment}` : segment;
  }
  return `${basePath}[${JSON.stringify(segment)}]`;
}

function collectExternalBodyFieldPaths(value, basePath = '') {
  const paths = [];

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      paths.push(...collectExternalBodyFieldPaths(item, appendManifestPath(basePath, index)));
    });
    return paths;
  }

  if (!isPlainObject(value)) return paths;

  for (const [key, child] of Object.entries(value)) {
    if (EXTERNAL_NON_BODY_CONTEXT_FIELDS.has(key)) continue;

    const childPath = appendManifestPath(basePath, key);
    if (EXTERNAL_BODY_FIELDS.has(key) && hasValue(child)) {
      paths.push(childPath);
    }
    paths.push(...collectExternalBodyFieldPaths(child, childPath));
  }

  return paths;
}

async function readManifest(manifestPath) {
  const abs = path.resolve(process.cwd(), manifestPath);
  const body = await readFile(abs, 'utf8');
  const records = [];
  const findings = [];

  body.split(/\r?\n/u).forEach((line, index) => {
    const lineNo = index + 1;
    if (!line.trim()) return;

    try {
      const parsed = JSON.parse(line);
      if (!isPlainObject(parsed)) {
        addFinding(findings, 'error', 'jsonl-record-object', parsed, lineNo, '各行はJSON objectにしてください。');
        return;
      }
      records.push({ record: parsed, lineNo });
    } catch (error) {
      findings.push({
        level: 'error',
        code: 'json-parse',
        line: lineNo,
        id: 'id未指定',
        message: `JSONを解析できません: ${error.message}`,
      });
    }
  });

  return { abs, records, findings };
}

function validateRequiredFields(record, lineNo, findings) {
  for (const field of REQUIRED_FIELDS) {
    if (!hasValue(record[field])) {
      addFinding(findings, 'error', 'required-field', record, lineNo, `必須フィールドがありません: ${field}`);
    }
  }
}

function validateStringField(record, lineNo, findings, field) {
  if (record[field] !== undefined && typeof record[field] !== 'string') {
    addFinding(findings, 'error', 'field-type', record, lineNo, `${field} は文字列にしてください。`);
  }
}

function validateBooleanField(record, lineNo, findings, field) {
  if (record[field] !== undefined && typeof record[field] !== 'boolean') {
    addFinding(findings, 'error', 'field-type', record, lineNo, `${field} は boolean にしてください。`);
  }
}

function validateSourceUrl(record, lineNo, findings) {
  if (typeof record.sourceUrl !== 'string') return;

  try {
    const parsed = new URL(record.sourceUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      addFinding(findings, 'error', 'source-url-protocol', record, lineNo, `sourceUrl は http/https のみ許可します: ${record.sourceUrl}`);
    }
  } catch {
    addFinding(findings, 'error', 'source-url-invalid', record, lineNo, `sourceUrl がURLとして不正です: ${record.sourceUrl}`);
  }
}

function validateTermsCheckedAt(record, lineNo, findings) {
  if (typeof record.termsCheckedAt !== 'string') return;

  const value = record.termsCheckedAt;
  if (isValidIsoDate(value)) return;

  if (value === 'TBD-before-fetch') {
    addFinding(findings, 'warning', 'terms-tbd', record, lineNo, 'termsCheckedAt が TBD-before-fetch です。実取得前に YYYY-MM-DD で利用条件確認日を記録してください。');
    return;
  }

  if (value === 'not-applicable' && record.origin === 'self-authored') return;

  addFinding(
    findings,
    'error',
    'terms-format',
    record,
    lineNo,
    'termsCheckedAt は YYYY-MM-DD、external-public の暫定値 TBD-before-fetch、または self-authored の not-applicable にしてください。',
  );
}

function validateReviewFocus(record, lineNo, findings) {
  if (record.reviewFocus === undefined) return;

  if (!Array.isArray(record.reviewFocus)) {
    addFinding(findings, 'error', 'review-focus-array', record, lineNo, 'reviewFocus は配列にしてください。');
    return;
  }

  if (record.reviewFocus.length === 0) {
    addFinding(findings, 'error', 'review-focus-empty', record, lineNo, 'reviewFocus は空配列にしないでください。');
  }

  const seen = new Set();
  record.reviewFocus.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      addFinding(findings, 'error', 'review-focus-item', record, lineNo, `reviewFocus[${index}] は空でない文字列にしてください。`);
      return;
    }
    if (seen.has(item)) {
      addFinding(findings, 'warning', 'review-focus-duplicate', record, lineNo, `reviewFocus が重複しています: ${item}`);
    }
    seen.add(item);
  });
}

function validateProfileAndGenre(record, lineNo, findings) {
  if (typeof record.profile === 'string' && !PROFILE_NAMES.includes(record.profile)) {
    addFinding(findings, 'error', 'profile-unknown', record, lineNo, `未知のprofileです: ${record.profile}`);
  }

  if (typeof record.genre !== 'string' || typeof record.profile !== 'string') return;

  if (record.profile === record.genre) {
    addFinding(findings, 'warning', 'profile-genre-identical', record, lineNo, `profile と genre が同じ値です (${record.profile})。profile は実行設定、genre は文書種別として分けてください。`);
  } else if (PROFILE_NAMES.includes(record.genre)) {
    addFinding(findings, 'warning', 'genre-profile-name', record, lineNo, `genre が既存profile名と一致しています (${record.genre})。profile/genre の取り違えがないか確認してください。`);
  }

  if (!PROFILE_NAMES.includes(record.profile) && PROFILE_NAMES.includes(record.genre)) {
    addFinding(findings, 'warning', 'possible-profile-genre-swap', record, lineNo, 'profile が未知で genre が既存profile名です。profile と genre の入れ替わりを確認してください。');
  }
}

function validateExternalPublicPolicy(record, lineNo, findings) {
  if (record.origin !== 'external-public') return;

  for (const field of ['includeText', 'repositoryIncluded', 'packageIncluded']) {
    if (record[field] !== false) {
      addFinding(findings, 'error', 'external-public-no-body', record, lineNo, `external-public の ${field} は false にしてください。`);
    }
  }

  for (const fieldPath of collectExternalBodyFieldPaths(record)) {
    addFinding(findings, 'error', 'external-public-body-field', record, lineNo, `external-public に本文らしいフィールドを含めないでください: ${fieldPath}`);
  }
}

function validateRecords(records, initialFindings) {
  const findings = [...initialFindings];
  const seenIds = new Set();

  for (const { record, lineNo } of records) {
    validateRequiredFields(record, lineNo, findings);

    for (const field of ['id', 'origin', 'sourceName', 'sourceUrl', 'license', 'termsCheckedAt', 'purpose', 'validationRole', 'storagePolicy', 'profile', 'genre', 'notes']) {
      validateStringField(record, lineNo, findings, field);
    }

    for (const field of ['includeText', 'repositoryIncluded', 'packageIncluded']) {
      validateBooleanField(record, lineNo, findings, field);
    }

    if (typeof record.id === 'string') {
      if (!/^[a-z0-9][a-z0-9._-]*$/u.test(record.id)) {
        addFinding(findings, 'error', 'id-format', record, lineNo, `id は小文字英数字、ドット、アンダースコア、ハイフンで安定化してください: ${record.id}`);
      }
      if (seenIds.has(record.id)) {
        addFinding(findings, 'error', 'id-duplicate', record, lineNo, `idが重複しています: ${record.id}`);
      }
      seenIds.add(record.id);
    }

    if (record.origin !== undefined && !ORIGINS.has(record.origin)) {
      addFinding(findings, 'error', 'origin-value', record, lineNo, `origin は external-public または self-authored にしてください: ${record.origin}`);
    }

    validateSourceUrl(record, lineNo, findings);
    validateTermsCheckedAt(record, lineNo, findings);
    validateReviewFocus(record, lineNo, findings);
    validateProfileAndGenre(record, lineNo, findings);
    validateExternalPublicPolicy(record, lineNo, findings);
  }

  return findings;
}

function summarize(records, findings) {
  return {
    records: records.length,
    errors: findings.filter(finding => finding.level === 'error').length,
    warnings: findings.filter(finding => finding.level === 'warning').length,
  };
}

function buildRecordRows(records, findings) {
  const byLine = new Map();
  for (const finding of findings) {
    if (!byLine.has(finding.line)) byLine.set(finding.line, { errors: 0, warnings: 0 });
    byLine.get(finding.line)[finding.level === 'error' ? 'errors' : 'warnings'] += 1;
  }

  return records.map(({ record, lineNo }) => {
    const counts = byLine.get(lineNo) ?? { errors: 0, warnings: 0 };
    return {
      line: lineNo,
      id: record.id ?? '',
      origin: record.origin ?? '',
      profile: record.profile ?? '',
      genre: record.genre ?? '',
      errors: counts.errors,
      warnings: counts.warnings,
    };
  });
}

function escapeMarkdownCell(value) {
  return String(value ?? '').replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ');
}

function renderFindings(title, findings) {
  if (findings.length === 0) return `## ${title}\n\nなし\n`;

  const lines = [
    `## ${title}`,
    '',
    '| line | id | code | message |',
    '|---:|---|---|---|',
  ];

  for (const finding of findings) {
    lines.push(`| ${finding.line} | ${escapeMarkdownCell(finding.id)} | ${escapeMarkdownCell(finding.code)} | ${escapeMarkdownCell(finding.message)} |`);
  }

  return `${lines.join('\n')}\n`;
}

function renderMarkdownReport({ manifestPath, generatedAt, records, findings }) {
  const summary = summarize(records, findings);
  const errors = findings.filter(finding => finding.level === 'error');
  const warnings = findings.filter(finding => finding.level === 'warning');
  const result = summary.errors === 0 ? 'PASS' : 'FAIL';
  const rows = buildRecordRows(records, findings);
  const lines = [
    '# Open corpus manifest audit report',
    '',
    `Generated: ${generatedAt}`,
    `Manifest: ${normalizePathForDisplay(manifestPath)}`,
    `Result: ${result}`,
    '',
    '## Summary',
    '',
    '| records | errors | warnings |',
    '|---:|---:|---:|',
    `| ${summary.records} | ${summary.errors} | ${summary.warnings} |`,
    '',
  ];

  lines.push(renderFindings('Errors', errors));
  lines.push(renderFindings('Warnings', warnings));
  lines.push('## Records');
  lines.push('');
  lines.push('| line | id | origin | profile | genre | errors | warnings |');
  lines.push('|---:|---|---|---|---|---:|---:|');
  for (const row of rows) {
    lines.push(`| ${row.line} | ${escapeMarkdownCell(row.id)} | ${escapeMarkdownCell(row.origin)} | ${escapeMarkdownCell(row.profile)} | ${escapeMarkdownCell(row.genre)} | ${row.errors} | ${row.warnings} |`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- この監査はローカルmanifestのみを読み、検索、外部取得、本文抽出は行わない。');
  lines.push('- `external-public` は `includeText=false`、`repositoryIncluded=false`、`packageIncluded=false` を必須とする。');
  lines.push('- `external-public` の本文らしいフィールドは入れ子のobject/arrayも確認し、検出時はmanifest内pathを出す。');
  lines.push('- `notes` と `purpose` は通常の説明欄として扱い、本文混入検出の対象にはしない。');
  lines.push('- `profile` は実行設定、`genre` は文書種別として扱い、同一値やprofile名の流用は確認対象にする。');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    printHelp();
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  let manifest;
  try {
    manifest = await readManifest(options.manifestPath);
  } catch (error) {
    process.stderr.write(`manifestを読めません: ${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
    return;
  }

  const findings = validateRecords(manifest.records, manifest.findings);
  const generatedAt = new Date().toISOString();
  const summary = summarize(manifest.records, findings);

  const payload = {
    tool: 'nihongo-slopless-audit-open-corpus-manifest',
    version: VERSION,
    generatedAt,
    manifestPath: normalizePathForDisplay(manifest.abs),
    profileNames: PROFILE_NAMES,
    summary,
    findings,
    records: buildRecordRows(manifest.records, findings),
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`Result: ${summary.errors === 0 ? 'PASS' : 'FAIL'} (${summary.errors} errors, ${summary.warnings} warnings, ${summary.records} records)\n`);
  }

  if (options.outputPath) {
    const outputPath = path.resolve(process.cwd(), options.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      renderMarkdownReport({
        manifestPath: manifest.abs,
        generatedAt,
        records: manifest.records,
        findings,
      }),
      'utf8',
    );
    process.stdout.write(`Wrote ${normalizePathForDisplay(outputPath)}\n`);
  }

  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

await main();
