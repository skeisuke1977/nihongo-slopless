import { countMatches, literalAlternationRegex } from '../utils.mjs';

const buzzwords = [
  'DX', '生成AI', 'AI', 'イノベーション', 'シナジー', 'エコシステム', 'アジャイル',
  'データ駆動', 'リスキリング', 'アップスキリング', '個別最適', '主体的', '対話的',
  '深い学び', '探究', 'ウェルビーイング', 'レジリエンス', '持続可能', '社会実装',
  '高度化', '効率化', '最適化', '価値創出', '人材育成',
];

export const rule = {
  id: 'buzzword-density',
  defaultSeverity: 'info',
  description: 'バズワードや政策語が密集し、実態が見えにくい段落を検出します。',
  defaultOptions: { buzzwords, maxPerParagraph: 4 },
  suggestion: 'バズワードを、具体的な行動、対象者、成果物、評価指標に置き換えてください。',
  run({ doc, options }) {
    const regex = literalAlternationRegex(options.buzzwords);
    if (!regex) return [];
    const findings = [];
    for (const paragraph of doc.paragraphs) {
      const count = countMatches(paragraph.text, regex);
      if (count > options.maxPerParagraph) {
        findings.push({
          index: paragraph.start,
          length: Math.min(paragraph.end - paragraph.start, 80),
          message: `バズワードが密集しています（段落内${count}件）。具体的な実践・成果・評価指標を示せるか確認してください。`,
        });
      }
    }
    return findings;
  },
};
