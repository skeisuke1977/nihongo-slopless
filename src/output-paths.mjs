import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STDIN_PATH = '<stdin>';

function normalizeSeparators(filePath) {
  return filePath.split(path.sep).join('/');
}

function absoluteFilePath(filePath, cwd = process.cwd()) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

export function outputFilePath(filePath, { absolutePaths = false, cwd = process.cwd() } = {}) {
  if (!filePath) return '';
  if (filePath === STDIN_PATH) return STDIN_PATH;
  const absolutePath = absoluteFilePath(filePath, cwd);
  if (absolutePaths) return absolutePath;

  const relativePath = path.relative(cwd, absolutePath);
  if (path.isAbsolute(relativePath)) return normalizeSeparators(absolutePath);
  return normalizeSeparators(relativePath || path.basename(absolutePath));
}

export function sarifArtifactUri(filePath, { absolutePaths = false, cwd = process.cwd() } = {}) {
  if (!filePath) return '';
  if (filePath === STDIN_PATH) return 'stdin';
  const absolutePath = absoluteFilePath(filePath, cwd);
  if (absolutePaths) return pathToFileURL(absolutePath).href;

  const relativePath = path.relative(cwd, absolutePath);
  if (path.isAbsolute(relativePath)) return pathToFileURL(absolutePath).href;
  return normalizeSeparators(relativePath || path.basename(absolutePath));
}
