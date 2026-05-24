// 段落単位で「曖昧な指示詞」の反復を検出するルール。
//
// 設計方針:
// - 指示詞 (これ / それ / あれ / この / その / あの / こうした / そうした /
//   このよう / そのよう / あのよう) が段落内に多く出現することは、
//   書き手の頭の中の文脈が読み手に伝わっていない兆候になり得る。
// - VISION の「文章の責任を可視化」原則に沿い、過剰な誤検出を避けるため
//   段落単位での反復(maxPerParagraph 超過)のみ検出する。
//   個別の指示詞使用は正常な日本語であり、対象としない。
// - 引用段落 (`> ` で始まる行)、コードブロック (markdown.mjs でマスク済み)、
//   見出し直後の独立段落構造はそれぞれの構造により段落として切り出される。
//   引用段落は段落本文の冒頭が `>` で始まるため、ここで除外する。
// - 「そのため」「その他」「このため」など、指示詞でなく接続辞・固定表現として
//   機能する語は除外する。これは `repeated-connectors` (接続辞の反復) と
//   役割を分けるためでもある。
// - 同一段落で「これ」「それ」が混在しても、語種別ではなく合算でカウントする。
//   読み手の負荷は語種を問わず累積するため。
//
// 既知の限界(将来課題):
// - 段落冒頭1文目の指示詞が前段落の名詞句から遠い「長距離参照」は MVP では扱わない。
//   段落跨ぎの被指示語の同定は誤検出が出やすく、別ルールとして検討する。

import { escapeRegExp, stringList, visibleLength } from '../utils.mjs';

const DEFAULT_DEICTIC_PHRASES = [
  'これ', 'それ', 'あれ',
  'この', 'その', 'あの',
  'こうした', 'そうした',
  'このよう', 'そのよう', 'あのよう',
];

// 指示詞の直後にこれらの語が続くと、固定表現・接続辞として機能するため
// 「曖昧な指示詞」とは数えない。これにより `そのため` 等は除外される。
const DEFAULT_FIXED_PHRASE_TAILS = [
  'ため', 'ほか', '他', 'まま', 'うち', 'つど', '上', 'もの',
  'とおり', 'ように', 'ような',
  'ぞれ', 'うえ', '都度',
];

function buildDeicticRegex(phrases, fixedTails) {
  const sortedPhrases = stringList(phrases)
    .slice()
    .sort((a, b) => b.length - a.length);
  if (sortedPhrases.length === 0) return null;

  const alternation = sortedPhrases.map(escapeRegExp).join('|');
  // 指示詞の直後が固定表現の尾部 (例: 「その」+「ため」 → 「そのため」) や
  // 「ら」(「これら」) のときは、独立した指示詞としてカウントしないため
  // 否定先読みで除外する。
  const excludedTailSuffixes = ['ら', ...stringList(fixedTails)];
  const negativeLookahead = excludedTailSuffixes.length > 0
    ? `(?!${excludedTailSuffixes.map(escapeRegExp).join('|')})`
    : '';

  return new RegExp(`(?:${alternation})${negativeLookahead}`, 'gu');
}

function isQuoteParagraph(paragraph) {
  // markdown.mjs の splitStructureBlocks では quote ブロックは独立段落として
  // flush される。段落本文は trimRange で先頭の空白が除去されているので、
  // `>` で始まるかどうかで quote 段落かを判定できる。
  return typeof paragraph.text === 'string' && paragraph.text.startsWith('>');
}

export const rule = {
  id: 'unclear-deictic',
  defaultSeverity: 'info',
  description: '段落内で指示詞が多く反復し、参照先が曖昧な可能性のある箇所を検出します。',
  defaultOptions: {
    deicticPhrases: DEFAULT_DEICTIC_PHRASES,
    fixedPhraseTails: DEFAULT_FIXED_PHRASE_TAILS,
    maxPerParagraph: 3,
    minParagraphChars: 80,
  },
  suggestion: '指示詞を具体的な名詞に置き換えるか、段落構造を再編して参照先を近づけてください。',
  run({ doc, options }) {
    const regex = buildDeicticRegex(
      options.deicticPhrases ?? DEFAULT_DEICTIC_PHRASES,
      options.fixedPhraseTails ?? DEFAULT_FIXED_PHRASE_TAILS,
    );
    if (!regex) return [];

    const findings = [];
    for (const paragraph of doc.paragraphs) {
      if (isQuoteParagraph(paragraph)) continue;
      if (visibleLength(paragraph.text) < options.minParagraphChars) continue;

      const matches = [...paragraph.text.matchAll(regex)];
      const count = matches.length;
      if (count > options.maxPerParagraph) {
        findings.push({
          index: paragraph.start,
          length: Math.min(paragraph.end - paragraph.start, 80),
          message: `指示詞が段落内で多く反復しています(段落内${count}回)。先に明示すべき名詞句が省略されていないか確認してください。`,
        });
      }
    }
    return findings;
  },
};
