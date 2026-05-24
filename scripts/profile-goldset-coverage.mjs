#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { PROFILE_NAMES, normalizeProfileName } from '../src/profiles.mjs';

const PROFILE_SET = new Set(PROFILE_NAMES);
const DEFAULT_PRIORITY_PROFILES = ['minimal', 'general', 'technical', 'agent-output'];

const EXPECTATION_FIELDS = [
  {
    name: 'expectedByProfile',
    fallbackFields: ['expectedRules', 'expected'],
    valueKind: 'array',
  },
  {
    name: 'expectedCountsByProfile',
    fallbackFields: ['expectedCounts'],
    valueKind: 'object',
  },
  {
    name: 'expectedFindingsByProfile',
    fallbackFields: ['expectedFindings'],
    valueKind: 'array',
  },
];

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    format: 'json',
    pretty: false,
    output: null,
    detailsLimit: 20,
    profiles: PROFILE_NAMES,
    priorityProfiles: null,
  };
  const files = [];

  while (args.length) {
    const arg = args.shift();
    if (arg === '--pretty') options.pretty = true;
    else if (arg === '--markdown') options.format = 'markdown';
    else if (arg === '--format') {
      const format = readValue(args, '--format');
      if (!['json', 'markdown'].includes(format)) {
        throw new Error('--format は json または markdown を指定してください。');
      }
      options.format = format;
    } else if (arg === '--output') {
      options.output = readValue(args, '--output');
    } else if (arg === '--details-limit') {
      const raw = readValue(args, '--details-limit');
      const limit = Number.parseInt(raw, 10);
      if (!Number.isInteger(limit) || limit < 0) {
        throw new Error('--details-limit は0以上の整数を指定してください。');
      }
      options.detailsLimit = limit;
    } else if (arg === '--profiles') {
      options.profiles = readProfileList(readValue(args, '--profiles'), '--profiles');
    } else if (arg === '--priority-profiles') {
      options.priorityProfiles = readProfileList(readValue(args, '--priority-profiles'), '--priority-profiles');
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      throw new Error(`未知の引数です: ${arg}`);
    } else {
      files.push(arg);
    }
  }

  options.priorityProfiles ??= DEFAULT_PRIORITY_PROFILES.filter(profile => options.profiles.includes(profile));
  const inactivePriorityProfiles = options.priorityProfiles.filter(profile => !options.profiles.includes(profile));
  if (inactivePriorityProfiles.length > 0) {
    throw new Error(`--priority-profiles は --profiles の集計対象に含まれるprofileだけを指定してください: ${inactivePriorityProfiles.join(', ')}`);
  }

  return { files, options };
}

