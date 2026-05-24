import { findAll, countMatches } from '../utils.mjs';

export const rule = {
  id: 'excessive-politeness',
  defaultSeverity: 'warning',
  description: '丁寧表現・謙譲表現の重なりで、主体、行動、依頼内容が読み取りにくい箇所を検出します。',
  defaultOptions: { maxSasetePerParagraph: 2 },
  suggestion: '敬語の必要性を保ちつつ、誰が何をするのか、何を依頼しているのかを補えるか確認してください。',
  run({ doc, options }) {
    const findings = [];
    for (const paragraph of doc.paragraphs) {
      const count = countMatches(paragraph.text, /させていただ|でございます|ございます/u);
      if (count > options.maxSasetePerParagraph) {
        findings.push({
          index: paragraph.start,
          length: Math.min(paragraph.end - paragraph.start, 80),
          message: `丁寧表現が密集しています（段落内${count}件）。主体、行動、依頼内容が読み取りにくくなっていないか確認してください。`,
        });
      }
    }

    for (const match of findAll(doc.maskedText, /させていただくこととなりました|させていただきたく存じます/gu)) {
      findings.push({
        index: match.index,
        length: match[0].length,
        message: '敬語が重なり、行動が見えにくくなっています。主体や依頼内容も読み取りにくくないか確認してください。',
      });
    }
    return findings;
  },
};
