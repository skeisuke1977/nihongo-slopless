const RANGE_LITERAL = 0;
const RANGE_TRANSPARENT = 1;
const RANGE_HIDDEN = 2;
const RANGE_OPAQUE = 3;

function clampOffset(value, length) {
  const number = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(0, Math.min(length, number));
}

function isEscaped(text, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function setRange(kinds, start, end, kind, { overwrite = false } = {}) {
  const from = clampOffset(start, kinds.length);
  const to = clampOffset(end, kinds.length);
  for (let index = from; index < to; index += 1) {
    if (overwrite || kinds[index] === RANGE_LITERAL) kinds[index] = kind;
  }
}

function protectLiteralRanges(text, protectedOffsets) {
  for (const match of text.matchAll(/<[^>\n]{0,8192}>/gu)) {
    setRange(protectedOffsets, match.index, match.index + match[0].length, 1, { overwrite: true });
  }
  for (let index = 0; index < text.length; index += 1) {
    if (!/[*_~\[\]()]/u.test(text[index]) || !isEscaped(text, index)) continue;
    const delimiter = text[index];
    let end = index + 1;
    if (/[*_~]/u.test(delimiter)) {
      while (end < text.length && text[end] === delimiter) end += 1;
    }
    setRange(protectedOffsets, index, end, 1, { overwrite: true });
  }
  for (const match of text.matchAll(/^(?: {0,3})(?:\*{3,}|_{3,}|-{3,})[ \t]*$/gmu)) {
    setRange(protectedOffsets, match.index, match.index + match[0].length, 1, { overwrite: true });
  }
}

function collectInlinePresentationRanges(text, kinds) {
  const protectedOffsets = new Uint8Array(text.length);
  protectLiteralRanges(text, protectedOffsets);

  // Inline links are deliberately bounded to the supported, non-nested form.
  // The visible label remains prose; its delimiters are transparent and the
  // destination (including parentheses) is hidden but bridgeable.
  for (const match of text.matchAll(/\[([^\]\n]{1,4096})\]\(([^)\n]{0,8192})\)/gu)) {
    const start = match.index;
    const labelEnd = start + 1 + match[1].length;
    const end = start + match[0].length;
    let protectedRange = false;
    for (let index = start; index < end; index += 1) {
      if (protectedOffsets[index] || kinds[index] === RANGE_OPAQUE) {
        protectedRange = true;
        break;
      }
    }
    if (protectedRange) continue;
    setRange(kinds, start, start + 1, RANGE_TRANSPARENT);
    setRange(kinds, labelEnd, labelEnd + 1, RANGE_TRANSPARENT);
    setRange(kinds, labelEnd + 1, end, RANGE_HIDDEN);
  }

  const presentationText = text.split('');
  for (let index = 0; index < kinds.length; index += 1) {
    if (kinds[index] === RANGE_HIDDEN) presentationText[index] = '\uFFFC';
  }
  const textForPresentation = presentationText.join('');

  const delimiterPatterns = [
    /\*\*(?=\S)([^\n]{0,4095}?\S)\*\*/gu,
    /(?<![A-Za-z0-9_])__(?=\S)([^\n]{0,4095}?\S)__(?![A-Za-z0-9_])/gu,
    /~~(?=\S)([^\n]{0,4095}?\S)~~/gu,
    /\*(?=\S)([^*\n]{0,4095}?\S)\*/gu,
    /(?<![A-Za-z0-9_])_(?=\S)([^_\n]{0,4095}?\S)_(?![A-Za-z0-9_])/gu,
  ];

  for (const regex of delimiterPatterns) {
    for (const match of textForPresentation.matchAll(regex)) {
      const delimiterLength = match[0].startsWith('**') || match[0].startsWith('__') || match[0].startsWith('~~') ? 2 : 1;
      const start = match.index;
      const end = start + match[0].length;
      if (isEscaped(text, start)) continue;
      let protectedRange = false;
      for (let index = start; index < end; index += 1) {
        if (protectedOffsets[index] || kinds[index] === RANGE_OPAQUE) {
          protectedRange = true;
          break;
        }
      }
      if (protectedRange) continue;
      setRange(kinds, start, start + delimiterLength, RANGE_TRANSPARENT);
      setRange(kinds, end - delimiterLength, end, RANGE_TRANSPARENT);
    }
  }
}

