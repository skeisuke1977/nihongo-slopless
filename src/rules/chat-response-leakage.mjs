import { findAll, literalAlternationRegex } from '../utils.mjs';

const phrases = [
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
];

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
  const hasExampleMarker = /(?:例|文例|回答例|記入例|テンプレート|ひな形|サンプル|引用|表記|文字列|フレーズ|言い回し)/u.test(sentence);
  const hasExplanation = /(?:という(?:表現|文字列|フレーズ|言い回し)?|と示す|と説明|として示す|として挙げる|として説明|から始まる|で始まる|を例示|を引用|を説明)/u.test(after);

  return hasExampleMarker && hasExplanation;
}

function isQuotedOrExplained(text, index, length) {
  return isInsideQuote(text, index, length) || isExplainedAsExample(text, index, length);
}

export const rule = {
  id: 'chat-response-leakage',
  defaultSeverity: 'warning',
  description: 'チャット応答としては自然でも、独立文書に残ると弱く見える表現を検出します。',
  defaultOptions: { phrases },
  suggestion: '文書の本文として必要な情報だけを残し、対話上の前置きや締めを削ってください。',
  run({ doc, options }) {
    const regex = literalAlternationRegex(options.phrases);
    if (!regex) return [];
    return findAll(doc.maskedText, regex)
      .filter(match => !isQuotedOrExplained(doc.maskedText, match.index, match[0].length))
      .map(match => ({
        index: match.index,
        length: match[0].length,
        message: 'チャット応答由来に見える表現です。独立した文書なら削るか、本文の役割を明確にしてください。',
      }));
  },
};
