import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

function hasGlob(input) {
  return /[*?\[\]{}]/u.test(input);
}

function globToRegExp(pattern) {
  const normalized = pattern.split(/[\\/]+/u).join('/');
  let out = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    const afterNext = normalized[i + 2];
    if (ch === '*' && next === '*' && afterNext === '/') {
      out += '(?:.*/)?';
      i += 2;
    } else if (ch === '*' && next === '*') {
      out += '.*';
      i += 1;
    } else if (ch === '*') {
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += ch.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  out += '$';
  return new RegExp(out);
}

function normalizeRelativePattern(pattern, cwd = process.cwd()) {
  return path.relative(cwd, path.resolve(cwd, pattern)).split(path.sep).join('/');
}

function normalizePathForGlob(filePath) {
  return filePath.split(/[\\/]+/u).join('/');
}

function globSearchRoot(pattern, cwd = process.cwd()) {
  const absolutePattern = path.resolve(cwd, pattern);
  const { root } = path.parse(absolutePattern);
  const segments = absolutePattern.slice(root.length).split(/[\\/]+/u).filter(Boolean);
  const fixedSegments = [];

  for (const segment of segments) {
    if (hasGlob(segment)) break;
    fixedSegments.push(segment);
  }

  const searchRoot = fixedSegments.length > 0 ? path.join(root, ...fixedSegments) : root;
  return {
    searchRoot,
    pattern: normalizePathForGlob(path.relative(searchRoot, absolutePattern)),
  };
}

async function walkGlobRoot(dir, extensions) {
  try {
    return await walk(dir, extensions);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return [];
    throw error;
  }
}

function isIgnoredFile(filePath, ignoreFiles = [], cwd = process.cwd()) {
  if (!Array.isArray(ignoreFiles) || ignoreFiles.length === 0) return false;

  const rel = path.relative(cwd, filePath).split(path.sep).join('/');
  return ignoreFiles
    .filter(pattern => typeof pattern === 'string' && pattern.length > 0)
    .some(pattern => globToRegExp(normalizeRelativePattern(pattern, cwd)).test(rel));
}

async function walk(dir, extensions, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, extensions, acc);
    else if (extensions.includes(path.extname(entry.name).toLowerCase())) acc.push(full);
  }
  return acc;
}

export async function expandInputs(inputs, { extensions = ['.md'], ignoreFiles = [], allowEmpty = false } = {}) {
  const found = new Set();

  for (const input of inputs) {
    if (hasGlob(input)) {
      const cwd = process.cwd();
      const { searchRoot, pattern } = globSearchRoot(input, cwd);
      const all = await walkGlobRoot(searchRoot, extensions);
      const re = globToRegExp(pattern);
      const matched = [];
      for (const file of all) {
        const rel = normalizePathForGlob(path.relative(searchRoot, file));
        if (re.test(rel)) matched.push(file);
      }
      if (matched.length === 0 && !allowEmpty) {
        throw new Error(`入力パターンに一致するファイルがありません: ${input}`);
      }
      for (const file of matched) {
        found.add(file);
      }
      continue;
    }

    const resolved = path.resolve(process.cwd(), input);
    const s = await stat(resolved);
    if (s.isDirectory()) {
      const matched = await walk(resolved, extensions);
      if (matched.length === 0 && !allowEmpty) {
        throw new Error(`入力ディレクトリに検査対象ファイルがありません: ${input}`);
      }
      for (const file of matched) found.add(file);
    } else {
      found.add(resolved);
    }
  }

  return [...found].filter(file => !isIgnoredFile(file, ignoreFiles)).sort();
}
