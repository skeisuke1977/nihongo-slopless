// @nihongo-slopless/textlint-adapter-experimental
// placeholder: TODO、仮置きなど、公開前に埋めるべき明確な目印を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/placeholder.mjs) と同じ主要語彙・「ここに」専用判定を保つ。
//
// 移植時の差分メモ:
//   - textlint AST の Str ノードだけを走査し、inline code / code block は対象外にする。
//   - Markdown タスクチェックボックスとリンクラベルは、未記入欄ではない構文として除外する。

'use strict';

const DEFAULT_TERMS = Object.freeze([
  'TODO',
  'TBD',
  'FIXME',
  'XXXX',
  'xxxx',
  'XXX',
  '○○',
  '〇〇',
  '△△',
  '□□',
  '後で書く',
  '仮置き',
  'ダミー',
  '未定',
  '未入力',
  '要追記',
  '要確認',
]);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPlaceholderRegex(terms) {
  const list = (Array.isArray(terms) ? terms : [])
    .filter(term => typeof term === 'string' && term.length > 0)
    .map(term => (term === '未定' ? '未定(?!義)' : escapeRegExp(term)));
  const alternatives = [...list, '【\\s*】', '\\[\\s*\\]'];
  if (!alternatives.length) return null;
  return new RegExp(alternatives.join('|'), 'gu');
}

function sentenceBounds(text, index) {
  let start = index;
  while (start > 0 && !/[。！？!?\n\r]/u.test(text[start - 1])) start -= 1;

  let end = index;
  while (end < text.length && !/[。！？!?\n\r]/u.test(text[end])) end += 1;
  if (end < text.length) end += 1;

  return { start, end };
}

function lineBounds(text, index) {
  let start = index;
  while (start > 0 && !/[\n\r]/u.test(text[start - 1])) start -= 1;

  let end = index;
  while (end < text.length && !/[\n\r]/u.test(text[end])) end += 1;

  return { start, end };
}

function isInsideQuote(text, index, length) {
  const { start, end } = lineBounds(text, index);
  const before = text.slice(start, index);
  const after = text.slice(index + length, end);

  return [
    ['「', '」'],
    ['『', '』'],
    ['“', '”'],
    ['‘', '’'],
  ].some(([open, close]) => before.lastIndexOf(open) > before.lastIndexOf(close) && after.includes(close));
}

function isExplainedAsExample(text, index, length) {
  const { start, end } = sentenceBounds(text, index);
  const sentence = text.slice(start, end);
  const localIndex = index - start;
  const after = sentence.slice(localIndex + length);
  const hasExampleMarker =
    /(?:例|記入例|テンプレート|ひな形|サンプル|引用|表記|文字列|項目名|欄名|ラベル|プレースホルダ)/u.test(
      sentence,
    );
  const hasExplanation =
    /(?:という(?:表記|文字列|項目名|欄名|ラベル|プレースホルダ)?|と示す|と説明|として示す|として挙げる|として説明|を例示|を引用|を説明)/u.test(
      after,
    );

  return hasExampleMarker && hasExplanation;
}

function isQuotedOrExplained(text, index, length) {
  return isInsideQuote(text, index, length) || isExplainedAsExample(text, index, length);
}

function isMarkdownTaskCheckbox(text, index, length) {
  const { start, end } = lineBounds(text, index);
  const before = text.slice(start, index);
  const after = text.slice(index + length, end);
  return /^\s*(?:[-+*]|\d+[.)])\s*$/u.test(before) && /^(?:\s|$)/u.test(after);
}

function isMarkdownLinkLabel(text, index, length) {
  const segment = text.slice(index, index + length);
  if (!segment.startsWith('[') || !segment.endsWith(']')) return false;

  const after = text.slice(index + length, index + length + 256);
  return /^\([^)\n\r]*\)/u.test(after);
}

