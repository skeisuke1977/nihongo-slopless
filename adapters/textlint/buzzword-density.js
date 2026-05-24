// @nihongo-slopless/textlint-adapter-experimental
// buzzword-density: バズワードや政策語が密集し、実践・対象・成果が見えにくい段落を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/buzzword-density.mjs) と同じ語彙・閾値・メッセージを使う。
//
// 移植時の差分メモ:
//   - standalone は doc.paragraphs を走査する。
//   - textlint 版は Paragraph ノードだけを本文段落として走査する。
//   - BlockQuote / CodeBlock / Table 配下に Paragraph が来る parser では、prose lint の境界として除外する。

'use strict';

const DEFAULT_BUZZWORDS = Object.freeze([
  'DX',
  '生成AI',
  'AI',
  'イノベーション',
  'シナジー',
  'エコシステム',
  'アジャイル',
  'データ駆動',
  'リスキリング',
  'アップスキリング',
  '個別最適',
  '主体的',
  '対話的',
  '深い学び',
  '探究',
  'ウェルビーイング',
  'レジリエンス',
  '持続可能',
  '社会実装',
  '高度化',
  '効率化',
  '最適化',
  '価値創出',
  '人材育成',
]);

const DEFAULT_OPTIONS = Object.freeze({
  buzzwords: DEFAULT_BUZZWORDS.slice(),
  maxPerParagraph: 4,
});

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

function buildBuzzwordRegex(values) {
  const list = (Array.isArray(values) ? values : [])
    .filter(value => typeof value === 'string' && value.length > 0)
    .map(escapeRegExp);
  if (list.length === 0) return null;
  return new RegExp(list.join('|'), 'gu');
}

function countMatches(text, regex) {
  regex.lastIndex = 0;
  let count = 0;
  while (regex.exec(text) !== null) count += 1;
  return count;
}

function mergeOptions(rawOptions) {
  const override = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  return Object.assign({}, DEFAULT_OPTIONS, override);
}

module.exports = function nihongoSloplessBuzzwordDensity(context, rawOptions) {
  const options = mergeOptions(rawOptions);
  const regex = buildBuzzwordRegex(options.buzzwords);
  if (!regex) return {};

  const maxPerParagraph = Number.isFinite(options.maxPerParagraph) ? options.maxPerParagraph : 4;
  const { Syntax, RuleError, report, getSource } = context || {};
  const ParagraphType = (Syntax && Syntax.Paragraph) || 'Paragraph';
  let ignoredDepth = 0;

  function visitParagraph(node) {
    if (ignoredDepth > 0) return;

    const source = typeof getSource === 'function' ? getSource(node) : (node && node.raw) || '';
    if (!source) return;

    const count = countMatches(source, regex);
    if (count <= maxPerParagraph) return;

    const message = `バズワードが密集しています（段落内${count}件）。具体的な実践・成果・評価指標を示せるか確認してください。`;
    if (typeof RuleError === 'function' && typeof report === 'function') {
      report(node, new RuleError(message, { index: 0 }));
    } else if (context && context._fallbackFindings) {
      const absBase = (node && node.range && node.range[0]) || 0;
      context._fallbackFindings.push({
        ruleId: 'nihongo-slopless/buzzword-density',
        severity: 'info',
        message,
        index: absBase,
        length: Math.min(source.length, 80),
      });
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
  id: 'nihongo-slopless/buzzword-density',
  description: 'バズワードや政策語の密集を検出します。',
  defaultOptions: DEFAULT_OPTIONS,
};
