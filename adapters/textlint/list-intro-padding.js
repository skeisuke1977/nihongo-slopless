// @nihongo-slopless/textlint-adapter-experimental
// list-intro-padding: 情報量の少ない前置きやリスト導入を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/list-intro-padding.mjs) と同じ語彙・メッセージを使う。
//
// 移植時の差分メモ:
//   - standalone は doc.maskedText 全体を走査する。
//   - textlint 版は Paragraph 配下の Str ノードだけを本文として走査し、inline code は除外する。
//   - BlockQuote / CodeBlock / Table 配下に Paragraph が来る parser では、prose lint の境界として除外する。

'use strict';

const DEFAULT_PHRASES = Object.freeze([
  '以下では',
  '以下に',
  '以下のように',
  '順番に説明します',
  '整理して説明します',
  'ポイントは次のとおりです',
  '主なポイントは以下です',
  'まずはじめに',
]);

const DEFAULT_OPTIONS = Object.freeze({
  phrases: DEFAULT_PHRASES.slice(),
  defaultSeverity: 'info',
});

const MESSAGE = '前置きとして機能が薄い可能性があります。削っても意味が保てるか確認してください。';
const IGNORED_CONTAINER_TYPES = Object.freeze([
  'BlockQuote',
  'CodeBlock',
  'Table',
  'TableRow',
  'TableCell',
  'Html',
  'HtmlBlock',
  'Comment',
]);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPhraseRegex(phrases) {
  const list = (Array.isArray(phrases) ? phrases : [])
    .filter(phrase => typeof phrase === 'string' && phrase.length > 0)
    .map(escapeRegExp);
  if (list.length === 0) return null;
  return new RegExp(list.join('|'), 'gu');
}

function mergeOptions(rawOptions) {
  const override = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  return Object.assign({}, DEFAULT_OPTIONS, override);
}

module.exports = function nihongoSloplessListIntroPadding(context, rawOptions) {
  const options = mergeOptions(rawOptions);
  const regex = buildPhraseRegex(options.phrases);
  if (!regex) return {};

  const { Syntax, RuleError, report, getSource } = context || {};
  const ParagraphType = (Syntax && Syntax.Paragraph) || 'Paragraph';
  const StrType = (Syntax && Syntax.Str) || 'Str';
  const CodeType = (Syntax && Syntax.Code) || 'Code';
  let ignoredDepth = 0;

  function collectTextSegments(node, segments) {
    if (!node) return;
    if (node.type === CodeType) return;
    if (node.type === StrType) {
      const text =
        typeof node.value === 'string'
          ? node.value
          : typeof getSource === 'function'
            ? getSource(node)
            : node.raw || '';
      if (text) {
        segments.push({
          text,
          absStart: node && Array.isArray(node.range) ? node.range[0] : null,
        });
      }
      return;
    }
    for (const child of node.children || []) collectTextSegments(child, segments);
  }

  function visitParagraph(node) {
    if (ignoredDepth > 0) return;

    const absBase = (node && node.range && node.range[0]) || 0;
    const segments = [];
    collectTextSegments(node, segments);
    if (segments.length === 0) {
      const source = typeof getSource === 'function' ? getSource(node) : (node && node.raw) || '';
      if (source) segments.push({ text: source, absStart: absBase });
    }

    for (const segment of segments) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(segment.text)) !== null) {
        const segmentBase = Number.isInteger(segment.absStart) ? segment.absStart : absBase;
        const index = segmentBase - absBase + match.index;
        const length = match[0].length;

        if (typeof RuleError === 'function' && typeof report === 'function') {
          report(node, new RuleError(MESSAGE, { index }));
        } else if (context && context._fallbackFindings) {
          context._fallbackFindings.push({
            ruleId: 'nihongo-slopless/list-intro-padding',
            severity: options.defaultSeverity || 'info',
            message: MESSAGE,
            index: absBase + index,
            length,
          });
        }
      }
    }
  }

  const handlers = {
    [ParagraphType]: visitParagraph,
  };

  for (const type of IGNORED_CONTAINER_TYPES) {
    const nodeType = (Syntax && Syntax[type]) || type;
    handlers[nodeType] = () => {
      ignoredDepth += 1;
    };
    handlers[`${nodeType}:exit`] = () => {
      ignoredDepth = Math.max(0, ignoredDepth - 1);
    };
  }

  return handlers;
};

module.exports.meta = {
  id: 'nihongo-slopless/list-intro-padding',
  description: '情報量の少ない前置きやリスト導入を検出します。',
  defaultOptions: DEFAULT_OPTIONS,
};
