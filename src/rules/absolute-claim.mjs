// absolute-claim: 適用範囲・例外確認が要りそうな断定表現を検出する。
// 除外カテゴリ: 否定文/メタフレーズ/引用ブロック/見出し/量的単位/ヘッジ副詞/否定形断定/自己言及メタ。
// 各カテゴリの「なぜ除外するか」「副作用」は対応する配列の直前コメントを参照。

import { findAll, literalAlternationRegex, stringList } from '../utils.mjs';

const terms = [
  '必ず', '絶対に', '完全に', 'すべて', '全て', '誰でも', '一切', '唯一', '万能',
  '例外なく', '確実に', '100%', '１００％',
];

// 既存: 「必ず/すべて」が否定で打ち消される文を除外する後方文脈パターン
const exclusionPatterns = [
  '(?:必ず|すべて|全て)[^。！？\\n]*(?:ではない|ではなく|とは限らない|わけではない|必要はない|必要はありません|同じではない|同じではありません)',
  'すべての(?:既存)?ルール',
];

// 既存: 周辺16-32文字に出現する自己言及的フレーズを除外
const contextExclusionPatterns = [
  'ルールIDはすべて',
];

// 新規: 引用ブロック (行頭 `>`) は他者主張のラベルなので除外。副作用: 引用形式の自著主張も拾わない。
const quoteContextExclusions = [
  '^\\s{0,3}>\\s?',
];

// 新規: 見出し行 (行頭 `#`〜`######`) は表現を題材化していることが多いので除外。副作用: 見出しに紛れた断定も拾わない。
const headingContextExclusions = [
  '^\\s{0,3}#{1,6}\\s+',
];

// 新規: 「100%(負担|...)」のように比率・分量を表す量的単位は断定ではないので除外。副作用: 量的表現の断定を見逃す。
const numericMeasureExclusions = [
  '^(?:100%|１００％)(?:負担|担保|拠出|減税|削減|増加|減少|出資|還元|完成|消化|消費|達成|出典|気にしなく|気にしない|気にし|否定|気にしなくていい)',
  '^(?:100%|１００％)\\s*(?:手数料|出典|気)',
];

// 新規: 「ほぼ必ず」「ほとんど必ず」のように強いヘッジ副詞を伴うと断定弱まる。副作用: 弱い断定を拾わない。
const hedgedAdverbExclusions = [
  '(?:ほぼ|ほとんど|概ね|おおむね|だいたい|大抵|たいてい|多くの場合|ほぼ確実に)\\s*(?:必ず|確実に|絶対に|例外なく)',
];

// 新規: 「万能ではない」「完全には〜ない」など、断定そのものを否定する句は除外。副作用: 否定後の主張は別途必要なら他ルールで拾う。
const negatedAbsoluteExclusions = [
  '^万能(?:では|でも|じゃ)?\\s*(?:ない|ありません|あり得ない|ありえない)',
  '^完全に(?:は|も)?\\s*(?:否定|消|消え|理解|把握|説明|解決|無視|排除)[^。！？\\n]{0,12}(?:できない|でき切れない|しきれない|ない|ありません)',
  '^完全には?[^。！？\\n]{0,16}(?:できない|でき切れない|しきれない|ない|ありません)',
];

// 新規: 自己言及で「100%と断言しない」のように表現を題材化しているフレーズは除外。副作用: メタ言及の断定形は拾わない。
const selfReferentialQuoteExclusions = [
  '「(?:100%|１００％)」(?:と|を|の|は)\\s*(?:断言|言って|言った|言う|言わ|主張)',
  '(?:100%|１００％)[^「」\\n]{0,8}」\\s*(?:と|を)\\s*(?:言って|言った|言う|言わ|断言|主張|発言)',
  '(?:100%|１００％)\\s*(?:percent|made\\s*up|wrong)',
];

// 新規: 条件や前提を名詞句として述べる「誰でも〜こと」は除外。副作用: 条件定義の短文内にある弱い断定を拾わない。
const conditionNounPhraseExclusions = [
  '^誰でも[^。！？\\n]{1,30}こと(?:。[^。！？\\n]{0,40}条件|[、,]?[^。！？\\n]{0,20}(?:条件|前提))',
];

