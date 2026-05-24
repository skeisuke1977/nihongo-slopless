// @nihongo-slopless/textlint-adapter-experimental
// actorless-action: 主体や期限が見えにくい対応・検討表現を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/actorless-action.mjs) と同じ語彙・メッセージを使う。
//
// 移植時の差分メモ(2026-05-21 P7 Agent N3):
//   - standalone は doc.sentences を文書全体で走査する。
//   - textlint 版は Paragraph ノード単位で文分割し、その文内で主体・期限・
//     外部資料の方向性紹介を判定する。
//   - 隣接 Paragraph をまたぐ主体・期限の補完は行わない。
//   - BlockQuote / CodeBlock / Table / HtmlBlock / Comment は既存 adapter と同様に除外する。

'use strict';

const DEFAULT_ACTION_PATTERNS = Object.freeze([
  '(?:検討|対応|調整|改善|推進)(?:する|していく)必要がある',
  '(?:検討|対応|調整|改善|推進)(?:が|を)?求められる',
  '(?:検討|対応|調整|改善|見直し)を(?:進める|進めていく|図る|行う)',
  '(?:見直す|改善する|対応する|調整する|検討する)こととする',
]);

const DEFAULT_OWNER_TERMS = Object.freeze([
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
]);

const DEFAULT_DEADLINE_PATTERN = '(?:[0-9０-９]{1,2}月[0-9０-９]{0,2}日?|[0-9０-９]{1,2}日|[0-9０-９]{4}年|[0-9０-９]{1,2}営業日|[0-9０-９]{1,2}日以内|今日|明日|翌日|来週|来月|次回|今年度|年度内|上旬|中旬|下旬|期限|期日|までに|まで|以内)';

const DEFAULT_CONTEXT_EXCLUSIONS = Object.freeze([
  '本稿では',
  '本研究では',
  '本報告では',
  '本資料では',
  '本記事では',
]);

const DEFAULT_REPORTED_DIRECTION_SOURCE_TERMS = Object.freeze([
  '同じ資料',
  '同資料',
  '引用元資料',
  '他資料',
  '別資料',
  '資料',
  '報告書',
  '文献',
  '原文',
]);

const DEFAULT_OPTIONS = Object.freeze({
  actionPatterns: DEFAULT_ACTION_PATTERNS.slice(),
  ownerTerms: DEFAULT_OWNER_TERMS.slice(),
  deadlinePattern: DEFAULT_DEADLINE_PATTERN,
  contextExclusions: DEFAULT_CONTEXT_EXCLUSIONS.slice(),
  reportedDirectionSourceTerms: DEFAULT_REPORTED_DIRECTION_SOURCE_TERMS.slice(),
  minChars: 12,
  defaultSeverity: 'warning',
});

const MESSAGE = '行動の主体や期限が見えにくい対応表現です。誰が、いつまでに、どの基準で対応するかを補えるか確認してください。';

const IGNORED_CONTAINER_TYPES = Object.freeze([
  'BlockQuote',
  'CodeBlock',
  'Table',
  'TableRow',
  'TableCell',
  'Html',
  'HtmlBlock',
  'Comment',
]);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stringList(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(value => typeof value === 'string' && value.length > 0);
}

function buildActionRegex(patterns) {
  const source = stringList(patterns).join('|');
  if (!source) return null;
  try {
    return new RegExp(source, 'gu');
  } catch {
    return null;
  }
}

function buildRegex(source) {
  if (typeof source !== 'string' || source.length === 0) return null;
  try {
    return new RegExp(source, 'u');
  } catch {
    return null;
  }
}

function splitSentences(text) {
  const result = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?') {
      result.push({ text: text.slice(start, i + 1), start, end: i + 1 });
      start = i + 1;
    }
  }
  if (start < text.length) {
    const tail = text.slice(start);
    if (tail.trim().length > 0) result.push({ text: tail, start, end: text.length });
  }
  return result;
}

function hasExplicitOwner(text, terms) {
  const directTerms = stringList(terms).map(escapeRegExp).join('|');
  const roleOwner = /[一-龠A-Za-z0-9０-９]{1,16}(?:部|課|係|室|局|委員会|チーム|担当者|担当|教員|職員|事務局|自治体|学校|会社)(?:は|が|で|として|により|から)/u;
  if (!directTerms) return roleOwner.test(text);
  const directOwner = new RegExp(`(?:${directTerms})(?:は|が|で|として|により|から)`, 'u');
  return directOwner.test(text) || roleOwner.test(text);
}

function hasDeadline(text, pattern) {
  const regex = buildRegex(pattern);
  return Boolean(regex && regex.test(text));
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

function mergeOptions(rawOptions) {
  const override = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  return Object.assign({}, DEFAULT_OPTIONS, override);
}

module.exports = function nihongoSloplessActorlessAction(context, rawOptions) {
  const options = mergeOptions(rawOptions);
  const actionRegex = buildActionRegex(options.actionPatterns);
  if (!actionRegex) return {};

  const { Syntax, RuleError, report, getSource } = context || {};
  const ParagraphType = (Syntax && Syntax.Paragraph) || 'Paragraph';
  let ignoredDepth = 0;

  function visitParagraph(node) {
    if (ignoredDepth > 0) return;

    const source = typeof getSource === 'function' ? getSource(node) : (node && node.raw) || '';
    if (!source) return;

    const absBase = (node && node.range && node.range[0]) || 0;

    for (const sentence of splitSentences(source)) {
      if (sentence.text.replace(/\s+/g, '').length < options.minChars) continue;
      if (hasContextExclusion(sentence.text, options.contextExclusions)) continue;

      const ownerVisible = hasExplicitOwner(sentence.text, options.ownerTerms);
      const deadlineVisible = hasDeadline(sentence.text, options.deadlinePattern);
      if (ownerVisible && deadlineVisible) continue;

      actionRegex.lastIndex = 0;
      let match;
      while ((match = actionRegex.exec(sentence.text)) !== null) {
        if (
          isReportedDirectionIntroduction(
            sentence.text,
            match.index,
            match[0].length,
            options.reportedDirectionSourceTerms,
          )
        ) {
          if (actionRegex.lastIndex === match.index) actionRegex.lastIndex += 1;
          continue;
        }

        const index = sentence.start + match.index;
        if (typeof RuleError === 'function' && typeof report === 'function') {
          report(node, new RuleError(MESSAGE, { index }));
        } else if (context && context._fallbackFindings) {
          context._fallbackFindings.push({
            ruleId: 'nihongo-slopless/actorless-action',
            severity: options.defaultSeverity || 'warning',
            message: MESSAGE,
            index: absBase + index,
            length: match[0].length,
          });
        }
        if (actionRegex.lastIndex === match.index) actionRegex.lastIndex += 1;
      }
    }
  }

  const handlers = {
    [ParagraphType]: visitParagraph,
  };

  for (const type of IGNORED_CONTAINER_TYPES) {
    const nodeType = (Syntax && Syntax[type]) || type;
    handlers[nodeType] = () => {
      ignoredDepth += 1;
    };
    handlers[`${nodeType}:exit`] = () => {
      ignoredDepth = Math.max(0, ignoredDepth - 1);
    };
  }

  return handlers;
};

module.exports.meta = {
  id: 'nihongo-slopless/actorless-action',
  description: '主体や期限が見えにくい対応・検討表現を検出します。',
  defaultOptions: DEFAULT_OPTIONS,
};
