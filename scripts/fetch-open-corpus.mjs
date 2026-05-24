#!/usr/bin/env node
// manifestで固定した公開資料だけを、ローカル検証用に取得する最小スクリプト。
// 検索、ライセンス可否判定、goldset投入は行わない。
// 取得したrawからの本文抽出は .local/open-corpus 配下のローカル検証用に限る。

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { PROFILE_NAMES } from '../src/profiles.mjs';
import { VERSION } from '../src/version.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const LOCAL_OPEN_CORPUS_DIR = path.resolve(REPO_ROOT, '.local', 'open-corpus');
const VALIDATION_DIR = path.resolve(REPO_ROOT, 'validation');
const DEFAULT_MANIFEST = 'validation/open-corpus-manifest.example.jsonl';
const DEFAULT_TIMEOUT_MS = 30000;
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

function printHelp() {
  process.stdout.write(`fetch-open-corpus ${VERSION}

manifestで固定した公開資料を .local/open-corpus 配下へ取得します。
検索、ライセンス可否の自動判定、goldset投入は行いません。
HTML/Markdown/テキストの最小本文抽出は、ローカル検証用の extracted/ にだけ書きます。

Usage:
  node scripts/fetch-open-corpus.mjs --manifest <jsonl> [options]

Options:
  --manifest <path>          JSONL manifest (既定 ${DEFAULT_MANIFEST})
  --out <dir>                出力ディレクトリ (既定 .local/open-corpus/<timestamp>)
  --id <id[,id...]>          対象IDを絞る。複数回指定可
  --dry-run                  取得せず、計画と検証結果だけを書く
  --force                    既存rawファイルを上書きする
  --include-self-authored    origin=self-authored も取得対象に含める
  --timeout-ms <ms>          1件あたりのfetch timeout (既定 ${DEFAULT_TIMEOUT_MS})
  --help                     ヘルプを表示

Examples:
  node scripts/fetch-open-corpus.mjs --dry-run
  node scripts/fetch-open-corpus.mjs --id mdn-ja-docs --out .local/open-corpus/2026-05-20-smoke
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    manifestPath: DEFAULT_MANIFEST,
    outDir: null,
    ids: [],
    dryRun: false,
    force: false,
    includeSelfAuthored: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
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
    if (!/^[1-9][0-9]*$/u.test(value)) {
      throw new Error(`${name} には正の整数を指定してください: ${value}`);
    }
    return Number(value);
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--manifest') options.manifestPath = readValue('--manifest');
    else if (arg === '--out') options.outDir = readValue('--out');
    else if (arg === '--id') {
      const ids = readValue('--id').split(',').map(s => s.trim()).filter(Boolean);
      options.ids.push(...ids);
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--include-self-authored') options.includeSelfAuthored = true;
    else if (arg === '--timeout-ms') options.timeoutMs = readPositiveInt('--timeout-ms');
    else throw new Error(`未知のオプションです: ${arg}`);
  }

  return options;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

function normalizePathForDisplay(filePath) {
  const abs = path.resolve(filePath);
  const rel = path.relative(REPO_ROOT, abs);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join('/');
  }
  return abs.split(path.sep).join('/');
}

function isInsidePath(childPath, parentPath) {
  const absChild = path.resolve(childPath);
  const absParent = path.resolve(parentPath);
  const rel = path.relative(absParent, absChild);
  return rel === '' || (rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function validateOutDirPolicy(outDir, records) {
  const resolvedOutDir = path.resolve(outDir);
  const errors = [];

  if (isInsidePath(resolvedOutDir, VALIDATION_DIR)) {
    errors.push(
      `取得本文を validation/ 配下へ自動投入する --out は許可しません: ${normalizePathForDisplay(resolvedOutDir)}`,
    );
  }

  const hasExternalPublic = records.some(record => record.origin === 'external-public');
  if (hasExternalPublic && !isInsidePath(resolvedOutDir, LOCAL_OPEN_CORPUS_DIR)) {
    errors.push(
      `external-public を含むmanifest取得では --out を .local/open-corpus/ 配下にしてください: ${normalizePathForDisplay(resolvedOutDir)}`,
    );
  }

  return errors;
}

function safeFileStem(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/gu, '-');
}

function inferExtension(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const ext = path.extname(parsed.pathname).toLowerCase();
    const allowed = new Set([
      '.html',
      '.htm',
      '.md',
      '.markdown',
      '.txt',
      '.json',
      '.xml',
      '.pdf',
      '.csv',
      '.yaml',
      '.yml',
    ]);
    return allowed.has(ext) ? ext : '.html';
  } catch {
    return '.raw';
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function classifyExtractionFormat(contentType, rawPath) {
  const lowerType = String(contentType ?? '').split(';', 1)[0].trim().toLowerCase();
  const lowerPath = rawPath.toLowerCase();

  if (lowerType) {
    if (lowerType.includes('html')) return 'html';
    if (lowerType.includes('markdown')) return 'markdown';
    if (lowerType === 'text/plain') return 'text';
    return null;
  }

  if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) return 'html';
  if (lowerPath.endsWith('.md') || lowerPath.endsWith('.markdown')) return 'markdown';
  if (lowerPath.endsWith('.txt')) return 'text';
  return null;
}

function isUnsupportedExtractionTarget(rawPath) {
  const lowerPath = rawPath.toLowerCase();
  const unsupported = ['.pdf', '.json', '.xml', '.csv', '.yaml', '.yml'];
  return unsupported.some(ext => lowerPath.endsWith(ext));
}

function isGithubRepositoryLanding(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== 'github.com' && hostname !== 'www.github.com') return false;
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts.length === 2;
  } catch {
    return false;
  }
}

function decodeHtmlEntities(text) {
  const named = new Map([
    ['amp', '&'],
    ['lt', '<'],
    ['gt', '>'],
    ['quot', '"'],
    ['apos', "'"],
    ['nbsp', ' '],
    ['ensp', ' '],
    ['emsp', ' '],
    ['thinsp', ' '],
    ['copy', '(c)'],
    ['reg', '(R)'],
  ]);

  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/giu, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named.get(lower) ?? match;
  });
}

function stripHtmlNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/gu, '\n')
    .replace(/<script\b[\s\S]*?<\/script>/giu, '\n')
    .replace(/<style\b[\s\S]*?<\/style>/giu, '\n')
    .replace(/<svg\b[\s\S]*?<\/svg>/giu, '\n')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/giu, '\n')
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/giu, '\n');
}

function isLikelyMediaWikiSource(record, raw = '') {
  try {
    const hostname = new URL(record.sourceUrl).hostname.toLowerCase();
    if (hostname.endsWith('.wikipedia.org') || hostname.endsWith('.wikibooks.org')) return true;
  } catch {
    // Fall through to raw-content hints.
  }

  return /\b(?:mw-parser-output|data-mw=|mw:Transclusion)\b/iu.test(raw);
}

function stripMediaWikiHtmlMetadata(html) {
  return html
    .replace(/<(sup|span)\b[^>]*\b(?:class|typeof)=["'][^"']*(?:\breference\b|mw:Extension\/ref)[^"']*["'][^>]*>[\s\S]*?<\/\1>/giu, '\n')
    .replace(/<(ol|ul)\b[^>]*\bclass=["'][^"']*\breferences\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/giu, '\n')
    .replace(/<div\b[^>]*\bclass=["'][^"']*(?:\breflist\b|\brefbegin\b|\brefend\b)[^"']*["'][^>]*>[\s\S]*?<\/div>/giu, '\n')
    .replace(/<span\b[^>]*\bclass=["'][^"']*\bmw-editsection\b[^"']*["'][^>]*>[\s\S]*?<\/span>/giu, '\n')
    .replace(/\sdata-(?:mw|parsoid|mw-i18n)=(?:"[\s\S]*?"|'[\s\S]*?')/giu, '');
}

function pickHtmlMainCandidates(html) {
  const candidates = [
    /<main\b[^>]*>([\s\S]*?)<\/main>/iu,
    /<article\b[^>]*>([\s\S]*?)<\/article>/iu,
    /<div\b[^>]*(?:id|class)=["'][^"']*(?:content|article|markdown-body|main)[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu,
    /<body\b[^>]*>([\s\S]*?)<\/body>/iu,
  ];

  return candidates
    .map(pattern => pattern.exec(html)?.[1])
    .filter(Boolean)
    .concat(html);
}

function htmlToMarkdown(html, { mediaWiki = false } = {}) {
  const toMarkdown = scoped => {
    const withBlocks = scoped
      .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu, '\n# $1\n\n')
      .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/giu, '\n## $1\n\n')
      .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/giu, '\n### $1\n\n')
      .replace(/<h[4-6]\b[^>]*>([\s\S]*?)<\/h[4-6]>/giu, '\n#### $1\n\n')
      .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/giu, '\n- $1')
      .replace(/<(p|div|section|br|tr|table|ul|ol)\b[^>]*>/giu, '\n')
      .replace(/<\/(p|div|section|tr|table|ul|ol)>/giu, '\n')
      .replace(/<a\b[^>]*href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/giu, '$1');

    return decodeHtmlEntities(withBlocks.replace(/<[^>]+>/gu, ' '))
      .split(/\r?\n/u)
      .map(line => line.replace(/[ \t]+/gu, ' ').trim())
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim();
  };

  let firstText = '';
  const preparedHtml = mediaWiki ? stripMediaWikiHtmlMetadata(html) : html;
  for (const scoped of pickHtmlMainCandidates(stripHtmlNoise(preparedHtml))) {
    const text = toMarkdown(scoped);
    if (!firstText) firstText = text;
    if (text.length >= 20) return text;
  }
  return firstText;
}

function stripMediaWikiTemplates(text) {
  let output = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '{' || text[index + 1] !== '{') {
      output += text[index];
      index += 1;
      continue;
    }

    let depth = 0;
    let cursor = index;
    while (cursor < text.length - 1) {
      const pair = text.slice(cursor, cursor + 2);
      if (pair === '{{') {
        depth += 1;
        cursor += 2;
        continue;
      }
      if (pair === '}}') {
        depth -= 1;
        cursor += 2;
        if (depth === 0) break;
        continue;
      }
      cursor += 1;
    }

    if (depth === 0) {
      output += ' ';
      index = cursor;
    } else {
      output += text[index];
      index += 1;
    }
  }
  return output;
}

function normalizeExtractedText(text) {
  return text
    .split(/\r?\n/u)
    .map(line => line.replace(/[ \t]+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function isLikelyMediaWikiIndexLine(line) {
  const trimmed = line.trim();
  if (trimmed.length < 100) return false;
  if (/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/u.test(trimmed)) return false;

  const sentenceMarks = (trimmed.match(/[。！？!?]/gu) ?? []).length;
  if (sentenceMarks > 1) return false;

  const separators = (trimmed.match(/\s[-–—]\s|[;；]|\s[:：]\s|→|＞|>/gu) ?? []).length;
  if (separators < 3) return false;

  const hasMediaWikiIndexShape =
    separators >= 5 ||
    /(?:教科|科目|学習|教育|数学|理科|分野|目次|リンク|カテゴリ|プログラミング)/u.test(trimmed);

  return hasMediaWikiIndexShape && !/[。、][^。！？!?]{40,}[。！？!?]/u.test(trimmed);
}

function splitMediaWikiIndexLine(line) {
  return line
    .split(/\s[-–—]\s|[;；]|\s[:：]\s|→|＞|>/u)
    .map(part => part.replace(/[ \t]+/gu, ' ').trim())
    .filter(part => part.length >= 2)
    .map(part => `- ${part}`)
    .join('\n');
}

function structureMediaWikiIndexLines(text) {
  return text
    .split(/\r?\n/u)
    .map(line => (isLikelyMediaWikiIndexLine(line) ? splitMediaWikiIndexLine(line) : line))
    .join('\n');
}

function cleanMediaWikiMarkdown(text) {
  const mediaPrefix = String.raw`(?:file|image|media|ファイル|画像)`;
  const menuLabel = String.raw`(?:目次|関連項目|外部リンク|脚注|注釈|参考文献|出典|ソースを編集|編集|履歴|カテゴリ)`;
  const menuLinePattern = new RegExp(String.raw`^\s{0,3}(?:#{1,6}\s*)?(?:\[\s*)?${menuLabel}(?:\s*\])?\s*:?\s*$`, 'iu');

  const withoutMarkup = stripMediaWikiTemplates(text)
    .replace(/__(?:TOC|NOTOC|FORCETOC|NOEDITSECTION|NEWSECTIONLINK|NONEWSECTIONLINK|NOGALLERY|HIDDENCAT|INDEX|NOINDEX|STATICREDIRECT)__/giu, ' ')
    .replace(new RegExp(String.raw`\[\[\s*${mediaPrefix}\s*:[\s\S]*?\]\]`, 'giu'), ' ')
    .replace(/\[\[([^\[\]\n]{1,500})\]\]/gu, (match, body) => {
      const trimmed = body.trim();
      if (new RegExp(String.raw`^${mediaPrefix}\s*:`, 'iu').test(trimmed)) return ' ';
      const parts = trimmed.split('|').map(part => part.trim()).filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : ' ';
    });

  return normalizeExtractedText(
    structureMediaWikiIndexLines(withoutMarkup)
      .split(/\r?\n/u)
      .filter(line => !menuLinePattern.test(line))
      .join('\n'),
  );
}

function buildExtractedMarkdown({ record, text }) {
  const header = [
    `<!-- sourceId: ${record.id} -->`,
    `<!-- sourceUrl: ${record.sourceUrl} -->`,
    `<!-- profile: ${record.profile} -->`,
    `<!-- storagePolicy: ${record.storagePolicy} -->`,
    '',
  ].join('\n');
  return `${header}${text.trim()}\n`;
}

async function fileInfo(filePath) {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    const buffer = await readFile(filePath);
    return {
      bytes: stats.size,
      sha256: sha256(buffer),
    };
  } catch {
    return null;
  }
}

async function readManifest(manifestPath) {
  const abs = path.resolve(process.cwd(), manifestPath);
  const body = await readFile(abs, 'utf8');
  const records = [];
  const errors = [];
  const lines = body.split(/\r?\n/u);

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (!line.trim()) return;
    try {
      const record = JSON.parse(line);
      records.push({ ...record, __line: lineNo });
    } catch (error) {
      errors.push(`line ${lineNo}: JSONを解析できません: ${error.message}`);
    }
  });

  return { abs, records, errors };
}

