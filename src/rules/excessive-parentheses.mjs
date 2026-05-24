// 括弧補足の過密を検出するルール。
//
// 設計方針:
//   - 段落内の括弧 (...) または （...） を全件抽出する。
//   - 各括弧を「glossary（読者の理解を助ける補足。略語展開・英訳・短い注記）」と
//     「effective（実質的な日本語注釈・条件付記など、本文構造を圧迫する補足）」に分類する。
//   - 検出条件は二段構え:
//       (a) effective が maxEffectivePairsPerParagraph を超える
//       (b) effective を含む段落で、合計が maxTotalPairsPerParagraph を超える
//       (c) 合計が minDensePairsPerParagraph 以上、かつ effective が
//           minEffectivePairsInDenseParagraph 以上
//     いずれかに該当すれば検出する。
//   - glossary 判定は「括弧の中身」と「括弧の直前文字」の両方を見る。
//     直前文字が ASCII 英数字なら、括弧は英略語・英単語に続く glossary 補足である可能性が高い。
//
// 既存の `maxPairsPerParagraph` オプションは後方互換のため、
// 指定があれば maxEffectivePairsPerParagraph として扱う。
//
// 関連: A6（リスト連結による段落結合の問題）は本ルールでは扱わない。
// markdown.mjs の paragraphs 分割が改善された段階で、検出範囲は自動的に整う。

const DEFAULT_GLOSSARY_PATTERNS = Object.freeze([
  // 略号 (ABC, OMO, IMC, ISO-9001 など)
  '^[A-Z][A-Z0-9][A-Z0-9\\-\\s]{0,18}$',
  // 英単語・英短句 (approval record, Annual Review, Notice of Update など)
  '^[A-Za-z][A-Za-z0-9][A-Za-z0-9\\s\\-]{0,48}$',
  // 略号と英単語の混合 (Section 403, Docket No. RM26-4-000 など)
  '^[A-Za-z][A-Za-z0-9\\s\\.\\-]{0,8}\\s*[0-9０-９][0-9０-９\\-]*$',
  // 英数字＋ハイフンの短いコード (RM26-4-000, ISO-9001 など)
  '^[A-Za-z0-9][A-Za-z0-9\\-]{2,15}$',
  // カタカナ語のみ／+ASCII短語 (データセンター, AIデータセンター等 など)
  '^(?:AI\\s*)?[ァ-ヶー・]{1,20}(?:\\s*等|\\s*など)?$',
  // 数値・桁・単位の繰り返し (20MW, 60日, 11月14日, 2026年4月30日, 2025年10月23日 など)
  '^[＞><≥≤]?\\s*(?:[0-9０-９]+(?:\\s*(?:年|月|日|時間|分|秒|円|MW|kW|GW|MWh|kWh|GWh|％|%|[MGKmgk]?[WBＷｗHz]))?)+$',
  // 数値 + 短い和語 (403条, 5件, 上位3件 など)
  '^[0-9０-９]+(?:条|項|号|件|個|本|名|人|社|回|章|節|段|位)$',
  // (1) (2) (a) (b) や (i) (ii) のような列挙ラベル
  '^[0-9０-９a-zａ-ｚⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]{1,3}$',
]);

// 括弧の直前にこのいずれかが直接来ていれば、glossary 寄せの強い信号とする。
// （例: OMO（運用管理室）, IMC（情報管理委員会）, Section 12（…））
const GLOSSARY_PREFIX_HINT = /[A-Za-z0-9）)]$/u;

function buildGlossaryRegex(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  const sources = patterns.filter(value => typeof value === 'string' && value.length > 0);
  if (sources.length === 0) return null;
  try {
    return new RegExp(`(?:${sources.join('|')})`, 'u');
  } catch {
    return null;
  }
}

