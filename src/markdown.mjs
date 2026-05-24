import { buildLineStarts, hasJapanese, isMostlyNumericOrSymbol } from './utils.mjs';
import { markdownCodeBlockRanges, parseDisableRanges } from './ignore.mjs';
import { ignorePatternRanges } from './ignore-patterns.mjs';

function maskRange(chars, start, end) {
  for (let i = start; i < end && i < chars.length; i += 1) {
    if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  }
}

function maskRangeKeepingPrefix(chars, start, end, prefix = '') {
  maskRange(chars, start, end);
  for (let i = 0; i < prefix.length && start + i < end && start + i < chars.length; i += 1) {
    if (chars[start + i] !== '\n' && chars[start + i] !== '\r') chars[start + i] = prefix[i];
  }
}

function trimRange(text, start, end) {
  while (start < end && /\s/u.test(text[start])) start += 1;
  while (end > start && /\s/u.test(text[end - 1])) end -= 1;
  return { start, end, text: text.slice(start, end) };
}

function skipLeadingHtmlComments(text, offset) {
  let cursor = offset;

  while (cursor < text.length) {
    const whitespace = text.slice(cursor).match(/^\s*/u);
    cursor += whitespace?.[0].length ?? 0;

    if (!text.startsWith('<!--', cursor)) return cursor;

    const commentEnd = text.indexOf('-->', cursor + 4);
    if (commentEnd === -1) return cursor;
    cursor = commentEnd + 3;
  }

  return cursor;
}

