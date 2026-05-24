#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const packageJsonPath = path.join(root, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const defaultOutDir = '_external-review';
const args = process.argv.slice(2);

function usage() {
  return [
    'Usage: node scripts/create-review-bundle.mjs [--out <dir>] [--force]',
    '',
    'Creates a sanitized external-review folder from the npm package surface.',
    'The bundle is generated from npm pack output, not broad source-tree copy.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    outDir: defaultOutDir,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--out requires a directory path.');
      }
      options.outDir = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function listFiles(directory) {
  const output = [];
  function walk(current, prefix = '') {
    const entries = readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else if (entry.isFile()) {
        output.push(relative);
      }
    }
  }
  walk(directory);
  return output;
}

function hasBlockedPath(files) {
  const blocked = [
    /^AGENTS\.md$/,
    /^HANDOFF\.md$/,
    /^VISION\.md$/,
    /^ROADMAP\.md$/,
    /^\.agents(?:\/|$)/,
    /^\.github(?:\/|$)/,
    /^\.local(?:\/|$)/,
    /^reports(?:\/|$)/,
    /^04_runs(?:\/|$)/,
    /^data(?:\/|$)/,
    /^private_corpus(?:\/|$)/,
    /^skills\/codex(?:\/|$)/,
    /^nihongo\.zip$/,
    /^NUL$/,
    /^reportsdispatch(?:\/|$)/,
    /^validation\/goldset\.local\.jsonl$/,
    /^validation\/open-corpus-manifest\.production\.jsonl$/,
  ];
  return files.filter((file) => blocked.some((pattern) => pattern.test(file)));
}

function run(command, commandArgs, options = {}) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'cmd.exe' : command;
  const argsForSpawn = process.platform === 'win32' && command === 'npm'
    ? ['/d', '/s', '/c', 'npm', ...commandArgs]
    : commandArgs;
  const result = spawnSync(executable, argsForSpawn, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : '';
    const stdout = result.stdout ? `\n${result.stdout}` : '';
    throw new Error(`${executable} ${argsForSpawn.join(' ')} failed with exit ${result.status}.${stderr}${stdout}`);
  }
  return result;
}