function validateRecords(records) {
  const errors = [];
  const warnings = [];
  const seen = new Set();

  for (const record of records) {
    const label = `line ${record.__line ?? '?'} (${record.id ?? 'id未指定'})`;

    for (const field of REQUIRED_FIELDS) {
      if (record[field] === undefined || record[field] === null) {
        errors.push(`${label}: 必須フィールドがありません: ${field}`);
      }
    }

    if (record.id) {
      if (seen.has(record.id)) errors.push(`${label}: idが重複しています: ${record.id}`);
      seen.add(record.id);
    }

    if (typeof record.sourceUrl === 'string') {
      try {
        const parsed = new URL(record.sourceUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push(`${label}: sourceUrl は http/https のみ許可します: ${record.sourceUrl}`);
        }
      } catch {
        errors.push(`${label}: sourceUrl がURLとして不正です: ${record.sourceUrl}`);
      }
    }

    if (record.profile && !PROFILE_NAMES.includes(record.profile)) {
      errors.push(`${label}: 未知のprofileです: ${record.profile}`);
    }

    if (!Array.isArray(record.reviewFocus)) {
      errors.push(`${label}: reviewFocus は配列にしてください。`);
    }

    for (const field of ['includeText', 'repositoryIncluded', 'packageIncluded']) {
      if (typeof record[field] !== 'boolean') {
        errors.push(`${label}: ${field} は boolean にしてください。`);
      }
    }

    if (record.origin === 'external-public' && record.packageIncluded === true) {
      errors.push(`${label}: external-public の packageIncluded=true は許可しません。`);
    }

    if (record.origin === 'external-public' && record.repositoryIncluded === true) {
      warnings.push(`${label}: external-public の repositoryIncluded=true は個別の権利確認が必要です。`);
    }

    if (String(record.termsCheckedAt ?? '').startsWith('TBD')) {
      warnings.push(`${label}: termsCheckedAt が未確認です。実取得前に利用条件を確認してください。`);
    }
  }

  return { errors, warnings };
}

