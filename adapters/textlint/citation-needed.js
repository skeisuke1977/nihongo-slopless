// @nihongo-slopless/textlint-adapter-experimental
// citation-needed: 時事性・実証性のある主張に根拠表示がない可能性を検出する(軽量版)。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/citation-needed.mjs) と同じ語彙・メッセージを使う。
//
// 移植時の差分メモ(2026-05-20 P6 Agent I):
//   - standalone は doc.sentences(文書全体)を走査し、隣接文・structureBlock 単位
//     の出典記法・出典名を見て抑制する。
//   - textlint 版は Paragraph ノードを単位として、その中で `。！？!?` を境界に
//     文分割を行い、文ごとに claim パターンを照合する。同じ Paragraph の
//     どこかに出典記法または出典名があれば抑制する。
//   - **制限事項**:
//       (a) **隣接 Paragraph** 越しの出典提示(直後の段落に URL がある等)は
//           検出抑制に使わない。standalone は同セクション内の前後 1 文を
//           見るため、ここでは差分が出る。
//       (b) **Document/List 全体**での引用・証拠収集はしない。
//           P11-I1 で ListItem 内の兄弟 Paragraph にある強い evidence
//           (URL/DOI/番号引用/著者年/数値データ)だけは抑制に使う。
//       (c) **narrow research bridge** 例外(`研究でも...結果が報告されている`)は
//           P10-I1 で軽量移植している。
//       (d) **技術状態/版** 例外(`現在のバージョン`等)は軽量版で移植している。
//   - BlockQuote / CodeBlock / Table / HtmlBlock / Comment は IGNORED_CONTAINER_TYPES
//     として配下の Paragraph を除外する(empty-conclusion / excessive-parentheses と同様)。

'use strict';

const DEFAULT_CLAIM_PATTERNS = Object.freeze([
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
]);

// 同一文または同一 Paragraph に出現すれば「出典/根拠が文中にある」とみなすパターン群。
// standalone の sourceMarkerPatterns を中核だけ移植。
const SOURCE_MARKER_PATTERNS = Object.freeze([
  /https?:\/\//u,
  /\bdoi\s*:/iu,
  /\b10\.[0-9]{4,9}\/[-._;()/:A-Z0-9]+/iu,
  /\[[0-9０-９]+\]/u,
  /\[[A-Za-z][^\]]*(?:[12][0-9]{3}|,)[^\]]*\]/u,
  /\[[^\]]+\]\(\s*https?:\/\//u,
  /出典[:：]|参考文献|引用/u,
  /(?:表|図)\s*[0-9０-９]+/u,
]);

// 主張に対する観察条件・量的事実を示しうるパターン。
// standalone の dataEvidencePatterns を、同一 Paragraph 抑制用に最小移植する。
const DATA_EVIDENCE_PATTERNS = Object.freeze([
  /(?:n|N)\s*=\s*[0-9０-９]+/u,
  /(?:参加者|回答者|対象者|調査対象|標本|サンプル)\s*[0-9０-９]+/u,
  /(?:参加者|回答者|対象者|調査対象|標本|サンプル)(?:は|を|として|に)[^。！？、,]{2,}/u,
  /調査[^。！？]{0,30}(?:を対象|対象(?:に|として|は))/u,
  /[0-9０-９]+(?:[.．][0-9０-９]+)?\s*(?:万|億|兆|千|百)?\s*(?:%|％|パーセント|ポイント|件|名|人|社|校|自治体|団体|施設|例|事例|回答|サンプル|カ国|か国|機|台|個|本|店|店舗|億ドル|万ドル|億円|万円|円|ドル|ユーロ)/u,
  /[0-9０-９]+\s*(?:名|人|社|校|団体|施設)(?:を|に)?対象/u,
]);

// 出典名(機関・媒体・形式)。standalone の sourceNamePatterns を中核だけ移植。
const SOURCE_NAME_PATTERNS = Object.freeze([
  /報じ(?:られ|た|る|ている|られている)/u,
  /(?:公式|公式サイト|公式発表|公式ブログ|プレスリリース|声明|発表)/u,
  /(?:ガイドライン|ガイダンス|FAQ)/u,
  /(?:IPA|NIST|MITRE|OECD|総務省|経産省|文科省|厚労省|金融庁|消費者庁|内閣府|個人情報保護委員会)/u,
  /(?:白書|報告書|調査報告|統計|月報|年報|議事概要|議事要旨|議事録|レポート)/u,
  /(?:ニュース|新聞|通信社|ロイター|AP通信|ブルームバーグ|日経|朝日|読売|毎日|NHK|BBC|CNN|業界紙|FT)/u,
  /(?:arXiv|bioRxiv|medRxiv|SSRN|preprint|プレプリント|ジャーナル|論文誌)/u,
  /(?:明記|明示)(?:されている|されていた|され|して)/u,
]);