function createView(originalText, kinds, position, options, direction) {
  const maxViewChars = Math.max(0, Math.trunc(options.maxViewChars ?? 32));
  const boundary = direction === 'before'
    ? clampOffset(options.minSourceOffset ?? 0, originalText.length)
    : clampOffset(options.maxSourceOffset ?? originalText.length, originalText.length);
  const origin = clampOffset(position, originalText.length);
  const chars = [];
  const offsets = [];
  let cursor = origin;
  let stopReason = null;

  const startsInsideHidden = direction === 'after'
    ? origin < originalText.length && kinds[origin] === RANGE_HIDDEN
    : origin > 0 && kinds[origin - 1] === RANGE_HIDDEN && kinds[origin] === RANGE_HIDDEN;
  if (startsInsideHidden) stopReason = 'opaque-barrier';

  const atBoundary = () => direction === 'before' ? cursor <= boundary : cursor >= boundary;
  const nextIndex = () => direction === 'before' ? cursor - 1 : cursor;
  const advance = () => { cursor += direction === 'before' ? -1 : 1; };

  while (true) {
    // Boundary wins when it coincides with the compact-view limit.
    if (atBoundary()) {
      stopReason = 'source-boundary';
      break;
    }
    if (stopReason) break;
    const index = nextIndex();
    if (index < 0 || index >= originalText.length) {
      stopReason = 'source-boundary';
      break;
    }
    if (kinds[index] === RANGE_OPAQUE) {
      stopReason = 'opaque-barrier';
      break;
    }

    if (kinds[index] === RANGE_LITERAL) {
      if (chars.length >= maxViewChars) {
        stopReason = 'max-view-chars';
        break;
      }
      if (direction === 'before') {
        chars.unshift(originalText[index]);
        offsets.unshift(index);
      } else {
        chars.push(originalText[index]);
        offsets.push(index);
      }
    }
    // Transparent and hidden bridgeable ranges contribute no view character.
    advance();
  }

  const complete = stopReason === 'source-boundary';
  const sourceStart = direction === 'before' ? cursor : origin;
  const sourceEnd = direction === 'before' ? origin : cursor;
  const sourceOffsets = Object.freeze(offsets);

  return Object.freeze({
    text: chars.join(''),
    sourceOffsets,
    originalOffsetAt(viewOffset) {
      if (!Number.isInteger(viewOffset) || viewOffset < 0 || viewOffset >= sourceOffsets.length) return null;
      return sourceOffsets[viewOffset];
    },
    originalRange(viewStart, viewEnd) {
      const start = clampOffset(Number.isFinite(viewStart) ? viewStart : 0, sourceOffsets.length);
      const end = clampOffset(Number.isFinite(viewEnd) ? Math.max(start, viewEnd) : sourceOffsets.length, sourceOffsets.length);
      if (start === end) {
        const offset = start < sourceOffsets.length ? sourceOffsets[start] : sourceEnd;
        return { start: offset, end: offset };
      }
      return { start: sourceOffsets[start], end: sourceOffsets[end - 1] + 1 };
    },
    complete,
    reachedSourceBoundary: complete,
    stopReason,
    sourceStart,
    sourceEnd,
  });
}

export function createMarkdownAdjacency(originalText, { opaqueRanges = [] } = {}) {
  const kinds = new Uint8Array(originalText.length);
  for (const range of opaqueRanges) {
    if (!range) continue;
    setRange(kinds, range.start, range.end, RANGE_OPAQUE, { overwrite: true });
  }
  collectInlinePresentationRanges(originalText, kinds);

  return Object.freeze({
    before(position, options = {}) {
      return createView(originalText, kinds, position, options, 'before');
    },
    after(position, options = {}) {
      return createView(originalText, kinds, position, options, 'after');
    },
  });
}