function readValue(args, optionName) {
  const value = args.shift();
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} には値を指定してください。`);
  }
  return value;
}

function readProfileList(raw, optionName) {
  const profiles = raw
    .split(',')
    .map(profile => profile.trim())
    .filter(Boolean);
  if (profiles.length === 0) throw new Error(`${optionName} にはprofile名を1つ以上指定してください。`);
  for (const profile of profiles) normalizeProfileName(profile);
  return profiles;
}

function printUsage() {
  const lines = [
    'profile-goldset-coverage.mjs — profile別期待ラベルの記述カバレッジを集計する',
    '',
    '使い方:',
    '  node scripts/profile-goldset-coverage.mjs <goldset.jsonl> [--pretty]',
    '  node scripts/profile-goldset-coverage.mjs <goldset.jsonl> --markdown',
    '',
    'オプション:',
    '  --format <json|markdown>  出力形式。既定 json',
    '  --markdown                --format markdown の短縮形',
    '  --pretty                  JSONをインデントして出力',
    '  --output <path>           出力先ファイル。未指定なら標準出力',
    '  --profiles <a,b>          集計対象profile。既定は全profile',
    '  --priority-profiles <a,b> 優先確認するprofile。既定 minimal,general,technical,agent-output',
    '  --details-limit <n>       Markdownの詳細行数。既定20、0で省略',
    '  -h, --help                使い方を表示',
    '',
    '注:',
    '  - このスクリプトはgoldsetの記述状況だけを読む。lint評価の合否、文章品質の点数化、AI生成判定は行わない。',
    '  - missing は機械的な不足候補であり、追加要否はレコードの目的とprofile差分を見て人間が判断する。',
    '  - 詳細は scripts/README-profile-goldset-coverage.md を参照。',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

async function readJsonlFiles(files) {
  const records = [];
  for (const file of files) {
    const body = await readFile(file, 'utf8');
    for (const [index, line] of body.split(/\n/u).entries()) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          throw new Error('JSONL行はオブジェクトで指定してください。');
        }
        records.push({ ...record, __sourceFile: file, __line: index + 1 });
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`${file}:${index + 1}: JSONL parse error: ${error.message}`);
        }
        throw new Error(`${file}:${index + 1}: ${error.message}`);
      }
    }
  }
  return records;
}

function recordId(record) {
  return hasOwn(record, 'id') ? String(record.id) : '<missing>';
}

function classifyExpectationValue(value, kind) {
  if (kind === 'array') {
    if (!Array.isArray(value)) return { validShape: false, empty: false, size: null };
    return { validShape: true, empty: value.length === 0, size: value.length };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { validShape: false, empty: false, size: null };
  }

  return { validShape: true, empty: Object.keys(value).length === 0, size: Object.keys(value).length };
}

function fallbackSource(record, fallbackFields) {
  for (const field of fallbackFields) {
    if (hasOwn(record, field)) return field;
  }
  return 'none';
}

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

function createProfileStats(profiles) {
  const stats = {};
  for (const profile of profiles) {
    stats[profile] = {
      presentRecords: 0,
      missingRecords: 0,
      nonEmptyRecords: 0,
      emptyRecords: 0,
      invalidShapeRecords: 0,
      coverage: 0,
    };
  }
  return stats;
}

function analyzeExpectationField(records, spec, profiles) {
  const profileStats = createProfileStats(profiles);
  const partialRecords = [];
  const missingOwnProfileRecords = [];
  const fallbackOnlyRecords = [];
  const unknownProfileKeys = [];
  let recordsWithProfileField = 0;
  let recordsWithFallbackOnly = 0;
  let recordsWithNeither = 0;

  for (const record of records) {
    const fallback = fallbackSource(record, spec.fallbackFields);
    const hasProfileField = hasOwn(record, spec.name);
    if (!hasProfileField) {
      if (fallback === 'none') {
        recordsWithNeither += 1;
      } else {
        recordsWithFallbackOnly += 1;
        fallbackOnlyRecords.push({
          id: recordId(record),
          file: record.__sourceFile,
          line: record.__line,
          recordProfile: record.profile ?? null,
          fallbackSource: fallback,
        });
      }
      continue;
    }

    recordsWithProfileField += 1;
    const value = record[spec.name];
    const profileMap = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const presentProfiles = Object.keys(profileMap).sort((left, right) => left.localeCompare(right));
    const missingProfiles = profiles.filter(profile => !hasOwn(profileMap, profile));
    const unknownProfiles = presentProfiles.filter(profile => !PROFILE_SET.has(profile));

    for (const profile of unknownProfiles) {
      unknownProfileKeys.push({
        id: recordId(record),
        file: record.__sourceFile,
        line: record.__line,
        field: spec.name,
        profile,
      });
    }

    for (const profile of profiles) {
      if (!hasOwn(profileMap, profile)) {
        profileStats[profile].missingRecords += 1;
        continue;
      }

      profileStats[profile].presentRecords += 1;
      const valueStats = classifyExpectationValue(profileMap[profile], spec.valueKind);
      if (!valueStats.validShape) {
        profileStats[profile].invalidShapeRecords += 1;
      } else if (valueStats.empty) {
        profileStats[profile].emptyRecords += 1;
      } else {
        profileStats[profile].nonEmptyRecords += 1;
      }
    }

    if (missingProfiles.length > 0 || unknownProfiles.length > 0) {
      partialRecords.push({
        id: recordId(record),
        file: record.__sourceFile,
        line: record.__line,
        recordProfile: record.profile ?? null,
        presentProfiles,
        missingProfiles,
        unknownProfiles,
        fallbackSource: fallback,
      });
    }

    if (record.profile && profiles.includes(record.profile) && !hasOwn(profileMap, record.profile)) {
      missingOwnProfileRecords.push({
        id: recordId(record),
        file: record.__sourceFile,
        line: record.__line,
        recordProfile: record.profile,
        presentProfiles,
        fallbackSource: fallback,
      });
    }
  }

  for (const profile of profiles) {
    const stats = profileStats[profile];
    stats.coverage = recordsWithProfileField === 0 ? 0 : stats.presentRecords / recordsWithProfileField;
  }

  return {
    fallbackFields: spec.fallbackFields,
    recordsWithProfileField,
    recordsWithFallbackOnly,
    recordsWithNeither,
    profiles: profileStats,
    missingOwnProfileRecords,
    partialRecords,
    fallbackOnlyRecords,
    unknownProfileKeys,
  };
}

function analyzeRecords(records, files, profiles) {
  const recordsByProfile = {};
  const recordsBySource = {};
  const unknownRecordProfiles = [];

  for (const record of records) {
    increment(recordsBySource, record.__sourceFile);
    const profile = record.profile ?? '<none>';
    increment(recordsByProfile, profile);
    if (record.profile && !PROFILE_SET.has(record.profile)) {
      unknownRecordProfiles.push({
        id: recordId(record),
        file: record.__sourceFile,
        line: record.__line,
        profile: record.profile,
      });
    }
  }

  const fields = {};
  for (const spec of EXPECTATION_FIELDS) {
    fields[spec.name] = analyzeExpectationField(records, spec, profiles);
  }

  return {
    tool: 'nihongo-slopless-profile-goldset-coverage',
    records: records.length,
    files,
    profiles,
    recordsBySource: sortedObject(recordsBySource),
    recordsByProfile: sortedObject(recordsByProfile),
    unknownRecordProfiles,
    fields,
  };
}

function buildPrioritySummary(payload, priorityProfiles) {
  const fields = {};
  for (const spec of EXPECTATION_FIELDS) {
    const field = payload.fields[spec.name];
    const missingByProfile = {};
    for (const profile of priorityProfiles) {
      missingByProfile[profile] = field.profiles[profile]?.missingRecords ?? 0;
    }

    const candidateRecords = [];
    for (const record of field.fallbackOnlyRecords) {
      candidateRecords.push({
        id: record.id,
        file: record.file,
        line: record.line,
        recordProfile: record.recordProfile,
        missingPriorityProfiles: priorityProfiles,
        presentProfiles: [],
        fallbackSource: record.fallbackSource,
        reason: 'fallback-only',
        missingCount: priorityProfiles.length,
      });
    }
    for (const record of field.partialRecords) {
      const missingPriorityProfiles = record.missingProfiles.filter(profile => priorityProfiles.includes(profile));
      if (missingPriorityProfiles.length === 0) continue;
      candidateRecords.push({
        id: record.id,
        file: record.file,
        line: record.line,
        recordProfile: record.recordProfile,
        missingPriorityProfiles,
        presentProfiles: record.presentProfiles,
        fallbackSource: record.fallbackSource,
        reason: 'missing-profile-key',
        missingCount: missingPriorityProfiles.length,
      });
    }

    candidateRecords.sort((left, right) =>
      right.missingCount - left.missingCount ||
      String(left.file).localeCompare(String(right.file)) ||
      left.line - right.line ||
      String(left.id).localeCompare(String(right.id)),
    );

    fields[spec.name] = {
      missingByProfile,
      fallbackOnlyRecords: field.fallbackOnlyRecords.length,
      candidateRecords,
    };
  }

  return {
    profiles: priorityProfiles,
    note: 'profile差は文章品質スコアではなく、運用負荷と回帰確認の観察候補として読む。',
    fields,
  };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function mdEscape(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
}

function profileList(profiles) {
  return profiles.length ? profiles.join(', ') : '-';
}

function renderRecordRows(records, limit, includeMissingProfiles = false) {
  if (limit === 0 || records.length === 0) return [];
  const rows = [
    includeMissingProfiles
      ? '| id | line | record profile | present | missing | fallback |'
      : '| id | line | record profile | present | fallback |',
    includeMissingProfiles
      ? '|---|---:|---|---|---|---|'
      : '|---|---:|---|---|---|',
  ];

  for (const record of records.slice(0, limit)) {
    if (includeMissingProfiles) {
      rows.push(`| \`${mdEscape(record.id)}\` | ${record.line} | ${mdEscape(record.recordProfile ?? '-')} | ${mdEscape(profileList(record.presentProfiles))} | ${mdEscape(profileList(record.missingProfiles))} | ${mdEscape(record.fallbackSource)} |`);
    } else {
      rows.push(`| \`${mdEscape(record.id)}\` | ${record.line} | ${mdEscape(record.recordProfile ?? '-')} | ${mdEscape(profileList(record.presentProfiles))} | ${mdEscape(record.fallbackSource)} |`);
    }
  }

  if (records.length > limit) {
    const omitted = records.length - limit;
    rows.push(`| ... |  |  |  | ${includeMissingProfiles ? ' | ' : ''}${omitted}件省略 |`);
  }

  return rows;
}

