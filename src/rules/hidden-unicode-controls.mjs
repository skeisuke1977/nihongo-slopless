import { findAll } from '../utils.mjs';

export const rule = {
  id: 'hidden-unicode-controls',
  defaultSeverity: 'error',
  description: 'ゼロ幅文字や双方向制御文字など、見えないUnicode制御文字を検出します。',
  defaultOptions: {},
  suggestion: '意図的でなければ削除してください。',
  run({ text }) {
    const regex = /[\u200B\u200C\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu;
    return findAll(text, regex).map(match => ({
      index: match.index,
      length: match[0].length,
      message: '見えないUnicode制御文字があります。コピー由来の混入なら削除してください。',
    }));
  },
};
