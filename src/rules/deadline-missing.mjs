// 期限のない対応表現を検出するルール。
// VISION.md と ROADMAP.md v0.5「期限のない対応表現」に対応。
//
// 設計の意図:
// - 対応・検討・推進などの行動述語は、責任ある主張なら「いつまでに」を伴うはず。
// - actorless-action は「主体と期限の両方が見えにくい」状態を「主体寄り」に見るが、
//   本ルールはあえて「期限の不在」だけにフォーカスする。両方欠けていれば
//   両ルールが指摘するが、情報的に有用 (主体は書いてあるが期限がない場合は
//   本ルールだけが出る、など) なので棲み分けが成り立つ。
// - 編集行動につながるように、メッセージは「いつまでに完了するかを補えるか」と
//   観察語で書く。断罪はしない。
//
// 誤検出を抑える条件:
// - 引用ブロック内の文 (他者主張のラベル)
// - 否定形 (対応しない、検討しない、進めない、推進しない など)
// - マイルストーンが代替期限として示されている文 (Phase 2 完了時、リリース時)
// - 文長 minSentenceChars 未満の短文 (文脈不足、行動述語だけの言い切り)
// - 能力説明・重要性評価・文書自己説明など、期限つき対応要求ではない文

import { stringList } from '../utils.mjs';

// 検出対象となる対応・行動述語のパターン。
// 各パターンは「(述語語幹)(語形変化を含む末尾)」の形にする。
const actionPredicates = [
  // 「対応する」「対応していく」「対応する予定」など
  '対応(?:する|していく|する予定|していく予定)',
  // 「検討する」など。「再検討」「要検討」も含む。
  '(?:再|要)?検討(?:する|していく|する予定|していく予定)',
  // 「推進する」など
  '推進(?:する|していく|する予定|していく予定)',
  // 「実施する」など
  '実施(?:する|していく|する予定|していく予定)',
  // 「取り組む」「取り組んでいく」など。送り仮名揺れに耐えるため「取組」も含む。
  '取(?:り組|組)(?:む|んでいく|む予定|んでいく予定)',
  // 「進める」「進めていく」など。連用形「進め」では拾わず終止/連体形だけ拾う。
  '進め(?:る|ていく|る予定|ていく予定)',
  // 「強化する」など
  '強化(?:する|していく|する予定|していく予定)',
  // 「改善する」など
  '改善(?:する|していく|する予定|していく予定)',
  // 「改革する」など
  '改革(?:する|していく|する予定|していく予定)',
  // 「整備する」など
  '整備(?:する|していく|する予定|していく予定)',
  // 「拡充する」など
  '拡充(?:する|していく|する予定|していく予定)',
];

// 期限・時点を示す表現の語彙。これらが文内にあれば「期限が見えている」と扱う。
// 副作用: 厳密でない時点 (「今後」「当面」など) も期限とみなすため、抽象的な
// 時点表現を残しがちな文を見逃す。これは weasel-phrases や actorless-action 側で拾う。
const deadlinePatterns = [
  // 数値 + 単位 + (まで|以内|中|頃) 系
  '[0-9０-９]{1,4}(?:年|月|日|週|期|四半期|半期)(?:まで|以内|中|頃|末)',
  // 年度名・期名 + 時点
  '(?:今年度|来年度|本年度|前年度|本年|来期|次期|当期|今期|前期)(?:まで|中|内|末|以降)',
  // 西暦年単独 + 時点 (2024年度末、2025年中 など)
  '(?:202[0-9]|203[0-9])(?:年)?(?:まで|中|内|末|以降|度末|度中)',
  // 季節 + 時点 (季節単独は名詞化することがあるため、必ず時点語を要求する)
  '(?:春|夏|秋|冬)(?:まで|以降|から|中|頃)',
  // 年末・月末・週末などの締まり時点
  '(?:年明け|年度末|年度内|月内|月末|週内|週末|年内|年初|月初|期末|期首)',
  // 期間レンジ語 (副詞用法を含む)
  '(?:短期|中期|長期|早期|速やか|至急|当面|今後|直近|近日|まもなく|早急)(?:に|的に)?',
  // 直近の相対時間
  '(?:来週|来月|来年|今週|今月|翌週|翌月|翌年|本日|明日|明後日|今日|今年)',
  // 「上旬/中旬/下旬」も時期指定
  '(?:上旬|中旬|下旬)',
  // 「期限」「期日」「締切」「目処」「目途」「メド」の語そのもの
  '(?:期限|期日|締切|締め切り|目処|目途|メド|めど)',
  // 「Phase X」「フェーズ X」「v1.0」のようなマイルストーン名 + 時点
  '(?:Phase|フェーズ|phase|Stage|ステージ|v|V)\\s?[0-9]+(?:\\.[0-9]+)?(?:\\s?(?:完了|リリース|時|まで|以降|の段階で))?',
  // 「マイルストーン」「リリース」「ローンチ」「公開」など、期限の代替となる節目語。
  '(?:マイルストーン|リリース|ローンチ|公開|施行|施策開始|完了時|終了時)(?:まで|時|以降|から|に)',
];

