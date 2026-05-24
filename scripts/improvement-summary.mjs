#!/usr/bin/env node
// nihongo-slopless 改善追跡スクリプト
//
// 2つの lint JSON 結果 (旧スナップショット vs 新スナップショット) を読み比較し、
// 差分サマリ Markdown を生成する。
//
// Usage:
//   node scripts/improvement-summary.mjs --old <oldJson> --new <newJson> --output <md>
//   node scripts/improvement-summary.mjs --old <oldJson> --regen-new <target> --profile <name> --output <md>
//
// 同一行 (file:line:column:ruleId) を比較キーとし、
//   - 消えた指摘 = "改善"
//   - 新規発生した指摘 = "見逃しが減って検出された" もしくは "退行"
// として分類する。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { VERSION } from '../src/version.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const SEVERITY_LEVELS = ['info', 'warning', 'error'];
const SEVERITY_RANK = { info: 1, warning: 2, error: 3 };

function printHelp() {
  process.stdout.write(`improvement-summary ${VERSION}

nihongo-slopless の旧/新 lint JSON を比較し改善追跡レポートを生成します。

Usage:
  node scripts/improvement-summary.mjs --old <oldJson> --new <newJson> --output <md>
  node scripts/improvement-summary.mjs --old <oldJson> --regen-new <target> --profile <name> --output <md>

Options:
  --old <path>            旧 JSON (--pretty 出力)
  --new <path>            新 JSON (--pretty 出力)
  --regen-new <target>    新 JSON を bin/nihongo-slopless.mjs で再生成する
                          (例: --regen-new private_corpus)
  --profile <name>        --regen-new で使う profile (例: general)
  --regen-output <path>   --regen-new で書き出す JSON のパス
                          (省略時: reports/<targetBase>_lint_after.json)
  --output <path>         Markdown 出力先 (省略時は標準出力)
  --top <count>           "消えた/新規" のトップN (既定: 20)
  --profile-strict        旧/新の profile が異なる場合に警告ではなくエラーにする
                          (現状の JSON には profile 情報が無いため将来用フック)
  --help                  ヘルプ表示
  --version               バージョン表示

Examples:
  node scripts/improvement-summary.mjs \\
    --old reports/private_corpus_lint_latest.json \\
    --new reports/private_corpus_lint_after.json \\
    --output reports/improvement-summary.md

  node scripts/improvement-summary.mjs \\
    --old reports/private_corpus_lint_latest.json \\
    --regen-new private_corpus --profile general \\
    --output reports/improvement-summary.md
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    oldPath: null,
    newPath: null,
    regenNew: null,
    regenOutputPath: null,
    profile: null,
    outputPath: null,
    top: 20,
    profileStrict: false,
    help: false,
    version: false,
  };

  const readValue = name => {
    const value = args.shift();
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${name} には値を指定してください。`);
    }
    return value;
  };
  const readPositiveInt = name => {
    const value = readValue(name);
    if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
      throw new Error(`${name} には0以上の整数を指定してください: ${value}`);
    }
    return Number(value);
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--old') options.oldPath = readValue('--old');
    else if (arg === '--new') options.newPath = readValue('--new');
    else if (arg === '--regen-new') options.regenNew = readValue('--regen-new');
    else if (arg === '--regen-output') options.regenOutputPath = readValue('--regen-output');
    else if (arg === '--profile') options.profile = readValue('--profile');
    else if (arg === '--output') options.outputPath = readValue('--output');
    else if (arg === '--top') options.top = readPositiveInt('--top');
    else if (arg === '--profile-strict') options.profileStrict = true;
    else if (arg.startsWith('--')) throw new Error(`未知のオプションです: ${arg}`);
    else throw new Error(`未知の位置引数です: ${arg}`);
  }

  return options;
}