// 新規: 「完全に〜未来は期待できない」のような否定された見通しは除外。副作用: 否定形の見立てを拾わない。
const negatedOutlookExclusions = [
  '^完全に[^。！？\\n]{0,28}(?:未来|状態|形|こと|可能性)[^。！？\\n]{0,24}(?:期待できません|期待できない|見込めません|見込めない|考えにくい|難しい)',
];

// 新規: カギ括弧内の概念名や問いは、本文の主張ではなく分析対象なので除外。副作用: 同形の引用内断定を一部拾わない。
const inlineQuotedConceptExclusions = [
  '「[^」。！？\\n]{0,20}(?:必ず|絶対に|完全に|すべて|全て|誰でも|一切|唯一|万能|例外なく|確実に|100%|１００％)[^」。！？\\n]{0,20}(?:言葉|表現|概念|条件|前提|問い|問題|ラベル)」(?:が|は|を|と|の|に)',
  '「[^」。！？\\n]{0,24}(?:必ず|絶対に|完全に|すべて|全て|誰でも|一切|唯一|万能|例外なく|確実に|100%|１００％)[^」。！？\\n]{0,24}か(?:どうか)?」(?:を|は|が|と|について)',
  '「[^\\n]{0,40}(?:必ず|絶対に|完全に|すべて|全て|誰でも|一切|唯一|万能|例外なく|確実に|100%|１００％)[^\\n]{0,40}」(?:を|は|が|の|など)[^。！？\\n]{0,24}(?:緩め|見直|扱|例示|パターン|再利用)',
];

// 新規: 対象網羅の含意や問いの射程を述べる文は除外。副作用: 「影響する/突きつけられる」型の強い射程主張を拾わない。
const scopedAudienceExclusions = [
  '(?:だけでなく|のみならず)[^。！？\\n]{0,40}(?:すべて|全て)の[^。！？\\n]{1,16}に影響する',
  '(?:これらの|この|その)?(?:問い|課題|問題)[^。！？\\n]{0,48}(?:すべて|全て)の[^。！？\\n]{1,16}に(?:突きつけられる|問われる)',
];

// 新規: 具体的な運用条件内の必須表現は除外。副作用: 条件付き手順の「必ず」を拾わない。
const operationalRequirementExclusions = [
  '(?:場合|場面|とき|時)(?:は|なら|には|では|に)[^。！？\\n]{0,40}(?:必ず|絶対に|確実に)[^。！？\\n]{0,20}(?:付ける|付けて|添える|添えて|示す|示して|記載する|記載して|確認する|確認して|残す|残して)',
  '(?:変更後|改修後|実装後|編集後|作業後|各\\s*Agent|各Agent|Agent|エージェント)[^。！？\\n]{0,80}(?:必ず|絶対に|確実に)[^。！？\\n]{0,32}(?:テスト|評価|確認|残す|残して|通す|通して)',
  '(?:報告書|run\\s*record|run\\s*記録)[^。！？\\n]{0,80}(?:必ず|絶対に|確実に)[^。！？\\n]{0,16}(?:残す|残して|保存する|保存して)',
];

// 新規: 評価ログや仕様文書内の閉じた作業実績・入出力仕様は除外。副作用: 評価メモ内の強い短句を拾わない。
const boundedProjectStatusExclusions = [
  '(?:A\\d|seed\\s*goldset|goldset|baseline|ルール|件|文書|ケース)[^。！？\\n]{0,48}(?:すべて|全て|完全に)[^。！？\\n]{0,32}(?:維持|PASS|pass|一致|動作確認|確認)',
  '(?:manifest|マニフェスト)[^。！？\\n]{0,32}(?:唯一)[^。！？\\n]{0,24}(?:入力|ソース|対象)',
  '唯一[^。！？\\n]{0,24}(?:完走分|採用分|入力|ソース)',
];