// 否定の検出用パターン (述語の直後 / 述語末尾の置換)。
// 例: 「対応しない」「検討しません」「推進していない」「進めなかった」
const negationPatterns = [
  '(?:ない|ません|なかった|ませんでした|ぬ|ず|ていない|ていません)',
];

// 文書の扱う範囲を述べる自己説明は、期限つき対応要求ではなく構成説明として扱う。
const contextExclusions = [
  '本稿では',
  '本研究では',
  '本報告では',
  '本資料では',
  '本記事では',
];

// 日本語のインライン引用括弧「...」または二重鉤括弧『...』の内側にいるかを判定する。
// 開き括弧と閉じ括弧の数を比較し、開きの方が多ければ括弧の内側とみなす。
// 文書本体の主張ではなく、他者発話・例示語の列挙として扱うために使う。
function isInsideJapaneseInlineQuote(text, matchIndex) {
  const before = text.slice(0, matchIndex);
  const openSingle = (before.match(/「/gu) || []).length;
  const closeSingle = (before.match(/」/gu) || []).length;
  const openDouble = (before.match(/『/gu) || []).length;
  const closeDouble = (before.match(/』/gu) || []).length;
  return openSingle > closeSingle || openDouble > closeDouble;
}

// 文全体で除外する文脈。読点で区切った「、という方向性」は、外部資料の
// 文言紹介として扱い、本文自身の対応要求とは分ける。
const sentenceExclusionPatterns = [
  '、という(?:方向性|方針)(?:も)?(?:が|は)?(?:書かれて|記載されて|示されて)(?:います|いる|いました|いた)',
];

// 行動述語の直後に続く、対応要求ではない補語。
// 例: 改善することができる / 進めることが重要である / 整備する方針です
// 「ためのN」「ためには」は構造補助節(目的・条件節)であって主節の対応要求ではない。
const actionSuffixExclusionPatterns = [
  'ことができる',
  'こと(?:が|は)(?:重要|必要|有効|有益|適切|望ましい|可能)(?:である|です)?',
  '(?:方針|方向性)(?:です|である)',
  'ため(?:の|に)',
];

// 「進める」の目的語が抽象成果だけの場合は、期限不足ではなく
// buzzword-density / thin-sentence 側の責務に寄せる。
const abstractProgressObjects = [
  '価値創出',
  '業務の効率化',
];

// 教材・チュートリアルの締めで「学習を進めていく中で」と読者の
// 学習過程を述べる箇所は、期限つきタスク対応ではない。
const learningProgressBeforePatterns = [
  '(?:これから|この先)?\\s*学習',
];

const learningProgressAfterPatterns = [
  '(?:中|過程|うえ|上|際)で',
];

const learningProgressContextPatterns = [
  '(?:これから|この先|解説|記事|章|教材|チュートリアル|レッスン|ガイド|テスト|演習|理解)',
];

// 技術文書では「対応する」が「問い合わせ・課題に対処する」ではなく、
// 仕様・リソース・イベントなどの対応関係や互換性を表すことがある。
const technicalCorrespondenceBeforePatterns = [
  '(?:規格|仕様|標準|バージョン|API|リソース|ワークロードリソース|インスタンス|static\\s*Pod|Pod|コンテナ|メソッド|プロパティ)',
];

