// @nihongo-slopless/textlint-adapter-experimental
// chat-response-leakage: チャット応答に由来する前置きや締めの定型句が、独立文書に
// 残っている箇所を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/chat-response-leakage.mjs) と一致する語彙・除外規則を保つ。
//
// 移植時の差分メモ:
//   - standalone は doc.maskedText (コード/HTML コメント/URL をマスク済み) に対して
//     正規表現を当てる。textlint は AST visitor で各 Str に到達するため、Str.value
//     と node.range を使えば自然にコード断片を素通りできる。
//   - 「『承知しました』という表現」のような引用・例示文脈は、standalone と同じ
//     ヒューリスティック (引用記号の挟み込み / 例示マーカーと説明動詞の同居) で除外する。

'use strict';

const DEFAULT_PHRASES = Object.freeze([
  '承知しました',
  'もちろんです',
  '以下に示します',
  '以下にまとめます',
  'ご希望であれば',
  '必要でしたら',
  'いかがでしょうか',
  'お役に立てれば幸いです',
  '参考になれば幸いです',
  '何かあれば',
  'お気軽にお知らせください',
  '結論から言うと',
]);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPhraseRegex(phrases) {
  const list = (Array.isArray(phrases) ? phrases : [])
    .filter((p) => typeof p === 'string' && p.length > 0)
    .map(escapeRegExp);
  if (!list.length) return null;
  return new RegExp(list.join('|'), 'gu');
}

// standalone と同義の文・行境界算出。
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
  ].some(
    ([open, close]) =>
      before.lastIndexOf(open) > before.lastIndexOf(close) && after.includes(close),
  );
}

function isExplainedAsExample(text, index, length) {
  const { start, end } = sentenceBounds(text, index);
  const sentence = text.slice(start, end);
  const localIndex = index - start;
  const after = sentence.slice(localIndex + length);
  const hasExampleMarker = /(?:例|文例|回答例|記入例|テンプレート|ひな形|サンプル|引用|表記|文字列|フレーズ|言い回し)/u.test(
    sentence,
  );
  const hasExplanation = /(?:という(?:表現|文字列|フレーズ|言い回し)?|と示す|と説明|として示す|として挙げる|として説明|から始まる|で始まる|を例示|を引用|を説明)/u.test(
    after,
  );
  return hasExampleMarker && hasExplanation;
}

function isQuotedOrExplained(text, index, length) {
  return isInsideQuote(text, index, length) || isExplainedAsExample(text, index, length);
}

module.exports = function nihongoSloplessChatResponseLeakage(context, rawOptions) {
  const options = Object.assign(
    { phrases: DEFAULT_PHRASES.slice() },
    rawOptions || {},
  );
  const regex = buildPhraseRegex(options.phrases);
  if (!regex) return {};

  const { Syntax, RuleError, report } = context || {};
  const StrType = (Syntax && Syntax.Str) || 'Str';

  return {
    [StrType](node) {
      // textlint の Str ノードは Code/CodeBlock/InlineCode を通常含まない。
      // ここでは余計なマスキングをせず、node.value をそのまま検査する。
      const source = (node && node.value) || '';
      if (!source) return;

      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(source)) !== null) {
        const index = match.index;
        const length = match[0].length;

        if (isQuotedOrExplained(source, index, length)) continue;

        const message =
          'チャット応答由来に見える表現です。独立した文書なら削るか、本文の役割を明確にしてください。';

        if (typeof RuleError === 'function' && typeof report === 'function') {
          const error = new RuleError(message, { index });
          report(node, error);
        } else if (context && context._fallbackFindings) {
          const absBase = (node && node.range && node.range[0]) || 0;
          context._fallbackFindings.push({
            ruleId: 'nihongo-slopless/chat-response-leakage',
            severity: 'warning',
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
  id: 'nihongo-slopless/chat-response-leakage',
  description:
    'チャット応答としては自然でも、独立文書に残ると弱く見える定型表現を検出する。',
  defaultOptions: { phrases: DEFAULT_PHRASES.slice() },
};