// 新規: 技術仕様・定義文脈の対象全称は除外。副作用: 技術語を含む短い保証文の一部を拾わない。
const technicalSpecificationExclusions = [
  '^(?:すべて|全て)の\\s*(?:APIレスポンス|HTTPレスポンス|レスポンス|CSV行|CSVレコード|リクエスト本文|フィールド|レコード|オブジェクト|配列要素?|ノード|Pod|ポッド|コンテナ|フレックスアイテム|グリッドアイテム|アイテム|子|段|列|イベント|大文字|todo|(?:ブログ)?投稿|データ|パケット|メッセージ|ヘッダー|HTTPヘッダー|Cookie|クッキー|エンドポイント)[^。！？\\n]{0,72}(?:保存|実行|維持|アクセス|割り当て|配置|整列|折り返|引き伸ば|伸縮|拡大|縮小|適用|継承|計算|評価|解釈|描画|レンダリング|定義|指定|設定|使用|送信|受信|返|処理|変換|渡|含|持|チェック|制御|等し|同じ)(?:する|します|される|されます|され|できる|できます|しようとする|しようとします|くする|くします|になる|なります|です|ます|つ|ちます|む|みます|し|して)',
  '^(?:すべて|全て)の\\s*(?:フレックスアイテム|グリッドアイテム|アイテム|子|段|列|ノード|Pod|ポッド|コンテナ|フィールド|レコード|CSV行)[^。！？\\n]{0,72}(?:値|幅|高さ|最小幅|列|行|型|形式)[^。！？\\n]{0,32}(?:です|で|になる|なります|同じ|等しい)',
  '^(?:すべて|全て)の\\s*(?:フレックスアイテム|グリッドアイテム|アイテム|段|列|子)[^。！？\\n]{0,56}(?:同じ|等しい)[^。！？\\n]{0,20}(?:長さ|幅|高さ|量)[^。！？\\n]{0,20}(?:です|になる|なります|占めます|占める)',
  '^(?:すべて|全て)\\s*(?:が\\s*)?(?:[*_]{1,3}\\s*)?(?:同じ|等しい|リアクティブ|反応的)[^。！？\\n]{0,32}(?:です|になる|なります|なっている|なっています|占めます|占める)',
  '^(?:すべて|全て)の\\s*古いPod[^。！？\\n]{0,48}新しいPod[^。！？\\n]{0,24}(?:置き換え|置換)(?:られる|られて|られ、|られます|る|ます)',
  '^(?:すべて|全て)の\\s*(?:材料|アセット|資産)[^。！？\\n]{0,40}(?:集合的な名前|総称|と呼ばれ)',
  '(?:この記事|本記事|このガイド|本ガイド|このチュートリアル|本チュートリアル|このページ|本ページ|この節|本節|この章|本章)[^。！？\\n]{0,16}(?:では|は)[^。！？\\n]{0,48}(?:すべて|全て)の(?:基本事項|基礎|内容|項目|手順|例|概念|使い方)[^。！？\\n]{0,32}(?:説明|解説|紹介|扱)(?:し|する|します|してい|しています|います)',
  '(?:[A-Za-z0-9一-龯ぁ-んァ-ンー・]+の)?(?:すべて|全て)を[^。！？\\n]{0,32}(?:説明|解説|紹介)した(?:記事|ガイド|ページ|チュートリアル)',
  '(?:このガイド|本ガイド|このチュートリアル|本チュートリアル)[^。！？\\n]{0,40}(?:残り|以降)[^。！？\\n]{0,64}(?:すべて|全て)に目を通す',
  '(?:準備ができたら|入力し|選択し|まとめて)[^。！？\\n]{0,48}(?:すべて|全て)を実行することができます',
  '(?:この|その|次の)[^。！？\\n]{0,12}宣言[^。！？\\n]{0,24}必要なもの(?:すべて|全て)を(?:与え|提供|用意)(?:てくれ|る|ます|する|します)',
  '(?:ほぼ|ほとんど)\\s*(?:すべて|全て)の',
  '(?:DOM|操作|処理|データ)[^。！？\\n]{0,32}(?:すべて|全て)[^。！？\\n]{0,32}(?:Vue|サーバー|クライアント|API|TCP/IP|HTTP|HTTPS|JSON|ブラウザ|ブラウザー)[^。！？\\n]{0,32}(?:によって)?[^。！？\\n]{0,24}(?:処理|送信|保存|解釈|制御)(?:される|されます|する|します)',
  '(?:場合|とき|時)(?:は|なら|には|では|に|、|,)[^。！？\\n]{0,48}(?:(?:サーバー|クライアント|API|エンドポイント)[^。！？\\n]{0,24})?(?:必ず|確実に)[^。！？\\n]{0,16}(?:[1-5][0-9]{2}|HTTP|JSON|レスポンス|エラー)[^。！？\\n]{0,16}(?:返す|返します|返される|返されます)',
];

