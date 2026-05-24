import { findAll, literalAlternationRegex } from '../utils.mjs';

const patterns = [
  '今後の発展が期待される',
  '今後の展開が期待される',
  'さらなる検討が必要',
  '今後の課題である',
  '有用であると考えられる',
  '重要であると考えられる',
  '意義があると考えられる',
  '一助となる',
  '貢献することが期待される',
  '示唆を与える',
  '可能性を秘めている',
  '大きな意味を持つ',
];

export const rule = {
  id: 'empty-conclusion',
  defaultSeverity: 'warning',
  description: '成果、対象、条件、次の確認事項が読み取りにくい抽象的な総括を検出します。',
  defaultOptions: { patterns },
  suggestion: '何が分かったか、誰に関係するか、どの条件で言えるか、次に何を確認するかを補えるか確認してください。',
  run({ doc, options }) {
    const regex = literalAlternationRegex(options.patterns);
    if (!regex) return [];
    return findAll(doc.maskedText, regex).map(match => ({
      index: match.index,
      length: match[0].length,
      message: '締めの内容が抽象的です。成果、対象、条件、次の確認事項を補えるか確認してください。',
    }));
  },
};
