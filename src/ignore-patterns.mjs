const SUPPORTED_SCOPES = new Set(['line']);
const MAX_PATTERN_LENGTH = 120;

function validateReason(reason, { source, index }) {
  if (typeof reason !== 'string' || reason.trim().length < 6) {
    throw new Error(`${source}.ignorePatterns[${index}].reason は6文字以上の理由で指定してください。`);
  }
}

function compilePattern(pattern, { source, index }) {
  let regex;
  try {
    regex = new RegExp(pattern, 'u');
  } catch (error) {
    throw new Error(`${source}.ignorePatterns[${index}].pattern は有効な正規表現で指定してください: ${error.message}`);
  }
  if (regex.test('')) {
    throw new Error(`${source}.ignorePatterns[${index}].pattern は空文字に一致しない範囲の狭い正規表現にしてください。`);
  }
  return regex;
}

export function normalizeIgnorePatterns(ignorePatterns, { source = 'config' } = {}) {
  if (ignorePatterns === undefined) return [];
  if (!Array.isArray(ignorePatterns)) {
    throw new Error(`${source}.ignorePatterns は配列で指定してください。`);
  }

  return ignorePatterns.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${source}.ignorePatterns[${index}] はオブジェクトで指定してください。`);
    }

    for (const key of Object.keys(item)) {
      if (!['pattern', 'scope', 'reason'].includes(key)) {
        throw new Error(`${source}.ignorePatterns[${index}] に未知の項目 ${key} があります。`);
      }
    }

    if (typeof item.pattern !== 'string' || item.pattern.length === 0 || item.pattern.length > MAX_PATTERN_LENGTH || !/\S/u.test(item.pattern)) {
      throw new Error(`${source}.ignorePatterns[${index}].pattern は1文字以上${MAX_PATTERN_LENGTH}文字以下の正規表現文字列で指定してください。`);
    }
    if (typeof item.scope !== 'string' || !SUPPORTED_SCOPES.has(item.scope)) {
      throw new Error(`${source}.ignorePatterns[${index}].scope は "line" で指定してください。`);
    }
    validateReason(item.reason, { source, index });

    return {
      pattern: item.pattern,
      scope: item.scope,
      reason: item.reason,
      regex: compilePattern(item.pattern, { source, index }),
    };
  });
}

function hasCompiledPatterns(ignorePatterns) {
  return Array.isArray(ignorePatterns)
    && ignorePatterns.every(item => item && item.scope === 'line' && item.regex instanceof RegExp);
}

function lineBodyEnd(text, lineStart, lineEnd) {
  if (lineEnd > lineStart && text[lineEnd - 1] === '\n') {
    const beforeLf = lineEnd - 2;
    return beforeLf >= lineStart && text[beforeLf] === '\r' ? beforeLf : lineEnd - 1;
  }
  return lineEnd;
}

function mergeRanges(ranges) {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function ignorePatternRanges(text, ignorePatterns = [], { source = 'config' } = {}) {
  const patterns = hasCompiledPatterns(ignorePatterns)
    ? ignorePatterns
    : normalizeIgnorePatterns(ignorePatterns, { source });
  if (patterns.length === 0) return [];

  const ranges = [];
  let lineStart = 0;
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const bodyEnd = lineBodyEnd(text, lineStart, lineEnd);
    const body = text.slice(lineStart, bodyEnd);

    if (patterns.some(item => item.scope === 'line' && item.regex.test(body))) {
      ranges.push({ start: lineStart, end: bodyEnd, rule: '*' });
    }

    if (newline === -1) break;
    lineStart = lineEnd;
  }

  return mergeRanges(ranges);
}