// 技術状態/版用法(現在のバージョン等)の軽量パターン。standalone の
// technicalStateOrVersionNouns + technicalStateOrVersionPattern を縮約。
const TECHNICAL_STATE_NOUNS_SOURCE = [
  '状態', '値', '版', 'バージョン', 'エディション', 'リリース',
  'ブラウザー', 'ブラウザ', 'ページ', 'テンプレート',
  'インスタンス', '設定', '構成', '属性', 'プロパティ',
  'コンポーネント', '要素', 'DOM', 'API', 'パッケージ',
  'イメージ', 'タグ', 'タブ', 'セッション', 'コンテキスト',
  'ノード', '入力', 'フォーム',
].join('|');

const TECHNICAL_STATE_PATTERN = new RegExp(
  '^(?:現在(?:の)?(?:アクティブな|選択中の|表示中の|実行中の|実行される|開いている)?|最新(?:の)?)'
    + `[^。！？、,]{0,18}(?:${TECHNICAL_STATE_NOUNS_SOURCE})`,
  'u',
);

// 時事性主張の文脈(これがあれば技術状態 pattern を上書きして citation 対象に残す)。
const TIME_SENSITIVE_CONTEXT_PATTERN =
  /(?:近年|調査|研究|統計|データ(?:によれば|では|で示|から|を用い|に基づ)|利用(?:率|者|数)|採用|導入|普及|市場|シェア|投資|急速|多く|世界初|国内初|業界初)/u;

const MESSAGE = '根拠が必要そうな主張です。出典、データ、観察条件を示せるか確認してください。';

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

