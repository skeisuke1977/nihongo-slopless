#!/usr/bin/env node
// プロファイル監査スクリプト。
// 用途別プロファイルが各ルールに対してどのような severity と options を割り当てているかを集計し、
// JSON と Markdown 形式の表に書き出す。設計上の不整合候補も併せて出力する。
//
// 使い方:
//   node scripts/profile-matrix.mjs --output docs/profiles-matrix.md
//   node scripts/profile-matrix.mjs --output docs/profiles-matrix.md --json reports/profile-matrix.json
//   node scripts/profile-matrix.mjs --stdout   # ファイル書き出しせず標準出力に Markdown を流す
//
// 文体方針: 観察語を用いる(裁定・断罪を避ける)。

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { PROFILE_NAMES, loadProfileConfig } from '../src/profiles.mjs';
import { allRules } from '../src/rules/index.mjs';
import { ruleMetadata, ruleMetadataById } from '../src/rules/metadata.mjs';

// ----- 引数 -----------------------------------------------------------------

function parseArgs(argv) {
  const args = [...argv];
  const options = { output: null, json: null, stdout: false };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--output') options.output = readValue(args, '--output');
    else if (arg === '--json') options.json = readValue(args, '--json');
    else if (arg === '--stdout') options.stdout = true;
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`未知の引数です: ${arg}`);
    }
  }
  return options;
}

function readValue(args, name) {
  const v = args.shift();
  if (!v || v.startsWith('--')) {
    throw new Error(`${name} には値を指定してください。`);
  }
  return v;
}

