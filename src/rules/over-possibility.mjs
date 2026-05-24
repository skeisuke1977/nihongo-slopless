import { countMatches, literalAlternationRegex, stringList, visibleLength } from '../utils.mjs';

// 推測・可能性をぼかす表現の一覧。
// thin-sentence は「具体性のない文単独」、weasel-phrases は「責任のぼかし語の総合」、
// over-possibility は段落単位の「推測の連鎖」だけを切り出して観察する。
const possibilityPhrases = [
  '可能性がある',
  '可能性が高い',
  'の可能性',
  'かもしれない',
  'と思われる',
  'とみられる',
  'と考えられる',
  'だろう',
  'であろう',
  'ではないか',
  'ことがある',
];

// メタ言及。段落自体が「可能性表現について語っている」場合は累積として扱わない。
const metaPhraseRegex = /(可能性を網羅|可能性を列挙|考えられるケース|可能性表現|可能性語|可能性のリスト|可能性の一覧)/u;

// 「読んだことがある」のような経験表現は、推測のぼかしとは別物なので除外する。
// 一方で「遅れることがある」は発生可能性を示すため数える。
const possibilityKotoGaAruRegex = /(?<![ただ])ことがある/gu;

function buildPossibilityRegexes(phrases) {
  const values = stringList(phrases);
  const literalPhrases = values.filter(phrase => phrase !== 'ことがある');
  return {
    literalRegex: literalAlternationRegex(literalPhrases),
    kotoGaAruRegex: values.includes('ことがある') ? possibilityKotoGaAruRegex : null,
  };
}

function countPossibilityMatches(text, regexes) {
  return (
    (regexes.literalRegex ? countMatches(text, regexes.literalRegex) : 0)
    + (regexes.kotoGaAruRegex ? countMatches(text, regexes.kotoGaAruRegex) : 0)
  );
}

export const rule = {
  id: 'over-possibility',
  defaultSeverity: 'warning',
  description: '段落内で推測表現が反復し、責任のぼかしが累積している箇所を検出します。',
  defaultOptions: {
    possibilityPhrases,
    maxPerParagraph: 2,
    minParagraphChars: 100,
  },
  suggestion: '推測表現自体は問題ありませんが、段落全体で何が確からしく、何が未確定なのかを区別できるか確認してください。',
  run({ doc, options }) {
    const regexes = buildPossibilityRegexes(options.possibilityPhrases ?? possibilityPhrases);
    if (!regexes.literalRegex && !regexes.kotoGaAruRegex) return [];

    const findings = [];

    for (const paragraph of doc.paragraphs) {
      const len = visibleLength(paragraph.text);
      if (len < options.minParagraphChars) continue;
      // 引用ブロックは観察対象としない。引用元の責任を読み手に委ねる。
      if (paragraph.text.startsWith('>')) continue;
      // メタ言及(本ルール解説や設計文書)を除外。
      if (metaPhraseRegex.test(paragraph.text)) continue;

      const count = countPossibilityMatches(paragraph.text, regexes);
      if (count > options.maxPerParagraph) {
        findings.push({
          index: paragraph.start,
          length: Math.min(paragraph.end - paragraph.start, 80),
          message: `推測表現が段落内で${count}回重なっています。確からしい点と未確定の点を区別できるか確認してください。`,
        });
      }
    }

    return findings;
  },
};