const DEFAULT_OPTIONS = Object.freeze({
  claimPatterns: DEFAULT_CLAIM_PATTERNS.slice(),
  defaultSeverity: 'warning',
});

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildClaimRegex(patterns) {
  const list = (Array.isArray(patterns) ? patterns : [])
    .filter(pattern => typeof pattern === 'string' && pattern.length > 0)
    .map(escapeRegExp);
  if (list.length === 0) return null;
  return new RegExp(list.join('|'), 'gu');
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

function hasParagraphCitation(text) {
  return SOURCE_MARKER_PATTERNS.some(pattern => pattern.test(text));
}

function hasParagraphDataEvidence(text) {
  return DATA_EVIDENCE_PATTERNS.some(pattern => pattern.test(text));
}

function hasAuthorYearCitation(text) {
  const matches = text.matchAll(/[（(]([^（）()]{1,50}(?:[12][0-9]{3})[^（）()]{0,30})[）)]/gu);
  for (const match of matches) {
    const content = match[1].replace(/\s+/g, '');
    if (/^[12][0-9]{3}年?$/.test(content)) continue;
    if (/[A-Za-zぁ-んァ-ン一-龠々]/u.test(content)) return true;
  }
  return false;
}

function hasParagraphStrongEvidence(text) {
  return hasParagraphCitation(text)
    || hasParagraphDataEvidence(text)
    || hasAuthorYearCitation(text);
}

function hasParagraphSourceName(text) {
  return SOURCE_NAME_PATTERNS.some(pattern => pattern.test(text));
}

// `研究でも` / `学術論文でも` が前後の出典提示を受ける橋渡しとして
// 使われ、かつ本文中では「結果」「傾向」が報告される形に限って抑制する。
// standalone と同じく `先行研究では` や `多くの研究で` は広く救わない。
function hasNarrowResearchBridgeContext(text) {
  const hasBridgeAttribution = /(?:^|[。！？、,\s「『（(])(?:研究|学術論文)でも/u.test(text);
  if (!hasBridgeAttribution) return false;
  return /(?:という)?(?:結果|傾向)[^。！？]{0,12}報告されている/u.test(text);
}

function isTechnicalStateOrVersionMatch(text, match) {
  const keyword = match[0];
  if (keyword !== '現在' && keyword !== '最新') return false;
  const tail = text.slice(match.index);
  if (keyword === '現在' && tail.startsWith('現在地')) return true;
  if (TIME_SENSITIVE_CONTEXT_PATTERN.test(text)) return false;
  return TECHNICAL_STATE_PATTERN.test(tail);
}

function mergeOptions(rawOptions) {
  const override = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  return Object.assign({}, DEFAULT_OPTIONS, override);
}

module.exports = function nihongoSloplessCitationNeeded(context, rawOptions) {
  const options = mergeOptions(rawOptions);
  const claimRegex = buildClaimRegex(options.claimPatterns);
  if (!claimRegex) return {};

  const { Syntax, RuleError, report, getSource } = context || {};
  const ParagraphType = (Syntax && Syntax.Paragraph) || 'Paragraph';
  const ListItemType = (Syntax && Syntax.ListItem) || 'ListItem';
  let ignoredDepth = 0;
  const listItemStack = [];

  function reportFinding(finding) {
    const { node, index, length } = finding;
    if (typeof RuleError === 'function' && typeof report === 'function') {
      report(node, new RuleError(MESSAGE, { index }));
    } else if (context && context._fallbackFindings) {
      const absBase = (node && node.range && node.range[0]) || 0;
      context._fallbackFindings.push({
        ruleId: 'nihongo-slopless/citation-needed',
        severity: options.defaultSeverity || 'warning',
        message: MESSAGE,
        index: absBase + index,
        length,
      });
    }
  }

  function queueOrReportFinding(finding) {
    const currentListItem = listItemStack[listItemStack.length - 1];
    if (currentListItem) {
      currentListItem.pendingFindings.push(finding);
      return;
    }
    reportFinding(finding);
  }

  function visitParagraph(node) {
    if (ignoredDepth > 0) return;

    const source = typeof getSource === 'function' ? getSource(node) : (node && node.raw) || '';
    if (!source) return;

    // Paragraph 全体に出典 / データ証拠 / 出典名があれば、その Paragraph の全主張に対して抑制する。
    // これは standalone の structureBlock-level / 隣接文 (同段落) 抑制を近似する。
    // ListItem 内の兄弟 Paragraph evidence は ListItem exit まで保留して狭く抑制する。
    // ただし文書全体や List 全体の引用収集までは行わない。
    const paraEvidence = hasParagraphStrongEvidence(source);
    const paraSourceName = hasParagraphSourceName(source);
    const currentListItem = listItemStack[listItemStack.length - 1];
    if (currentListItem && paraEvidence) currentListItem.hasStrongEvidenceParagraph = true;

    const sentences = splitSentences(source);
    for (const sent of sentences) {
      const text = sent.text;

      const matches = [];
      claimRegex.lastIndex = 0;
      let m;
      while ((m = claimRegex.exec(text)) !== null) {
        matches.push({ index: m.index, length: m[0].length, matchText: m[0] });
        if (claimRegex.lastIndex === m.index) claimRegex.lastIndex += 1;
      }
      if (matches.length === 0) continue;

      // 同一文に出典記法、著者年引用、データ証拠、出典名があれば抑制。
      if (hasParagraphStrongEvidence(text)) continue;
      if (hasParagraphSourceName(text)) continue;

      // standalone と同じく、研究紹介の橋渡し表現だけは狭く抑制する。
      if (hasNarrowResearchBridgeContext(text)) continue;

      // Paragraph レベルで(他の文に)出典、著者年引用、データ証拠、出典名があれば抑制。
      if (paraEvidence) continue;
      if (paraSourceName) continue;

      // 技術状態/版用法は時事主張ではないので抑制(現在のバージョン等)。
      const claimMatches = matches.filter((match) => {
        const original = { 0: match.matchText, index: match.index };
        return !isTechnicalStateOrVersionMatch(text, original);
      });
      if (claimMatches.length === 0) continue;

      const first = claimMatches[0];
      const matchIndex = sent.start + first.index;
      queueOrReportFinding({ node, index: matchIndex, length: first.length });
    }
  }

  const handlers = {
    [ListItemType]() {
      listItemStack.push({
        hasStrongEvidenceParagraph: false,
        pendingFindings: [],
      });
    },
    [`${ListItemType}:exit`]() {
      const finished = listItemStack.pop();
      if (!finished || finished.hasStrongEvidenceParagraph) return;
      for (const finding of finished.pendingFindings) reportFinding(finding);
    },
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
  id: 'nihongo-slopless/citation-needed',
  description: '時事性・実証性のある主張に、根拠表示がない可能性を検出します(軽量版)。',
  defaultOptions: DEFAULT_OPTIONS,
};
