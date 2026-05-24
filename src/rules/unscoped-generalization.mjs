import { findAll, patternAlternationRegex, stringList } from '../utils.mjs';

/**
 * @rule unscoped-generalization
 * @category evidence-responsibility
 * @goal 「あらゆる〜」「いかなる〜も」「どんな〜でも」「常に〜する」のような集合全体への主張で、
 *       対象集合の限定や境界条件が文中に示されていないものを観察用に取り上げる。
 * @notGoal 文学的、慣用的、定義的な総称表現を否定することではない。
 * @fixHint 対象範囲(時点、領域、対象者、条件)を本文で補えるか、断定の強さを調整できるか確認する。
 * @profiles general, business, research, public, web, agent-output, strict
 *
 * 設計メモ:
 * - `absolute-claim` は「必ず」「絶対に」「100%」など単語レベルの強い断定を扱う。
 * - 本ルールは「集合全体を主語にする」構文 (あらゆる/いかなる/どんな/常に) のうち、
 *   対象集合の限定句が文中に存在しないものを観察する。
 * - 「すべての〜」は `absolute-claim` の `すべて` と重複するため、本ルールでは扱わない。
 * - 慣用句 (あらゆる手を尽くす、いかなる場合も、常にあることだ など) は除外する。
 * - 否定文 (〜とは限らない、〜わけではない、〜成立しない) は除外する。
 * - 引用ブロックや見出し行は除外する。
 */

// 検出パターン: 集合全体への主張構文
const patterns = [
  // 「あらゆるX(は|が|を|に)」
  'あらゆる[^、。！？\\s「」『』\\(\\)（）\\[\\]【】]{1,12}(?:は|が|を|に|で|では)',
  // 「いかなるX(も|でも)」
  'いかなる[^、。！？\\s「」『』\\(\\)（）\\[\\]【】]{1,12}(?:も|でも)',
  // 「どんなX(でも|も)」
  'どんな[^、。！？\\s「」『』\\(\\)（）\\[\\]【】]{1,12}(?:でも|も)',
  // 「常にX(する|である|となる|なる|存在する|生じる|...)」 文末以外でも可
  '常に[^、。！？\\s「」『』\\(\\)（）\\[\\]【】]{0,20}(?:する|できる|である|となる|なる|存在する|生じる|起こる|発生する|行う|行われる|求められる|期待される|必要である|必要となる|可能である|可能になる)',
];

// 文中で対象範囲を限定していると判定する手掛かり(これらが同じ文にあれば除外側へ寄せる)
// 例: 「2025年以降の」「日本の」「中小企業の」「医療現場の」「特定の条件下で」
const scopeMarkerPatterns = [
  // 西暦/年号での時点限定
  '[12][0-9]{3}年(?:以降|以前|時点|度|まで|から)',
  '[0-9０-９]{1,2}世紀',
  '(?:今年度|来年度|前年度|本年度|今期|今月|現在|過去|将来|昨今|近年)(?:の|まで|以降|以前)',
  // 地域・国・分野・組織を絞る修飾
  '(?:日本|国内|海外|欧州|米国|アジア|アフリカ)の',
  '(?:中小|大手|国内|海外)?企業の',
  '(?:医療|教育|行政|金融|製造|農業|学術|報道|広告|出版)(?:現場|業界|分野|領域|機関|機構)の',
  '(?:本研究|本稿|本書|本調査|本資料|本ガイド|本マニュアル|本仕様)(?:では|において|の)',
  '(?:本節|本章|本項|本段|本パート)(?:では|において|の)',
  // 条件節
  '(?:において|における|に限り|に限って|に限定|の場合(?:に|は)|前提(?:で|では|として))',
  '特定の[^、。！？]{1,20}(?:では|において|に限)',
  '一定の(?:条件|範囲|前提)',
  // 対象者・対象物の限定
  '(?:対象者|参加者|回答者|利用者|担当者|学習者|受講者)(?:は|が|を|の)',
  '対象を[^、。！？]{1,30}に限',
  // 主体の限定
  '(?:本サービス|当社|弊社|本機関|当機構)(?:では|において|の)',
];

