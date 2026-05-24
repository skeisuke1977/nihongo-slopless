import { escapeRegExp, patternAlternationRegex, stringList } from '../utils.mjs';

const actionPatterns = [
  '(?:検討|対応|調整|改善|推進)(?:する|していく)必要がある',
  '(?:検討|対応|調整|改善|推進)(?:が|を)?求められる',
  '(?:検討|対応|調整|改善|見直し)を(?:進める|進めていく|図る|行う)',
  '(?:見直す|改善する|対応する|調整する|検討する)こととする',
];

const ownerTerms = [
  '市',
  '区',
  '町',
  '村',
  '県',
  '国',
  '自治体',
  '学校',
  '本校',
  '本学',
  '大学',
  '当社',
  '弊社',
  '会社',
  '営業部',
  '広報担当',
  '担当部署',
  '関係部署',
  '担当者',
  '担当教員',
  '教員',
  '事務局',
  '委員会',
  '研究チーム',
  'チーム',
  '運営',
  '管理者',
  '開発者',
  '窓口',
  '職員',
];

const deadlinePattern = '(?:[0-9０-９]{1,2}月[0-9０-９]{0,2}日?|[0-9０-９]{1,2}日|[0-9０-９]{4}年|[0-9０-９]{1,2}営業日|[0-9０-９]{1,2}日以内|今日|明日|翌日|来週|来月|次回|今年度|年度内|上旬|中旬|下旬|期限|期日|までに|まで|以内)';

const contextExclusions = [
  '本稿では',
  '本研究では',
  '本報告では',
  '本資料では',
  '本記事では',
];

const reportedDirectionSourceTerms = [
  '同じ資料',
  '同資料',
  '引用元資料',
  '他資料',
  '別資料',
  '資料',
  '報告書',
  '文献',
  '原文',
];

function hasExplicitOwner(text, terms) {
  const directTerms = stringList(terms).map(escapeRegExp).join('|');
  const roleOwner = /[一-龠A-Za-z0-9０-９]{1,16}(?:部|課|係|室|局|委員会|チーム|担当者|担当|教員|職員|事務局|自治体|学校|会社)(?:は|が|で|として|により|から)/u;
  if (!directTerms) return roleOwner.test(text);
  const directOwner = new RegExp(`(?:${directTerms})(?:は|が|で|として|により|から)`, 'u');
  return directOwner.test(text) || roleOwner.test(text);
}

function hasDeadline(text, pattern) {
  return typeof pattern === 'string' && pattern.length > 0 && new RegExp(pattern, 'u').test(text);
}

function hasContextExclusion(text, exclusions) {
  return stringList(exclusions).some(item => text.includes(item));
}

function isReportedDirectionIntroduction(text, matchIndex, matchLength, sourceTerms) {
  const sourcePattern = stringList(sourceTerms).map(escapeRegExp).join('|');
  if (!sourcePattern) return false;

  const before = text.slice(0, matchIndex);
  const after = text.slice(matchIndex + matchLength);
  const hasSourceBefore = new RegExp(`(?:${sourcePattern})(?:で|では|には|にも|によると)`, 'u').test(before);
  if (!hasSourceBefore) return false;

  return /^[^。！？\n]{0,40}[、,]\s*という方向性(?:も|が|は)?書かれて(?:います|いる|いました|いた)/u.test(after);
}

export const rule = {
  id: 'actorless-action',
  defaultSeverity: 'warning',
  description: '主体や期限が見えにくい対応・検討表現を検出します。',
  defaultOptions: {
    actionPatterns,
    ownerTerms,
    deadlinePattern,
    contextExclusions,
    reportedDirectionSourceTerms,
    minChars: 12,
  },
  suggestion: '誰が、いつまでに、どの基準で対応するのかを補えるか確認してください。',
  run({ doc, options }) {
    const regex = patternAlternationRegex(options.actionPatterns);
    if (!regex) return [];
    const findings = [];

    for (const sentence of doc.sentences) {
      if (sentence.text.replace(/\s+/g, '').length < options.minChars) continue;
      if (hasContextExclusion(sentence.text, options.contextExclusions)) continue;
      const ownerVisible = hasExplicitOwner(sentence.text, options.ownerTerms);
      const deadlineVisible = hasDeadline(sentence.text, options.deadlinePattern);
      if (ownerVisible && deadlineVisible) continue;

      for (const match of sentence.text.matchAll(regex)) {
        if (
          isReportedDirectionIntroduction(
            sentence.text,
            match.index,
            match[0].length,
            options.reportedDirectionSourceTerms,
          )
        ) {
          continue;
        }

        findings.push({
          index: sentence.start + match.index,
          length: match[0].length,
          message: '行動の主体や期限が見えにくい対応表現です。誰が、いつまでに、どの基準で対応するかを補えるか確認してください。',
        });
      }
    }

    return findings;
  },
};
