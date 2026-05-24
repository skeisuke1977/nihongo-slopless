import { findAll, countMatches, literalAlternationRegex, hasEvidenceMarker } from '../utils.mjs';

const phrases = [
  '一般に',
  '一般的に',
  '多くの場合',
  '多くの場面で',
  'しばしば',
  '多くの人',
  '多くの研究',
  'と言われている',
  'とされている',
  'と考えられている',
  '可能性がある',
  '可能性が高い',
  '示唆される',
  '考えられる',
  '期待される',
  '重要である',
];

// Source-attribution markers that the rule treats as "evidence is nearby".
// When one of these appears in the same sentence or within the surrounding
// raw-text window, we assume the writer has already disclosed where the claim
// comes from and skip the single-phrase finding. This is intentionally broad:
// the rule's goal is to nudge the writer toward responsibility, so once the
// source is on the page the nudge is no longer needed.
const evidenceContextPatterns = [
  // Reporting / disclosure verbs and nouns
  /報道|報じ|公表|発表|公式|声明|会見|談話|談合|公報|公開|公告|公示|公布|公開状/u,
  // Documents and channels
  /ガイダンス|ガイドライン|ヘルプ(?:センター|ページ)?|FAQ|よくある質問|リリース(?:ノート)?|プレスリリース|報告書|報告|論文|記事|資料|文書|通知|案内|声明文|アナウンス|お知らせ/u,
  // Institutional / authority sources
  /(?:政府|省庁|庁|省|府|内閣|議会|国会|委員会|委員|機関|当局|当社|当機関|裁判所|条約|条例|規則|法令|法律|法案|憲法)/u,
  // Well-known acronyms / national bodies
  /IPA|NHK|JIS|ISO|IEEE|ACM|WHO|UN|EU|OECD|G7|G20|FTC|FCC|FDA|SEC|GDPR|景表法|個人情報保護法|薬機法|労基法|公取委|金融庁|総務省|経産省|文科省|厚労省|国交省|警察庁|消費者庁|内閣府|金融機関|地方自治体/u,
  // Major corporate names that commonly carry product-spec claims
  /マイクロソフト|Google|グーグル|Apple|アップル|Meta|メタ|Amazon|アマゾン|OpenAI|Anthropic|アンソロピック|NVIDIA|オラクル|IBM|Intel|AMD|Samsung|サムスン|Sony|ソニー|Toyota|トヨタ|Tesla|テスラ|スペースX|Twitter|ツイッター|Facebook|フェイスブック|Instagram|YouTube|TikTok|ChatGPT/u,
  // Generic corporate suffix references
  /[A-Z][A-Za-z0-9]+(?:\s*社|\s*Inc\.?|\s*Corp\.?|\s*Ltd\.?|\s*GmbH|\s*Co\.?,?\s*Ltd\.?)/u,
  /[一-龠ァ-ヴ][一-龠ァ-ヴA-Za-z0-9]{0,12}(?:株式会社|有限会社|合同会社|社\b)/u,
  // Attribution constructions
  /(?:[によに]?(?:よれば|よると)|[によに]ると|[によに]よれば|の(?:話|説明|見解|発言|主張|報告)|の(?:資料|報告書|論文|発表|公式)|が(?:発表|公表|公開|報告|警告|指摘|主張|説明))/u,
  // Markdown inline link [...] (url) — the visible label survives masking
  /\[[^\]]+\]\([^)]+\)/u,
  // Bare URLs and citation hints
  /https?:\/\//u,
];

// Look around the raw-text window for evidence even if the matching sentence
// itself does not contain it. Reports often place "報道によると..." in the
// preceding or following sentence; treating both as cooperating with the
// source disclosure avoids penalising writers who do attribute their claims.
function hasEvidenceContext(rawText, sentenceStart, sentenceEnd, windowChars = 30) {
  const windowStart = Math.max(0, sentenceStart - windowChars);
  const windowEnd = Math.min(rawText.length, sentenceEnd + windowChars);
  const window = rawText.slice(windowStart, windowEnd);
  if (hasEvidenceMarker(window)) return true;
  return evidenceContextPatterns.some(pattern => pattern.test(window));
}