function renderPriorityRows(records, limit) {
  if (limit === 0 || records.length === 0) return [];
  const rows = [
    '| id | line | record profile | missing priority profiles | reason | fallback |',
    '|---|---:|---|---|---|---|',
  ];

  for (const record of records.slice(0, limit)) {
    rows.push(`| \`${mdEscape(record.id)}\` | ${record.line} | ${mdEscape(record.recordProfile ?? '-')} | ${mdEscape(profileList(record.missingPriorityProfiles))} | ${mdEscape(record.reason)} | ${mdEscape(record.fallbackSource)} |`);
  }

  if (records.length > limit) {
    rows.push(`| ... |  |  |  |  | ${records.length - limit}件省略 |`);
  }

  return rows;
}

function renderMarkdown(payload, options) {
  const lines = [
    '# profile別 goldset coverage',
    '',
    `対象: ${payload.files.map(file => `\`${file}\``).join(', ')}`,
    `レコード数: ${payload.records}`,
    `集計対象profile: ${payload.profiles.map(profile => `\`${profile}\``).join(', ')}`,
    '',
    'この表は期待ラベル記述の網羅状況だけを見る。lint評価の合否、文章品質、著者推定、AI生成確率は扱わない。',
    '',
    '## priority summary',
    '',
    `優先確認profile: ${payload.prioritySummary.profiles.map(profile => `\`${profile}\``).join(', ') || '-'}`,
    '',
    '不足数は「次に確認する候補」であり、すべてを埋めるべきという意味ではない。',
    '',
  ];

  for (const spec of EXPECTATION_FIELDS) {
    const priorityField = payload.prioritySummary.fields[spec.name];
    lines.push(
      `### ${spec.name}`,
      '',
      '| profile | missing |',
      '|---|---:|',
    );
    for (const profile of payload.prioritySummary.profiles) {
      lines.push(`| \`${profile}\` | ${priorityField.missingByProfile[profile] ?? 0} |`);
    }
    lines.push(
      '',
      `優先候補record: ${priorityField.candidateRecords.length}件`,
    );
    lines.push(...renderPriorityRows(priorityField.candidateRecords, options.detailsLimit));
    lines.push('');
  }

  lines.push(
    '## record profile 分布',
    '',
    '| profile | records |',
    '|---|---:|',
  );

  for (const [profile, count] of Object.entries(payload.recordsByProfile)) {
    lines.push(`| \`${mdEscape(profile)}\` | ${count} |`);
  }

  if (payload.unknownRecordProfiles.length > 0) {
    lines.push('', `未知profileを持つrecord: ${payload.unknownRecordProfiles.length}件`);
  }

  for (const spec of EXPECTATION_FIELDS) {
    const field = payload.fields[spec.name];
    lines.push(
      '',
      `## ${spec.name}`,
      '',
      `profile別フィールドあり: ${field.recordsWithProfileField}件`,
      `fallbackのみ: ${field.recordsWithFallbackOnly}件 (${field.fallbackFields.map(name => `\`${name}\``).join(' / ')})`,
      `該当期待なし: ${field.recordsWithNeither}件`,
      '',
      '| profile | present | missing | coverage | non-empty | empty | invalid-shape |',
      '|---|---:|---:|---:|---:|---:|---:|',
    );

    for (const profile of payload.profiles) {
      const stats = field.profiles[profile];
      lines.push(
        `| \`${profile}\` | ${stats.presentRecords} | ${stats.missingRecords} | ${percent(stats.coverage)} | ${stats.nonEmptyRecords} | ${stats.emptyRecords} | ${stats.invalidShapeRecords} |`,
      );
    }

    lines.push(
      '',
      `自record profileキー不足: ${field.missingOwnProfileRecords.length}件`,
    );
    lines.push(...renderRecordRows(field.missingOwnProfileRecords, options.detailsLimit));

    lines.push(
      '',
      `部分記述または未知profileキーあり: ${field.partialRecords.length}件`,
    );
    lines.push(...renderRecordRows(field.partialRecords, options.detailsLimit, true));

    if (field.unknownProfileKeys.length > 0) {
      lines.push('', `未知profileキー: ${field.unknownProfileKeys.length}件`);
    }
  }

  return `${lines.join('\n')}\n`;
}

async function writeOutput(output, outputPath) {
  if (!outputPath) {
    process.stdout.write(output);
    return;
  }

  const directory = path.dirname(outputPath);
  if (directory && directory !== '.') await mkdir(directory, { recursive: true });
  await writeFile(outputPath, output, 'utf8');
}

async function main() {
  const { files, options } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const records = await readJsonlFiles(files);
  const payload = analyzeRecords(records, files, options.profiles);
  payload.prioritySummary = buildPrioritySummary(payload, options.priorityProfiles);
  const output = options.format === 'markdown'
    ? renderMarkdown(payload, options)
    : `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`;

  await writeOutput(output, options.output);
}

await main().catch(error => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 2;
});
