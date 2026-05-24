import { hasEvidenceMarker, patternAlternationRegex, stringList } from '../utils.mjs';

// 強度語 (intensifier): 「どれくらい」を示す副詞・連体修飾語
const intensifiers = [
  '大幅に',
  '劇的に',
  '飛躍的に',
  '著しく',
  '顕著に',
  '大きく',
  '圧倒的に',
  '画期的に',
  '爆発的に',
  '急速に',
  '急激に',
  '大幅な',
  '劇的な',
  '飛躍的な',
  '顕著な',
  '大きな',
  '圧倒的な',
  '画期的な',
  '爆発的な',
  '急速な',
  '急激な',
  '著しい',
];

// 効果語 (effect): 量・状態の変化・成果を示す名詞・動詞語幹
const effects = [
  '向上',
  '改善',
  '増加',
  '減少',
  '拡大',
  '縮小',
  '低下',
  '加速',
  '前進',
  '変化',
  '発展',
  '成長',
  '普及',
  '低減',
  '削減',
  '促進',
  '効率化',
  '成果',
  '効果',
  '影響',
];

// 数値・量を表すパターン (０〜９は全角数字 U+FF10〜U+FF19)
const numericPatterns = [
  '[0-9\\uFF10-\\uFF19]+(?:[.．][0-9\\uFF10-\\uFF19]+)?\\s*(?:%|％|パーセント|ポイント|倍|割|分|人|件|台|社|店|校|名|億|兆|万|円|円台|m|km|kg|分間|秒|分|時間)',
  '(?:半|[1-9])(?:割|分|倍)',
  '[0-9\\uFF10-\\uFF19]+(?:年|か月|ヶ月|カ月|月|週|日|時間)',
];

// 期間・対比表現
const comparisonPatterns = [
  '(?:今年|昨年|前年|前期|前回|当社|従来|過去最高|過去最低)(?:比|より|から|と比べて|に比べて|に比して)',
  '(?:前年|前期|前回|当社|従来)比',
  '過去最(?:高|低|大|小)',
  '[0-9\\uFF10-\\uFF19]+(?:年|か月|ヶ月|カ月|月|週|日)(?:で|に|間で|間に|間)',
];

function buildEvidenceRegex(numericList, comparisonList) {
  const sources = [...stringList(numericList), ...stringList(comparisonList)];
  if (sources.length === 0) return null;
  return new RegExp(sources.join('|'), 'u');
}

function buildIntensifierRegex(values) {
  return patternAlternationRegex(
    stringList(values).map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'gu',
  );
}

function buildEffectRegex(values) {
  return patternAlternationRegex(
    stringList(values).map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'u',
  );
}

function crossesClaimBoundary(text) {
  return /[、，。．；;：:]/u.test(text);
}

function bridgesConceptNoun(text) {
  return /(?:意味|意義|違い|差|特徴|論点|観点|視点|問い|理由|目的|条件|前提)(?:は|が|を|に|も|とは|では|でも|として|から)/u.test(text);
}

function isNonAssertedEffectTail(text) {
  return /^(?:(?:し|する|した|している|される|された)?かどうか|の(?:有無|違い|比較|説明|定義|意味)|ではなく|でなく|とは|という)/u.test(text);
}

function inQuotedSpan(sentenceText, relativeIndex) {
  // 「」『』内かどうかを左側からカウントして粗く判定
  const head = sentenceText.slice(0, relativeIndex);
  const open1 = (head.match(/「/gu) ?? []).length;
  const close1 = (head.match(/」/gu) ?? []).length;
  if (open1 > close1) return true;
  const open2 = (head.match(/『/gu) ?? []).length;
  const close2 = (head.match(/』/gu) ?? []).length;
  return open2 > close2;
}

function isInListLineWithCounter(line) {
  // 「- 来場者300人」のような短いリスト行は、数値が文末にあれば文窓では拾われる。
  // ここは特別扱いしない。
  return /^\s*(?:[-+*]|\d+[.)])\s+/u.test(line);
}

export const rule = {
  id: 'no-numerics-claim',
  defaultSeverity: 'warning',
  description: '効果主張の強度語が、数値・期間・対比を伴わずに使われている可能性を検出します。',
  defaultOptions: {
    intensifiers,
    effects,
    numericPatterns,
    comparisonPatterns,
    evidenceWindowChars: 50,
    suppressIfNumericInWindow: true,
  },
  suggestion: '数値、期間、対比、出典のいずれかを補えるか確認してください。',
  run({ doc, options }) {
    const intensifierRegex = buildIntensifierRegex(options.intensifiers);
    const effectRegex = buildEffectRegex(options.effects);
    if (!intensifierRegex || !effectRegex) return [];

    const evidenceRegex = options.suppressIfNumericInWindow
      ? buildEvidenceRegex(options.numericPatterns, options.comparisonPatterns)
      : null;
    const windowChars = Math.max(0, Number(options.evidenceWindowChars ?? 50));
    const findings = [];

    for (const sentence of doc.sentences) {
      const sentenceText = sentence.text;
      const matches = [...sentenceText.matchAll(intensifierRegex)];
      if (matches.length === 0) continue;

      for (const match of matches) {
        const relativeIndex = match.index;
        const intensifier = match[0];
        const tail = sentenceText.slice(relativeIndex + intensifier.length);

        // 強度語の直後 (連結助詞などを挟まず) に効果語が来ているかを確認する。
        // 強度語の直後12文字以内に効果語が出現する場合のみ「効果主張」と見なす。
        const proximityWindow = tail.slice(0, 12);
        const effectMatch = effectRegex.exec(proximityWindow);
        if (!effectMatch) continue;

        const between = proximityWindow.slice(0, effectMatch.index);
        const effectTail = tail.slice(effectMatch.index + effectMatch[0].length);
        if (crossesClaimBoundary(between)) continue;
        if (bridgesConceptNoun(between)) continue;
        if (isNonAssertedEffectTail(effectTail)) continue;

        // 引用内なら除外
        if (inQuotedSpan(sentenceText, relativeIndex)) continue;

        // 文＋前後 windowChars に証拠 (数値・期間・対比・出典) があれば除外
        const docStart = Math.max(0, sentence.start - windowChars);
        const docEnd = Math.min(doc.maskedText.length, sentence.end + windowChars);
        const contextText = doc.maskedText.slice(docStart, docEnd);

        if (evidenceRegex && evidenceRegex.test(contextText)) continue;
        if (hasEvidenceMarker(contextText)) continue;

        findings.push({
          index: sentence.start + relativeIndex,
          length: intensifier.length + effectMatch.index + effectMatch[0].length,
          message: '強度の修飾語に対して、数値、期間、対比、出典が見当たりません。どれだけ、いつから、何と比べたのかを補えるか確認してください。',
        });

        // 同一文の重複指摘を避けるため、最初の1件で打ち切る
        break;
      }
    }

    return findings;
  },
};