// Markdown table cells are tabular data, not flowing prose. Phrases like
// "「説明不足」と言われている" inside a cell are labels, not assertions made by
// the writer in body text. Detect table lines by checking the surrounding line
// in the raw text — masked text preserves layout so the pipes are still there.
function isInsideTableLine(rawText, index) {
  let lineStart = index;
  while (lineStart > 0 && rawText[lineStart - 1] !== '\n') lineStart -= 1;
  let lineEnd = index;
  while (lineEnd < rawText.length && rawText[lineEnd] !== '\n') lineEnd += 1;
  const line = rawText.slice(lineStart, lineEnd).replace(/\r$/u, '');
  return /^\s*\|.*\|\s*$/u.test(line);
}

const concreteQuantityPattern =
  /[0-9０-９]+(?:[.,．][0-9０-９]+)?\s*(?:倍|%|％|パーセント|年|年度|か月|カ月|ヶ月|月|日|円|万円|億円|ドル|人|件|社|基|台)?/u;

const policyContextPattern =
  /免税|税額|税率|控除額|料率|補助額|助成額|上限|下限|基準|法定|枠|規模|生産能力|生産量|工場|期限|期間/u;

const boundaryCuePattern = /まで|以内|以上|以下|未満|超(?:え|過)?|上限|下限|最大|最低|規模|枠/u;

function isConcretePolicyQuantityStatement(rawText, sentenceStart, sentenceEnd, phrase) {
  if (phrase !== 'とされている') return false;
  const sentenceText = rawText.slice(sentenceStart, sentenceEnd);
  return (
    concreteQuantityPattern.test(sentenceText) &&
    policyContextPattern.test(sentenceText) &&
    boundaryCuePattern.test(sentenceText)
  );
}

const singlePhraseRegex = /(?:多くの研究|と言われている|とされている|と考えられている)/gu;

export const rule = {
  id: 'weasel-phrases',
  defaultSeverity: 'warning',
  description: '責任の所在や根拠を確認したい表現の重なりを検出します。',
  defaultOptions: { phrases, maxPerParagraph: 3 },
  suggestion: '誰が言っているのか、どのデータに基づくのか、条件は何かを本文で補えるか確認してください。',
  run({ doc, options }) {
    const regex = literalAlternationRegex(options.phrases);
    const findings = [];

    if (regex) {
      for (const paragraph of doc.paragraphs) {
        const count = countMatches(paragraph.text, regex);
        if (count > options.maxPerParagraph) {
          findings.push({
            index: paragraph.start,
            length: Math.min(paragraph.end - paragraph.start, 80),
            message: `確認したい表現が重なっています（段落内${count}件）。根拠、主体、条件を本文で補えるか確認してください。`,
          });
        }
      }
    }

    for (const match of findAll(doc.maskedText, singlePhraseRegex)) {
      // Identify the sentence containing this match so we can scope evidence
      // detection. Falling back to the masked region around the match keeps
      // behaviour stable when the lexer did not split a sentence (e.g. list
      // bullets that never reached a sentence terminator).
      const sentence = doc.sentences.find(s => s.start <= match.index && match.index < s.end);
      const sentenceStart = sentence ? sentence.start : match.index;
      const sentenceEnd = sentence ? sentence.end : match.index + match[0].length;

      if (isInsideTableLine(doc.text, match.index)) continue;
      if (hasEvidenceContext(doc.text, sentenceStart, sentenceEnd)) continue;
      if (isConcretePolicyQuantityStatement(doc.text, sentenceStart, sentenceEnd, match[0])) continue;

      findings.push({
        index: match.index,
        length: match[0].length,
        message: '根拠や見解の出どころが本文だけでは見えにくい表現です。出典、調査対象、誰の見解かを示せるか確認してください。',
      });
    }
    return findings;
  },
};
