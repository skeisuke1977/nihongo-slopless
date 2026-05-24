#!/usr/bin/env node
// nihongo-slopless 自動レポート生成スクリプト
// 既存 JSON 出力、または対象ディレクトリ/glob から
// reports/private_corpus_lint_report.md と同形式の Markdown を生成する。

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { lintText, summarizeResults, loadConfigFile } from '../src/index.mjs';
import { expandInputs } from '../src/glob.mjs';
import { outputFilePath } from '../src/output-paths.mjs';
import { VERSION } from '../src/version.mjs';

const SEVERITY_LEVELS = ['info', 'warning', 'error'];
const FAIL_ON_LEVELS = [...SEVERITY_LEVELS, 'off'];
const SEVERITY_RANK = { info: 1, warning: 2, error: 3 };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

function printHelp() {
  process.stdout.write(`lint-report ${VERSION}

nihongo-slopless の出力 JSON、または対象ディレクトリ/glob から
Markdown レポートを生成します。

Usage:
  node scripts/lint-report.mjs --input <jsonPath> --output <mdPath>
  node scripts/lint-report.mjs --target <dir|glob> [--profile <name>] --output <mdPath>

Options:
  --input <path>         既存 JSON 出力 (--pretty 形式) を読み込む
  --target <input>       lint 対象 (ディレクトリ、ファイル、glob)。複数指定可
  --output <path>        Markdown 出力先 (省略時は標準出力)
  --profile <name>       --target モードで使うプロファイル
  --config <path>        --target モードで使う設定ファイル
  --min-severity <level> info|warning|error の最小出力レベル
  --fail-on <level>      info|warning|error|off。終了コード1にする最小重要度
  --max-detail <count>   指摘詳細をこの件数までに抑える
  --base-dir <path>      対象ファイルを読み直す基点ディレクトリ (既定: --input の親 / cwd)
  --title <text>         レポートタイトル (既定: "<対象> lint report")
  --no-fail              終了コードを常に 0 にする (--target モード用ラッパ向け)
  --help                 ヘルプを表示
  --version              バージョンを表示

Examples:
  node scripts/lint-report.mjs --input reports/private_corpus_lint_latest.json --output reports/regenerated.md
  node scripts/lint-report.mjs --target private_corpus --profile general --output reports/private_corpus_general.md
  node scripts/lint-report.mjs --target "docs/**/*.md" --output reports/docs.md
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const targets = [];
  const options = {
    inputPath: null,
    outputPath: null,
    profile: null,
    configPath: null,
    minSeverity: 'info',
    failOn: 'warning',
    maxDetail: null,
    baseDir: null,
    title: null,
    help: false,
    version: false,
    suppressFail: false,
  };

  const readValue = name => {
    const value = args.shift();
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${name} には値を指定してください。`);
    }
    return value;
  };
  const readChoice = (name, choices) => {
    const value = readValue(name);
    if (!choices.includes(value)) {
      throw new Error(`${name} には ${choices.join('|')} のいずれかを指定してください: ${value}`);
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
    else if (arg === '--input') options.inputPath = readValue('--input');
    else if (arg === '--output') options.outputPath = readValue('--output');
    else if (arg === '--target') targets.push(readValue('--target'));
    else if (arg === '--profile') options.profile = readValue('--profile');
    else if (arg === '--config') options.configPath = readValue('--config');
    else if (arg === '--min-severity') options.minSeverity = readChoice('--min-severity', SEVERITY_LEVELS);
    else if (arg === '--fail-on') options.failOn = readChoice('--fail-on', FAIL_ON_LEVELS);
    else if (arg === '--max-detail') options.maxDetail = readPositiveInt('--max-detail');
    else if (arg === '--base-dir') options.baseDir = readValue('--base-dir');
    else if (arg === '--title') options.title = readValue('--title');
    else if (arg === '--no-fail') options.suppressFail = true;
    else if (arg.startsWith('--')) throw new Error(`未知のオプションです: ${arg}`);
    else targets.push(arg);
  }

  return { options, targets };
}

function severityRank(level) {
  return SEVERITY_RANK[level] ?? 0;
}

