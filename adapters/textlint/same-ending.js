// @nihongo-slopless/textlint-adapter-experimental
// same-ending: 同じ文末 (です/ます/である/だ/た,ない) が連続したリズム固定を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/same-ending.mjs) と同じく既定 consecutive = 4 で連続を判定する。
//
// 移植時の差分メモ:
//   - standalone は src/markdown.mjs で見出し・表・コードフェンス・空行を sectionIndex に
//     畳み込み、sentence.structureSectionIndex の比較で「節境界」を判定する。
//   - textlint AST では、節境界となる node.type を素直に列挙する方が自然なので、
//     Heading, BlockQuote, CodeBlock, HorizontalRule, Table を見たら streak をリセットする。
//   - 段落 (Paragraph) を continuous な本文として扱い、Paragraph 内で文末を切る。
//   - 連続するリスト内の項目は、standalone と同じく streak の対象として残す。
//   - 文末分類は src/utils.mjs の sentenceEnding と完全に一致させる。

'use strict';

const DEFAULT_OPTIONS = Object.freeze({
  consecutive: 4,
});

// standalone 側 src/utils.mjs の sentenceEnding と同義。
function sentenceEnding(sentenceText) {
  const text = (sentenceText || '').trim();
  if (!text) return '';
  if (/(です|でした|でしょう|ですか)[。！？!?”"』）\)]*$/u.test(text)) return 'です';
  if (/(ます|ました|ません|ましょう)[。！？!?”"』）\)]*$/u.test(text)) return 'ます';
  if (/(である|であった|であろう)[。！？!?”"』）\)]*$/u.test(text)) return 'である';
  if (/(だ|だった|だろう)[。！？!?”"』）\)]*$/u.test(text)) return 'だ';
  if (/(た|ない)[。！？!?”"』）\)]*$/u.test(text)) return 'た/ない';
  return '';
}

function splitSentences(text) {
  const sentences = [];
  if (typeof text !== 'string' || !text) return sentences;
  const closeChars = /[」』”’）\)\]】〉》]/u;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/[。！？!?]/u.test(text[i])) {
      let end = i + 1;
      while (end < text.length && closeChars.test(text[end])) end += 1;
      const slice = text.slice(start, end);
      const trimmed = slice.trim();
      if (trimmed) {
        const leading = slice.length - slice.replace(/^\s+/u, '').length;
        sentences.push({ text: trimmed, relStart: start + leading, relEnd: end });
      }
      start = end;
      i = end - 1;
    }
  }
  return sentences;
}

function sentenceSourceStart(sentence) {
  return sentence.absStart;
}

function sentenceSourceEnd(sentence) {
  return sentence.absEnd;
}

function streakSource(wholeSource, streak) {
  if (!wholeSource || streak.length === 0) {
    return streak.map(sentence => sentence.text).join('\n');
  }
  return wholeSource.slice(sentenceSourceStart(streak[0]), sentenceSourceEnd(streak[streak.length - 1]));
}

function previousNonBlankLine(wholeSource, streak) {
  if (!wholeSource || streak.length === 0) return '';
  const before = wholeSource.slice(0, sentenceSourceStart(streak[0]));
  const lines = before.split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^(?:[-+*]|\d+[.)])$/u.test(line));
  return lines[lines.length - 1] || '';
}

function countPattern(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function hasMarkdownListLines(source, streakLength) {
  const listLines = source.split(/\r?\n/u)
    .filter(line => line.trim())
    .filter(line => /^\s*(?:[-+*]|\d+[.)])\s+\S/u.test(line));
  return listLines.length >= Math.ceil(streakLength / 2);
}

function isListStreak(wholeSource, streak) {
  return streak.length > 0
    && (streak.every(sentence => sentence.isList) || hasMarkdownListLines(streakSource(wholeSource, streak), streak.length));
}

function hasRepeatedListLabels(source, streakLength) {
  const labelledLines = source.split(/\r?\n/u)
    .filter(line => line.trim())
    .filter(line => /^\s*(?:(?:[-+*]|\d+[.)])\s+)?(?:`[^`]+`|[A-Za-z][A-Za-z0-9_-]*|[\p{Script=Han}ぁ-んァ-ンA-Za-z0-9_-]{1,24})\s*[:：]/u.test(line));
  return labelledLines.length >= streakLength;
}

function hasSpecCue(text) {
  return /(?:仕様|設定|形式|manifest|profile|schema|JSON|CLI|API|EOF|コードフェンス|コメント|無視|入力|出力|各行|ルールID|finding\.index)/u.test(text);
}

function isStructuralListRepetition(wholeSource, streak) {
  if (!isListStreak(wholeSource, streak)) return false;

  const source = streakSource(wholeSource, streak);
  const intro = previousNonBlankLine(wholeSource, streak);
  const codeRefCount = countPattern(source, /`[^`]+`/gu);
  const updateIntro = /(?:直近で改善したもの|[0-9]{4}-[0-9]{2}-[0-9]{2}\s*の改善|更新履歴|変更履歴|修正履歴|改善|リリースノート)[:：]?\s*$/u.test(intro);
  const exampleIntro = /(?:望ましい表現|避けたい表現|検出例|検出しない例|修正例|例示)[:：]\s*$/u.test(intro);

  if (exampleIntro) return true;
  if (updateIntro && codeRefCount >= Math.ceil(streak.length / 2)) return true;
  return hasRepeatedListLabels(source, streak.length) && hasSpecCue(`${intro}\n${source}`);
}

function isSpecificationParagraphRepetition(wholeSource, streak) {
  if (!streak.every(sentence => !sentence.isList)) return false;

  const source = streakSource(wholeSource, streak);
  const codeRefCount = countPattern(source, /`[^`]+`/gu);
  const proceduralSpec = /(?:対象にします|無視しません|扱いません|固定します|持たせます|分けます|保存します|返します|抑制され得ます)/u.test(source);
  return codeRefCount >= 3 && hasSpecCue(source) && proceduralSpec;
}

function shouldSuppressStructuralRepetition(wholeSource, streak) {
  return isStructuralListRepetition(wholeSource, streak)
    || isSpecificationParagraphRepetition(wholeSource, streak);
}

// textlint AST で「節境界」とみなすノード種別。standalone 側の
// shouldLintStructure を裏返した集合に近い。
const BOUNDARY_NODE_TYPES = new Set([
  'Header',
  'Heading',
  'HorizontalRule',
  'CodeBlock',
  'Table',
  'TableRow',
  'TableCell',
  'BlockQuote',
  'Html',
  'HtmlBlock',
  'Comment',
]);

module.exports = function nihongoSloplessSameEnding(context, rawOptions) {
  const options = Object.assign({}, DEFAULT_OPTIONS, rawOptions || {});
  const { Syntax, RuleError, report, getSource } = context || {};
  const ParagraphType = (Syntax && Syntax.Paragraph) || 'Paragraph';
  const DocumentType = (Syntax && Syntax.Document) || 'Document';
  const ListType = (Syntax && Syntax.List) || 'List';
  const ListItemType = (Syntax && Syntax.ListItem) || 'ListItem';
  const wholeSource = (() => {
    if (typeof getSource !== 'function') return '';
    try {
      const source = getSource();
      return typeof source === 'string' ? source : '';
    } catch {
      return '';
    }
  })();

  // streak は Document を貫いて保持し、節境界となるノードが現れた時点でフラッシュする。
  // textlint の Markdown AST は ListItem の内側に Paragraph を持つため、ListItem と Paragraph の
  // 両方を消費すると同じ文を二重カウントする。本文消費は Paragraph だけに寄せる。
  const state = {
    streak: [],
    current: '',
    previousProseEnd: null,
    listDepth: 0,
  };

  function flush(node) {
    if (state.current && state.streak.length >= options.consecutive) {
      const first = state.streak[0];
      const last = state.streak[state.streak.length - 1];
      if (!shouldSuppressStructuralRepetition(wholeSource, state.streak)) {
        const message =
          `「${state.current}」調の文末が${state.streak.length}文連続しています。意図したリズムか確認してください。`;
        if (typeof RuleError === 'function' && typeof report === 'function') {
          const error = new RuleError(message, {
            index: first.relStart,
          });
          report(first.node || node, error);
        } else if (context && context._fallbackFindings) {
          context._fallbackFindings.push({
            ruleId: 'nihongo-slopless/same-ending',
            severity: 'info',
            message,
            index: first.absStart,
            length: Math.min(last.absEnd - first.absStart, 80),
          });
        }
      }
    }
    state.streak = [];
    state.current = '';
  }

  function resetAtBoundary(node) {
    flush(node);
    state.previousProseEnd =
      node && Array.isArray(node.range) && Number.isInteger(node.range[1]) ? node.range[1] : null;
  }

  function hasBlankSectionBoundaryBefore(absBase) {
    if (!Number.isInteger(state.previousProseEnd)) return false;
    if (!Number.isInteger(absBase) || absBase <= state.previousProseEnd) return false;

    if (wholeSource) {
      return /\r?\n\s*\r?\n/u.test(wholeSource.slice(state.previousProseEnd, absBase));
    }

    // getSource() 全体取得が無い textlint 互換環境向けの保守的フォールバック。
    // LF/CRLF 1 改行のリスト連続は維持し、明らかな複数改行だけを節境界として扱う。
    return absBase > state.previousProseEnd + 2;
  }

  function consumeProseNode(node) {
    const source = typeof getSource === 'function' ? getSource(node) : (node && node.raw) || '';
    if (!source) return;
    // textlint の node.range は [start, end] の絶対オフセット。
    const absBase = (node && node.range && node.range[0]) || 0;
    if (hasBlankSectionBoundaryBefore(absBase)) flush(node);

    for (const sentence of splitSentences(source)) {
      const ending = sentenceEnding(sentence.text);
      if (ending && ending === state.current) {
        state.streak.push({
          node,
          relStart: sentence.relStart,
          relEnd: sentence.relEnd,
          absStart: absBase + sentence.relStart,
          absEnd: absBase + sentence.relEnd,
          text: sentence.text,
          isList: state.listDepth > 0,
        });
      } else {
        flush(node);
        state.current = ending;
        state.streak = ending
          ? [
              {
                node,
                relStart: sentence.relStart,
                relEnd: sentence.relEnd,
                absStart: absBase + sentence.relStart,
                absEnd: absBase + sentence.relEnd,
                text: sentence.text,
                isList: state.listDepth > 0,
              },
            ]
          : [];
      }
    }
    state.previousProseEnd =
      node && Array.isArray(node.range) && Number.isInteger(node.range[1])
        ? node.range[1]
        : absBase + source.length;
  }

  const handlers = {
    [ParagraphType]: consumeProseNode,
    [ListType]() {
      state.listDepth += 1;
    },
    [`${ListType}:exit`]() {
      state.listDepth = Math.max(0, state.listDepth - 1);
    },
    [ListItemType]() {
      state.listDepth += 1;
    },
    [`${ListItemType}:exit`]() {
      state.listDepth = Math.max(0, state.listDepth - 1);
    },
  };

  // 節境界となる型は visitor を渡して streak をリセットする。
  for (const type of BOUNDARY_NODE_TYPES) {
    handlers[type] = resetAtBoundary;
  }

  // Document の visit 終わりに最後の streak をフラッシュする。
  // textlint v12 以降は `<Type>:exit` を取れるので、その想定で文字列を組み立てる。
  handlers[`${DocumentType}:exit`] = (node) => flush(node);

  return handlers;
};

module.exports.meta = {
  id: 'nihongo-slopless/same-ending',
  description: '同じ文末が連続し、読みのリズムが固定されている箇所を検出する。',
  defaultOptions: DEFAULT_OPTIONS,
};