const technicalCorrespondenceAfterPatterns = [
  '(?:すべての|全ての)?(?:アプリケーション|コントローラー|イベント|リソース|オブジェクト|メソッド|プロパティ|コンポーネント|要素)',
  '\\{\\{<',
  '`',
  '[A-Za-z][A-Za-z0-9_-]*',
];

// 引用ブロックは sentence.structureKind === 'quote' で判定する。
// マークダウン側で既に分類済みのメタを使い、本ルールでは正規表現を持たない。

function buildSourceUnion(values) {
  const source = stringList(values).join('|');
  return source || null;
}

function hasContextExclusion(text, exclusions) {
  return stringList(exclusions).some(item => text.includes(item));
}

function buildAnchoredRegex(values, suffix = '', prefix = '') {
  const source = buildSourceUnion(values);
  return source ? new RegExp(`${prefix}(?:${source})${suffix}`, 'u') : null;
}

export const rule = {
  id: 'deadline-missing',
  defaultSeverity: 'warning',
  description: '対応・検討表現に期限や時点が見えにくい文を検出します。',
  defaultOptions: {
    actionPredicates,
    deadlinePatterns,
    negationPatterns,
    contextExclusions,
    sentenceExclusionPatterns,
    actionSuffixExclusionPatterns,
    abstractProgressObjects,
    learningProgressBeforePatterns,
    learningProgressAfterPatterns,
    learningProgressContextPatterns,
    technicalCorrespondenceBeforePatterns,
    technicalCorrespondenceAfterPatterns,
    minSentenceChars: 20,
  },
  suggestion: 'いつまでに、何を完了するのかを補えるか確認してください。',
  run({ doc, options }) {
    const actionSource = buildSourceUnion(options.actionPredicates);
    if (!actionSource) return [];

    const deadlineSource = buildSourceUnion(options.deadlinePatterns);
    const negationSource = buildSourceUnion(options.negationPatterns);
    const sentenceExclusionSource = buildSourceUnion(options.sentenceExclusionPatterns);
    const actionSuffixExclusionSource = buildSourceUnion(options.actionSuffixExclusionPatterns);
    const abstractProgressObjectSource = buildSourceUnion(options.abstractProgressObjects);
    const learningProgressContextSource = buildSourceUnion(options.learningProgressContextPatterns);
    const learningProgressBeforeRegex = buildAnchoredRegex(
      options.learningProgressBeforePatterns,
      '\\s*を\\s*$',
    );
    const learningProgressAfterRegex = buildAnchoredRegex(
      options.learningProgressAfterPatterns,
      '',
      '^\\s*',
    );
    const learningProgressContextRegex = learningProgressContextSource
      ? new RegExp(learningProgressContextSource, 'u')
      : null;
    const technicalCorrespondenceBeforeRegex = buildAnchoredRegex(
      options.technicalCorrespondenceBeforePatterns,
      '\\s*に\\s*$',
    );
    const technicalCorrespondenceAfterRegex = buildAnchoredRegex(
      options.technicalCorrespondenceAfterPatterns,
      '',
      '^',
    );

    const minChars = Number.isFinite(options.minSentenceChars) ? options.minSentenceChars : 20;
    const sentenceExclusionRegex = sentenceExclusionSource
      ? new RegExp(sentenceExclusionSource, 'u')
      : null;
    const actionSuffixExclusionRegex = actionSuffixExclusionSource
      ? new RegExp(`^(?:${actionSuffixExclusionSource})`, 'u')
      : null;
    const abstractProgressObjectRegex = abstractProgressObjectSource
      ? new RegExp(`(?:${abstractProgressObjectSource})\\s*を\\s*$`, 'u')
      : null;
    const repeatedProgressRegex = /進め(?:る|ていく|る予定|ていく予定)/gu;
    const progressMatchCount = doc.sentences.reduce(
      (count, sentence) => count + [...sentence.text.matchAll(repeatedProgressRegex)].length,
      0,
    );
    const hasRepeatedProgress = progressMatchCount >= 2;

    const findings = [];

    for (const sentence of doc.sentences) {
      // 短文は誤検出が増えやすいのでスキップする。
      if (sentence.text.replace(/\s+/g, '').length < minChars) continue;

      // 引用ブロックの文は他者主張のラベルなので除外する。
      if (sentence.structureKind === 'quote') continue;

      // 文書の自己説明や外部資料の文言紹介は、対応期限の要求とは分ける。
      if (hasContextExclusion(sentence.text, options.contextExclusions)) continue;
      if (sentenceExclusionRegex && sentenceExclusionRegex.test(sentence.text)) continue;

      // 期限表現があれば、本ルールの目的 (期限の不在検出) には該当しない。
      // 文単位で毎回新しい RegExp を生成し、状態を持たせない。
      if (deadlineSource) {
        const deadlineRegex = new RegExp(deadlineSource, 'u');
        if (deadlineRegex.test(sentence.text)) continue;
      }

      // 述語の出現位置ごとに、否定形に該当する場合を除外する。
      const actionRegex = new RegExp(actionSource, 'gu');
      for (const match of sentence.text.matchAll(actionRegex)) {
        const matchEnd = match.index + match[0].length;
        const beforeChunk = sentence.text.slice(Math.max(0, match.index - 32), match.index);
        const afterChunk = sentence.text.slice(
          matchEnd,
          Math.min(sentence.text.length, matchEnd + 24),
        );

        // 日本語インライン引用「...」や『...』の内側は、他者発話のラベルや
        // 例示語の列挙として扱う。文書本体の対応要求ではないため除外する。
        if (isInsideJapaneseInlineQuote(sentence.text, match.index)) {
          continue;
        }

        // 否定形の判定: 「対応しない」のような述語直接置換形は actionRegex 自体が
        // マッチしないので、ここに来た時点では拾われていない。
        // 拾うのは「対応する予定はない」「検討する予定はない」のように述語直後に
        // 否定が続くケース。
        // 述語末尾の直後近傍に限定する (前方を見ない) ことで、別文節の
        // 「無い」「ない」を誤って否定とみなす誤検出を避ける。
        if (negationSource) {
          // 「予定はない」「ことはない」「ものはない」「わけではない」など、
          // 述語直後に弱結合の助詞句を伴う否定を拾うため、後方の数文字を見る。
          // 助詞句リストはホワイトリスト化して、誤検出を抑える。
          const negationProbe = new RegExp(
            `^(?:(?:こと|もの|わけ|つもり|予定)(?:は|では|も)?)?(?:${negationSource})`,
            'u',
          );
          if (negationProbe.test(afterChunk)) {
            continue;
          }
        }

        // 能力説明、抽象的な重要性評価、単なる方針表明は期限つき対応要求ではない。
        if (actionSuffixExclusionRegex && actionSuffixExclusionRegex.test(afterChunk)) {
          continue;
        }

        // 「規格に対応するアプリケーション」「対応するイベント」のような
        // 技術的な対応関係は、期限つきタスク対応ではない。
        if (
          match[0].startsWith('対応') &&
          (
            (technicalCorrespondenceBeforeRegex && technicalCorrespondenceBeforeRegex.test(beforeChunk)) ||
            (technicalCorrespondenceAfterRegex && technicalCorrespondenceAfterRegex.test(afterChunk))
          )
        ) {
          continue;
        }

        // 「価値創出を進める」のような抽象成果だけの進行表現は、
        // 期限ではなく語彙密度や薄さのルールで扱う。
        if (
          match[0].startsWith('進め') &&
          learningProgressBeforeRegex &&
          learningProgressAfterRegex &&
          learningProgressContextRegex &&
          learningProgressContextRegex.test(sentence.text) &&
          learningProgressBeforeRegex.test(beforeChunk) &&
          learningProgressAfterRegex.test(afterChunk)
        ) {
          continue;
        }

        if (
          match[0].startsWith('進め') &&
          abstractProgressObjectRegex &&
          abstractProgressObjectRegex.test(beforeChunk) &&
          !hasRepeatedProgress
        ) {
          continue;
        }

        findings.push({
          index: sentence.start + match.index,
          length: match[0].length,
          message: '期限が見えにくい対応表現です。いつまでに、何を完了するのかを補えるか確認してください。',
        });
      }
    }

    return findings;
  },
};
