import { findAll } from '../utils.mjs';

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
  const hasExampleMarker = /(?:例|記入例|テンプレート|ひな形|サンプル|引用|表記|文字列|項目名|欄名|ラベル|プレースホルダ)/u.test(sentence);
  const hasExplanation = /(?:という(?:表記|文字列|項目名|欄名|ラベル|プレースホルダ)?|と示す|と説明|として示す|として挙げる|として説明|を例示|を引用|を説明)/u.test(after);

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

// 「ここに」検出: 後続に「記入・挿入を要求する動詞」が来るときだけ未完成のシグナルと見なす。
// 既出概念を指す指示詞用法（ここに〜がある／ある／生じる／現れる／見える 等）や、
// 接続的に「ここに、…」と続けるレトリック用法は除外する。
//
// 検出する完成要求語 (KOKONI_COMPLETION_PATTERN):
//   - 動詞のみ: 書く・書いて・書いた・記入・入力・挿入・埋め・記述・記載
//   - 「<名詞>を<動詞|挿入>」のパターン: 具体例を|氏名を|日付を|値を|内容を|名前を|住所を|金額を|タイトルを|題名を|出典を + 書く/記入/入力/挿入/挿入する/書いて/書いた
//
// 除外する指示詞・存在用法 (KOKONI_EXISTENCE_PATTERN):
//   - 直後 1文字以内に「、」が来る場合 (ここに、…)
//   - 「ある」「あります」「ない」「いる」「います」
//   - 「生じる」「現れる」「見える」「存在する」「残っ」「かかっ」
//   - 「焦点」「分岐点」「確認点」「認識差」「偏り」など特定名詞 (本文中の既出概念を指す表現)
//   - 助詞「は」を伴う指示詞用法 (ここには…)
const KOKONI_COMPLETION_PATTERN =
  /^(?:(?:具体例|氏名|名前|日付|値|内容|住所|金額|時間|タイトル|題名|出典|本文)を\s*(?:書(?:く|いて|いた)|記入|入力|挿入|記述|記載|埋め)|書(?:く|いて|いた)|記入|入力|挿入|挿入する|記述|記載|埋め(?:る|て|た|込)|入れる|入れて|書き込)/u;

const KOKONI_EXISTENCE_PATTERN =
  /^(?:、|は[、，]?|[^、，。！？!?\n\r]{0,40}?(?:ある|あります|あって|あった|ない|なし|いる|います|生じ|現れ|見え|存在|残っ|残り|かか(?:る|っ)|分岐|焦点|確認点|認識差|偏り|問題|理由|意味|可能性|余地|背景|本質|特徴|難し|限界|危険|希望))/u;

function isPlaceholderKokoni(text, index, length) {
  const after = text.slice(index + length, index + length + 60);
  // 接続的「ここに、…」用法はプレースホルダではない。
  if (/^[\s　]*[、，]/u.test(after)) return false;
  // 「ここには…」のような助詞用法も指示詞表現として除外。
  if (/^[\s　]*は/u.test(after)) return false;
  // 完成要求語が後続する場合だけプレースホルダとみなす。
  const trimmedAfter = after.replace(/^[\s　「『]+/u, '');
  if (KOKONI_COMPLETION_PATTERN.test(trimmedAfter)) return true;
  // 既存概念を指す存在/状態動詞が後続する場合は除外。
  if (KOKONI_EXISTENCE_PATTERN.test(trimmedAfter)) return false;
  // どちらにも当てはまらない場合は控えめに非検出 (誤検出を避ける)。
  return false;
}

export const rule = {
  id: 'placeholder',
  defaultSeverity: 'error',
  description: 'TODO、仮置き、伏せ字、未記入の痕跡を検出します。',
  defaultOptions: {},
  suggestion: '提出・公開前に具体名、日付、値、出典を埋めてください。',
  run({ doc }) {
    // 「ここに」は専用判定に分離。それ以外の一般プレースホルダトークンは従来通り。
    const generalRegex = /(?:TODO|TBD|FIXME|XXX|xxxx|XXXX|○○|〇〇|△△|□□|後で書く|仮置き|ダミー|未定|未入力|要追記|要確認|【\s*】|\[\s*\])/gu;
    const kokoniRegex = /ここに/gu;

    const generalMatches = findAll(doc.maskedText, generalRegex)
      .filter(match => !isMarkdownTaskCheckbox(doc.maskedText, match.index, match[0].length))
      .filter(match => !isMarkdownLinkLabel(doc.text, match.index, match[0].length))
      .filter(match => !isQuotedOrExplained(doc.maskedText, match.index, match[0].length));

    const kokoniMatches = findAll(doc.maskedText, kokoniRegex)
      .filter(match => !isMarkdownTaskCheckbox(doc.maskedText, match.index, match[0].length))
      .filter(match => !isQuotedOrExplained(doc.maskedText, match.index, match[0].length))
      .filter(match => isPlaceholderKokoni(doc.maskedText, match.index, match[0].length));

    return [...generalMatches, ...kokoniMatches]
      .sort((a, b) => a.index - b.index)
      .map(match => ({
        index: match.index,
        length: match[0].length,
        message: '未完成のプレースホルダに見える表現です。公開前に埋めるか削除してください。',
      }));
  },
};