function selectRecords(records, ids) {
  if (ids.length === 0) return records;
  const wanted = new Set(ids);
  const selected = records.filter(record => wanted.has(record.id));
  const found = new Set(selected.map(record => record.id));
  const missing = [...wanted].filter(id => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`manifestに存在しないIDです: ${missing.join(', ')}`);
  }
  return selected;
}

function hasUnapprovedTerms(record) {
  return record.origin === 'external-public'
    && String(record.termsCheckedAt ?? '').startsWith('TBD');
}

function buildRecordPlan(record, rawDir) {
  const rawPath = path.join(rawDir, `${safeFileStem(record.id)}${inferExtension(record.sourceUrl)}`);
  return {
    id: record.id,
    origin: record.origin,
    sourceName: record.sourceName,
    sourceUrl: record.sourceUrl,
    profile: record.profile,
    genre: record.genre,
    validationRole: record.validationRole,
    includeText: record.includeText,
    repositoryIncluded: record.repositoryIncluded,
    packageIncluded: record.packageIncluded,
    rawPath,
  };
}

async function extractOne({ record, result, extractedDir, options }) {
  const startedAt = Date.now();
  const rawPath = path.isAbsolute(result.rawPath)
    ? result.rawPath
    : path.resolve(REPO_ROOT, result.rawPath);
  const extractedPath = path.join(extractedDir, `${safeFileStem(record.id)}.md`);

  if (options.dryRun) {
    let extractAction = result.action === 'would-fetch' ? 'would-extract' : 'would-skip';
    let extractReason = result.action === 'would-fetch' ? null : result.reason;

    if (result.action === 'would-fetch') {
      if (isUnsupportedExtractionTarget(rawPath)) {
        extractAction = 'would-skip';
        extractReason = `unsupported-format:${path.extname(rawPath).toLowerCase()}`;
      } else if (isGithubRepositoryLanding(record.sourceUrl)) {
        extractAction = 'would-skip';
        extractReason = 'github-repository-landing';
      } else if (!classifyExtractionFormat(result.contentType, rawPath)) {
        extractAction = 'would-skip';
        extractReason = 'unsupported-content-type';
      }
    }

    return {
      extractAction,
      extractReason,
      extractedPath: normalizePathForDisplay(extractedPath),
      extractElapsedMs: 0,
    };
  }

  if (!['fetched', 'skipped'].includes(result.action) || !result.rawPath || result.reason === 'self-authored-skipped') {
    return {
      extractAction: 'skipped',
      extractReason: result.reason ?? `raw-${result.action}`,
      extractElapsedMs: Date.now() - startedAt,
    };
  }

  if (isUnsupportedExtractionTarget(rawPath)) {
    return {
      extractAction: 'skipped',
      extractReason: `unsupported-format:${path.extname(rawPath).toLowerCase()}`,
      extractedPath: normalizePathForDisplay(extractedPath),
      extractElapsedMs: Date.now() - startedAt,
    };
  }

  if (isGithubRepositoryLanding(record.sourceUrl)) {
    return {
      extractAction: 'skipped',
      extractReason: 'github-repository-landing',
      extractedPath: normalizePathForDisplay(extractedPath),
      extractElapsedMs: Date.now() - startedAt,
    };
  }

  const existing = await fileInfo(extractedPath);
  if (existing && !options.force) {
    return {
      extractAction: 'skipped',
      extractReason: 'extracted-exists',
      extractedPath: normalizePathForDisplay(extractedPath),
      extractedBytes: existing.bytes,
      extractedSha256: existing.sha256,
      extractElapsedMs: Date.now() - startedAt,
    };
  }

  let text;
  try {
    const raw = await readFile(rawPath, 'utf8');
    const mediaWiki = isLikelyMediaWikiSource(record, raw);
    const format = classifyExtractionFormat(result.contentType, rawPath);
    if (format === 'html') {
      text = htmlToMarkdown(raw, { mediaWiki });
    } else if (format === 'markdown' || format === 'text') {
      text = raw.trim();
    } else {
      return {
        extractAction: 'skipped',
        extractReason: 'unsupported-content-type',
        contentType: result.contentType ?? null,
        extractedPath: normalizePathForDisplay(extractedPath),
        extractElapsedMs: Date.now() - startedAt,
      };
    }
    if (mediaWiki) text = cleanMediaWikiMarkdown(text);
  } catch (error) {
    return {
      extractAction: 'failed',
      extractReason: String(error?.message ?? error),
      extractedPath: normalizePathForDisplay(extractedPath),
      extractElapsedMs: Date.now() - startedAt,
    };
  }

  if (!text || text.length < 20) {
    return {
      extractAction: 'failed',
      extractReason: 'empty-or-too-short',
      extractedPath: normalizePathForDisplay(extractedPath),
      extractElapsedMs: Date.now() - startedAt,
    };
  }

  const body = buildExtractedMarkdown({ record, text });
  await writeFile(extractedPath, body, 'utf8');
  const buffer = Buffer.from(body);
  return {
    extractAction: 'extracted',
    extractReason: null,
    extractedPath: normalizePathForDisplay(extractedPath),
    extractedBytes: buffer.length,
    extractedSha256: sha256(buffer),
    extractElapsedMs: Date.now() - startedAt,
  };
}

