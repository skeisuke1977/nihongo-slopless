import { findAll, literalAlternationRegex } from '../utils.mjs';

const phrases = [
  '以下では',
  '以下に',
  '以下のように',
  '順番に説明します',
  '整理して説明します',
  'ポイントは次のとおりです',
  '主なポイントは以下です',
  'まずはじめに',
];

export const rule = {
  id: 'list-intro-padding',
  defaultSeverity: 'info',
  description: '情報量の少ない前置きやリスト導入を検出します。',
  defaultOptions: { phrases },
  suggestion: '見出しや箇条書きが続くなら、前置きを削って本文から始められないか確認してください。',
  run({ doc, options }) {
    const regex = literalAlternationRegex(options.phrases);
    if (!regex) return [];
    return findAll(doc.maskedText, regex).map(match => ({
      index: match.index,
      length: match[0].length,
      message: '前置きとして機能が薄い可能性があります。削っても意味が保てるか確認してください。',
    }));
  },
};