const KOKONI_COMPLETION_PATTERN =
  /^(?:(?:具体例|氏名|名前|日付|値|内容|住所|金額|時間|タイトル|題名|出典|本文)を\s*(?:書(?:く|いて|いた)|記入|入力|挿入|記述|記載|埋め)|書(?:く|いて|いた)|記入|入力|挿入|挿入する|記述|記載|埋め(?:る|て|た|込)|入れる|入れて|書き込)/u;

const KOKONI_EXISTENCE_PATTERN =
  /^(?:、|は[、，]?|[^、，。！？!?\n\r]{0,40}?(?:ある|あります|あって|あった|ない|なし|いる|います|生じ|現れ|見え|存在|残っ|残り|かか(?:る|っ)|分岐|焦点|罠|温度差|非対称|別の|問題|理由|意味|可能性|余地|背景|本質|特徴|難し|限界|危険|希望))/u;

function isPlaceholderKokoni(text, index, length) {
  const after = text.slice(index + length, index + length + 60);
  if (/^[\s　]*[、，]/u.test(after)) return false;
  if (/^[\s　]*は/u.test(after)) return false;

  const trimmedAfter = after.replace(/^[\s　「『]+/u, '');
  if (KOKONI_COMPLETION_PATTERN.test(trimmedAfter)) return true;
  if (KOKONI_EXISTENCE_PATTERN.test(trimmedAfter)) return false;
  return false;
}

module.exports = function nihongoSloplessPlaceholder(context, rawOptions) {
  const options = Object.assign({ terms: DEFAULT_TERMS.slice() }, rawOptions || {});
  const regex = buildPlaceholderRegex(options.terms);
  if (!regex) return {};

  const { Syntax, RuleError, report, getSource } = context || {};
  const StrType = (Syntax && Syntax.Str) || 'Str';
  const wholeSource = (() => {
    if (typeof getSource !== 'function') return '';
    try {
      const source = getSource();
      return typeof source === 'string' ? source : '';
    } catch {
      return '';
    }
  })();

  return {
    [StrType](node) {
      const source = (node && node.value) || '';
      if (!source) return;
      const absBase = (node && node.range && node.range[0]) || 0;
      const matches = [];

      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(source)) !== null) {
        const index = match.index;
        const length = match[0].length;
        const contextSource = wholeSource || source;
        const contextIndex = wholeSource ? absBase + index : index;

        if (isMarkdownTaskCheckbox(contextSource, contextIndex, length)) continue;
        if (isMarkdownLinkLabel(contextSource, contextIndex, length)) continue;
        if (isQuotedOrExplained(contextSource, contextIndex, length)) continue;

        matches.push({ index, length });
      }

      const kokoniRegex = /ここに/gu;
      while ((match = kokoniRegex.exec(source)) !== null) {
        const index = match.index;
        const length = match[0].length;
        const contextSource = wholeSource || source;
        const contextIndex = wholeSource ? absBase + index : index;

        if (isMarkdownTaskCheckbox(contextSource, contextIndex, length)) continue;
        if (isQuotedOrExplained(contextSource, contextIndex, length)) continue;
        if (!isPlaceholderKokoni(contextSource, contextIndex, length)) continue;

        matches.push({ index, length });
      }

      matches.sort((a, b) => a.index - b.index);

      for (const { index, length } of matches) {
        const message = '未完成のプレースホルダに見える表現です。公開前に埋めるか削除してください。';

        if (typeof RuleError === 'function' && typeof report === 'function') {
          report(node, new RuleError(message, { index }));
        } else if (context && context._fallbackFindings) {
          context._fallbackFindings.push({
            ruleId: 'nihongo-slopless/placeholder',
            severity: 'error',
            message,
            index: absBase + index,
            length,
          });
        }
      }
    },
  };
};

module.exports.meta = {
  id: 'nihongo-slopless/placeholder',
  description: 'TODO、仮置きなど、公開前に埋めるべき明確な目印を検出する。',
  defaultOptions: { terms: DEFAULT_TERMS.slice() },
};