function findYamlFrontMatterRange(text) {
  const start = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  const frontMatterStart = skipLeadingHtmlComments(text, start);
  const openingMatch = text.slice(frontMatterStart).match(/^---(?:\r?\n)/u);
  if (!openingMatch) return null;

  let offset = frontMatterStart + openingMatch[0].length;
  while (offset < text.length) {
    const lineEnd = text.indexOf('\n', offset);
    const end = lineEnd === -1 ? text.length : lineEnd + 1;
    const bodyEnd = lineEnd === -1
      ? text.length
      : (text[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd);
    if (text.slice(offset, bodyEnd) === '---') return { start: frontMatterStart, end };
    offset = end;
  }

  return null;
}

function visibleHugoShortcodeText(shortcode) {
  const textAttribute = shortcode.match(/\btext=(["'])(.*?)\1/u);
  return textAttribute?.[2] ?? '';
}

function markdownLineKind(line) {
  const body = line.replace(/\r?\n$/u, '');
  if (!body.trim()) return 'blank';
  if (/^\s{0,3}#{1,6}\s+\S/u.test(body)) return 'heading';
  if (/^\s*\|.*\|\s*$/u.test(body)) return 'table';
  if (/^\s*(?:[-+*]|\d+[.)])\s+\S/u.test(body)) return 'list';
  if (/^\s{0,3}>\s?/u.test(body)) return 'quote';
  if (/^\s{0,3}(?:[-*_]\s*){3,}$/u.test(body)) return 'thematic';
  return 'normal';
}

function shouldLintStructure(kind) {
  return ['normal', 'list', 'quote'].includes(kind);
}

function isListContinuationLine(line) {
  return /^\s{2,}\S/u.test(line.replace(/\r?\n$/u, ''));
}

function splitStructureBlocks(maskedText) {
  const blocks = [];
  const lines = maskedText.split(/(?<=\n)/u);
  let offset = 0;
  let currentStart = null;
  let currentEnd = null;
  let currentKind = null;
  let currentSectionIndex = null;
  let sectionIndex = 0;

  const flushCurrent = () => {
    if (currentStart !== null && currentEnd !== null && currentEnd > currentStart) {
      blocks.push({
        start: currentStart,
        end: currentEnd,
        kind: currentKind,
        sectionIndex: currentSectionIndex,
        lintStructure: true,
      });
    }
    currentStart = null;
    currentEnd = null;
    currentKind = null;
    currentSectionIndex = null;
  };

  const startCurrent = (kind, start, end) => {
    currentStart = start;
    currentEnd = end;
    currentKind = kind;
    currentSectionIndex = sectionIndex;
  };

  for (const line of lines) {
    const kind = markdownLineKind(line);
    const lineStart = offset;
    const lineEnd = offset + line.length;

    if (kind === 'blank') {
      flushCurrent();
      sectionIndex += 1;
    } else if (kind === 'normal') {
      if (currentKind === 'list' && isListContinuationLine(line)) {
        currentEnd = lineEnd;
      } else {
        if (currentKind !== 'normal') flushCurrent();
        if (currentStart === null) startCurrent('normal', lineStart, lineEnd);
        currentEnd = lineEnd;
        currentKind = 'normal';
      }
    } else if (kind === 'list') {
      flushCurrent();
      startCurrent('list', lineStart, lineEnd);
    } else {
      flushCurrent();
      if (shouldLintStructure(kind)) {
        startCurrent(kind, lineStart, lineEnd);
        flushCurrent();
      } else {
        sectionIndex += 1;
      }
    }

    offset = lineEnd;
  }

  flushCurrent();
  return blocks;
}

function maskMarkdown(text, { ignoredRanges = [] } = {}) {
  const chars = text.split('');

  // YAML front matter
  const yamlFrontMatterRange = findYamlFrontMatterRange(text);
  if (yamlFrontMatterRange) maskRange(chars, yamlFrontMatterRange.start, yamlFrontMatterRange.end);

  // Markdown code blocks
  for (const range of markdownCodeBlockRanges(text)) {
    maskRange(chars, range.start, range.end);
  }

  // HTML comments
  for (const match of text.matchAll(/<!--[\s\S]*?-->/gu)) {
    maskRange(chars, match.index, match.index + match[0].length);
  }

  // Hugo-style shortcodes are template syntax, not prose. Keep surrounding
  // body text visible while removing attributes such as figure captions or
  // glossary IDs from sentence-length and paragraph heuristics.
  for (const match of text.matchAll(/\{\{[<%][^\n]*?[>%]\}\}/gu)) {
    maskRangeKeepingPrefix(
      chars,
      match.index,
      match.index + match[0].length,
      visibleHugoShortcodeText(match[0]),
    );
  }

  // MDN/KumaScript macros such as {{cssxref("display")}} and Vue-style
  // template expressions are source syntax, not prose. Hugo shortcodes are
  // handled above because their explicit text="..." attribute is visible text.
  for (const match of text.matchAll(/\{\{(?![<%])[^\n]*?\}\}/gu)) {
    maskRange(chars, match.index, match.index + match[0].length);
  }

  // Inline code spans
  for (const match of text.matchAll(/`[^`\n]+`/gu)) {
    maskRange(chars, match.index, match.index + match[0].length);
  }

  // Markdown image alt and URL; prose lint should not inspect image syntax.
  for (const match of text.matchAll(/!\[[^\]]*\]\([^)]*\)/gu)) {
    maskRange(chars, match.index, match.index + match[0].length);
  }

  // Markdown link URL part, keeping visible anchor text.
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]*)\)/gu)) {
    const urlStart = match.index + match[0].lastIndexOf('(') + 1;
    const urlEnd = match.index + match[0].length - 1;
    maskRange(chars, urlStart, urlEnd);
  }

  for (const range of ignoredRanges) {
    maskRange(chars, range.start, range.end);
  }

  return chars.join('');
}

function maskAdditionalRanges(text, ranges) {
  const chars = text.split('');
  for (const range of ranges) {
    maskRange(chars, range.start, range.end);
  }
  return chars.join('');
}

function splitSentencesInRange(maskedText, blockStart, blockEnd) {
  const sentences = [];
  let start = blockStart;
  const closeChars = /[」』”’）\)\]】〉》]/u;

  for (let i = blockStart; i < blockEnd; i += 1) {
    const ch = maskedText[i];
    if (/[。！？!?]/u.test(ch)) {
      let end = i + 1;
      while (end < blockEnd && closeChars.test(maskedText[end])) end += 1;
      const trimmed = trimRange(maskedText, start, end);
      if (trimmed.text && hasJapanese(trimmed.text) && !isMostlyNumericOrSymbol(trimmed.text)) {
        sentences.push({ ...trimmed, rawStart: start, rawEnd: end });
      }
      start = end;
      i = end - 1;
    }
  }

  const rest = trimRange(maskedText, start, blockEnd);
  if (rest.text && hasJapanese(rest.text) && !isMostlyNumericOrSymbol(rest.text) && rest.text.length > 20) {
    sentences.push({ ...rest, rawStart: start, rawEnd: blockEnd });
  }
  return sentences;
}

function splitSentences(maskedText, blocks) {
  return blocks
    .filter(block => block.lintStructure)
    .flatMap((block, blockIndex) => splitSentencesInRange(maskedText, block.start, block.end)
      .map(sentence => ({
        ...sentence,
        structureBlockIndex: blockIndex,
        structureKind: block.kind,
        structureBlockSectionIndex: block.sectionIndex,
      })));
}

function hasMarkdownSectionBoundaryBetween(text, previousSentence, nextSentence) {
  const previousEnd = previousSentence.rawEnd ?? previousSentence.end;
  const nextStart = nextSentence.rawStart ?? nextSentence.start;
  const between = text.slice(previousEnd, nextStart);
  return /\r?\n\s*\r?\n/u.test(between)
    || /(^|\r?\n)\s{0,3}#{1,6}\s+\S/u.test(between)
    || /(^|\r?\n)\s*\|.*\|\s*(?=\r?\n|$)/u.test(between)
    || /(^|\r?\n)\s{0,3}(?:[-*_]\s*){3,}(?=\r?\n|$)/u.test(between)
    || /(^|\r?\n)\s{0,3}(?:```+|~~~+)/u.test(between);
}

function annotateSentenceSections(text, sentences) {
  let sectionIndex = 0;
  return sentences.map((sentence, index) => {
    if (index > 0 && hasMarkdownSectionBoundaryBetween(text, sentences[index - 1], sentence)) {
      sectionIndex += 1;
    }
    return { ...sentence, structureSectionIndex: sectionIndex };
  });
}

function splitParagraphs(maskedText, sentences, blocks) {
  const paragraphs = [];

  for (const block of blocks) {
    if (!block.lintStructure) continue;
    const trimmed = trimRange(maskedText, block.start, block.end);
    if (!trimmed.text || !hasJapanese(trimmed.text) || isMostlyNumericOrSymbol(trimmed.text)) continue;

    const sentenceCount = sentences.filter(s => s.start >= trimmed.start && s.end <= trimmed.end).length;
    paragraphs.push({ ...trimmed, sentenceCount });
  }

  return paragraphs;
}

export function prepareMarkdown(text, { filePath = '<text>', ignorePatterns = [] } = {}) {
  const ignoredRanges = ignorePatternRanges(text, ignorePatterns);
  const maskedText = maskMarkdown(text, { ignoredRanges });
  const lineStarts = buildLineStarts(text);
  const structureBlocks = splitStructureBlocks(maskedText);
  const sentences = annotateSentenceSections(text, splitSentences(maskedText, structureBlocks));
  const paragraphs = splitParagraphs(maskedText, sentences, structureBlocks);
  const disableRanges = [...parseDisableRanges(text), ...ignoredRanges];
  const redactedText = maskAdditionalRanges(maskedText, disableRanges);
  return {
    filePath,
    text,
    maskedText,
    redactedText,
    lineStarts,
    sentences,
    paragraphs,
    structureBlocks,
    disableRanges,
    ignoredRanges,
  };
}