function printUsage() {
  const lines = [
    'profile-matrix.mjs — プロファイル監査の表を生成する',
    '',
    'オプション:',
    '  --output <path>   Markdown 出力先(指定しない場合は標準出力)',
    '  --json <path>     JSON 出力先(任意)',
    '  --stdout          --output を指定していても Markdown を標準出力に流す',
    '  -h, --help        使い方を表示',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

// ----- 設定値の読み取り ------------------------------------------------------

const SEVERITY_LETTER = { info: 'i', warning: 'w', error: 'e' };
const OFF_LETTER = '−';        // 無効化(`false` または `"off"`)
const UNSET_LETTER = '?';      // 未指定(=メタデータの既定 severity)

const RULE_IDS = allRules.map(rule => `nihongo-slopless/${rule.id}`);

function isDisabled(value) {
  return value === false || value === 'off';
}

// `false`, `"off"`, `"warning"`, `["warning", {…}]`, `{severity, options}` の形を吸収して
// { state: 'off'|'set'|'unset', severity, options } に正規化する。
function normalizeRuleEntry(value) {
  if (value === undefined) {
    return { state: 'unset', severity: null, options: {} };
  }
  if (isDisabled(value)) {
    return { state: 'off', severity: null, options: {} };
  }
  if (typeof value === 'string') {
    return { state: 'set', severity: value, options: {} };
  }
  if (Array.isArray(value)) {
    const opts = value[1] && typeof value[1] === 'object' ? value[1] : {};
    return { state: 'set', severity: value[0] ?? null, options: opts };
  }
  if (value && typeof value === 'object') {
    return {
      state: 'set',
      severity: value.severity ?? null,
      options: value.options && typeof value.options === 'object' ? value.options : {},
    };
  }
  return { state: 'unset', severity: null, options: {} };
}

function cellLetter(entry) {
  if (entry.state === 'off') return OFF_LETTER;
  if (entry.state === 'unset') return UNSET_LETTER;
  return SEVERITY_LETTER[entry.severity] ?? UNSET_LETTER;
}

// 既定 severity(ルールメタデータ)。未指定セルの解釈に使う。
function defaultSeverityFor(fullRuleId) {
  return ruleMetadataById[fullRuleId]?.severity ?? null;
}

// ----- マトリクスの構築 -----------------------------------------------------

async function buildMatrix() {
  const profileConfigs = {};
  for (const name of PROFILE_NAMES) {
    profileConfigs[name] = await loadProfileConfig(name);
  }

  // ルール × プロファイル の表本体。
  const cells = {};      // cells[ruleId][profile] = normalized entry
  const optionKeys = {}; // optionKeys[ruleId] = Set<string> ※全プロファイル横断のオプションキー
  for (const ruleId of RULE_IDS) {
    cells[ruleId] = {};
    optionKeys[ruleId] = new Set();
    for (const profile of PROFILE_NAMES) {
      const rules = profileConfigs[profile].rules ?? {};
      // プロファイル設定はフル ID を使う前提だが、念のため short ID も覗く。
      const shortId = ruleId.replace(/^nihongo-slopless\//, '');
      const raw = rules[ruleId] ?? rules[shortId];
      const entry = normalizeRuleEntry(raw);
      cells[ruleId][profile] = entry;
      for (const key of Object.keys(entry.options ?? {})) {
        optionKeys[ruleId].add(key);
      }
    }
  }

  return { profileConfigs, cells, optionKeys };
}

// ----- 矛盾候補の抽出 -------------------------------------------------------

// 同じルールについて、プロファイル間で severity が大きく食い違う/有効・無効が反転している箇所を集める。
// すべて「観察」であって「誤り」ではない。設計意図上意図的な差分も含まれる点に注意する。
function detectInconsistencies(cells) {
  const issues = [];
  const severityRank = { off: -1, info: 1, warning: 2, error: 3 };

  function rankOf(entry, ruleId) {
    if (entry.state === 'off') return -1;
    const severity = entry.state === 'set' ? entry.severity : defaultSeverityFor(ruleId);
    return severityRank[severity] ?? 0;
  }

  for (const ruleId of RULE_IDS) {
    const row = cells[ruleId];
    const minimal = row.minimal;
    const general = row.general;
    const strict = row.strict;
    const agent = row['agent-output'];

    // (A) minimal で有効なのに strict で無効。
    if (minimal.state === 'set' && strict.state === 'off') {
      issues.push({
        ruleId,
        kind: 'minimal-on-strict-off',
        note: `${shortId(ruleId)} は minimal で ${minimal.severity} だが strict では無効化されている`,
      });
    }
    // (B) strict で重く設定されているのに general で off。
    if (strict.state === 'set' && severityRank[strict.severity] >= severityRank.warning && general.state === 'off') {
      issues.push({
        ruleId,
        kind: 'strict-warn-general-off',
        note: `${shortId(ruleId)} は strict で ${strict.severity} だが general で無効化されている`,
      });
    }
    // (C) agent-output で発火するが general で off。
    if (agent.state === 'set' && general.state === 'off') {
      issues.push({
        ruleId,
        kind: 'agent-on-general-off',
        note: `${shortId(ruleId)} は agent-output で ${agent.severity} だが general で無効化されている`,
      });
    }
    // (D) ルール既定が warning 以上なのに general で off(設計上の弱化候補)。
    const meta = ruleMetadataById[ruleId];
    if (meta && severityRank[meta.severity] >= severityRank.warning && general.state === 'off') {
      issues.push({
        ruleId,
        kind: 'default-warn-general-off',
        note: `${shortId(ruleId)} はメタデータ既定が ${meta.severity} だが general で無効化されている`,
      });
    }
    // (E) strict より重い severity を別プロファイルが持っている(strict が最も厳しいという暗黙の前提に対する観察)。
    for (const profile of PROFILE_NAMES) {
      if (profile === 'strict') continue;
      const r1 = rankOf(row[profile], ruleId);
      const r2 = rankOf(strict, ruleId);
      if (r1 > r2 && r1 > 0) {
        issues.push({
          ruleId,
          kind: 'over-strict',
          note: `${shortId(ruleId)} は ${profile}(${describeEntry(row[profile])}) が strict(${describeEntry(strict)}) より重い severity を割り当てている`,
        });
      }
    }
    // (F) profile メタデータ列(`profiles`)で「対象」とされているのに、その profile で off になっている箇所。
    if (meta) {
      for (const profile of meta.profiles) {
        const entry = row[profile];
        if (entry && entry.state === 'off') {
          issues.push({
            ruleId,
            kind: 'metadata-vs-profile-off',
            note: `${shortId(ruleId)} のメタデータは ${profile} を対象に挙げているが、${profile}.json では無効化されている`,
          });
        }
      }
    }
    // (G) profile メタデータ列に無い profile で、severity が warning 以上に設定されている箇所。
    if (meta) {
      const declared = new Set(meta.profiles);
      for (const profile of PROFILE_NAMES) {
        if (declared.has(profile)) continue;
        const entry = row[profile];
        if (entry.state === 'set' && severityRank[entry.severity] >= severityRank.warning) {
          issues.push({
            ruleId,
            kind: 'metadata-missing-profile',
            note: `${shortId(ruleId)} のメタデータは ${profile} を対象に挙げていないが、${profile}.json では ${entry.severity} で発火する`,
          });
        }
      }
    }
    // (H) agent-output が general より軽い severity を割り当てている(agent-output は「強めに見る」とROADMAP/ガイドにある)。
    if (agent.state === 'set' && general.state === 'set'
        && severityRank[agent.severity] < severityRank[general.severity]) {
      issues.push({
        ruleId,
        kind: 'agent-weaker-than-general',
        note: `${shortId(ruleId)} は agent-output(${describeEntry(agent)}) が general(${describeEntry(general)}) より軽い。agent-output は「強めに見る」運用想定との差。`,
      });
    }
    // (I) minimal で off にされていないのに strict 側で off。
    if (minimal.state !== 'off' && strict.state === 'off') {
      issues.push({
        ruleId,
        kind: 'minimal-set-strict-off',
        note: `${shortId(ruleId)} は minimal で ${describeEntry(minimal)} だが strict で off。`,
      });
    }
    // (J) general が warning を割り当てているが minimal が off(導入から一段上げる移行に断絶が大きい)。
    if (general.state === 'set' && severityRank[general.severity] >= severityRank.warning && minimal.state === 'off') {
      issues.push({
        ruleId,
        kind: 'general-warn-minimal-off',
        note: `${shortId(ruleId)} は general で ${general.severity} だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。`,
      });
    }
    // (K) options の数値が strict より別 profile で厳しい(strict 想定の前提との比較)。
    for (const profile of PROFILE_NAMES) {
      if (profile === 'strict') continue;
      const entry = row[profile];
      if (entry.state !== 'set' || strict.state !== 'set') continue;
      const opts = entry.options ?? {};
      const strictOpts = strict.options ?? {};
      for (const [key, value] of Object.entries(opts)) {
        if (!Object.prototype.hasOwnProperty.call(strictOpts, key)) continue;
        const strictValue = strictOpts[key];
        if (typeof value !== 'number' || typeof strictValue !== 'number') continue;
        // 多くのオプションは「上限」「下限」を示す。
        // long-sentence/long-paragraph: 上限が小さいほど厳しい。 max* / errorChars はこれに該当。
        // abstract-noun-stack/nominalization-density: minHits/minChars が小さいほど厳しい。
        // 一律に「strict より小さい数値はより厳しい」とは限らないが、観察として残す。
        const looksLikeMax = /^(max|errorChars)/i.test(key);
        const looksLikeMin = /^min/i.test(key);
        if (looksLikeMax && value < strictValue) {
          issues.push({
            ruleId,
            kind: 'option-tighter-than-strict',
            note: `${shortId(ruleId)} のオプション ${key} は ${profile}=${value} < strict=${strictValue}。strict 側より厳しい上限を ${profile} が持つ可能性。`,
          });
        } else if (looksLikeMin && value < strictValue) {
          issues.push({
            ruleId,
            kind: 'option-tighter-than-strict',
            note: `${shortId(ruleId)} のオプション ${key} は ${profile}=${value} < strict=${strictValue}。strict より早く発火する設定。`,
          });
        }
      }
    }
  }

  return issues;
}

function shortId(fullRuleId) {
  return fullRuleId.replace(/^nihongo-slopless\//, '');
}

function describeEntry(entry) {
  if (entry.state === 'off') return 'off';
  if (entry.state === 'unset') return 'unset';
  const opts = Object.keys(entry.options ?? {}).length
    ? ` ${JSON.stringify(entry.options)}`
    : '';
  return `${entry.severity}${opts}`;
}

function describeSeverityOnly(entry) {
  if (entry.state === 'off') return 'off';
  if (entry.state === 'unset') return 'unset';
  return entry.severity;
}

// ----- 改善提案 -------------------------------------------------------------
// 「これは意図的なものかもしれない」観察として残す。レビューの呼び水。
function buildSuggestions(cells) {
  const lines = [];
  const severityRank = { info: 1, warning: 2, error: 3 };

  for (const ruleId of RULE_IDS) {
    const meta = ruleMetadataById[ruleId];
    const row = cells[ruleId];
    const sid = shortId(ruleId);
    const strict = row.strict;
    const minimal = row.minimal;
    const general = row.general;
    const agent = row['agent-output'];

    if (meta && severityRank[meta.severity] >= severityRank.warning && strict.state === 'off') {
      lines.push(`- \`nihongo-slopless/${sid}\` はメタデータ既定が ${meta.severity} だが \`strict\` でも有効化されていない。意図的か再確認の余地がある。`);
    }
    if (strict.state === 'set' && minimal.state === 'set' && severityRank[strict.severity] < severityRank[minimal.severity]) {
      lines.push(`- \`nihongo-slopless/${sid}\` は \`minimal\`(${minimal.severity})よりも \`strict\`(${strict.severity})の方が軽い。導入時より品質確認時の方が弱い設定になっている。`);
    }
    if (general.state === 'set' && strict.state === 'set' && severityRank[general.severity] > severityRank[strict.severity]) {
      lines.push(`- \`nihongo-slopless/${sid}\` は \`general\`(${general.severity})が \`strict\`(${strict.severity})より重い。strict 側の意図と整合するか観察したい。`);
    }
    if (agent.state === 'set' && general.state === 'set' && severityRank[agent.severity] < severityRank[general.severity]) {
      lines.push(`- \`nihongo-slopless/${sid}\` は \`agent-output\`(${agent.severity})が \`general\`(${general.severity})より軽い。\`agent-output\` は応答残骸や薄い文体を「強めに見る」前提があるため、設計と運用の整合を再確認したい。`);
    }
    // 評価責任系のルール(category=evidence-responsibility)が agent-output で info より重くなっていない場合の指摘。
    if (meta?.category === 'evidence-responsibility'
        && agent.state === 'set' && severityRank[agent.severity] < severityRank.warning) {
      lines.push(`- \`nihongo-slopless/${sid}\` は evidence-responsibility 分類だが \`agent-output\` で ${agent.severity}。応答残骸を主用途とする agent-output では根拠系を warning 以上に置く設計が自然か観察したい。`);
    }
  }

  return Array.from(new Set(lines));
}

// ----- Markdown レンダリング ------------------------------------------------

function renderMatrix(profileNames, cells) {
  const header = ['rule', ...profileNames].map(escapeMd).join(' | ');
  const divider = ['---', ...profileNames.map(() => ':---:')].join(' | ');
  const rows = RULE_IDS.map(ruleId => {
    const meta = ruleMetadataById[ruleId];
    const defaultSeverity = meta?.severity ? `[既定 ${SEVERITY_LETTER[meta.severity] ?? '?'}]` : '';
    const labelParts = [`\`${ruleId}\``];
    if (defaultSeverity) labelParts.push(defaultSeverity);
    const label = labelParts.join(' ');
    const tuples = profileNames.map(p => cellLetter(cells[ruleId][p]));
    return `${label} | ${tuples.join(' | ')}`;
  });
  return [`| ${header} |`, `| ${divider} |`, ...rows.map(line => `| ${line} |`)].join('\n');
}

function renderOptionsTable(profileNames, cells, optionKeys) {
  const sections = [];
  for (const ruleId of RULE_IDS) {
    const keys = [...optionKeys[ruleId]].sort();
    if (keys.length === 0) continue;
    const header = ['option', ...profileNames].map(escapeMd).join(' | ');
    const divider = ['---', ...profileNames.map(() => ':---:')].join(' | ');
    const rows = keys.map(key => {
      const cellsRow = profileNames.map(p => {
        const entry = cells[ruleId][p];
        if (entry.state === 'off') return '−';
        if (entry.state === 'unset') return '?';
        const v = entry.options?.[key];
        return v === undefined ? '·' : `\`${formatOptionValue(v)}\``;
      });
      return `${'`'}${key}${'`'} | ${cellsRow.join(' | ')}`;
    });
    sections.push([
      `#### \`${ruleId}\``,
      '',
      `| ${header} |`,
      `| ${divider} |`,
      ...rows.map(line => `| ${line} |`),
    ].join('\n'));
  }
  if (sections.length === 0) {
    return '_オプションを取るルールはありません。_';
  }
  return sections.join('\n\n');
}

function formatOptionValue(value) {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function formatProfileList(profiles) {
  const quoted = profiles.map(profile => `\`${profile}\``);
  if (quoted.length <= 4) return quoted.join(', ');
  return `${quoted.length} profile (${quoted.slice(0, 3).join(', ')} ほか)`;
}

function renderRuleNotes(cells) {
  const lines = [];
  const severityRank = { off: -1, info: 1, warning: 2, error: 3 };

  for (const ruleId of RULE_IDS) {
    const row = cells[ruleId];
    const ranks = PROFILE_NAMES.map(p => {
      const entry = row[p];
      if (entry.state === 'off') return -1;
      const severity = entry.state === 'set' ? entry.severity : defaultSeverityFor(ruleId);
      return severityRank[severity] ?? 0;
    });
    const min = Math.min(...ranks);
    const max = Math.max(...ranks);
    if (min === max) {
      lines.push(`- \`${ruleId}\`: 全プロファイルで重み付けが同等(${describeSeverityOnly(row.general)}相当)。`);
      continue;
    }

    const heaviest = PROFILE_NAMES.filter((p, i) => ranks[i] === max);
    const lightest = PROFILE_NAMES.filter((p, i) => ranks[i] === min);
    lines.push(
      `- \`${ruleId}\`: 重い側 = ${formatProfileList(heaviest)}、軽い側 = ${formatProfileList(lightest)}。`
        + ` 例えば \`general\` は ${describeSeverityOnly(row.general)}、\`strict\` は ${describeSeverityOnly(row.strict)}、\`minimal\` は ${describeSeverityOnly(row.minimal)}。`,
    );
  }
  return lines.join('\n');
}

// 観察結果を「設計と整合する可能性が高い(by-design)」と「再確認候補(needs-review)」に分けて表示する。
// `general-warn-minimal-off` などは minimal の運用方針(誤検出を極力抑える)と整合するため by-design。
const BY_DESIGN_KINDS = new Set([
  'general-warn-minimal-off',
  'minimal-set-strict-off',
]);

function renderInconsistencies(issues) {
  if (issues.length === 0) {
    return '_観察上の不整合候補は見つかりませんでした。_';
  }
  const byDesign = [];
  const needsReview = [];
  for (const issue of issues) {
    if (BY_DESIGN_KINDS.has(issue.kind)) byDesign.push(issue);
    else needsReview.push(issue);
  }
  const lines = [];
  lines.push('> 以下は **観察** であり、誤りではありません。設計意図上で意図的に差を付けている場合もあります。');
  lines.push('');

  lines.push('### 再確認候補');
  lines.push('');
  if (needsReview.length === 0) {
    lines.push('_設計意図と乖離する可能性のある観察はありません。_');
    lines.push('');
  } else {
    const byRule = groupByRule(needsReview);
    for (const [ruleId, list] of byRule.entries()) {
      lines.push(`#### \`${ruleId}\``);
      lines.push('');
      for (const issue of list) {
        lines.push(`- (${issue.kind}) ${issue.note}`);
      }
      lines.push('');
    }
  }

  lines.push('### 設計と整合する観察(参考)');
  lines.push('');
  lines.push('`minimal` プロファイルは「誤検出を極力抑える」設計のため、`general` で warning のルールが `minimal` で off になる差分は意図的なものです。下記は参考として残します。');
  lines.push('');
  if (byDesign.length === 0) {
    lines.push('_設計通りの観察は見つかりませんでした。_');
  } else {
    const byRule = groupByRule(byDesign);
    for (const [ruleId, list] of byRule.entries()) {
      lines.push(`#### \`${ruleId}\``);
      lines.push('');
      for (const issue of list) {
        lines.push(`- (${issue.kind}) ${issue.note}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd();
}

function groupByRule(issues) {
  const byRule = new Map();
  for (const issue of issues) {
    if (!byRule.has(issue.ruleId)) byRule.set(issue.ruleId, []);
    byRule.get(issue.ruleId).push(issue);
  }
  return byRule;
}

function escapeMd(text) {
  return String(text).replace(/\|/g, '\\|');
}

function renderDocument({ profileNames, cells, optionKeys, issues, suggestions }) {
  const now = new Date().toISOString();
  const profileCount = profileNames.length;
  const ruleCount = Object.keys(cells).length;
  const legend = [
    '| 記号 | 意味 |',
    '| --- | --- |',
    '| `e` | error |',
    '| `w` | warning |',
    '| `i` | info |',
    `| \`${OFF_LETTER}\` | 無効化(\`false\` / \`"off"\`) |`,
    `| \`${UNSET_LETTER}\` | 未指定(\`config/profiles/<name>.json\` に記載なし、メタデータの既定 severity が使われる) |`,
  ].join('\n');

  return [
    '# プロファイル監査マトリクス',
    '',
    `\`config/profiles/*.json\` に並ぶ ${profileCount} 個のプロファイルが、\`src/rules/index.mjs\` に列挙された ${ruleCount} ルールに対して、どの severity と options を割り当てているかを観察用に一覧化したものです。`,
    '',
    '本ファイルは `scripts/profile-matrix.mjs` から生成されます。表現は観察語に寄せています。',
    '',
    `_最終生成: ${now}_`,
    '',
    '## 記号',
    '',
    legend,
    '',
    '`?` は profile 側で何も書かれていない状態を示します。`src/profiles.mjs` の `mergeConfigs` ではプロファイル側で値を書かないとプロジェクト設定や `validateConfig` の規定は通りますが、`run` 時にはルールメタデータの既定 severity が使われます。',
    '',
    '## マトリクス',
    '',
    renderMatrix(profileNames, cells),
    '',
    '## ルール別 重み付けの差',
    '',
    renderRuleNotes(cells),
    '',
    '## オプション差分',
    '',
    'severity 以外で `options` を取るルールについて、プロファイル間の値差を一覧します。`·` は当該プロファイルが値を指定していない(=ルールの内部既定が使われる)ことを示します。',
    '',
    renderOptionsTable(profileNames, cells, optionKeys),
    '',
    '## 矛盾候補',
    '',
    renderInconsistencies(issues),
    '',
    '## 改善提案(再確認候補)',
    '',
    (suggestions.length === 0 ? '_再確認候補は見つかりませんでした。_' : suggestions.join('\n')),
    '',
    '## 観察方法のメモ',
    '',
    '- `cellLetter()` は `false`/`"off"` を `−` に、未指定を `?` に、severity を頭文字 1 文字 (`e`/`w`/`i`) に変換しています。',
    '- 矛盾候補の `kind` には次が含まれます: `minimal-on-strict-off`、`strict-warn-general-off`、`agent-on-general-off`、`default-warn-general-off`、`over-strict`、`metadata-vs-profile-off`、`metadata-missing-profile`、`agent-weaker-than-general`、`minimal-set-strict-off`、`general-warn-minimal-off`、`option-tighter-than-strict`。',
    '- `metadata-*` 系は `src/rules/metadata.mjs` の `profiles` フィールドと `config/profiles/*.json` の実際の値の対応関係を観察したものです。`profiles` フィールドは「設計意図として対象に含めたい profile」を示しているため、ここでのずれは「思想と設定の同期が取れていない可能性」を示します。',
    '- `option-tighter-than-strict` は、ある profile のオプション値が `strict` より厳しい(`max*` が小さい / `min*` が小さい)場合に観察として残します。`strict` が一律に最も厳しい設計でないケースを照らします。',
    '',
  ].join('\n');
}

// ----- メイン --------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { cells, optionKeys, profileConfigs } = await buildMatrix();
  const issues = detectInconsistencies(cells);
  const suggestions = buildSuggestions(cells);

  const markdown = renderDocument({
    profileNames: PROFILE_NAMES,
    cells,
    optionKeys,
    issues,
    suggestions,
  });

  const jsonReport = {
    generatedAt: new Date().toISOString(),
    profiles: PROFILE_NAMES,
    rules: RULE_IDS.map(ruleId => ({
      ruleId,
      defaultSeverity: defaultSeverityFor(ruleId),
      cells: Object.fromEntries(PROFILE_NAMES.map(p => {
        const entry = cells[ruleId][p];
        return [p, {
          letter: cellLetter(entry),
          state: entry.state,
          severity: entry.severity,
          options: entry.options,
        }];
      })),
    })),
    inconsistencies: issues,
    suggestions,
  };

  if (options.json) {
    await ensureDir(path.dirname(options.json));
    await writeFile(options.json, JSON.stringify(jsonReport, null, 2));
  }

  if (options.output) {
    await ensureDir(path.dirname(options.output));
    await writeFile(options.output, markdown);
  }

  if (options.stdout || (!options.output && !options.json)) {
    process.stdout.write(markdown);
    if (!markdown.endsWith('\n')) process.stdout.write('\n');
  }

  // サマリは stderr に流す(出力ファイルを汚さない)。
  const cellsTotal = RULE_IDS.length * PROFILE_NAMES.length;
  process.stderr.write([
    `profiles: ${PROFILE_NAMES.length}`,
    `rules: ${RULE_IDS.length}`,
    `cells: ${cellsTotal}`,
    `inconsistencies: ${issues.length}`,
    `suggestions: ${suggestions.length}`,
    options.output ? `markdown -> ${options.output}` : null,
    options.json ? `json -> ${options.json}` : null,
  ].filter(Boolean).join('\n') + '\n');

  return { profileConfigs, cells, optionKeys, issues, suggestions };
}

async function ensureDir(dir) {
  if (!dir) return;
  await mkdir(dir, { recursive: true });
}

const isDirectInvocation = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  main().catch(err => {
    process.stderr.write(`profile-matrix: ${err.message}\n`);
    process.exit(1);
  });
}
