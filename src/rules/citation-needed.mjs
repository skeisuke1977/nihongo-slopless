import { literalAlternationRegex } from '../utils.mjs';

const claimPatterns = [
  '近年',
  '現在',
  '最新',
  '世界初',
  '国内初',
  '業界初',
  '多くの研究',
  '先行研究',
  '研究によれば',
  '調査によれば',
  '統計によれば',
  'データによれば',
  '報告されている',
  '明らかになっている',
];

// 同一文内に出現すれば「出典/根拠の指示が文中にある」とみなすパターン群。
// URL、DOI、番号引用、出典記法、表番号・図番号、書誌情報、Markdown リンク。
const sourceMarkerPatterns = [
  /https?:\/\//u,
  /\bdoi\s*:/iu,
  /\b10\.[0-9]{4,9}\/[-._;()/:A-Z0-9]+/iu,
  /\[[0-9０-９]+\]/u,
  /\[[A-Za-z][^\]]*(?:[12][0-9]{3}|,)[^\]]*\]/u,
  // Markdown link 形式は doc.maskedText では URL 部が空白で潰されるが、
  // sentence.text は原文を保持しているため `[label](http...)` を直接検出できる。
  /\[[^\]]+\]\(\s*https?:\/\//u,
  /出典[:：]|参考文献|引用/u,
  /(?:表|図)\s*[0-9０-９]+/u,
];

// 主張に対する根拠 (調査対象、サンプル数、量的事実) を示しうるパターン。
// 単位は合成境界例で使う「機」「台」「件」など物量カウントも含めて
// 拡張している。これは出典そのものではないが、文中に観測可能な数量が
// 添えられている場合、citation-needed のような時事性主張は事実記述に
// 寄っていると判断する。
const dataEvidencePatterns = [
  /(?:n|N)\s*=\s*[0-9０-９]+/u,
  /(?:参加者|回答者|対象者|調査対象|標本|サンプル)\s*[0-9０-９]+/u,
  /(?:参加者|回答者|対象者|調査対象|標本|サンプル)(?:は|を|として|に)[^。！？、,]{2,}/u,
  /調査[^。！？]{0,30}(?:を対象|対象(?:に|として|は))/u,
  /[0-9０-９]+(?:[.．][0-9０-９]+)?\s*(?:万|億|兆|千|百)?\s*(?:%|％|パーセント|ポイント|件|名|人|社|校|自治体|団体|施設|例|事例|回答|サンプル|カ国|か国|機|台|個|本|店|店舗|億ドル|万ドル|億円|万円|円|ドル|ユーロ)/u,
  /[0-9０-９]+\s*(?:名|人|社|校|団体|施設)(?:を|に)?対象/u,
];

// 出典名・情報源名。これらが同一文や隣接文に登場すると、根拠は本文外の
// 一次資料へ参照されていると考え citation-needed を抑制する。
// 「報じられている」「報じる」は伝聞動詞、「明記されている」は公式文書、
// 「Help Center」「ガイドライン」「白書」などは出典そのもの。
const sourceNamePatterns = [
  /報じ(?:られ|た|る|ている|られている)/u,
  /[^一-龠々]報道(?:[によで、は]|$)/u,
  /^報道(?:[によで、は])/u,
  /(?:公式|公式サイト|公式発表|公式ブログ|プレスリリース|声明|発表)/u,
  /Help\s*Center/iu,
  /ヘルプセンター/u,
  /(?:ガイドライン|ガイダンス|FAQ)/u,
  /(?:IPA|NIST|MITRE|OECD|総務省|経産省|文科省|厚労省|金融庁|消費者庁|内閣府|個人情報保護委員会|議事録|議会|国会|裁判所|最高裁|地裁|高裁)/u,
  /(?:白書|報告書|調査報告|統計|月報|年報|議事概要|議事要旨|議事録|レポート)/u,
  /(?:ニュース|新聞|通信社|ロイター|AP通信|ブルームバーグ|日経|朝日|読売|毎日|NHK|BBC|CNN|業界紙|FT|TechCrunch|The\s*Verge|Axios)/u,
  /(?:arXiv|bioRxiv|medRxiv|SSRN|preprint|プレプリント|ジャーナル|論文誌)/u,
  /(?:明記|明示)(?:されている|されていた|され|して)/u,
  /(?:申請書|出願|提出資料|定款|規約|約款|契約書|条文|施行令|施行規則)/u,
];

function hasAuthorYearCitation(text) {
  const matches = text.matchAll(/[（(]([^（）()]{1,50}(?:[12][0-9]{3})[^（）()]{0,30})[）)]/gu);
  for (const match of matches) {
    const content = match[1].replace(/\s+/g, '');
    if (/^[12][0-9]{3}年?$/.test(content)) continue;
    if (/[A-Za-zぁ-んァ-ン一-龠々]/u.test(content)) return true;
  }
  return false;
}