// 新規: 否定・限界を示すMarkdownリスト内の「すべて/全て」だけを除外。
// 副作用: 非目標・非保証・回避対象の列挙に見える項目では、全称語単体の確認を求めない。
const negativeListContextExclusions = [
  '(?:何を)?目指さない(?:か|こと)?',
  '(?:目指しません|目指さない)',
  '(?:保証しない|保証しません|保証できない|保証できません)(?:こと)?',
  '(?:避けたい|避けます|避ける)(?:作業単位|こと|項目)?',
];

const negativeListItemExclusions = [
  '(?:すべて|全て)[^。！？\\n]{0,48}検出(?:すること)?\\s*$',
  '(?:すべて|全て)[^。！？\\n]{0,48}(?:同時に作る|一気に改善する|代替すること|評価すること)\\s*$',
];

function buildRegexList(patterns) {
  return stringList(patterns).map(pattern => new RegExp(pattern, 'u'));
}

function isExcludedMatch(context, relativeIndex, matchText, patterns, contextPatterns) {
  const afterMatch = context.slice(relativeIndex);
  const aroundMatch = context.slice(
    Math.max(0, relativeIndex - 16),
    Math.min(context.length, relativeIndex + matchText.length + 32),
  );
  return patterns.some(pattern => new RegExp(pattern, 'u').test(afterMatch)) ||
    contextPatterns.some(pattern => new RegExp(pattern, 'u').test(aroundMatch));
}

function lineContextStartAt(text, index) {
  return text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
}

function lineContextAt(text, index) {
  const start = lineContextStartAt(text, index);
  const nextNewline = text.indexOf('\n', index);
  const end = nextNewline === -1 ? text.length : nextNewline;
  return text.slice(start, end);
}

function isLineExcluded(line, lineRegexes) {
  if (!line) return false;
  return lineRegexes.some(re => re.test(line));
}

function matchesAfter(afterText, regexes) {
  return regexes.some(re => re.test(afterText));
}

function matchesAround(aroundText, regexes) {
  return regexes.some(re => re.test(aroundText));
}

function isMarkdownListLine(line) {
  return /^\s{0,3}(?:[-*+]|\d+[.)])\s+/.test(line);
}

function listItemBody(line) {
  return line.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/, '');
}

