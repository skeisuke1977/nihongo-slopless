import { findAll, visibleLength } from '../utils.mjs';

export const rule = {
  id: 'nominalization-density',
  defaultSeverity: 'warning',
  description: '「〜性」「〜化」「〜的」などの名詞化・抽象化の過密を検出します。',
  defaultOptions: { minHits: 6, minChars: 60 },
  suggestion: '名詞の鎖をほどき、誰が何をするのかという動詞中心の文にしてください。',
  run({ doc, options }) {
    const regex = /[ぁ-んァ-ン一-龠々]{1,10}(?:性|化|的|感|力|度|論|観|像|性質)/gu;
    const findings = [];
    for (const sentence of doc.sentences) {
      const hits = [...sentence.text.matchAll(regex)].map(m => m[0]);
      const len = visibleLength(sentence.text);
      if (len >= options.minChars && hits.length >= options.minHits) {
        findings.push({
          index: sentence.start,
          length: Math.min(sentence.end - sentence.start, 80),
          message: `名詞化・抽象化が密集しています（${hits.slice(0, 6).join('、')}）。動詞で説明できるか確認してください。`,
        });
      }
    }
    return findings;
  },
};
