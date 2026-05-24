#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { lintText, summarizeResults, loadConfigFile, listRuleMetadata } from '../src/index.mjs';
import { expandInputs } from '../src/glob.mjs';
import { PROFILE_NAMES } from '../src/profiles.mjs';
import { outputFilePath } from '../src/output-paths.mjs';
import { createSarifLog } from '../src/sarif.mjs';
import { VERSION } from '../src/version.mjs';

const PROFILE_LIST = PROFILE_NAMES.join('|');
const SEVERITY_LEVELS = ['info', 'warning', 'error'];
const FAIL_ON_LEVELS = [...SEVERITY_LEVELS, 'off'];
const OUTPUT_FORMATS = ['json', 'sarif'];

function printHelp() {
  console.log(`nihongo-slopless ${VERSION}

日本語Markdown向けの決定論的散文リンター。AI判定器ではありません。

Usage:
  nihongo-slopless <file|dir|glob|-> [options]

Options:
  --pretty               出力を整形
  --format <name>        json|sarif。既定はjson
  --profile <name>       ${PROFILE_LIST} の設定を下敷きにする
  --config <path>        設定JSONを読み込む
  --rules                ルール一覧をJSONで出力
  --min-severity <level> info|warning|error の最小出力レベル
  --fail-on <level>      info|warning|error|off。終了コード1にする最小重要度
  --max-findings <count> 指摘件数がcountを超えたら終了コード1にする
  --output <path>        JSONまたはSARIF出力をファイルに保存
  --allow-empty          globやディレクトリが0件でも実行エラーにしない
  --absolute-paths       JSON pathとSARIF artifact URIを絶対パスで出力
  --collapse-occurrences 同一行近接findingsをoccurrences[]に折りたたむ
  --help                 ヘルプを表示
  --version              バージョンを表示

Examples:
  nihongo-slopless "docs/**/*.md" --pretty
  cat draft.md | nihongo-slopless - --pretty

Profiles:
  agent-output はAI生成判定ではなく、応答残骸や未編集の兆候を見る設定です。
  profile は著者や生成元ではなく、文書用途に応じた設定名です。
`);
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function parseArgs(argv) {
  const args = [...argv];
  const inputs = [];
  const options = {
    pretty: false,
    profile: null,
    configPath: null,
    minSeverity: 'info',
    failOn: 'warning',
    maxFindings: null,
    outputPath: null,
    format: 'json',
    rules: false,
    allowEmpty: false,
    absolutePaths: false,
    collapseOccurrences: false,
  };

  const readOptionValue = optionName => {
    const value = args.shift();
    if (!value || value.startsWith('--')) {
      throw new Error(`${optionName} には値を指定してください。`);
    }
    return value;
  };

  const readChoiceValue = (optionName, choices) => {
    const value = readOptionValue(optionName);
    if (!choices.includes(value)) {
      throw new Error(`${optionName} には ${choices.join('|')} のいずれかを指定してください: ${value}`);
    }
    return value;
  };

  const readNonNegativeInteger = optionName => {
    const value = readOptionValue(optionName);
    if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
      throw new Error(`${optionName} には0以上の整数を指定してください: ${value}`);
    }
    const count = Number(value);
    if (!Number.isSafeInteger(count)) {
      throw new Error(`${optionName} の値が大きすぎます: ${value}`);
    }
    return count;
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--pretty') options.pretty = true;
    else if (arg === '--rules') options.rules = true;
    else if (arg === '--allow-empty') options.allowEmpty = true;
    else if (arg === '--absolute-paths') options.absolutePaths = true;
    else if (arg === '--collapse-occurrences') options.collapseOccurrences = true;
    else if (arg === '--format') options.format = readChoiceValue('--format', OUTPUT_FORMATS);
    else if (arg === '--profile') options.profile = readOptionValue('--profile');
    else if (arg === '--config') options.configPath = readOptionValue('--config');
    else if (arg === '--min-severity') options.minSeverity = readChoiceValue('--min-severity', SEVERITY_LEVELS);
    else if (arg === '--fail-on') options.failOn = readChoiceValue('--fail-on', FAIL_ON_LEVELS);
    else if (arg === '--max-findings') options.maxFindings = readNonNegativeInteger('--max-findings');
    else if (arg === '--output') options.outputPath = readOptionValue('--output');
    else if (arg.startsWith('--')) throw new Error(`未知のオプションです: ${arg}`);
    else inputs.push(arg);
  }
  return { inputs, options };
}

function severityRank(level) {
  return { info: 1, warning: 2, error: 3 }[level] ?? 1;
}

async function emitPayload(payload, { pretty = false, outputPath = null } = {}) {
  const serialized = JSON.stringify(payload, null, pretty ? 2 : 0);
  if (!outputPath) {
    console.log(serialized);
    return;
  }

  const resolved = path.resolve(process.cwd(), outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${serialized}\n`, 'utf8');
}

async function main() {
  try {
    const { inputs, options } = parseArgs(process.argv.slice(2));

    if (options.version) {
      console.log(VERSION);
      return;
    }
    if (options.help) {
      printHelp();
      return;
    }
    if (options.rules) {
      await emitPayload(
        { tool: 'nihongo-slopless', version: VERSION, rules: listRuleMetadata() },
        { pretty: options.pretty, outputPath: options.outputPath },
      );
      return;
    }
    if (inputs.length === 0) {
      printHelp();
      process.exitCode = 2;
      return;
    }

    const config = await loadConfigFile(options.configPath, { profile: options.profile });
    if (options.collapseOccurrences) {
      config.collapseOccurrences = true;
    }
    const files = [];

    if (inputs.includes('-')) {
      const text = await readStdin();
      files.push({ path: '<stdin>', text });
    }

    const fileInputs = inputs.filter(x => x !== '-');
    if (fileInputs.length > 0) {
      const expanded = await expandInputs(fileInputs, {
        extensions: ['.md', '.markdown', '.txt'],
        ignoreFiles: config.ignoreFiles,
        allowEmpty: options.allowEmpty,
      });
      for (const filePath of expanded) {
        files.push({ path: filePath, text: await readFile(filePath, 'utf8') });
      }
    }

    const minRank = severityRank(options.minSeverity);
    const results = files.map(file => {
      const result = lintText(file.text, { filePath: file.path, config });
      result.messages = result.messages.filter(m => severityRank(m.severity) >= minRank);
      result.path = outputFilePath(file.path, { absolutePaths: options.absolutePaths });
      return result;
    });

    const payload = {
      tool: 'nihongo-slopless',
      version: VERSION,
      language: 'ja',
      files: results,
      summary: summarizeResults(results),
    };

    const output = options.format === 'sarif'
      ? createSarifLog({ ...payload, rules: listRuleMetadata(), absolutePaths: options.absolutePaths })
      : payload;
    await emitPayload(output, { pretty: options.pretty, outputPath: options.outputPath });

    const exceedsMaxFindings = options.maxFindings != null && payload.summary.findings > options.maxFindings;
    if (options.failOn !== 'off') {
      const failRank = severityRank(options.failOn);
      const hasFailingFinding = results.some(file => file.messages.some(m => severityRank(m.severity) >= failRank));
      process.exitCode = hasFailingFinding || exceedsMaxFindings ? 1 : 0;
    } else if (exceedsMaxFindings) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify({ tool: 'nihongo-slopless', error: String(error?.message ?? error) }, null, 2));
    process.exitCode = 2;
  }
}

await main();
