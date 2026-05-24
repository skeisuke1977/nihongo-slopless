// @nihongo-slopless/textlint-adapter-experimental
// excessive-parentheses: 段落内の括弧補足の過密を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/excessive-parentheses.mjs) と同じ正規表現・閾値・メッセージを使う。
//
// 移植時の差分メモ:
//   - standalone は doc.paragraphs を走査する。
//   - textlint 版は Paragraph ノードだけを本文段落として走査する。
//   - BlockQuote / CodeBlock / Table 配下に Paragraph が来る parser では、prose lint の境界として除外する。

'use strict';

const DEFAULT_GLOSSARY_PATTERNS = Object.freeze([
  // 略号 (ABC, OMO, IMC, ISO-9001 など)
  '^[A-Z][A-Z0-9][A-Z0-9\\-\\s]{0,18}$',
  // 英単語・英短句 (approval record, Annual Review, Notice of Update など)
  '^[A-Za-z][A-Za-z0-9][A-Za-z0-9\\s\\-]{0,48}$',
  // 略号と英単語の混合 (Section 403, Docket No. RM26-4-000 など)
  '^[A-Za-z][A-Za-z0-9\\s\\.\\-]{0,8}\\s*[0-9０-９][0-9０-９\\-]*$',
  // 英数字＋ハイフンの短いコード (RM26-4-000, ISO-9001 など)
  '^[A-Za-z0-9][A-Za-z0-9\\-]{2,15}$',
  // カタカナ語のみ／+ASCII短語 (データセンター, AIデータセンター等 など)
  '^(?:AI\\s*)?[ァ-ヶー・]{1,20}(?:\\s*等|\\s*など)?$',
  // 数値・桁・単位の繰り返し (20MW, 60日, 11月14日, 2026年4月30日, 2025年10月23日 など)
  '^[＞><≥≤]?\\s*(?:[0-9０-９]+(?:\\s*(?:年|月|日|時間|分|秒|円|MW|kW|GW|MWh|kWh|GWh|％|%|[MGKmgk]?[WBＷｗHz]))?)+$',
  // 数値 + 短い和語 (403条, 5件, 上位3件 など)
  '^[0-9０-９]+(?:条|項|号|件|個|本|名|人|社|回|章|節|段|位)$',
  // (1) (2) (a) (b) や (i) (ii) のような列挙ラベル
  '^[0-9０-９a-zａ-ｚⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]{1,3}$',
]);

const DEFAULT_OPTIONS = Object.freeze({
  maxEffectivePairsPerParagraph: 4,
  maxTotalPairsPerParagraph: 9,
  minDensePairsPerParagraph: 5,
  minEffectivePairsInDenseParagraph: 3,
  glossaryParenPattern: DEFAULT_GLOSSARY_PATTERNS.slice(),
  maxGlossaryInnerLength: 25,
  maxPairsPerParagraph: null,
});

// 括弧の直前にこのいずれかが直接来ていれば、glossary 寄せの強い信号とする。
const GLOSSARY_PREFIX_HINT = /[A-Za-z0-9）)]$/u;
const PAREN_REGEX = /[（(]([^）)]{1,80})[）)]/gu;
const MESSAGE_PREFIX = '括弧補足が多すぎる可能性があります';
const MESSAGE_SUFFIX = '本文構造で整理できるか確認してください。';
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

function buildGlossaryRegex(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  const sources = patterns.filter(value => typeof value === 'string' && value.length > 0);
  if (sources.length === 0) return null;
  try {
    return new RegExp(`(?:${sources.join('|')})`, 'u');
  } catch {
    return null;
  }
}

function classifyParen({ inner, prefixChar, glossaryRegex, maxGlossaryInnerLength }) {
  const trimmed = inner.trim();
  if (!trimmed) return 'glossary';
  if (glossaryRegex && glossaryRegex.test(trimmed)) return 'glossary';
  if (prefixChar && GLOSSARY_PREFIX_HINT.test(prefixChar) && trimmed.length <= maxGlossaryInnerLength) {
    return 'glossary';
  }
  return 'effective';
}

function mergeOptions(rawOptions) {
  const override = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  return Object.assign({}, DEFAULT_OPTIONS, override);
}

module.exports = function nihongoSloplessExcessiveParentheses(context, rawOptions) {
  const options = mergeOptions(rawOptions);
  const glossaryRegex = buildGlossaryRegex(options.glossaryParenPattern);
  const effectiveLimit = Number.isFinite(options.maxPairsPerParagraph)
    ? options.maxPairsPerParagraph
    : options.maxEffectivePairsPerParagraph;
  const totalLimit = options.maxTotalPairsPerParagraph;
  const densePairsFloor = Number.isFinite(options.minDensePairsPerParagraph)
    ? options.minDensePairsPerParagraph
    : 5;
  const denseEffectiveFloor = Number.isFinite(options.minEffectivePairsInDenseParagraph)
    ? options.minEffectivePairsInDenseParagraph
    : 3;
  const maxGlossaryInnerLength = Number.isFinite(options.maxGlossaryInnerLength)
    ? options.maxGlossaryInnerLength
    : 25;

  const { Syntax, RuleError, report, getSource } = context || {};
  const ParagraphType = (Syntax && Syntax.Paragraph) || 'Paragraph';
  let ignoredDepth = 0;

  function visitParagraph(node) {
    if (ignoredDepth > 0) return;

    const source = typeof getSource === 'function' ? getSource(node) : (node && node.raw) || '';
    if (!source) return;

    let total = 0;
    let effective = 0;
    PAREN_REGEX.lastIndex = 0;
    let match;
    while ((match = PAREN_REGEX.exec(source)) !== null) {
      total += 1;
      const prefixChar = match.index > 0 ? source[match.index - 1] : '';
      const kind = classifyParen({
        inner: match[1],
        prefixChar,
        glossaryRegex,
        maxGlossaryInnerLength,
      });
      if (kind === 'effective') effective += 1;
    }
    if (total === 0) return;

    const overEffective = Number.isFinite(effectiveLimit) && effective > effectiveLimit;
    const overTotal = Number.isFinite(totalLimit) && total > totalLimit && effective > 0;
    const overDenseMixed =
      Number.isFinite(densePairsFloor) &&
      Number.isFinite(denseEffectiveFloor) &&
      total >= densePairsFloor &&
      effective >= denseEffectiveFloor;
    if (!overEffective && !overTotal && !overDenseMixed) return;

    const reason =
      overEffective && overTotal
        ? `実質補足が${effective}組、総${total}組`
        : overEffective
          ? `実質補足が${effective}組（総${total}組）`
          : overTotal
            ? `総${total}組（うち実質補足${effective}組）`
            : `総${total}組のうち実質補足が${effective}組`;
    const message = `${MESSAGE_PREFIX}（${reason}）。${MESSAGE_SUFFIX}`;

    if (typeof RuleError === 'function' && typeof report === 'function') {
      report(node, new RuleError(message, { index: 0 }));
    } else if (context && context._fallbackFindings) {
      const absBase = (node && node.range && node.range[0]) || 0;
      context._fallbackFindings.push({
        ruleId: 'nihongo-slopless/excessive-parentheses',
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
  id: 'nihongo-slopless/excessive-parentheses',
  description: '括弧補足の過密を検出します。',
  defaultOptions: DEFAULT_OPTIONS,
};
