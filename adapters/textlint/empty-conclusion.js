// @nihongo-slopless/textlint-adapter-experimental
// empty-conclusion: 成果、対象、条件、次の確認事項が読み取りにくい抽象的な総括を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/empty-conclusion.mjs) と同じ語彙・メッセージを使う。
//
// 移植時の差分メモ:
//   - standalone は doc.maskedText 全体を走査する。
//   - textlint 版は Paragraph ノードだけを本文段落として走査する。
//   - BlockQuote / CodeBlock / Table 配下に Paragraph が来る parser では、prose lint の境界として除外する。

'use strict';

const DEFAULT_PATTERNS = Object.freeze([
  '今後の発展が期待される',
  '今後の展開が期待される',
  'さらなる検討が必要',
  '今後の課題である',
  '有用であると考えられる',
  '重要であると考えられる',
  '意義があると考えられる',
  '一助となる',
  '貢献することが期待される',
  '示唆を与える',
  '可能性を秘めている',
  '大きな意味を持つ',
]);

const DEFAULT_OPTIONS = Object.freeze({
  patterns: DEFAULT_PATTERNS.slice(),
  defaultSeverity: 'warning',
});

const MESSAGE = '締めの内容が抽象的です。成果、対象、条件、次の確認事項を補えるか確認してください。';
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

function buildPatternRegex(patterns) {
  const list = (Array.isArray(patterns) ? patterns : [])
    .filter(pattern => typeof pattern === 'string' && pattern.length > 0)
    .map(escapeRegExp);
  if (list.length === 0) return null;
  return new RegExp(list.join('|'), 'gu');
}

function mergeOptions(rawOptions) {
  const override = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  return Object.assign({}, DEFAULT_OPTIONS, override);
}

module.exports = function nihongoSloplessEmptyConclusion(context, rawOptions) {
  const options = mergeOptions(rawOptions);
  const regex = buildPatternRegex(options.patterns);
  if (!regex) return {};

  const { Syntax, RuleError, report, getSource } = context || {};
  const ParagraphType = (Syntax && Syntax.Paragraph) || 'Paragraph';
  let ignoredDepth = 0;

  function visitParagraph(node) {
    if (ignoredDepth > 0) return;

    const source = typeof getSource === 'function' ? getSource(node) : (node && node.raw) || '';
    if (!source) return;

    const absBase = (node && node.range && node.range[0]) || 0;
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(source)) !== null) {
      const index = match.index;
      const length = match[0].length;

      if (typeof RuleError === 'function' && typeof report === 'function') {
        report(node, new RuleError(MESSAGE, { index }));
      } else if (context && context._fallbackFindings) {
        context._fallbackFindings.push({
          ruleId: 'nihongo-slopless/empty-conclusion',
          severity: options.defaultSeverity || 'warning',
          message: MESSAGE,
          index: absBase + index,
          length,
        });
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
  id: 'nihongo-slopless/empty-conclusion',
  description: '成果、対象、条件、次の確認事項が読み取りにくい抽象的な総括を検出します。',
  defaultOptions: DEFAULT_OPTIONS,
};
