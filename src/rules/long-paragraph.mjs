import { stripInlineUrls, visibleLength } from '../utils.mjs';

// A sentence "counts" toward paragraph weight only if it carries prose load.
// - Pure citation anchors like `[Source](https://...)` strip
//   to an empty/very short fragment and should not inflate the sentence count.
// - Unterminated lead-ins to a following list/code block (e.g.
//   「なので今後は、議論が「スピード」だけでなく、」) end without a Japanese
//   sentence terminator and are structural connectors, not standalone claims.
// Both cases are filtered here without touching prepareMarkdown so that other
// rules (same-ending, repeated-connectors, long-sentence) keep their existing
// view of doc.sentences.
const SENTENCE_TERMINATORS = /[。！？!?][」』”’）)\]】〉》]*\s*$/u;
const MIN_PROSE_VISIBLE_CHARS = 5;

function isCountableSentence(sentence) {
  const proseText = stripInlineUrls(sentence.text).trim();
  if (visibleLength(proseText) < MIN_PROSE_VISIBLE_CHARS) return false;
  if (!SENTENCE_TERMINATORS.test(proseText)) return false;
  return true;
}

export const rule = {
  id: 'long-paragraph',
  defaultSeverity: 'warning',
  description: '長すぎる段落を検出します。引用リンクや次の箇条書きへの渡し文は重み計算から除外し、本文の負荷だけで判定します。',
  defaultOptions: { maxChars: 420, maxSentences: 5 },
  suggestion: '段落の役割を1つに絞り、主張・根拠・例・含意を分けてください。',
  run({ doc, options }) {
    const findings = [];
    for (const paragraph of doc.paragraphs) {
      const proseText = stripInlineUrls(paragraph.text);
      const proseLen = visibleLength(proseText);

      const paragraphSentences = doc.sentences.filter(
        s => s.start >= paragraph.start && s.end <= paragraph.end,
      );
      const countableSentences = paragraphSentences.filter(isCountableSentence).length;

      if (proseLen > options.maxChars || countableSentences > options.maxSentences) {
        findings.push({
          index: paragraph.start,
          length: Math.min(paragraph.end - paragraph.start, 80),
          message: `段落が重くなっています（${proseLen}字、${countableSentences}文）。読み手のために分割を検討してください。`,
        });
      }
    }
    return findings;
  },
};