async function readJsonPayload(jsonPath, label) {
  const abs = path.resolve(process.cwd(), jsonPath);
  if (!existsSync(abs)) {
    throw new Error(`${label} のファイルが見つかりません: ${abs}`);
  }
  const body = await readFile(abs, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new Error(`${label} のJSONを解析できませんでした (${abs}): ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.files)) {
    throw new Error(`${label} のJSON形式が不正です (files 配列が見つかりません): ${abs}`);
  }
  return { payload: parsed, absPath: abs };
}

function regenerateNewSnapshot({ regenNew, profile, regenOutputPath }) {
  const cliPath = path.join(REPO_ROOT, 'bin', 'nihongo-slopless.mjs');
  if (!existsSync(cliPath)) {
    throw new Error(`bin/nihongo-slopless.mjs が見つかりません: ${cliPath}`);
  }

  // 出力パス。既定は reports/<targetBase>_lint_after.json。
  const targetBase = path.basename(regenNew.replace(/[/\\]+$/u, '')) || 'target';
  const defaultOutput = path.join(REPO_ROOT, 'reports', `${targetBase}_lint_after.json`);
  const outputPath = regenOutputPath
    ? path.resolve(process.cwd(), regenOutputPath)
    : defaultOutput;

  const args = [cliPath, regenNew];
  if (profile) args.push('--profile', profile);
  args.push('--fail-on', 'off', '--pretty', '--output', outputPath);

  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`再リント実行に失敗しました: ${result.error.message}`);
  }
  // CLI 側で --fail-on off を指定しているので、status は 0/null 想定。
  // 念のため status 2 (パースエラー等) のみ厳格に弾く。
  if (result.status === 2) {
    const stderr = (result.stderr ?? '').trim() || (result.stdout ?? '').trim();
    throw new Error(`再リントが失敗しました (exit 2): ${stderr}`);
  }

  return { outputPath };
}

function stripRulePrefix(ruleId) {
  return ruleId.startsWith('nihongo-slopless/')
    ? ruleId.slice('nihongo-slopless/'.length)
    : ruleId;
}

// 同一指摘判定キー。file:line:column:ruleId で安定。
// index/length は markdown 改行の差で揺れる可能性があるので含めない。
function findingKey({ filePath, message }) {
  const ruleShort = stripRulePrefix(message.ruleId);
  return `${filePath}${message.line}${message.column}${ruleShort}`;
}

// payload.files から指摘 + ファイル情報のフラットリストを作る。
function flatten(payload) {
  const items = [];
  const fileSet = new Set();
  for (const file of payload.files ?? []) {
    fileSet.add(file.path);
    for (const message of file.messages ?? []) {
      items.push({
        key: findingKey({ filePath: file.path, message }),
        filePath: file.path,
        ruleShort: stripRulePrefix(message.ruleId),
        ruleFull: message.ruleId,
        severity: message.severity,
        line: message.line,
        column: message.column,
        excerpt: message.excerpt ?? '',
        message: message.message ?? '',
      });
    }
  }
  return { items, fileSet };
}

function severityRank(level) {
  return SEVERITY_RANK[level] ?? 0;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function unionKeys(...maps) {
  const set = new Set();
  for (const m of maps) {
    for (const k of m.keys()) set.add(k);
  }
  return set;
}

// Markdown テーブルセルのパイプ・改行をエスケープする。
function escCell(text) {
  return String(text ?? '')
    .replace(/\r?\n/gu, ' ')
    .replace(/\|/gu, '\\|');
}

// 大量差分時に表が崩れないよう長すぎる excerpt を切り詰める。
function truncateExcerpt(text, max = 60) {
  const single = String(text ?? '').replace(/\r?\n/gu, ' ').trim();
  if (single.length <= max) return single;
  return `${single.slice(0, max - 1)}…`;
}

function formatHeader({ oldPath, newPath, oldPayload, newPayload, generatedAt }) {
  const oldFiles = oldPayload.files?.length ?? 0;
  const newFiles = newPayload.files?.length ?? 0;
  const oldFindings = (oldPayload.summary && oldPayload.summary.findings) ?? oldPayload.files
    ?.reduce((acc, f) => acc + (f.messages?.length ?? 0), 0) ?? 0;
  const newFindings = (newPayload.summary && newPayload.summary.findings) ?? newPayload.files
    ?.reduce((acc, f) => acc + (f.messages?.length ?? 0), 0) ?? 0;

  const delta = newFindings - oldFindings;
  const deltaText = delta === 0 ? '±0' : (delta > 0 ? `+${delta}` : `${delta}`);

  return [
    '# 改善追跡サマリ (nihongo-slopless)',
    '',
    `生成日時: ${generatedAt}  `,
    `旧: \`${oldPath}\`  `,
    `新: \`${newPath}\`  `,
    `対象数: 旧 ${oldFiles} ファイル / 新 ${newFiles} ファイル  `,
    `指摘総数: 旧 ${oldFindings} → 新 ${newFindings} (差分 ${deltaText})`,
    '',
  ].join('\n');
}

function renderRuleDiffTable(oldItems, newItems) {
  const oldByRule = countBy(oldItems, x => x.ruleShort);
  const newByRule = countBy(newItems, x => x.ruleShort);
  const ruleIds = [...unionKeys(oldByRule, newByRule)].sort((a, b) => {
    const diffB = (newByRule.get(b) ?? 0) - (oldByRule.get(b) ?? 0);
    const diffA = (newByRule.get(a) ?? 0) - (oldByRule.get(a) ?? 0);
    // 改善幅 (旧 - 新 が大きい順) で並べ、同値はルール名昇順。
    const improveB = (oldByRule.get(b) ?? 0) - (newByRule.get(b) ?? 0);
    const improveA = (oldByRule.get(a) ?? 0) - (newByRule.get(a) ?? 0);
    if (improveB !== improveA) return improveB - improveA;
    return a.localeCompare(b);
  });

  const lines = [
    '## 差分サマリ表 (ルール別)',
    '',
    '| ルール | 旧 | 新 | 差分 (新−旧) |',
    '|---|---:|---:|---:|',
  ];
  for (const rule of ruleIds) {
    const o = oldByRule.get(rule) ?? 0;
    const n = newByRule.get(rule) ?? 0;
    const d = n - o;
    const dText = d === 0 ? '±0' : (d > 0 ? `+${d}` : `${d}`);
    lines.push(`| \`${escCell(rule)}\` | ${o} | ${n} | ${dText} |`);
  }
  if (ruleIds.length === 0) {
    lines.push('| (差分なし) | 0 | 0 | ±0 |');
  }
  lines.push('');
  return lines.join('\n');
}

function renderSeverityDiffTable(oldItems, newItems) {
  const oldBySev = countBy(oldItems, x => x.severity);
  const newBySev = countBy(newItems, x => x.severity);
  const ordered = SEVERITY_LEVELS
    .slice()
    .sort((a, b) => severityRank(b) - severityRank(a));

  const lines = [
    '## 重要度別の推移',
    '',
    '| 重要度 | 旧 | 新 | 差分 (新−旧) |',
    '|---|---:|---:|---:|',
  ];
  for (const sev of ordered) {
    const o = oldBySev.get(sev) ?? 0;
    const n = newBySev.get(sev) ?? 0;
    const d = n - o;
    const dText = d === 0 ? '±0' : (d > 0 ? `+${d}` : `${d}`);
    lines.push(`| ${sev} | ${o} | ${n} | ${dText} |`);
  }
  // SEVERITY_LEVELS に無い未知の severity も拾う。
  const known = new Set(SEVERITY_LEVELS);
  const extras = [...unionKeys(oldBySev, newBySev)].filter(s => !known.has(s));
  for (const sev of extras) {
    const o = oldBySev.get(sev) ?? 0;
    const n = newBySev.get(sev) ?? 0;
    const d = n - o;
    const dText = d === 0 ? '±0' : (d > 0 ? `+${d}` : `${d}`);
    lines.push(`| ${escCell(sev)} | ${o} | ${n} | ${dText} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderTopList({ title, items, emptyNote, limit, totalLabel }) {
  const lines = [
    `## ${title} (上位${limit}件 / 全${items.length}件)`,
    '',
  ];
  if (items.length === 0) {
    lines.push(emptyNote);
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| # | file:line:col | ルール | 重要度 | 検出周辺 |');
  lines.push('|---:|---|---|---|---|');
  const top = items.slice(0, limit);
  top.forEach((item, idx) => {
    const loc = `${item.filePath}:${item.line}:${item.column}`;
    lines.push(
      `| ${idx + 1} | ${escCell(loc)} | \`${escCell(item.ruleShort)}\` | ${escCell(item.severity)} | ${escCell(truncateExcerpt(item.excerpt))} |`,
    );
  });
  if (items.length > limit) {
    lines.push('');
    lines.push(`（残り ${items.length - limit} 件は省略。${totalLabel}）`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderFilePerFile({ oldItems, newItems, oldFileSet, newFileSet }) {
  const oldByFile = countBy(oldItems, x => x.filePath);
  const newByFile = countBy(newItems, x => x.filePath);
  const fileNames = [...new Set([...oldFileSet, ...newFileSet])].sort((a, b) => a.localeCompare(b));

  const lines = [
    '## ファイル別の前後件数',
    '',
    '| ファイル | 旧 | 新 | 差分 (新−旧) | 状態 |',
    '|---|---:|---:|---:|---|',
  ];
  for (const file of fileNames) {
    const o = oldByFile.get(file) ?? 0;
    const n = newByFile.get(file) ?? 0;
    const d = n - o;
    const dText = d === 0 ? '±0' : (d > 0 ? `+${d}` : `${d}`);
    const status = [];
    if (!oldFileSet.has(file)) status.push('新規ファイル');
    if (!newFileSet.has(file)) status.push('旧のみ');
    if (status.length === 0) {
      if (d < 0) status.push('改善');
      else if (d > 0) status.push('退行候補');
      else status.push('変化なし');
    }
    lines.push(`| ${escCell(file)} | ${o} | ${n} | ${dText} | ${escCell(status.join(', '))} |`);
  }
  if (fileNames.length === 0) {
    lines.push('| (対象ファイルなし) | 0 | 0 | ±0 | - |');
  }
  lines.push('');
  return lines.join('\n');
}

function renderFileOverlapNote({ oldFileSet, newFileSet }) {
  const newOnly = [...newFileSet].filter(f => !oldFileSet.has(f)).sort();
  const oldOnly = [...oldFileSet].filter(f => !newFileSet.has(f)).sort();

  const lines = [
    '## 対象ファイル集合の差',
    '',
  ];

  if (newOnly.length === 0 && oldOnly.length === 0) {
    lines.push('旧と新の対象ファイル集合は一致しています。');
    lines.push('');
    return lines.join('\n');
  }

  if (newOnly.length > 0) {
    lines.push('### 新側にしかないファイル');
    lines.push('');
    for (const f of newOnly) lines.push(`- \`${escCell(f)}\``);
    lines.push('');
  }
  if (oldOnly.length > 0) {
    lines.push('### 旧側にしかないファイル');
    lines.push('');
    for (const f of oldOnly) lines.push(`- \`${escCell(f)}\``);
    lines.push('');
  }
  return lines.join('\n');
}

function renderProfileCaveat({ oldPayload, newPayload, profileStrict }) {
  // 現状の lint JSON には profile 情報を残していない。
  // 将来 payload.profile 等が入った場合に検知できるよう薄く備える。
  const oldProfile = oldPayload.profile ?? null;
  const newProfile = newPayload.profile ?? null;
  if (oldProfile == null && newProfile == null) {
    return ''; // どちらも未記録ならコメントを出さない。
  }
  if (oldProfile === newProfile) {
    return [
      '## 注記',
      '',
      `両方とも profile=\`${oldProfile ?? '(未指定)'}\` で生成されています。`,
      '',
    ].join('\n');
  }
  const warningLines = [
    '## 注記',
    '',
    `旧 profile=\`${oldProfile ?? '(未指定)'}\` と 新 profile=\`${newProfile ?? '(未指定)'}\` が異なります。`,
    'profile が異なる場合、ルール集合や severity が違うため、差分は改善ではなく設定差の可能性があります。',
    '',
  ];
  if (profileStrict) {
    throw new Error(`profile が一致しません (--profile-strict): old=${oldProfile} new=${newProfile}`);
  }
  return warningLines.join('\n');
}

function buildIndex(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.key)) map.set(item.key, []);
    map.get(item.key).push(item);
  }
  return map;
}

// 同じキー (file:line:col:rule) は複数指摘になることがあるので、
// 集合差ではなく多重集合差で扱う。
// 例: 旧2件・新1件 → 1件消えた。
function multiSetDiff(oldItems, newItems) {
  const oldByKey = buildIndex(oldItems);
  const newByKey = buildIndex(newItems);

  const removed = []; // 旧にしかない (改善)
  const added = []; // 新にしかない (退行候補)
  const persisted = []; // 両方にある

  const allKeys = new Set([...oldByKey.keys(), ...newByKey.keys()]);
  for (const key of allKeys) {
    const o = oldByKey.get(key) ?? [];
    const n = newByKey.get(key) ?? [];
    const overlap = Math.min(o.length, n.length);
    for (let i = 0; i < overlap; i += 1) persisted.push(n[i]);
    if (o.length > n.length) {
      for (let i = overlap; i < o.length; i += 1) removed.push(o[i]);
    } else if (n.length > o.length) {
      for (let i = overlap; i < n.length; i += 1) added.push(n[i]);
    }
  }
  // 件数の多そうな順は降順では無く、視認性のため severity 降順 → file:line 昇順で並べる。
  const sortFn = (a, b) => {
    const sevDelta = severityRank(b.severity) - severityRank(a.severity);
    if (sevDelta !== 0) return sevDelta;
    const fileCmp = a.filePath.localeCompare(b.filePath);
    if (fileCmp !== 0) return fileCmp;
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  };
  removed.sort(sortFn);
  added.sort(sortFn);

  return { removed, added, persisted };
}

function nowJst() {
  // dispatch レポートに合わせて日本時間表記を使う。
  // toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) は環境差があるため
  // 単純に new Date().toISOString() と JST 表記を併記する。
  const now = new Date();
  const iso = now.toISOString();
  const jst = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  return { iso, jst, display: `${jst} (JST) / ${iso}` };
}

function buildMarkdown({
  oldPath,
  newPath,
  oldPayload,
  newPayload,
  oldItems,
  newItems,
  oldFileSet,
  newFileSet,
  topN,
  profileStrict,
  generatedAt,
}) {
  const { removed, added } = multiSetDiff(oldItems, newItems);

  const parts = [];
  parts.push(formatHeader({ oldPath, newPath, oldPayload, newPayload, generatedAt }));

  const headlineLines = [
    '## ハイライト',
    '',
    `- 消えた指摘 (改善): **${removed.length} 件**`,
    `- 新規発生した指摘 (退行候補 or 検出漏れ修正): **${added.length} 件**`,
    `- 同一行 (file:line:col:ruleId) ベースで集計しました。`,
    '',
  ];
  parts.push(headlineLines.join('\n'));

  const caveat = renderProfileCaveat({ oldPayload, newPayload, profileStrict });
  if (caveat) parts.push(caveat);

  parts.push(renderRuleDiffTable(oldItems, newItems));
  parts.push(renderTopList({
    title: '消えた指摘 (改善判定)',
    items: removed,
    emptyNote: '旧 → 新 で消えた指摘はありませんでした。',
    limit: topN,
    totalLabel: '完全な一覧は JSON 差分を参照してください。',
  }));
  parts.push(renderTopList({
    title: '新規発生した指摘 (後退の候補確認)',
    items: added,
    emptyNote: '新規発生した指摘はありませんでした。',
    limit: topN,
    totalLabel: '完全な一覧は JSON 差分を参照してください。',
  }));
  parts.push(renderSeverityDiffTable(oldItems, newItems));
  parts.push(renderFilePerFile({ oldItems, newItems, oldFileSet, newFileSet }));
  parts.push(renderFileOverlapNote({ oldFileSet, newFileSet }));

  return parts.join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd() + '\n';
}

async function emitMarkdown(markdown, outputPath) {
  if (!outputPath) {
    process.stdout.write(markdown);
    return;
  }
  const resolved = path.resolve(process.cwd(), outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, markdown, 'utf8');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (!options.oldPath) {
    process.stderr.write('--old は必須です。--help を参照してください。\n');
    process.exitCode = 2;
    return;
  }
  if (!options.newPath && !options.regenNew) {
    process.stderr.write('--new または --regen-new のいずれかが必要です。\n');
    process.exitCode = 2;
    return;
  }

  try {
    let newPathToUse = options.newPath;
    if (options.regenNew) {
      const { outputPath } = regenerateNewSnapshot({
        regenNew: options.regenNew,
        profile: options.profile,
        regenOutputPath: options.regenOutputPath,
      });
      newPathToUse = outputPath;
    }

    const { payload: oldPayload, absPath: oldAbs } = await readJsonPayload(options.oldPath, '--old');
    const { payload: newPayload, absPath: newAbs } = await readJsonPayload(newPathToUse, '--new');

    const { items: oldItems, fileSet: oldFileSet } = flatten(oldPayload);
    const { items: newItems, fileSet: newFileSet } = flatten(newPayload);

    const { display: generatedAt } = nowJst();
    const markdown = buildMarkdown({
      oldPath: path.relative(REPO_ROOT, oldAbs).replace(/\\/gu, '/'),
      newPath: path.relative(REPO_ROOT, newAbs).replace(/\\/gu, '/'),
      oldPayload,
      newPayload,
      oldItems,
      newItems,
      oldFileSet,
      newFileSet,
      topN: options.top,
      profileStrict: options.profileStrict,
      generatedAt,
    });

    await emitMarkdown(markdown, options.outputPath);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}

await main();
