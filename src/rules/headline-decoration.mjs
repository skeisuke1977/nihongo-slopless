import { findAll } from '../utils.mjs';

export const rule = {
  id: 'headline-decoration',
  defaultSeverity: 'info',
  description: '本文情報より目立つ見出し装飾を検出します。',
  defaultOptions: {},
  suggestion: '装飾記号ではなく、見出し語そのものの強さで構造を示してください。',
  run({ doc }) {
    const regex = /^(?:#{1,6}\s*)?(?:[★☆◆◇■□●◎✨🔥🚀]+\s*){2,}.+$/gmu;
    return findAll(doc.maskedText, regex).map(match => ({
      index: match.index,
      length: Math.min(match[0].length, 80),
      message: '見出し装飾が本文情報より目立つ可能性があります。媒体の目的、読者、情報構造に合うか確認してください。',
    }));
  },
};
