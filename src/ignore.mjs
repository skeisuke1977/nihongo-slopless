function parseRuleList(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return ['*'];
  return trimmed.split(/[\s,]+/u).filter(Boolean).map(x => x.startsWith('nihongo-slopless/') ? x : `nihongo-slopless/${x}`);
}

function stripReason(raw) {
  const index = raw.search(/[:：]/u);
  return index === -1 ? raw : raw.slice(0, index);
}

function nextLineRange(text, commentEnd) {
  const currentLineEnd = text.indexOf('\n', commentEnd);
  if (currentLineEnd === -1) return null;

  const start = currentLineEnd + 1;
  const nextLineEnd = text.indexOf('\n', start);
  const end = nextLineEnd === -1 ? text.length : nextLineEnd;
  return { start, end };
}

function lineBody(line) {
  return line.replace(/\r?\n$/u, '');
}

function parseFenceLine(line) {
  const match = lineBody(line).match(/^( {0,3})(`{3,}|~{3,})(.*)$/u);
  if (!match) return null;
  return { marker: match[2], char: match[2][0], length: match[2].length, rest: match[3] };
}

function isClosingFence(fence, openFence) {
  return fence.char === openFence.char && fence.length >= openFence.length && fence.rest.trim() === '';
}

function markdownLineContextKind(line) {
  const body = lineBody(line);
  if (!body.trim()) return 'blank';
  if (/^\s{0,3}#{1,6}\s+\S/u.test(body)) return 'boundary';
  if (/^\s*\|.*\|\s*$/u.test(body)) return 'boundary';
  if (/^\s{0,3}(?:[-*_]\s*){3,}$/u.test(body)) return 'boundary';
  if (/^\s*(?:[-+*]|\d+[.)])\s+\S/u.test(body)) return 'list';
  if (/^\s{0,3}>\s?/u.test(body)) return 'quote';
  return 'normal';
}

function isIndentedCodeLine(line) {
  const body = lineBody(line);
  return /^(?: {4,}|\t)/u.test(body) && body.trim() !== '';
}

function canStartIndentedCodeAfter(kind) {
  return kind === 'blank' || kind === 'boundary' || kind === 'indented-code' || kind === 'fenced-code';
}

export function markdownCodeBlockRanges(text) {
  const ranges = [];
  let offset = 0;
  let openFence = null;
  let indentedStart = null;
  let previousKind = 'blank';

  const closeIndented = (end) => {
    if (indentedStart !== null && end > indentedStart) {
      ranges.push({ start: indentedStart, end });
      indentedStart = null;
    }
  };

  for (const line of text.split(/(?<=\n)/u)) {
    if (openFence) {
      const fence = parseFenceLine(line);
      if (fence && isClosingFence(fence, openFence)) {
        ranges.push({ start: openFence.start, end: offset + line.length });
        openFence = null;
        previousKind = 'fenced-code';
      }
      offset += line.length;
      continue;
    }

    const fence = parseFenceLine(line);
    if (fence) {
      closeIndented(offset);
      openFence = { start: offset, char: fence.char, length: fence.length };
      previousKind = 'fenced-code';
      offset += line.length;
      continue;
    }

    if (isIndentedCodeLine(line) && canStartIndentedCodeAfter(previousKind)) {
      if (indentedStart === null) indentedStart = offset;
      previousKind = 'indented-code';
      offset += line.length;
      continue;
    }

    closeIndented(offset);
    previousKind = markdownLineContextKind(line);
    offset += line.length;
  }

  if (openFence !== null) ranges.push({ start: openFence.start, end: text.length });
  closeIndented(text.length);
  return ranges;
}

function isInRange(ranges, index) {
  return ranges.some(range => index >= range.start && index < range.end);
}

export function parseDisableRanges(text) {
  const events = [];
  const lineRanges = [];
  const codeRanges = markdownCodeBlockRanges(text);
  const commentRegex = /<!--\s*(nihongo-slopless|textlint)-(disable-next-line|ignore|disable|enable)\b\s*([^>]*)-->/gu;
  for (const match of text.matchAll(commentRegex)) {
    if (isInRange(codeRanges, match.index)) continue;

    const family = match[1];
    const action = match[2];
    const rawRules = match[3] ?? '';
    const commentEnd = match.index + match[0].length;

    if (action === 'disable-next-line' || action === 'ignore') {
      const range = nextLineRange(text, commentEnd);
      if (range) {
        const rules = parseRuleList(stripReason(rawRules));
        for (const rule of rules) {
          lineRanges.push({ ...range, rule });
        }
      }
      continue;
    }

    // textlint-disable without specific nihongo rule disables all for this tool.
    const rules = parseRuleList(rawRules);
    events.push({ index: match.index, action, rules, family });
  }

  const open = new Map();
  const ranges = [];

  for (const event of events.sort((a, b) => a.index - b.index)) {
    for (const rule of event.rules) {
      if (event.action === 'disable') {
        if (!open.has(rule)) open.set(rule, event.index);
      } else if (event.action === 'enable') {
        const start = open.get(rule);
        if (start != null) {
          ranges.push({ start, end: event.index, rule });
          open.delete(rule);
        }
      }
    }
  }

  for (const [rule, start] of open.entries()) {
    ranges.push({ start, end: text.length, rule });
  }

  return [...ranges, ...lineRanges];
}

export function isDisabledAt(ranges, ruleId, index) {
  return ranges.some(range => index >= range.start && index <= range.end && (range.rule === '*' || range.rule === ruleId));
}