// 否定文(集合全体を否定する反例) → 主張ではないので除外
const negationPatterns = [
  'わけではない',
  'わけではありません',
  'とは限らない',
  'とは限りません',
  '(?:ではない|ではありません|でない)$',
  '成立しない',
  '通用しない',
  '成り立たない',
  '当てはまらない',
  '同じではない',
  '同じではありません',
];

// 慣用句や定型表現(検出対象から外す)
const idiomaticPatterns = [
  'あらゆる手(?:を尽く|だて)',
  'あらゆる角度',
  'あらゆる手段',
  'あらゆる可能性',
  'いかなる場合(?:も|においても)',
  'いかなる理由(?:があ|でも|においても)',
  '常に変わ(?:り|ら)',
  '常にそうである',
  '常にあることだ',
  '常に念頭(?:に|を)',
];

// 行コンテキスト除外(引用、見出し、表セル、コードフェンス内は対象外)
function lineContextStartAt(text, index) {
  return text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
}

function lineContextAt(text, index) {
  const start = lineContextStartAt(text, index);
  const nextNewline = text.indexOf('\n', index);
  const end = nextNewline === -1 ? text.length : nextNewline;
  return text.slice(start, end);
}

function isQuoteOrHeadingLine(line) {
  if (!line) return false;
  return /^\s{0,3}>\s?/u.test(line) || /^\s{0,3}#{1,6}\s+\S/u.test(line);
}

function hasAny(text, regexSources) {
  return regexSources.some(source => new RegExp(source, 'u').test(text));
}

export const rule = {
  id: 'unscoped-generalization',
  defaultSeverity: 'warning',
  description: '集合全体への主張で、対象範囲や条件が文中に見えない箇所を検出します。',
  defaultOptions: {
    patterns,
    scopeMarkerPatterns,
    negationPatterns,
    idiomaticPatterns,
  },
  suggestion: '対象範囲、時点、条件、対象者のいずれかを本文で補えるか、断定の強さを調整できるか確認してください。',
  run({ doc, options }) {
    const regex = patternAlternationRegex(options.patterns);
    if (!regex) return [];

    const scopeSources = stringList(options.scopeMarkerPatterns);
    const negationSources = stringList(options.negationPatterns);
    const idiomaticSources = stringList(options.idiomaticPatterns);

    const findings = [];
    const seenStarts = new Set();

    for (const match of findAll(doc.maskedText, regex)) {
      const matchText = match[0];
      if (!matchText) continue;

      // 慣用句は除外
      const matchSlice = doc.maskedText.slice(
        Math.max(0, match.index - 4),
        Math.min(doc.maskedText.length, match.index + matchText.length + 12),
      );
      if (hasAny(matchSlice, idiomaticSources)) continue;

      // 行コンテキスト: 引用・見出しは対象外
      const line = lineContextAt(doc.maskedText, match.index);
      if (isQuoteOrHeadingLine(line)) continue;

      // 文単位での判定
      const sentence = doc.sentences.find(item => match.index >= item.start && match.index < item.end);
      const sentenceText = sentence?.text ?? line;

      // 否定文は除外
      if (hasAny(sentenceText, negationSources)) continue;

      // 対象範囲の限定が文中にあれば除外
      if (hasAny(sentenceText, scopeSources)) continue;

      // 同一開始位置の重複検出を抑止
      if (seenStarts.has(match.index)) continue;
      seenStarts.add(match.index);

      findings.push({
        index: match.index,
        length: matchText.length,
        message: '集合全体への主張に見えます。対象範囲、時点、条件、対象者を本文で示せるか確認してください。',
      });
    }

    return findings;
  },
};
