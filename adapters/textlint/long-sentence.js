// @nihongo-slopless/textlint-adapter-experimental
// long-sentence: 1文の可視長を測り、110字超で warning、170字超で error として報告する。
//
// これは「試作品」です。npm publish を目的としていません。
// nihongo-slopless の standalone CLI (src/rules/long-sentence.mjs) と挙動を揃えるための
// textlint ルール形式の参照実装です。
//
// 移植時の差分メモ:
//   - standalone は Markdown を独自にマスキングしてから sentenceBounds を切る。
//   - textlint は AST 木を Document → Paragraph → Str ... と渡してくれるので、
//     Paragraph 単位で getSource() してから「。！？!?」で分割する。
//   - URL 計測対象外: standalone の stripInlineUrls と同じ正規表現を再現する。
//   - 110/170 字の閾値、可視長計算 (空白を除外) を一致させる。

'use strict';

const DEFAULT_OPTIONS = Object.freeze({
  maxChars: 110,
  errorChars: 170,
});

// standalone 側 src/utils.mjs の visibleLength と同義。
function visibleLength(text) {
  if (typeof text !== 'string' || !text) return 0;
  return text.replace(/\s+/g, '').length;
}

// standalone 側 src/utils.mjs の stripInlineUrls と同義。
// URL は読み手の負荷ではないため長さ計測から除外する。
function stripInlineUrls(text) {
  if (typeof text !== 'string' || !text) return '';
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\[[^\]]+\]\([^)]*\)/gu, '')
    .replace(/<https?:\/\/[^>\s]+>/gu, '')
    .replace(/https?:\/\/[^\s<>"'）)\]」』】〉》]+/gu, '');
}

// 文末記号での雑な分割。textlint AST には文単位のノードが無いため、
// Paragraph の getSource() / node.raw を取得してから自前で割る。
// standalone 側の splitSentencesInRange と挙動を完全には一致させない (試作)。
function splitSentences(text) {
  const sentences = [];
  if (typeof text !== 'string' || !text) return sentences;
  const closeChars = /[」』”’）\)\]】〉》]/u;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/[。！？!?]/u.test(ch)) {
      let end = i + 1;
      while (end < text.length && closeChars.test(text[end])) end += 1;
      const slice = text.slice(start, end);
      const trimmed = slice.trim();
      if (trimmed) {
        const leading = slice.length - slice.replace(/^\s+/u, '').length;
        sentences.push({
          text: trimmed,
          relStart: start + leading,
          relEnd: end,
        });
      }
      start = end;
      i = end - 1;
    }
  }
  // 末尾に句点が無い断片は捨てる (standalone の rest 判定と簡易に近づける)。
  return sentences;
}

// textlint の慣習に従ったルールエントリ。
// 本物の textlint context が与えられた場合は context.Syntax を使い分けるが、
// オフライン試作のためここでは "Paragraph" 文字列でフォールバックする。
module.exports = function nihongoSloplessLongSentence(context, rawOptions) {
  const options = Object.assign({}, DEFAULT_OPTIONS, rawOptions || {});
  const { Syntax, RuleError, report, getSource } = context || {};
  const ParagraphType = (Syntax && Syntax.Paragraph) || 'Paragraph';

  return {
    [ParagraphType](node) {
      // textlint は node.raw / getSource(node) で原文断片を返す。
      const source = typeof getSource === 'function' ? getSource(node) : (node && node.raw) || '';
      if (!source) return;
      const absBase = (node && node.range && node.range[0]) || 0;

      for (const sentence of splitSentences(source)) {
        const proseText = stripInlineUrls(sentence.text);
        const len = visibleLength(proseText);
        if (len <= options.maxChars) continue;

        const severity = len > options.errorChars ? 'error' : 'warning';
        const message = `1文が長すぎます（${len}字）。複数の論点を分けられるか確認してください。`;

        // textlint の RuleError は { line, column, padding } または index 指定が可能。
        // ここでは node.loc を起点に sentence の相対位置を加える形を示す。
        if (typeof RuleError === 'function' && typeof report === 'function') {
          const error = new RuleError(message, {
            index: sentence.relStart,
            // textlint v12 以降のメタ拡張 (severity) はバージョン依存。
            // 試作のため標準フィールドのみを使う。
          });
          // severity は textlint の rule 側からは設定できないため、メッセージで補足する。
          report(node, error);
        } else {
          // standalone モード用フォールバック (Node から直接 require した時など)
          if (!context || !context._fallbackFindings) return;
          context._fallbackFindings.push({
            ruleId: 'nihongo-slopless/long-sentence',
            severity,
            message,
            index: absBase + sentence.relStart,
            length: Math.min(sentence.relEnd - sentence.relStart, 80),
          });
        }
      }
    },
  };
};

// 試験用にメタ情報を露出する (本物の textlint パッケージでは不要)。
module.exports.meta = {
  id: 'nihongo-slopless/long-sentence',
  description:
    '長すぎる文を検出する。URL や引用リンクは読み手の負荷ではないため、長さ計測から除外する。',
  defaultOptions: DEFAULT_OPTIONS,
};