function classifyParen({ inner, prefixChar, glossaryRegex, maxGlossaryInnerLength }) {
  const trimmed = inner.trim();
  if (!trimmed) return 'glossary';
  if (glossaryRegex && glossaryRegex.test(trimmed)) return 'glossary';
  // 直前が ASCII 英数字なら、ASCII の語 (略号・英単語) に続く glossary 補足の可能性が高い。
  // ただし括弧内が長文（条件節など）であれば effective と判定する。
  if (prefixChar && GLOSSARY_PREFIX_HINT.test(prefixChar) && trimmed.length <= maxGlossaryInnerLength) {
    return 'glossary';
  }
  return 'effective';
}

export const rule = {
  id: 'excessive-parentheses',
  defaultSeverity: 'info',
  description: '括弧補足の過密を検出します。略語展開・英訳・数値注記など、読者の理解を助ける補足はカウントから除外し、実質的な補足の重なりだけを段落単位で検出します。',
  defaultOptions: {
    maxEffectivePairsPerParagraph: 4,
    maxTotalPairsPerParagraph: 9,
    minDensePairsPerParagraph: 5,
    minEffectivePairsInDenseParagraph: 3,
    glossaryParenPattern: [...DEFAULT_GLOSSARY_PATTERNS],
    // ASCII 略号の直後に続く括弧で、内側がこの長さ以下なら glossary 扱いにする。
    maxGlossaryInnerLength: 25,
    // 旧オプション名（後方互換）。指定があれば maxEffectivePairsPerParagraph として扱う。
    maxPairsPerParagraph: null,
  },
  suggestion: '括弧内の情報を本文に昇格するか、不要な補足を削ってください。',
  run({ doc, options }) {
    const findings = [];
    const glossaryRegex = buildGlossaryRegex(options.glossaryParenPattern);
    const effectiveLimit = Number.isFinite(options.maxPairsPerParagraph)
      ? options.maxPairsPerParagraph
      : options.maxEffectivePairsPerParagraph;
    const totalLimit = options.maxTotalPairsPerParagraph;
    const densePairsFloor = Number.isFinite(options.minDensePairsPerParagraph)
      ? options.minDensePairsPerParagraph
      : 5;
    const denseEffectiveFloor = Number.isFinite(options.minEffectivePairsInDenseParagraph)
      ? options.minEffectivePairsInDenseParagraph
      : 3;
    const maxGlossaryInnerLength = Number.isFinite(options.maxGlossaryInnerLength)
      ? options.maxGlossaryInnerLength
      : 25;

    const re = /[（(]([^）)]{1,80})[）)]/gu;

    for (const paragraph of doc.paragraphs) {
      let total = 0;
      let effective = 0;
      let match;
      re.lastIndex = 0;
      while ((match = re.exec(paragraph.text)) !== null) {
        total += 1;
        const innerStart = match.index + 1;
        const prefixChar = match.index > 0 ? paragraph.text[match.index - 1] : '';
        const kind = classifyParen({
          inner: match[1],
          prefixChar,
          glossaryRegex,
          maxGlossaryInnerLength,
        });
        if (kind === 'effective') effective += 1;
        // innerStart only used to silence unused-variable lints in some toolchains.
        void innerStart;
      }
      if (total === 0) continue;

      const overEffective = Number.isFinite(effectiveLimit) && effective > effectiveLimit;
      const overTotal = Number.isFinite(totalLimit) && total > totalLimit && effective > 0;
      const overDenseMixed = (
        Number.isFinite(densePairsFloor)
        && Number.isFinite(denseEffectiveFloor)
        && total >= densePairsFloor
        && effective >= denseEffectiveFloor
      );
      if (!overEffective && !overTotal && !overDenseMixed) continue;

      const reason = overEffective && overTotal
        ? `実質補足が${effective}組、総${total}組`
        : overEffective
          ? `実質補足が${effective}組（総${total}組）`
          : overTotal
            ? `総${total}組（うち実質補足${effective}組）`
            : `総${total}組のうち実質補足が${effective}組`;
      findings.push({
        index: paragraph.start,
        length: Math.min(paragraph.end - paragraph.start, 80),
        message: `括弧補足が多すぎる可能性があります（${reason}）。本文構造で整理できるか確認してください。`,
      });
    }
    return findings;
  },
};