function isNegativeListCue(line, regexes) {
  const normalized = line.replace(/^\s{0,3}#{1,6}\s+/, '').trim();
  return regexes.some(re => re.test(normalized));
}

function hasNegativeListCueBefore(text, lineStart, cueRegexes) {
  const before = text.slice(Math.max(0, lineStart - 1200), lineStart);
  const lines = before.split('\n').reverse();
  let scannedChars = 0;
  for (const rawLine of lines) {
    scannedChars += rawLine.length + 1;
    if (scannedChars > 1200) break;

    const line = rawLine.trim();
    if (!line) continue;
    if (isMarkdownListLine(rawLine)) continue;
    if (isNegativeListCue(rawLine, cueRegexes)) return true;
    return false;
  }
  return false;
}

function isNegativeListItemExcluded(text, matchIndex, matchText, line, cueRegexes, itemRegexes) {
  if (matchText !== 'すべて' && matchText !== '全て') return false;
  if (!isMarkdownListLine(line)) return false;
  if (!matchesAfter(listItemBody(line), itemRegexes)) return false;

  const lineStart = lineContextStartAt(text, matchIndex);
  return hasNegativeListCueBefore(text, lineStart, cueRegexes);
}

export const rule = {
  id: 'absolute-claim',
  defaultSeverity: 'warning',
  description: '適用範囲や例外条件の確認が必要になりやすい断定表現を検出します。',
  defaultOptions: {
    terms,
    exclusionPatterns,
    contextExclusionPatterns,
    quoteContextExclusions,
    headingContextExclusions,
    numericMeasureExclusions,
    hedgedAdverbExclusions,
    negatedAbsoluteExclusions,
    selfReferentialQuoteExclusions,
    conditionNounPhraseExclusions,
    negatedOutlookExclusions,
    inlineQuotedConceptExclusions,
    scopedAudienceExclusions,
    operationalRequirementExclusions,
    boundedProjectStatusExclusions,
    technicalSpecificationExclusions,
    negativeListContextExclusions,
    negativeListItemExclusions,
  },
  suggestion: '適用範囲、例外、根拠を示すか、断定の強さを調整してください。',
  run({ doc, options }) {
    const regex = literalAlternationRegex(options.terms);
    if (!regex) return [];
    const exclusions = stringList(options.exclusionPatterns);
    const contextExclusions = stringList(options.contextExclusionPatterns);
    const quoteLineRegexes = buildRegexList(options.quoteContextExclusions);
    const headingLineRegexes = buildRegexList(options.headingContextExclusions);
    const numericMeasureRegexes = buildRegexList(options.numericMeasureExclusions);
    const hedgedAdverbRegexes = buildRegexList(options.hedgedAdverbExclusions);
    const negatedAbsoluteRegexes = buildRegexList(options.negatedAbsoluteExclusions);
    const selfReferentialRegexes = buildRegexList(options.selfReferentialQuoteExclusions);
    const conditionNounPhraseRegexes = buildRegexList(options.conditionNounPhraseExclusions);
    const negatedOutlookRegexes = buildRegexList(options.negatedOutlookExclusions);
    const inlineQuotedConceptRegexes = buildRegexList(options.inlineQuotedConceptExclusions);
    const scopedAudienceRegexes = buildRegexList(options.scopedAudienceExclusions);
    const operationalRequirementRegexes = buildRegexList(options.operationalRequirementExclusions);
    const boundedProjectStatusRegexes = buildRegexList(options.boundedProjectStatusExclusions);
    const technicalSpecificationRegexes = buildRegexList(options.technicalSpecificationExclusions);
    const negativeListContextRegexes = buildRegexList(options.negativeListContextExclusions);
    const negativeListItemRegexes = buildRegexList(options.negativeListItemExclusions);

    return findAll(doc.maskedText, regex).filter(match => {
      const matchText = match[0];
      if (!matchText) return false;

      const sentence = doc.sentences.find(item => match.index >= item.start && match.index < item.end);
      const context = sentence?.text ?? lineContextAt(doc.maskedText, match.index);
      const contextStart = sentence?.start ?? lineContextStartAt(doc.maskedText, match.index);
      const relativeIndex = Math.max(0, match.index - contextStart);

      if (isExcludedMatch(context, relativeIndex, matchText, exclusions, contextExclusions)) return false;

      // 行コンテキスト判定: 行頭が引用ブロック or 見出しなら除外
      const line = lineContextAt(doc.maskedText, match.index);
      if (isLineExcluded(line, quoteLineRegexes)) return false;
      if (isLineExcluded(line, headingLineRegexes)) return false;
      if (isNegativeListItemExcluded(
        doc.maskedText,
        match.index,
        matchText,
        line,
        negativeListContextRegexes,
        negativeListItemRegexes,
      )) return false;

      // 自己言及的なメタ言及: 例「『100%』と断言しない」
      const around = doc.maskedText.slice(
        Math.max(0, match.index - 8),
        Math.min(doc.maskedText.length, match.index + matchText.length + 32),
      );
      if (matchesAround(around, selfReferentialRegexes)) return false;
      if (matchesAround(around, inlineQuotedConceptRegexes)) return false;

      if (matchesAround(context, scopedAudienceRegexes)) return false;
      if (matchesAround(context, operationalRequirementRegexes)) return false;
      if (matchesAround(context, boundedProjectStatusRegexes)) return false;
      if (matchesAround(context, technicalSpecificationRegexes)) return false;

      // 量的単位: 「100%負担」「100%気にしなくていい」など
      const afterMatchFull = doc.maskedText.slice(match.index, match.index + matchText.length + 24);
      if (matchesAfter(afterMatchFull, numericMeasureRegexes)) return false;

      // 強いヘッジ副詞: 直前16文字に「ほぼ」「ほとんど」など
      const beforeMatch = doc.maskedText.slice(Math.max(0, match.index - 16), match.index + matchText.length);
      if (matchesAfter(beforeMatch, hedgedAdverbRegexes)) return false;

      // 断定の否定形: 「万能ではない」「完全には〜できない」
      if (matchesAfter(afterMatchFull, negatedAbsoluteRegexes)) return false;

      const afterMatchExtended = doc.maskedText.slice(match.index, match.index + matchText.length + 96);
      if (matchesAfter(afterMatchExtended, conditionNounPhraseRegexes)) return false;
      if (matchesAfter(afterMatchExtended, negatedOutlookRegexes)) return false;
      if (matchesAfter(afterMatchExtended, technicalSpecificationRegexes)) return false;

      return true;
    }).map(match => ({
      index: match.index,
      length: match[0].length,
      message: '適用範囲や例外条件の確認が必要になりやすい断定表現です。根拠、対象範囲、前提を補えるか確認してください。',
    }));
  },
};
