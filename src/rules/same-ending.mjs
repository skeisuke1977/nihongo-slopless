import { sentenceEnding } from '../utils.mjs';

function hasSectionBoundaryBetween(previousSentence, nextSentence) {
  return previousSentence.structureSectionIndex !== undefined
    && nextSentence.structureSectionIndex !== undefined
    && previousSentence.structureSectionIndex !== nextSentence.structureSectionIndex;
}

function sentenceSourceStart(sentence) {
  return sentence.rawStart ?? sentence.start;
}

function sentenceSourceEnd(sentence) {
  return sentence.rawEnd ?? sentence.end;
}

function streakSource(doc, streak) {
  return doc.text.slice(sentenceSourceStart(streak[0]), sentenceSourceEnd(streak.at(-1)));
}

function previousNonBlankLine(doc, streak) {
  const before = doc.text.slice(0, sentenceSourceStart(streak[0]));
  const lines = before.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  return lines.at(-1) ?? '';
}

function countPattern(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function isListStreak(streak) {
  return streak.length > 0 && streak.every(sentence => sentence.structureKind === 'list');
}

function hasRepeatedListLabels(source, streakLength) {
  const labelledLines = source.split(/\r?\n/u)
    .filter(line => line.trim())
    .filter(line => /^\s*(?:[-+*]|\d+[.)])\s+(?:`[^`]+`|[A-Za-z][A-Za-z0-9_-]*|[\p{Script=Han}ぁ-んァ-ンA-Za-z0-9_-]{1,24})\s*[:：]/u.test(line));
  return labelledLines.length >= streakLength;
}

function hasSpecCue(text) {
  return /(?:仕様|設定|形式|manifest|profile|schema|JSON|CLI|API|EOF|コードフェンス|コメント|無視|入力|出力|各行|ルールID|finding\.index)/u.test(text);
}

function isStructuralListRepetition(doc, streak) {
  if (!isListStreak(streak)) return false;

  const source = streakSource(doc, streak);
  const intro = previousNonBlankLine(doc, streak);
  const codeRefCount = countPattern(source, /`[^`]+`/gu);
  const updateIntro = /(?:直近で改善したもの|[0-9]{4}-[0-9]{2}-[0-9]{2}\s*の改善|更新履歴|変更履歴|修正履歴|改善|リリースノート)[:：]?\s*$/u.test(intro);
  const exampleIntro = /(?:望ましい表現|避けたい表現|検出例|検出しない例|修正例|例示)[:：]\s*$/u.test(intro);

  if (exampleIntro) return true;
  if (updateIntro && codeRefCount >= Math.ceil(streak.length / 2)) return true;
  return hasRepeatedListLabels(source, streak.length) && hasSpecCue(`${intro}\n${source}`);
}

function isSpecificationParagraphRepetition(doc, streak) {
  if (!streak.every(sentence => sentence.structureKind === 'normal')) return false;

  const source = streakSource(doc, streak);
  const codeRefCount = countPattern(source, /`[^`]+`/gu);
  const proceduralSpec = /(?:対象にします|無視しません|扱いません|固定します|持たせます|分けます|保存します|返します|抑制され得ます)/u.test(source);
  return codeRefCount >= 3 && hasSpecCue(source) && proceduralSpec;
}

function shouldSuppressStructuralRepetition(doc, streak) {
  return isStructuralListRepetition(doc, streak)
    || isSpecificationParagraphRepetition(doc, streak);
}

export const rule = {
  id: 'same-ending',
  defaultSeverity: 'info',
  description: '同じ文末が連続し、読みのリズムが固定されている箇所を検出します。',
  defaultOptions: { consecutive: 4 },
  suggestion: '文の長短、述語、体言止めの有無を調整し、意図したリズムか確認してください。',
  run({ doc, options }) {
    const findings = [];

    const emitStreak = (ending, streak) => {
      if (!ending || streak.length < options.consecutive) return;
      if (shouldSuppressStructuralRepetition(doc, streak)) return;
      findings.push({
        index: streak[0].start,
        length: Math.min(streak.at(-1).end - streak[0].start, 80),
        message: `「${ending}」調の文末が${streak.length}文連続しています。意図したリズムか確認してください。`,
      });
    };

    let streak = [];
    let current = '';
    let previousSentence = null;

    for (const sentence of doc.sentences) {
      if (previousSentence && hasSectionBoundaryBetween(previousSentence, sentence)) {
        emitStreak(current, streak);
        current = '';
        streak = [];
      }

      const ending = sentenceEnding(sentence.text);
      if (ending && ending === current) {
        streak.push(sentence);
      } else {
        emitStreak(current, streak);
        current = ending;
        streak = ending ? [sentence] : [];
      }
      previousSentence = sentence;
    }
    emitStreak(current, streak);

    return findings;
  },
};