async function fetchOne({ plan, record, options }) {
  const startedAt = Date.now();

  if (record.origin === 'self-authored' && !options.includeSelfAuthored) {
    return {
      ...plan,
      action: options.dryRun ? 'would-skip' : 'skipped',
      reason: 'self-authored-skipped',
      elapsedMs: 0,
    };
  }

  if (options.dryRun) {
    return {
      ...plan,
      action: 'would-fetch',
      reason: null,
      elapsedMs: 0,
    };
  }

  const existing = await fileInfo(plan.rawPath);
  if (existing && !options.force) {
    return {
      ...plan,
      action: 'skipped',
      reason: 'raw-exists',
      rawPath: normalizePathForDisplay(plan.rawPath),
      bytes: existing.bytes,
      sha256: existing.sha256,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(record.sourceUrl, {
      signal: controller.signal,
      headers: {
        'user-agent': `nihongo-slopless-fetch-open-corpus/${VERSION}`,
      },
    });
    const contentType = response.headers.get('content-type') ?? null;
    const finalUrl = response.url;

    if (!response.ok) {
      return {
        ...plan,
        action: 'failed',
        reason: `http-${response.status}`,
        httpStatus: response.status,
        finalUrl,
        contentType,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(plan.rawPath, buffer);
    return {
      ...plan,
      action: 'fetched',
      reason: null,
      rawPath: normalizePathForDisplay(plan.rawPath),
      httpStatus: response.status,
      finalUrl,
      contentType,
      bytes: buffer.length,
      sha256: sha256(buffer),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...plan,
      action: 'failed',
      reason: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(results) {
  const byAction = {};
  const byExtractAction = {};
  for (const result of results) {
    byAction[result.action] = (byAction[result.action] ?? 0) + 1;
    if (result.extractAction) {
      byExtractAction[result.extractAction] = (byExtractAction[result.extractAction] ?? 0) + 1;
    }
  }
  return {
    records: results.length,
    byAction,
    byExtractAction,
    failed: results.filter(result => result.action === 'failed').length,
    extractionFailed: results.filter(result => result.extractAction === 'failed').length,
  };
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function writeSnapshot(filePath, records) {
  const body = records
    .map(record => {
      const { __line, ...clean } = record;
      return JSON.stringify(clean);
    })
    .join('\n') + '\n';
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body, 'utf8');
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

  if (!options.outDir) {
    options.outDir = path.join(LOCAL_OPEN_CORPUS_DIR, timestampForPath());
  } else {
    options.outDir = path.resolve(process.cwd(), options.outDir);
  }

  let manifest;
  try {
    manifest = await readManifest(options.manifestPath);
  } catch (error) {
    process.stderr.write(`manifestを読めません: ${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
    return;
  }

  const manifestValidation = validateRecords(manifest.records);
  const allErrors = [...manifest.errors, ...manifestValidation.errors];
  if (allErrors.length > 0) {
    for (const error of allErrors) process.stderr.write(`error: ${error}\n`);
    process.exitCode = 2;
    return;
  }

  let selected;
  try {
    selected = selectRecords(manifest.records, options.ids);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  const outputPolicyErrors = validateOutDirPolicy(options.outDir, selected);
  if (outputPolicyErrors.length > 0) {
    for (const error of outputPolicyErrors) process.stderr.write(`error: ${error}\n`);
    process.exitCode = 2;
    return;
  }

  const selectedLines = new Set(selected.map(record => record.__line));
  const selectedWarnings = manifestValidation.warnings.filter(warning => {
    const match = /^line ([0-9]+)/u.exec(warning);
    return !match || selectedLines.has(Number(match[1]));
  });

  const blockedByTerms = selected.filter(hasUnapprovedTerms);
  if (!options.dryRun && blockedByTerms.length > 0) {
    for (const record of blockedByTerms) {
      process.stderr.write(
        `error: line ${record.__line ?? '?'} (${record.id}): external-public の termsCheckedAt が未確認です。実取得前に YYYY-MM-DD で利用条件確認日を記録してください。\n`,
      );
    }
    process.exitCode = 2;
    return;
  }

  const rawDir = path.join(options.outDir, 'raw');
  const extractedDir = path.join(options.outDir, 'extracted');
  await mkdir(rawDir, { recursive: true });
  await mkdir(extractedDir, { recursive: true });

  const snapshotPath = path.join(options.outDir, 'manifest.snapshot.jsonl');
  await writeSnapshot(snapshotPath, selected);

  const results = [];
  for (const record of selected) {
    const plan = buildRecordPlan(record, rawDir);
    const result = await fetchOne({ plan, record, options });
    const extraction = await extractOne({ record, result, extractedDir, options });
    results.push({
      ...result,
      ...extraction,
      rawPath: result.rawPath ? normalizePathForDisplay(path.resolve(REPO_ROOT, result.rawPath)) : normalizePathForDisplay(plan.rawPath),
    });
  }

  const report = {
    tool: 'nihongo-slopless-fetch-open-corpus',
    version: VERSION,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    manifestPath: normalizePathForDisplay(manifest.abs),
    outDir: normalizePathForDisplay(options.outDir),
    snapshotPath: normalizePathForDisplay(snapshotPath),
    timeoutMs: options.timeoutMs,
    ids: options.ids,
    includeSelfAuthored: options.includeSelfAuthored,
    force: options.force,
    warnings: selectedWarnings,
    summary: summarize(results),
    records: results,
  };

  const reportPath = path.join(options.outDir, 'fetch-report.json');
  await writeJson(reportPath, report);

  process.stdout.write(`Wrote ${normalizePathForDisplay(snapshotPath)}\n`);
  process.stdout.write(`Wrote ${normalizePathForDisplay(reportPath)}\n`);
  process.stdout.write(`Summary: ${JSON.stringify(report.summary)}\n`);
  if (selectedWarnings.length > 0) {
    process.stdout.write(`Warnings: ${selectedWarnings.length}\n`);
  }

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

await main();
