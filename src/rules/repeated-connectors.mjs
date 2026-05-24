// 文頭接続語の反復検出ルール。
//
// 設計方針:
// - 接続語の反復は、見出し、空行、コードフェンス、罫線などの「節境界」を
//   またいで数えない。これは `same-ending` ルールと同じ節境界判定を使う。
// - `doc.sentences` には `structureSectionIndex` が付与されているため、
//   接続語の出現を節ごとに分けて集計し、節内のみで window/minRepeats を見る。
// - これにより、別々の `##` セクションに 1 回ずつ現れる「つまり」を
//   反復としてカウントしない。

const DEFAULT_CONNECTOR_REGEX = /^(また|さらに|一方で|しかし|つまり|要するに|したがって|そのため|なお|まず|次に)[、,]/u;

function hasSectionBoundaryBetween(previousSentence, nextSentence) {
  return previousSentence.structureSectionIndex !== undefined
    && nextSentence.structureSectionIndex !== undefined
    && previousSentence.structureSectionIndex !== nextSentence.structureSectionIndex;
}

function collectConnectorRuns(sentences, regex) {
  // 節境界をまたがない連続した接続語出現列(run)を返す。
  const runs = [];
  let current = [];
  let previousSentence = null;

  for (const sentence of sentences) {
    if (previousSentence && hasSectionBoundaryBetween(previousSentence, sentence)) {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    }
    const match = sentence.text.trim().match(regex);
    if (match) {
      current.push({ word: match[1], sentence });
    }
    previousSentence = sentence;
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function findRepeatedInRun(run, options) {
  const findings = [];
  for (let i = 0; i <= run.length - options.minRepeats; i += 1) {
    const slice = run.slice(i, i + options.window);
    const counts = new Map();
    for (const item of slice) counts.set(item.word, (counts.get(item.word) ?? 0) + 1);
    for (const [word, count] of counts.entries()) {
      if (count >= options.minRepeats) {
        const first = slice.find(x => x.word === word);
        findings.push({
          index: first.sentence.start,
          length: word.length,
          message: `文頭の「${word}」が近い範囲で反復しています。論理関係を別の形で示せるか確認してください。`,
        });
        i += options.window - 1;
        break;
      }
    }
  }
  return findings;
}

export const rule = {
  id: 'repeated-connectors',
  defaultSeverity: 'info',
  description: '文頭接続語の反復を検出します。',
  defaultOptions: { window: 6, minRepeats: 3 },
  suggestion: '接続語で構造を作るのではなく、段落構造や見出しで論理を見せられないか確認してください。',
  run({ doc, options }) {
    const regex = DEFAULT_CONNECTOR_REGEX;
    const runs = collectConnectorRuns(doc.sentences, regex);
    return runs.flatMap(run => findRepeatedInRun(run, options));
  },
};
