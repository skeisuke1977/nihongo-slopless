#!/usr/bin/env node
// nihongo-slopless ベンチマークスクリプト
// 複数コーパス × profile を一括 lint し、構造化 JSON と Markdown を出力する。
// 改良前後の比較を容易にするため、--baseline 指定時には差分 Markdown も生成する。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { lintText, summarizeResults, listRuleMetadata } from '../src/index.mjs';
import { expandInputs } from '../src/glob.mjs';
import { loadProfileConfig, PROFILE_NAMES } from '../src/profiles.mjs';
import { VERSION } from '../src/version.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'reports', 'bench');

// 既定コーパス。glob とファイル名を混ぜて読み込む。
const DEFAULT_CORPORA = [
  { name: 'private_corpus', inputs: ['private_corpus/*.md'] },
  { name: 'docs', inputs: ['docs/*.md'] },
  { name: 'examples', inputs: ['examples/*.md'] },
  { name: 'top-level', inputs: ['README.md', 'ROADMAP.md', 'VISION.md', 'AGENTS.md', 'HANDOFF.md'] },
];

function printHelp() {
  process.stdout.write(`benchmark ${VERSION}

nihongo-slopless ベンチマーク。複数コーパス × profile を一括 lint。

Usage:
  node scripts/benchmark.mjs --label <name> [options]

Options:
  --label <name>         出力ファイル名のラベル (必須)
  --profile <name>       単一プロファイル名。既定 'general'
  --all-profiles         全 ${PROFILE_NAMES.length} プロファイルで実行
  --baseline <jsonPath>  ベースライン JSON を読み込み差分を生成
  --out-dir <path>       出力先ディレクトリ (既定 reports/bench)
  --help                 ヘルプを表示

Examples:
  node scripts/benchmark.mjs --label baseline
  node scripts/benchmark.mjs --label after-A3 --baseline reports/bench/baseline.json
  node scripts/benchmark.mjs --label initial --all-profiles
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    label: null,
    profile: 'general',
    allProfiles: false,
    baselinePath: null,
    outDir: DEFAULT_OUT_DIR,
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
    else if (arg === '--label') options.label = readValue('--label');
    else if (arg === '--profile') options.profile = readValue('--profile');
    else if (arg === '--all-profiles') options.allProfiles = true;
    else if (arg === '--baseline') options.baselinePath = readValue('--baseline');
    else if (arg === '--out-dir') options.outDir = readValue('--out-dir');
    else throw new Error(`未知のオプションです: ${arg}`);
  }

  return options;
}

function sanitizeLabel(label) {
  return label.replace(/[^A-Za-z0-9._-]/g, '-');
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

async function collectCorpusFiles(corpus) {
  // expandInputs は cwd ベースで解決するため、REPO_ROOT を一時的に基準にする。
  const savedCwd = process.cwd();
  try {
    process.chdir(REPO_ROOT);
    const expanded = await expandInputs(corpus.inputs, {
      extensions: ['.md', '.markdown', '.txt'],
      allowEmpty: true,
    });
    return expanded;
  } finally {
    process.chdir(savedCwd);
  }
}

async function lintCorpusWithProfile({ corpus, files, profileConfig }) {
  const start = performance.now();
  const results = [];
  for (const filePath of files) {
    const text = await readFile(filePath, 'utf8');
    const result = lintText(text, { filePath, config: profileConfig });
    result.path = relativeToRepo(filePath);
    results.push(result);
  }
  const elapsedMs = performance.now() - start;
  const summary = summarizeResults(results);
  return {
    corpus: corpus.name,
    files: results.length,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    summary,
  };
}

async function runOneProfile({ profileName, corpora, corpusFiles }) {
  const profileConfig = await loadProfileConfig(profileName);
  const corporaResults = [];
  let totalFiles = 0;
  let totalFindings = 0;
  let totalElapsedMs = 0;

  for (const corpus of corpora) {
    const files = corpusFiles.get(corpus.name);
    const result = await lintCorpusWithProfile({ corpus, files, profileConfig });
    corporaResults.push(result);
    totalFiles += result.files;
    totalFindings += result.summary.findings;
    totalElapsedMs += result.elapsedMs;
  }

  return {
    profile: profileName,
    totals: {
      files: totalFiles,
      findings: totalFindings,
      elapsedMs: Number(totalElapsedMs.toFixed(2)),
    },
    corpora: corporaResults,
  };
}

function shortRule(ruleId) {
  return ruleId.replace(/^nihongo-slopless\//, '');
}

function buildMarkdown({ label, payload }) {
  const lines = [];
  lines.push(`# benchmark report: ${label}`);
  lines.push('');
  lines.push(`生成日時: ${payload.generatedAt}  `);
  lines.push(`Node.js: ${payload.nodeVersion}  `);
  lines.push(`ルール総数: ${payload.totalRules}  `);
  lines.push(`対象コーパス: ${payload.corpora.length}  `);
  lines.push(`対象プロファイル: ${payload.profiles.length} (${payload.profiles.map(p => p.profile).join(', ')})`);
  lines.push('');

  // コーパス内訳
  lines.push('## コーパス一覧');
  lines.push('');
  lines.push('| コーパス | ファイル数 | 入力パターン |');
  lines.push('|---|---:|---|');
  for (const corpus of payload.corpora) {
    lines.push(`| ${corpus.name} | ${corpus.files} | \`${corpus.inputs.join('` `')}\` |`);
  }
  lines.push('');

  // プロファイルごとの概要
  for (const profile of payload.profiles) {
    lines.push(`## profile: ${profile.profile}`);
    lines.push('');
    lines.push(`合計ファイル: ${profile.totals.files} / 合計指摘: ${profile.totals.findings} / 計測時間: ${profile.totals.elapsedMs.toFixed(2)} ms`);
    lines.push('');

    lines.push('### コーパス別');
    lines.push('');
    lines.push('| コーパス | ファイル | 指摘 | error | warning | info | 経過 (ms) |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    for (const c of profile.corpora) {
      const sev = c.summary.bySeverity ?? {};
      lines.push(`| ${c.corpus} | ${c.files} | ${c.summary.findings} | ${sev.error ?? 0} | ${sev.warning ?? 0} | ${sev.info ?? 0} | ${c.elapsedMs.toFixed(2)} |`);
    }
    lines.push('');

    // ルール件数 (全コーパス合算)
    const ruleTotals = {};
    for (const c of profile.corpora) {
      for (const [ruleId, count] of Object.entries(c.summary.byRule ?? {})) {
        ruleTotals[ruleId] = (ruleTotals[ruleId] ?? 0) + count;
      }
    }
    const ruleEntries = Object.entries(ruleTotals).sort((a, b) => b[1] - a[1]);
    if (ruleEntries.length > 0) {
      lines.push('### ルール別 (全コーパス合算)');
      lines.push('');
      lines.push('| ルール | 件数 |');
      lines.push('|---|---:|');
      for (const [ruleId, count] of ruleEntries) {
        lines.push(`| \`${shortRule(ruleId)}\` | ${count} |`);
      }
      lines.push('');
    } else {
      lines.push('指摘なし。');
      lines.push('');
    }
  }

  return lines.join('\n') + '\n';
}

function buildDiffMarkdown({ label, baselineLabel, payload, baseline }) {
  const lines = [];
  lines.push(`# benchmark diff: ${label} vs ${baselineLabel}`);
  lines.push('');
  lines.push(`baseline 生成日時: ${baseline.generatedAt}  `);
  lines.push(`current 生成日時: ${payload.generatedAt}  `);
  lines.push('');

  const baseProfiles = new Map(baseline.profiles.map(p => [p.profile, p]));
  const currProfiles = new Map(payload.profiles.map(p => [p.profile, p]));
  const allProfileNames = new Set([...baseProfiles.keys(), ...currProfiles.keys()]);

  // 全体サマリ
  lines.push('## 全体サマリ');
  lines.push('');
  lines.push('| profile | 指摘 (baseline) | 指摘 (current) | 差分 | 計測時間 (ms) baseline | current | 差 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const name of [...allProfileNames].sort()) {
    const b = baseProfiles.get(name);
    const c = currProfiles.get(name);
    const bf = b?.totals.findings ?? 0;
    const cf = c?.totals.findings ?? 0;
    const be = b?.totals.elapsedMs ?? 0;
    const ce = c?.totals.elapsedMs ?? 0;
    const diffSign = cf - bf > 0 ? `+${cf - bf}` : `${cf - bf}`;
    const elapsedDiff = (ce - be).toFixed(2);
    const elapsedSign = ce - be > 0 ? `+${elapsedDiff}` : elapsedDiff;
    lines.push(`| ${name} | ${bf} | ${cf} | ${diffSign} | ${be.toFixed(2)} | ${ce.toFixed(2)} | ${elapsedSign} |`);
  }
  lines.push('');

  // profile × ルール別の差分
  for (const name of [...allProfileNames].sort()) {
    const b = baseProfiles.get(name);
    const c = currProfiles.get(name);
    if (!b || !c) {
      lines.push(`## profile: ${name}`);
      lines.push('');
      lines.push(b ? 'current 側に存在しません。' : 'baseline 側に存在しません。');
      lines.push('');
      continue;
    }

    const aggRules = corpus => {
      const totals = {};
      for (const cor of corpus.corpora) {
        for (const [ruleId, count] of Object.entries(cor.summary.byRule ?? {})) {
          totals[ruleId] = (totals[ruleId] ?? 0) + count;
        }
      }
      return totals;
    };
    const baseRules = aggRules(b);
    const currRules = aggRules(c);
    const ruleNames = new Set([...Object.keys(baseRules), ...Object.keys(currRules)]);

    const diffRows = [];
    for (const ruleId of ruleNames) {
      const bv = baseRules[ruleId] ?? 0;
      const cv = currRules[ruleId] ?? 0;
      const d = cv - bv;
      if (d !== 0) diffRows.push({ ruleId, base: bv, curr: cv, diff: d });
    }
    diffRows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    lines.push(`## profile: ${name}`);
    lines.push('');
    if (diffRows.length === 0) {
      lines.push('ルール別の件数差なし。');
      lines.push('');
      continue;
    }
    lines.push('| ルール | baseline | current | 差分 |');
    lines.push('|---|---:|---:|---:|');
    for (const row of diffRows) {
      const sign = row.diff > 0 ? `+${row.diff}` : `${row.diff}`;
      lines.push(`| \`${shortRule(row.ruleId)}\` | ${row.base} | ${row.curr} | ${sign} |`);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
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
  if (!options.label) {
    process.stderr.write('--label は必須です。\n');
    printHelp();
    process.exitCode = 2;
    return;
  }

  const safeLabel = sanitizeLabel(options.label);

  // プロファイル選択
  let profileNames;
  if (options.allProfiles) {
    profileNames = [...PROFILE_NAMES];
  } else {
    if (!PROFILE_NAMES.includes(options.profile)) {
      process.stderr.write(`未知のプロファイル: ${options.profile}\n`);
      process.exitCode = 2;
      return;
    }
    profileNames = [options.profile];
  }

  // コーパス展開 (1度だけ)
  const corpusFiles = new Map();
  const corporaSummary = [];
  for (const corpus of DEFAULT_CORPORA) {
    const files = await collectCorpusFiles(corpus);
    corpusFiles.set(corpus.name, files);
    corporaSummary.push({
      name: corpus.name,
      inputs: corpus.inputs,
      files: files.length,
      paths: files.map(relativeToRepo),
    });
  }

  // ルール件数
  const totalRules = listRuleMetadata().length;

  // profile × corpora 一括 lint
  const profilesResults = [];
  const overallStart = performance.now();
  for (const profileName of profileNames) {
    const result = await runOneProfile({
      profileName,
      corpora: DEFAULT_CORPORA,
      corpusFiles,
    });
    profilesResults.push(result);
  }
  const overallElapsedMs = Number((performance.now() - overallStart).toFixed(2));

  const payload = {
    tool: 'nihongo-slopless-benchmark',
    version: VERSION,
    label: options.label,
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    totalRules,
    overallElapsedMs,
    corpora: corporaSummary,
    profiles: profilesResults,
  };

  // 出力
  await mkdir(options.outDir, { recursive: true });
  const jsonPath = path.join(options.outDir, `${safeLabel}.json`);
  const mdPath = path.join(options.outDir, `${safeLabel}.md`);
  await writeFile(jsonPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await writeFile(mdPath, buildMarkdown({ label: options.label, payload }), 'utf8');

  process.stdout.write(`Wrote ${relativeToRepo(jsonPath)}\n`);
  process.stdout.write(`Wrote ${relativeToRepo(mdPath)}\n`);

  // 差分
  if (options.baselinePath) {
    const baselineAbs = path.resolve(process.cwd(), options.baselinePath);
    if (!existsSync(baselineAbs)) {
      process.stderr.write(`baseline JSON が見つかりません: ${baselineAbs}\n`);
      process.exitCode = 2;
      return;
    }
    const baseline = JSON.parse(await readFile(baselineAbs, 'utf8'));
    const baselineLabel = baseline.label ?? path.basename(baselineAbs, '.json');
    const diffPath = path.join(options.outDir, `${safeLabel}-diff.md`);
    const diffMd = buildDiffMarkdown({
      label: options.label,
      baselineLabel,
      payload,
      baseline,
    });
    await writeFile(diffPath, diffMd, 'utf8');
    process.stdout.write(`Wrote ${relativeToRepo(diffPath)}\n`);
  }

  // コンソールサマリ
  process.stdout.write('\nSummary:\n');
  for (const p of profilesResults) {
    process.stdout.write(`  ${p.profile}: files=${p.totals.files} findings=${p.totals.findings} elapsed=${p.totals.elapsedMs.toFixed(2)}ms\n`);
  }
}

await main();