function ensureWithinRoot(target) {
  const resolved = path.resolve(root, target);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Output directory must stay inside the project root: ${target}`);
  }
  return resolved;
}

function writeReviewDocs(bundleDir, manifest) {
  const scope = `# 外部レビュー範囲

このフォルダは、${manifest.name}@${manifest.version} の外部レビュー用bundleです。

## レビュー対象

- 日本語Markdown散文リンターとしての決定論的な検出挙動。
- CLI、設定、ルール、examples、公開用validation seedの使いやすさ。
- docsの説明可能性、ethical-useの妥当性、誤検出リスク。
- パッケージとしてのローカル実行とsmoke test。

## レビュー対象外

- AI生成判定、著者推定、不正認定、単一スコアによる文章評価。
- 内部開発設定、引き継ぎメモ、run log、dispatch report、ローカルcorpus、source repository運用。
- 第三者本文の再配布。公開validation dataは自作文またはmetadata-onlyに限定する。

## レビュー時の注意

- 指摘は編集候補であり、著者や文章生成由来の証明ではありません。
- 報告では、再現コマンド、レビュー用に自作した入力片、実際の出力、期待する出力を分けてください。
- 第三者の記事本文、画像、表、長い引用をレビューコメントへ貼り込まないでください。
`;

  const checklist = `# 外部レビューチェックリスト

## 機能レビュー

- [ ] CLI helpが理解しやすい。
- [ ] ` + '`node bin/nihongo-slopless.mjs examples/sloppy.md --pretty --fail-on off`' + ` runs.
- [ ] ルールメッセージが編集行動につながる具体性を持つ。
- [ ] 設定とprofilesが理解しやすい。
- [ ] 誤検出例が説明可能で、設定または運用で扱える。

## 安全性レビュー

- [ ] AI生成判定、著者推定、不正認定、単一スコア化の文言が入っていない。
- [ ] 内部開発設定やrun logが入っていない。
- [ ] 第三者本文が入っていない。
- [ ] 公開docsが、決定論的lint指摘と人間の判断を分けている。

## パッケージレビュー

- [ ] ` + '`npm test`' + ` passes in this folder.
- [ ] ` + '`npm pack --dry-run --json`' + ` が内部ファイルを列挙しない。
- [ ] 非公開source repositoryへアクセスしなくても中身をレビューできる。
`;

  writeFileSync(path.join(bundleDir, 'REVIEW_SCOPE.md'), scope, 'utf8');
  writeFileSync(path.join(bundleDir, 'REVIEW_CHECKLIST.md'), checklist, 'utf8');
}

function main() {
  const options = parseArgs(args);
  const outRoot = ensureWithinRoot(options.outDir);
  const bundleName = `${packageJson.name}-${packageJson.version}`;
  const bundleDir = path.join(outRoot, bundleName);
  const archiveTarget = path.join(outRoot, `${bundleName}.tgz`);

  if (existsSync(bundleDir) || existsSync(archiveTarget)) {
    if (!options.force) {
      throw new Error(`Review bundle already exists. Use --force to replace: ${path.relative(root, outRoot)}`);
    }
    rmSync(bundleDir, { recursive: true, force: true });
    rmSync(archiveTarget, { force: true });
  }

  mkdirSync(outRoot, { recursive: true });

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'nihongo-slopless-review-'));
  try {
    const packResult = run('npm', ['pack', '--json', '--pack-destination', tempDir]);
    const packInfo = JSON.parse(packResult.stdout)[0];
    const packedArchive = path.join(tempDir, packInfo.filename);
    const extractDir = path.join(tempDir, 'extract');
    mkdirSync(extractDir);

    run('tar', ['-xzf', packedArchive, '-C', extractDir]);

    const extractedPackage = path.join(extractDir, 'package');
    if (!existsSync(extractedPackage) || !statSync(extractedPackage).isDirectory()) {
      throw new Error('npm pack archive did not contain the expected package/ directory.');
    }

    cpSync(extractedPackage, bundleDir, { recursive: true });
    cpSync(packedArchive, archiveTarget);

    const packageFiles = listFiles(bundleDir);
    const blocked = hasBlockedPath(packageFiles);
    if (blocked.length > 0) {
      throw new Error(`Blocked paths found in review bundle:\n${blocked.join('\n')}`);
    }

    const manifest = {
      name: packageJson.name,
      version: packageJson.version,
      generatedAt: new Date().toISOString(),
      source: 'npm pack',
      archive: toPosix(path.relative(outRoot, archiveTarget)),
      entryCount: packInfo.entryCount,
      size: packInfo.size,
      unpackedSize: packInfo.unpackedSize,
      packageFiles,
      addedReviewFiles: [
        'REVIEW_SCOPE.md',
        'REVIEW_CHECKLIST.md',
        'BUNDLE_MANIFEST.json',
      ],
      blockedPathCount: blocked.length,
    };

    writeReviewDocs(bundleDir, manifest);
    writeFileSync(
      path.join(bundleDir, 'BUNDLE_MANIFEST.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    const finalFiles = listFiles(bundleDir);
    const finalBlocked = hasBlockedPath(finalFiles);
    if (finalBlocked.length > 0) {
      throw new Error(`Blocked paths found after adding review docs:\n${finalBlocked.join('\n')}`);
    }

    console.log(JSON.stringify({
      bundleDir: toPosix(path.relative(root, bundleDir)),
      archive: toPosix(path.relative(root, archiveTarget)),
      packageEntryCount: packInfo.entryCount,
      packageSize: packInfo.size,
      reviewFileCount: finalFiles.length,
      blockedPathCount: finalBlocked.length,
    }, null, 2));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
