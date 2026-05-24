#!/usr/bin/env node
// npm同梱対象のseed goldsetをローカルで監査する。
// 権利可否の自動判定、外部取得、本文由来の推定は行わない。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { VERSION } from '../src/version.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const DEFAULT_GOLDSET = 'validation/goldset.example.jsonl';
const PACKAGED_ORIGINS = new Set(['self-authored', 'rights-cleared']);
const LOCAL_SOURCE_PREFIXES = ['private_corpus/'];
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
const PUBLIC_ATTRIBUTE_TERMS = [
  'private_corpus',
  '公開属性未確認',
  '抜粋',
  '引用',
  '転載',
  '記事',
  '外部',
  '公開資料',
  'source:',
  'http://',
  'https://',
];

function printHelp() {
  process.stdout.write(`audit-packaged-goldset ${VERSION}

npm同梱対象のseed goldsetの公開属性をローカル監査します。
権利可否の自動判定、外部取得、AI生成判定、著者推定は行いません。

Usage:
  node scripts/audit-packaged-goldset.mjs [options]

Options:
  --goldset <path>      JSONL goldset (既定 ${DEFAULT_GOLDSET})
  --strict-origin       全recordで origin を必須にする
  --strict-local-source self-authoredのローカル下書き由来断片をerrorにする
  --output <path>       Markdownレポート出力先
  --json                JSONを標準出力する
  --help                ヘルプを表示

Examples:
  node scripts/audit-packaged-goldset.mjs
  node scripts/audit-packaged-goldset.mjs --strict-origin
  node scripts/audit-packaged-goldset.mjs --strict-local-source
  node scripts/audit-packaged-goldset.mjs --output reports/dispatch/packaged-goldset-audit.report.md
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    goldsetPath: DEFAULT_GOLDSET,
    strictOrigin: false,
    strictLocalSource: false,
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
    else if (arg === '--goldset') options.goldsetPath = readValue('--goldset');
    else if (arg === '--strict-origin') options.strictOrigin = true;
    else if (arg === '--strict-local-source') options.strictLocalSource = true;
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
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

async function readGoldset(goldsetPath) {
  const abs = path.resolve(process.cwd(), goldsetPath);
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

function findPublicAttributeTerms(record) {
  const fields = ['sourceFile', 'note', 'notes'];
  const hits = [];

  for (const field of fields) {
    const value = record[field];
    if (typeof value !== 'string') continue;
    for (const term of PUBLIC_ATTRIBUTE_TERMS) {
      if (value.includes(term)) hits.push({ field, term });
    }
  }

  return hits;
}

function bodyLikeFields(record) {
  return Object.keys(record).filter(key => EXTERNAL_BODY_FIELDS.has(key) && hasValue(record[key]));
}

function normalizedSourceFile(record) {
  if (typeof record.sourceFile !== 'string') return '';
  return record.sourceFile.trim().replaceAll('\\', '/');
}

function localSourcePrefix(record) {
  const sourceFile = normalizedSourceFile(record);
  return LOCAL_SOURCE_PREFIXES.find(prefix => sourceFile === prefix.slice(0, -1) || sourceFile.startsWith(prefix));
}

function validateOrigin(record, lineNo, findings, options) {
  if (!hasOwn(record, 'origin')) {
    if (options.strictOrigin) {
      addFinding(findings, 'error', 'origin-required', record, lineNo, '--strict-origin では origin が必須です。');
    } else {
      addFinding(findings, 'warning', 'origin-missing', record, lineNo, '後方互換のため通常モードではfailしませんが、npm同梱seedでは origin の追加を推奨します。');
    }

    const hits = findPublicAttributeTerms(record);
    if (hits.length > 0) {
      const terms = hits.map(hit => `${hit.field}:${hit.term}`).join(', ');
      addFinding(findings, 'error', 'origin-missing-public-attribute-term', record, lineNo, `origin がなく、公開属性確認が必要な語を含みます: ${terms}`);
    }
    return;
  }

  if (!PACKAGED_ORIGINS.has(record.origin)) {
    addFinding(findings, 'error', 'origin-not-packaged', record, lineNo, `npm同梱seedの origin は self-authored または rights-cleared のみ許可します: ${String(record.origin)}`);
  }

  if (record.origin === 'external-public') {
    const bodyFields = bodyLikeFields(record);
    if (record.includeText === true || bodyFields.length > 0) {
      const fields = [
        record.includeText === true ? 'includeText=true' : null,
        ...bodyFields,
      ].filter(Boolean);
      addFinding(findings, 'error', 'external-public-body-included', record, lineNo, `external-public の本文同梱はnpm同梱seedでは不可です: ${fields.join(', ')}`);
    }
  }

  if (record.origin === 'self-authored') {
    const prefix = localSourcePrefix(record);
    if (prefix) {
      addFinding(
        findings,
        options.strictLocalSource ? 'error' : 'warning',
        'self-authored-local-source',
        record,
        lineNo,
        `self-authored だが sourceFile がローカル下書き領域を指しています: ${prefix}`,
      );
    }
  }
}

function validateRecordShape(record, lineNo, findings) {
  if (hasOwn(record, 'origin') && typeof record.origin !== 'string') {
    addFinding(findings, 'error', 'origin-type', record, lineNo, 'origin は文字列にしてください。');
  }

  if (hasOwn(record, 'rightsNote') && typeof record.rightsNote !== 'string') {
    addFinding(findings, 'error', 'rights-note-type', record, lineNo, 'rightsNote は文字列にしてください。');
  }
}

function validateRecords(records, initialFindings, options) {
  const findings = [...initialFindings];
  const seenIds = new Set();

  for (const { record, lineNo } of records) {
    if (typeof record.id === 'string') {
      if (seenIds.has(record.id)) {
        addFinding(findings, 'error', 'id-duplicate', record, lineNo, `idが重複しています: ${record.id}`);
      }
      seenIds.add(record.id);
    }

    validateRecordShape(record, lineNo, findings);
    validateOrigin(record, lineNo, findings, options);
  }

  return findings;
}

function summarize(records, findings) {
  const origins = {};
  for (const { record } of records) {
    const origin = hasOwn(record, 'origin') ? String(record.origin) : '<missing>';
    origins[origin] = (origins[origin] ?? 0) + 1;
  }

  return {
    records: records.length,
    errors: findings.filter(finding => finding.level === 'error').length,
    warnings: findings.filter(finding => finding.level === 'warning').length,
    origins: Object.fromEntries(Object.entries(origins).sort(([left], [right]) => left.localeCompare(right))),
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
      origin: hasOwn(record, 'origin') ? record.origin : '',
      sourceFile: record.sourceFile ?? '',
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

function renderMarkdownReport({ goldsetPath, generatedAt, strictOrigin, strictLocalSource, records, findings }) {
  const summary = summarize(records, findings);
  const errors = findings.filter(finding => finding.level === 'error');
  const warnings = findings.filter(finding => finding.level === 'warning');
  const result = summary.errors === 0 ? 'PASS' : 'FAIL';
  const rows = buildRecordRows(records, findings);
  const lines = [
    '# Packaged goldset audit report',
    '',
    `Generated: ${generatedAt}`,
    `Goldset: ${normalizePathForDisplay(goldsetPath)}`,
    `Strict origin: ${strictOrigin ? 'true' : 'false'}`,
    `Strict local source: ${strictLocalSource ? 'true' : 'false'}`,
    `Result: ${result}`,
    '',
    '## Summary',
    '',
    '| records | errors | warnings |',
    '|---:|---:|---:|',
    `| ${summary.records} | ${summary.errors} | ${summary.warnings} |`,
    '',
    '## Origin distribution',
    '',
    '| origin | records |',
    '|---|---:|',
  ];

  for (const [origin, count] of Object.entries(summary.origins)) {
    lines.push(`| ${escapeMarkdownCell(origin)} | ${count} |`);
  }

  lines.push('');
  lines.push(renderFindings('Errors', errors));
  lines.push(renderFindings('Warnings', warnings));
  lines.push('## Records');
  lines.push('');
  lines.push('| line | id | origin | sourceFile | errors | warnings |');
  lines.push('|---:|---|---|---|---:|---:|');
  for (const row of rows) {
    lines.push(`| ${row.line} | ${escapeMarkdownCell(row.id)} | ${escapeMarkdownCell(row.origin)} | ${escapeMarkdownCell(row.sourceFile)} | ${row.errors} | ${row.warnings} |`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- この監査はローカルgoldsetのみを読み、検索、外部取得、ライセンス可否判定は行わない。');
  lines.push('- npm同梱seedの `origin` は `self-authored` または `rights-cleared` のみ許可する。');
  lines.push('- `self-authored` でも `sourceFile` が `private_corpus/` を指す断片は、ローカル下書き由来として通常モードでは warning にする。');
  lines.push('- 通常モードでは後方互換のため `origin` 欠落を warning に留める。ただし `sourceFile` / `note` / `notes` に公開属性確認が必要な語があれば error にする。');
  lines.push('- `--strict-origin` では全recordで `origin` を必須にする。');
  lines.push('- `--strict-local-source` では `self-authored` のローカル下書き由来断片を error にする。');
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

  let goldset;
  try {
    goldset = await readGoldset(options.goldsetPath);
  } catch (error) {
    process.stderr.write(`goldsetを読めません: ${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
    return;
  }

  const findings = validateRecords(goldset.records, goldset.findings, options);
  const generatedAt = new Date().toISOString();
  const summary = summarize(goldset.records, findings);

  const payload = {
    tool: 'nihongo-slopless-audit-packaged-goldset',
    version: VERSION,
    generatedAt,
    goldsetPath: normalizePathForDisplay(goldset.abs),
    strictOrigin: options.strictOrigin,
    strictLocalSource: options.strictLocalSource,
    allowedPackagedOrigins: [...PACKAGED_ORIGINS],
    localSourcePrefixes: LOCAL_SOURCE_PREFIXES,
    publicAttributeTerms: PUBLIC_ATTRIBUTE_TERMS,
    summary,
    findings,
    records: buildRecordRows(goldset.records, findings),
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
        goldsetPath: goldset.abs,
        generatedAt,
        strictOrigin: options.strictOrigin,
        strictLocalSource: options.strictLocalSource,
        records: goldset.records,
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