// 同一文の text 範囲内に「URL / 出典記法 / 表番号 / 著者年 / データ実証」が
// あるかを判定する。これは引数 text 自体に対する局所判定で、隣接文には
// 触れない。隣接文判定は hasAdjacentSourceEvidence で別途行う。
function hasInSentenceCitation(text) {
  return sourceMarkerPatterns.some(pattern => pattern.test(text))
    || dataEvidencePatterns.some(pattern => pattern.test(text))
    || hasAuthorYearCitation(text);
}

// 出典名そのものの言及があるか (Help Center, IPA, 報じられている 等)。
// これは「同一文」と「隣接文」両方で適用される弱い証拠で、URL より柔らかい。
function hasSourceName(text) {
  return sourceNamePatterns.some(pattern => pattern.test(text));
}

// `研究でも` / `学術論文でも` が前後の出典提示を受ける橋渡しとして
// 使われ、かつ本文中では「結果」「傾向」が報告される形に限って抑制する。
// `先行研究では` や `多くの研究で` を広く救うと根拠不足主張を見逃すため、
// 文頭または句読点直後の `でも` 形式に限定する。
function hasNarrowResearchBridgeContext(text) {
  const hasBridgeAttribution = /(?:^|[。！？、,\s「『（(])(?:研究|学術論文)でも/u.test(text);
  if (!hasBridgeAttribution) return false;
  return /(?:という)?(?:結果|傾向)[^。！？]{0,12}報告されている/u.test(text);
}

// sentence と同じ段落 (structureBlockIndex) または同じセクション
// (structureSectionIndex) 内で、直前 1 文と直後 1 文を返す。
// 順序は決定論的: sentences 配列の登場順 (オフセット昇順) に依存する。
function adjacentSentencesInSameContext(sentences, currentIndex) {
  if (!Array.isArray(sentences) || sentences.length === 0) return [];
  const current = sentences[currentIndex];
  if (!current) return [];
  const sameContext = (other) => {
    if (!other) return false;
    if (other === current) return false;
    if (current.structureBlockIndex !== undefined
        && other.structureBlockIndex !== undefined
        && current.structureBlockIndex === other.structureBlockIndex) {
      return true;
    }
    if (current.structureSectionIndex !== undefined
        && other.structureSectionIndex !== undefined
        && current.structureSectionIndex === other.structureSectionIndex) {
      return true;
    }
    return false;
  };
  const result = [];
  const prev = sentences[currentIndex - 1];
  const next = sentences[currentIndex + 1];
  if (sameContext(prev)) result.push(prev);
  if (sameContext(next)) result.push(next);
  return result;
}

// 隣接文の text に強い出典記法 (URL, 出典記法, 著者年) があるか。
// 同一段落 (structureBlockIndex 一致) では「（出典：[arXiv ...](url))」
// のような直後文を救うため、強い証拠は隣接でも採用する。
// 弱い証拠 (出典名のみ) は誤検出が増えるため、隣接文では強い証拠のみ。
function hasAdjacentStrongCitation(sentences, currentIndex) {
  const neighbors = adjacentSentencesInSameContext(sentences, currentIndex);
  return neighbors.some(neighbor => hasInSentenceCitation(neighbor.text));
}

// 同一構造ブロック (段落・リスト項目) の原文範囲に強い出典記法があるか。
// `doc.sentences` は記号過密の短い出典フラグメント (`（出典：[arXiv 1234](url)）`
// 単独) を独立文化しない場合がある。隣接文ベースの判定だけでは救えないため、
// 構造ブロックの原文 (`doc.text.slice(block.start, block.end)`) から
// `現在の sentence の範囲を除いて` 出典記法を探す。
// 現在の文を除外するのは、誤って自身の matchedKeyword (e.g. `現在`) を含む
// 検出語そのものを「出典」と誤認しないため。
function hasBlockLevelStrongCitation(doc, sentence) {
  const blocks = doc.structureBlocks ?? [];
  if (sentence.structureBlockIndex === undefined) return false;
  const block = blocks[sentence.structureBlockIndex];
  if (!block) return false;
  const text = doc.text ?? '';
  const blockText = text.slice(block.start, block.end);
  if (!blockText) return false;
  // 現在の文の範囲をブロック内オフセットに換算し、そこを空白で潰した
  // テキストに対してパターンを当てる。これにより、自分自身を出典として
  // 救うようなトートロジーを防ぎつつ、他の部分の出典記法は確認できる。
  const sentStart = Math.max(0, (sentence.start ?? 0) - block.start);
  const sentEnd = Math.min(blockText.length, (sentence.end ?? blockText.length) - block.start);
  const others = blockText.slice(0, sentStart) + ' '.repeat(Math.max(0, sentEnd - sentStart)) + blockText.slice(sentEnd);
  return sourceMarkerPatterns.some(pattern => pattern.test(others));
}

// 技術文書では `現在` / `最新` が、時事主張ではなく状態名・値・版・
// ブラウザー環境を説明するラベルとして使われることがある。こうした
// 用法は出典要求よりも仕様説明に近いため抑制する。一方、調査・研究・
// 普及・投資などの時事/普及主張は citation-needed の対象に残す。
const technicalStateOrVersionNouns = [
  '状態',
  '値',
  '版',
  'バージョン',
  'エディション',
  'リリース',
  'ブラウザー',
  'ブラウザ',
  'ウェブブラウザー',
  'Webブラウザー',
  'ページ',
  'テンプレート',
  'Podテンプレート',
  'インスタンス',
  '設定項目',
  '設定形式',
  '設定',
  '構成',
  '属性',
  'プロパティ',
  'コンポーネント',
  '要素',
  'DOM',
  'API',
  'パッケージ',
  'イメージ',
  'タグ',
  'タブ',
  'セッション',
  'コンテキスト',
  'ルート',
  'ノード',
  '入力',
  'フォーム',
];

const technicalStateOrVersionPattern = new RegExp(
  `^(?:現在(?:の)?(?:アクティブな|選択中の|表示中の|実行中の|実行される|開いている)?|最新(?:の)?)`
    + `[^。！？、,]{0,18}(?:${technicalStateOrVersionNouns.join('|')})`,
  'u',
);

const timeSensitiveClaimContextPattern =
  /(?:近年|調査|研究|統計|データ(?:によれば|では|で示|から|を用い|に基づ)|利用(?:率|者|数|は|が|を|され)|使われ|採用|導入|普及|市場|シェア|投資|契約|売上|急速|多く|世界初|国内初|業界初)/u;

function isTechnicalStateOrVersionMatch(text, match) {
  const keyword = match[0];
  if (keyword !== '現在' && keyword !== '最新') return false;
  const tail = text.slice(match.index);
  if (keyword === '現在' && tail.startsWith('現在地')) return true;
  if (timeSensitiveClaimContextPattern.test(text)) return false;
  return technicalStateOrVersionPattern.test(tail);
}

function isCitationClaimMatch(text, match) {
  return !isTechnicalStateOrVersionMatch(text, match);
}

export const rule = {
  id: 'citation-needed',
  defaultSeverity: 'warning',
  description: '時事性・実証性のある主張に、根拠表示がない可能性を検出します。',
  defaultOptions: { claimPatterns },
  suggestion: '出典、調査対象、URL、表番号、具体的なデータなどを添えてください。',
  run({ doc, options }) {
    const regex = literalAlternationRegex(options.claimPatterns);
    if (!regex) return [];
    const findings = [];
    const sentences = doc.sentences ?? [];

    for (let i = 0; i < sentences.length; i += 1) {
      const sentence = sentences[i];
      const text = sentence.text;
      const matches = [...text.matchAll(regex)]
        .filter(match => isCitationClaimMatch(text, match));
      if (matches.length === 0) continue;

      // 同一文内に強い出典 (URL, 著者年, 表番号, データ) があれば抑制。
      if (hasInSentenceCitation(text)) continue;

      // 同一文内に出典名 (Help Center, 報じられている, IPA 等) があれば抑制。
      if (hasSourceName(text)) continue;

      // 研究紹介文で、直前の出典提示を受ける `研究でも/学術論文でも` と
      // `結果/傾向が報告されている` が近接する境界だけを抑制する。
      if (hasNarrowResearchBridgeContext(text)) continue;

      // 隣接文 (同一段落または同一セクション) に強い出典があれば抑制。
      // 直後の文に `（出典：[arXiv...](url))` が来るパターンを救う。
      if (hasAdjacentStrongCitation(sentences, i)) continue;

      // 同一段落 (structureBlock) の原文に出典記法があれば抑制。
      // sentences として分離されない短い出典フラグメント (URL や Markdown
      // link 単独括弧) を救うための保険。`doc.text` を直接見るため、
      // maskedText で空白化された URL も検出できる。
      if (hasBlockLevelStrongCitation(doc, sentence)) continue;

      // 隣接文に出典名がある場合、その出典名が「直前」「直後」のうち
      // 同段落内のものに限って抑制する (セクション境界をまたぐ場合は
      // 文脈が切れているため救わない)。
      const sameParagraphNeighbors = adjacentSentencesInSameContext(sentences, i)
        .filter(other => sentence.structureBlockIndex !== undefined
          && other.structureBlockIndex === sentence.structureBlockIndex);
      if (sameParagraphNeighbors.some(neighbor => hasSourceName(neighbor.text))) continue;

      const first = matches[0];
      findings.push({
        index: sentence.start + first.index,
        length: first[0].length,
        message: '根拠が必要そうな主張です。出典、データ、観察条件を示せるか確認してください。',
      });
    }
    return findings;
  },
};