function stripPrefix(ruleId) {
  return ruleId.startsWith('nihongo-slopless/') ? ruleId.slice('nihongo-slopless/'.length) : ruleId;
}

// `### private_corpus/...md` から GitHub Anchor 互換 (本ツール独自) のリンクを作る。
// 既存 reports/private_corpus_lint_report.md と同じ
// `#<encodeURIComponent(path.toLowerCase())>` 形式を採用する。
function anchorFor(filePath) {
  return `#${encodeURIComponent(filePath.toLowerCase())}`;
}

// JS の encodeURIComponent はパスセパレータ "/" を %2F に変換する。
function tablePathAnchor(filePath) {
  return anchorFor(filePath);
}

function formatExecCommand({ targets, profile, configPath }) {
  const parts = ['node', 'bin/nihongo-slopless.mjs'];
  for (const t of targets) {
    parts.push(quoteIfNeeded(t));
  }
  if (profile) parts.push('--profile', profile);
  if (configPath) parts.push('--config', quoteIfNeeded(configPath));
  parts.push('--fail-on', 'off', '--pretty');
  return `conda activate sci; ${parts.join(' ')}`;
}

function quoteIfNeeded(text) {
  if (/[\s'"]/u.test(text)) {
    return `'${text.replace(/'/gu, "'\\''")}'`;
  }
  return text;
}

function summarizeFilesPerRule(messages) {
  const byRule = new Map();
  for (const m of messages) {
    const key = stripPrefix(m.ruleId);
    byRule.set(key, (byRule.get(key) ?? 0) + 1);
  }
  // 件数降順 → ルール名昇順
  return [...byRule.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

function summarizeBySeverity(results) {
  const counts = new Map();
  for (const file of results) {
    for (const m of file.messages) {
      counts.set(m.severity, (counts.get(m.severity) ?? 0) + 1);
    }
  }
  // 件数降順、同値は severity rank 降順 (error > warning > info)
  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return severityRank(b[0]) - severityRank(a[0]);
  });
}

function summarizeByRule(results) {
  const counts = new Map();
  for (const file of results) {
    for (const m of file.messages) {
      const id = stripPrefix(m.ruleId);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

// 入力順を保つ。lintTargets/JSON のいずれも、ファイル発見順を保持したい。
function filesWithFindings(results) {
  return results
    .filter(f => f.messages.length > 0)
    .map(f => ({ ...f }));
}

function filesWithoutFindings(results) {
  return results
    .filter(f => f.messages.length === 0)
    .map(f => f.path);
}

// 「主なルール」表示。reports/private_corpus_lint_report.md と同じく
// そのファイルで検出された全ルールを件数降順 → ルール名昇順で列挙する。
// 上位 N に絞りたい場合は呼び出し側で limit を指定する。
function topRulesSummary(messages, limit = Infinity) {
  const counts = summarizeFilesPerRule(messages);
  const capped = Number.isFinite(limit) ? counts.slice(0, limit) : counts;
  return capped.map(([ruleId, n]) => `\`${ruleId}\` ${n}`).join(', ');
}

async function readJsonPayload(inputPath) {
  const abs = path.resolve(process.cwd(), inputPath);
  if (!existsSync(abs)) {
    throw new Error(`--input で指定したファイルが見つかりません: ${abs}`);
  }
  const body = await readFile(abs, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new Error(`--input のJSONを解析できませんでした (${abs}): ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.files)) {
    throw new Error(`--input のJSON形式が不正です (files 配列が見つかりません): ${abs}`);
  }
  return { payload: parsed, inputPath: abs };
}

// 対象ファイル本文の取得をメモ化。
// 大量ファイル時のメモリ効率のため、ファイル内容は呼び出しタイミングで読み、
// 行情報抽出後すぐ参照を解放するキャッシュにしている。
function createLineFetcher(baseDirs) {
  const fileCache = new Map();

  async function fetchLine(relativePath, line) {
    if (fileCache.has(relativePath) && fileCache.get(relativePath) === null) {
      return null;
    }
    let lines = fileCache.get(relativePath);
    if (lines === undefined) {
      lines = await loadLines(relativePath);
      fileCache.set(relativePath, lines);
    }
    if (!lines) return null;
    if (line < 1 || line > lines.length) return null;
    return lines[line - 1];
  }

  async function loadLines(relativePath) {
    const candidates = [];
    if (path.isAbsolute(relativePath)) {
      candidates.push(relativePath);
    }
    for (const dir of baseDirs) {
      candidates.push(path.resolve(dir, relativePath));
    }
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const stats = await stat(candidate);
        if (!stats.isFile()) continue;
      } catch {
        continue;
      }
      try {
        const text = await readFile(candidate, 'utf8');
        return text.split(/\r?\n/u);
      } catch {
        // continue trying other candidates
      }
    }
    return null;
  }

  function releaseAll() {
    fileCache.clear();
  }

  return { fetchLine, releaseAll };
}

function renderHeader({ title, target, execCommand, generatedAt }) {
  return [
    `# ${title}`,
    '',
    `生成日時: ${generatedAt}  `,
    `対象: \`${target}\`  `,
    `実行: \`${execCommand}\``,
    '',
  ].join('\n');
}

function renderSummary({ results, severityCounts, ruleCounts, noFindingFiles }) {
  const total = results.length;
  const findings = results.reduce((sum, f) => sum + f.messages.length, 0);
  const withFindings = results.filter(f => f.messages.length > 0).length;
  const withoutFindings = total - withFindings;

  const lines = [
    '## サマリー',
    '',
    `- 対象ファイル: ${total}`,
    `- 指摘総数: ${findings}`,
    `- 指摘ありファイル: ${withFindings}`,
    `- 指摘なしファイル: ${withoutFindings}`,
    '',
    '### 重要度別',
    '',
    '| 重要度 | 件数 |',
    '|---|---:|',
  ];
  if (severityCounts.length === 0) {
    lines.push('| (該当なし) | 0 |');
  } else {
    for (const [sev, n] of severityCounts) {
      lines.push(`| ${sev} | ${n} |`);
    }
  }
  lines.push('');
  lines.push('### ルール別');
  lines.push('');
  lines.push('| ルール | 件数 |');
  lines.push('|---|---:|');
  if (ruleCounts.length === 0) {
    lines.push('| (該当なし) | 0 |');
  } else {
    for (const [ruleId, n] of ruleCounts) {
      lines.push(`| \`${ruleId}\` | ${n} |`);
    }
  }
  lines.push('');
  lines.push('### 指摘なしファイル');
  lines.push('');
  if (noFindingFiles.length === 0) {
    lines.push('- (なし)');
  } else {
    for (const p of noFindingFiles) {
      lines.push(`- \`${p}\``);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function renderFileTable(files) {
  const lines = [
    '## ファイル別一覧',
    '',
    '| ファイル | 指摘数 | 主なルール |',
    '|---|---:|---|',
  ];
  if (files.length === 0) {
    lines.push('| (指摘なし) | 0 |  |');
    lines.push('');
    return lines.join('\n');
  }
  for (const file of files) {
    const link = `[${file.path}](${tablePathAnchor(file.path)})`;
    const top = topRulesSummary(file.messages) || '-';
    lines.push(`| ${link} | ${file.messages.length} | ${top} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function renderDetails({ files, fetchLine, maxDetail, inputMode }) {
  const out = [];
  out.push('## 指摘詳細');
  out.push('');
  out.push('各項目の「実際の行」は、対象 Markdown ファイルから該当行を読み直したものです。検出語は列番号と長さから切り出しています。');
  out.push('');

  let totalEmitted = 0;
  let truncated = false;

  for (const file of files) {
    if (maxDetail != null && totalEmitted >= maxDetail) {
      truncated = true;
      break;
    }
    out.push(`### ${file.path}`);
    out.push('');
    out.push(`ファイル: \`${file.path}\`  `);
    out.push(`指摘数: ${file.messages.length}`);
    out.push('');

    for (let i = 0; i < file.messages.length; i += 1) {
      if (maxDetail != null && totalEmitted >= maxDetail) {
        truncated = true;
        break;
      }
      const m = file.messages[i];
      const ruleId = stripPrefix(m.ruleId);
      out.push(`#### ${i + 1}. L${m.line}:C${m.column} \`${ruleId}\` [${m.severity}]`);
      out.push('');
      out.push(`- 指摘: ${m.message ?? ''}`);
      const term = await resolveDetectedTerm(m, fetchLine, file.path);
      out.push(`- 検出語: \`${term}\``);
      if (m.suggestion) out.push(`- 修正方針: ${m.suggestion}`);
      out.push(`- 検出周辺: \`${m.excerpt ?? ''}\``);
      out.push('- 実際の行:');
      out.push('');
      const line = await fetchLine(file.path, m.line);
      if (line == null) {
        out.push('```text');
        out.push(inputMode ? '(ファイル取得不可)' : '(該当行を取得できませんでした)');
        out.push('```');
      } else {
        out.push('```text');
        out.push(line);
        out.push('```');
      }
      out.push('');
      totalEmitted += 1;
    }
  }

  if (truncated) {
    out.push(`> --max-detail=${maxDetail} のため、以降の指摘詳細は省略しました。`);
    out.push('');
  }
  return out.join('\n');
}

async function resolveDetectedTerm(message, fetchLine, filePath) {
  const length = Math.max(1, Number(message.length ?? 1));
  const line = await fetchLine(filePath, message.line);
  if (line == null) {
    const fromExcerpt = pickFromExcerpt(message);
    return fromExcerpt ?? '(検出語不明)';
  }
  const col = Math.max(1, Number(message.column ?? 1));
  // 列は1-indexed、行は LF 区切り。長さ length のサブストリングを取り出す。
  const start = col - 1;
  if (start >= line.length) {
    return pickFromExcerpt(message) ?? '(検出語不明)';
  }
  return line.slice(start, start + length);
}

function pickFromExcerpt(message) {
  // フォールバック: excerpt の先頭から length 文字を返す
  if (!message.excerpt) return null;
  const length = Math.max(1, Number(message.length ?? 1));
  return message.excerpt.slice(0, length);
}

async function buildReport({
  payload,
  inputAbsPath,
  baseDir,
  target,
  execCommand,
  title,
  maxDetail,
  inputMode,
}) {
  const generatedAt = new Date().toLocaleString('ja-JP');
  const results = payload.files.map(file => ({
    path: file.path,
    messages: Array.isArray(file.messages) ? file.messages : [],
  }));

  const filesWithMsg = filesWithFindings(results);
  const ruleCounts = summarizeByRule(results);
  const severityCounts = summarizeBySeverity(results);
  const noFindingFiles = filesWithoutFindings(results);

  const baseDirs = [];
  if (baseDir) baseDirs.push(baseDir);
  if (inputAbsPath) baseDirs.push(path.dirname(inputAbsPath));
  baseDirs.push(process.cwd());
  baseDirs.push(REPO_ROOT);
  // 重複除去
  const seenDir = new Set();
  const uniqueBaseDirs = [];
  for (const d of baseDirs) {
    const r = path.resolve(d);
    if (seenDir.has(r)) continue;
    seenDir.add(r);
    uniqueBaseDirs.push(r);
  }
  const { fetchLine, releaseAll } = createLineFetcher(uniqueBaseDirs);

  const segments = [];
  segments.push(renderHeader({
    title,
    target,
    execCommand,
    generatedAt,
  }));
  segments.push(renderSummary({
    results,
    severityCounts,
    ruleCounts,
    noFindingFiles,
  }));
  segments.push(renderFileTable(filesWithMsg));
  segments.push(await renderDetails({
    files: filesWithMsg,
    fetchLine,
    maxDetail,
    inputMode,
  }));

  releaseAll();
  return segments.join('\n');
}

async function lintTargets({ targets, profile, configPath, minSeverity }) {
  const config = await loadConfigFile(configPath, { profile });
  const expanded = await expandInputs(targets, {
    extensions: ['.md', '.markdown', '.txt'],
    ignoreFiles: config.ignoreFiles,
    allowEmpty: false,
  });
  const results = [];
  const minRank = severityRank(minSeverity);
  for (const filePath of expanded) {
    const text = await readFile(filePath, 'utf8');
    const result = lintText(text, { filePath, config });
    result.messages = result.messages.filter(m => severityRank(m.severity) >= minRank);
    result.path = outputFilePath(filePath, { absolutePaths: false });
    results.push(result);
  }
  return {
    payload: {
      tool: 'nihongo-slopless',
      version: VERSION,
      language: 'ja',
      files: results,
      summary: summarizeResults(results),
    },
    config,
  };
}

function filterMessagesBySeverity(payload, minSeverity) {
  const minRank = severityRank(minSeverity);
  for (const file of payload.files) {
    if (!Array.isArray(file.messages)) continue;
    file.messages = file.messages.filter(m => severityRank(m.severity) >= minRank);
  }
}

function chooseTitleAndTarget({ inputMode, targets, inputAbsPath, override }) {
  if (override) {
    return { title: override };
  }
  if (inputMode) {
    // `private_corpus_lint_latest.json` のように suffix を持つ場合は剥がす
    const base = path.basename(inputAbsPath, path.extname(inputAbsPath));
    const stripped = base
      .replace(/_lint_latest$/u, '')
      .replace(/_lint_report$/u, '')
      .replace(/_lint$/u, '');
    return { title: `${stripped || base} lint report` };
  }
  if (targets.length === 1) {
    const base = path.basename(targets[0]);
    return { title: `${base.replace(/\.(md|markdown|txt)$/u, '')} lint report` };
  }
  return { title: 'nihongo-slopless lint report' };
}

async function emitReport(markdown, outputPath) {
  if (!outputPath) {
    process.stdout.write(markdown);
    if (!markdown.endsWith('\n')) process.stdout.write('\n');
    return;
  }
  const abs = path.resolve(process.cwd(), outputPath);
  await mkdir(path.dirname(abs), { recursive: true });
  const body = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  await writeFile(abs, body, 'utf8');
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
    return;
  }
  const { options, targets } = parsed;

  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (options.help || (!options.inputPath && targets.length === 0)) {
    printHelp();
    if (!options.help) process.exitCode = 2;
    return;
  }

  try {
    let payload;
    let inputAbsPath = null;
    let target;
    let execCommand;
    const inputMode = Boolean(options.inputPath);

    if (inputMode) {
      const loaded = await readJsonPayload(options.inputPath);
      payload = loaded.payload;
      inputAbsPath = loaded.inputPath;
      filterMessagesBySeverity(payload, options.minSeverity);
      target = inputAbsPath;
      execCommand = `cat ${quoteIfNeeded(options.inputPath)} (再生成: scripts/lint-report.mjs --input)`;
    } else {
      const linted = await lintTargets({
        targets,
        profile: options.profile,
        configPath: options.configPath,
        minSeverity: options.minSeverity,
      });
      payload = linted.payload;
      // execCommand を表示: targets の絶対パス化
      const absTargets = targets.map(t => path.resolve(process.cwd(), t));
      target = absTargets.length === 1 ? absTargets[0] : absTargets.join(' , ');
      execCommand = formatExecCommand({
        targets: absTargets,
        profile: options.profile,
        configPath: options.configPath,
      });
    }

    const { title: titleHint } = chooseTitleAndTarget({
      inputMode,
      targets,
      inputAbsPath,
      override: options.title,
    });
    const title = options.title ?? titleHint;

    const markdown = await buildReport({
      payload,
      inputAbsPath,
      baseDir: options.baseDir ? path.resolve(process.cwd(), options.baseDir) : null,
      target,
      execCommand,
      title,
      maxDetail: options.maxDetail,
      inputMode,
    });

    await emitReport(markdown, options.outputPath);

    if (options.suppressFail) return;
    if (options.failOn !== 'off') {
      const failRank = severityRank(options.failOn);
      const hasFailing = payload.files.some(file => file.messages.some(m => severityRank(m.severity) >= failRank));
      if (hasFailing) process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
  }
}

await main();
