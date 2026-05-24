import { findAll, literalAlternationRegex } from '../utils.mjs';

const abstractWords = [
  '重要', '有用', '必要', '意義', '価値', '効果', '影響', '課題', '可能性', '方向性',
  '観点', '側面', '構造', '文脈', '役割', '関係', '要因', '本質', '多様', '複雑',
  '高度', '包括的', '体系的', '持続的', '実践的', '創造的', '主体的', '探究的',
];

export const rule = {
  id: 'abstract-noun-stack',
  defaultSeverity: 'warning',
  description: '抽象語が積み重なり、内容が見えにくい文を検出します。',
  defaultOptions: { abstractWords, minHits: 4 },
  suggestion: '抽象語を、観察可能な行動、数値、対象、制約条件に置き換えてください。',
  run({ doc, options }) {
    const regex = literalAlternationRegex(options.abstractWords);
    if (!regex) return [];
    const findings = [];
    for (const sentence of doc.sentences) {
      const hits = [...sentence.text.matchAll(regex)].map(m => m[0]);
      if (hits.length >= options.minHits) {
        findings.push({
          index: sentence.start,
          length: Math.min(sentence.end - sentence.start, 80),
          message: `抽象語が密集しています（${[...new Set(hits)].slice(0, 6).join('、')}）。具体例、数値、対象を足せるか確認してください。`,
        });
      }
    }
    return findings;
  },
};
