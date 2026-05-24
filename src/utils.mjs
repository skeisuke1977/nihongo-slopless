export function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

export function offsetToLocation(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }
  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: offset - lineStarts[lineIndex] + 1 };
}

export function excerptAt(text, index, length = 30) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

export function hasJapanese(text) {
  return /[ぁ-んァ-ン一-龠々〆ヵヶ]/u.test(text);
}

export function visibleLength(text) {
  return text.replace(/\s+/g, '').length;
}

// Removes inline link/citation URLs and bare URLs from a sentence-level string
// before length-based measurements. URLs are not prose: readers skim them, so
// counting their characters as "reader load" inflates the score and produces
// false positives on otherwise readable sentences that end with a citation link.
//
// Stripped patterns:
//   - Markdown inline links: [label](url)            -> entire construct removed
//   - Markdown images:        ![alt](url)            -> entire construct removed
//   - Markdown autolinks:     <https://...>          -> entire construct removed
//   - Bare URLs:              https://...  http://... -> entire URL removed
//
// Used only for length heuristics; the original sentence.text remains untouched
// elsewhere so other rules (thin-sentence, citation-needed, etc.) keep their
// existing behaviour.
export function stripInlineUrls(text) {
  if (typeof text !== 'string' || !text) return '';
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\[[^\]]+\]\([^)]*\)/gu, '')
    .replace(/<https?:\/\/[^>\s]+>/gu, '')
    .replace(/https?:\/\/[^\s<>"'）)\]」』】〉》]+/gu, '');
}

export function countMatches(text, regex) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const r = new RegExp(regex.source, flags);
  return [...text.matchAll(r)].length;
}

export function findAll(text, regex) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const r = new RegExp(regex.source, flags);
  return [...text.matchAll(r)];
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stringList(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(value => typeof value === 'string' && value.length > 0);
}

export function literalAlternationRegex(values, flags = 'gu') {
  const source = stringList(values).map(escapeRegExp).join('|');
  return source ? new RegExp(source, flags) : null;
}

export function patternAlternationRegex(values, flags = 'gu') {
  const source = stringList(values).join('|');
  return source ? new RegExp(source, flags) : null;
}

export function normalizeSeverity(value, fallback = 'warning') {
  if (['info', 'warning', 'error'].includes(value)) return value;
  if (value === 1) return 'info';
  if (value === 2) return 'warning';
  if (value === 3) return 'error';
  return fallback;
}

export function hasEvidenceMarker(text) {
  return /(https?:\/\/|doi:|DOI:|\[[0-9０-９]+\]|\[[A-Za-z][^\]]+\]|（?\(?[12][0-9]{3}\)?）?|出典[:：]|参考文献|引用|表\s*[0-9０-９]+|図\s*[0-9０-９]+)/u.test(text);
}

export function isMostlyNumericOrSymbol(text) {
  const compact = text.replace(/\s/g, '');
  if (!compact) return true;
  const symbols = compact.replace(/[ぁ-んァ-ン一-龠々A-Za-z]/gu, '');
  return symbols.length / compact.length > 0.7;
}

export function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function sentenceEnding(sentenceText) {
  const text = sentenceText.trim();
  if (!text) return '';
  if (/(です|でした|でしょう|ですか)[。！？!?”"』）\)]*$/u.test(text)) return 'です';
  if (/(ます|ました|ません|ましょう)[。！？!?”"』）\)]*$/u.test(text)) return 'ます';
  if (/(である|であった|であろう)[。！？!?”"』）\)]*$/u.test(text)) return 'である';
  if (/(だ|だった|だろう)[。！？!?”"』）\)]*$/u.test(text)) return 'だ';
  if (/(た|ない)[。！？!?”"』）\)]*$/u.test(text)) return 'た/ない';
  return '';
}
