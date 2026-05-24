import { findAll, countMatches, literalAlternationRegex } from '../utils.mjs';

const directPatterns = [
  'であるところの',
  'することができる',
  'ということができる',
  'ところである',
];

const densityPatterns = [
  'において',
  'に関して',
  'に関する',
  '観点から',
  '踏まえて',
  '伴って',
  'ということ',
  'ものである',
];

export const rule = {
  id: 'translationese',
  defaultSeverity: 'info',
  description: '文が重くなりやすい表現を検出します。',
  defaultOptions: { directPatterns, densityPatterns, maxPerParagraph: 4 },
  suggestion: '短く言えるか、動詞を直接使えるか、読者に必要な精度かを確認してください。',
  run({ doc, options }) {
    const findings = [];
    const direct = literalAlternationRegex(options.directPatterns);
    if (direct) {
      for (const match of findAll(doc.maskedText, direct)) {
        findings.push({
          index: match.index,
          length: match[0].length,
          message: '文が重くなりやすい表現です。より直接的に書けるか確認してください。',
        });
      }
    }

    const density = literalAlternationRegex(options.densityPatterns);
    if (density) {
      for (const paragraph of doc.paragraphs) {
        const count = countMatches(paragraph.text, density);
        if (count > options.maxPerParagraph) {
          findings.push({
            index: paragraph.start,
            length: Math.min(paragraph.end - paragraph.start, 80),
            message: `文が重くなりやすい表現が段落内に多くあります（段落内${count}件）。簡潔化を検討してください。`,
          });
        }
      }
    }
    return findings;
  },
};
