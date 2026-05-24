import { stripInlineUrls, visibleLength } from '../utils.mjs';

function stripBalancedDelimited(text, open, close) {
  let out = '';
  let cursor = 0;
  let keptStart = 0;
  let depth = 0;

  while (cursor < text.length) {
    if (text.startsWith(open, cursor)) {
      if (depth === 0) out += text.slice(keptStart, cursor);
      depth += 1;
      cursor += open.length;
      continue;
    }
    if (depth > 0 && text.startsWith(close, cursor)) {
      depth -= 1;
      cursor += close.length;
      if (depth === 0) keptStart = cursor;
      continue;
    }
    cursor += 1;
  }

  if (depth === 0) out += text.slice(keptStart);
  return out;
}

function stripMediaWikiJsonMetadata(text) {
  const hasJsonLikeMetadata = /"\s*:\s*\{\s*"wt"\s*:|"\s*,\s*"i"\s*:/u.test(text);
  if (!hasJsonLikeMetadata) return text;

  return text
    .replace(/"[^"\n]{1,80}"\s*:\s*\{\s*"wt"\s*:\s*"(?:\\.|[^"\\])*"\s*\}/gu, ' ')
    .replace(/\{\s*"wt"\s*:\s*"(?:\\.|[^"\\])*"\s*\}/gu, ' ')
    .replace(/"[^"\n]{1,80}"\s*:\s*"(?:\\.|[^"\\])*"/gu, ' ')
    .replace(/(?:^|[\s,{}\[\]])"i"\s*:\s*\d+(?:[\s,{}\[\]])*/gu, ' ')
    .replace(/[{}\[\],":<>]+/gu, ' ');
}

function replaceMediaWikiLinks(text) {
  return text.replace(/\[\[([^\]\n]+)\]\]/gu, (_, body) => {
    const trimmed = body.trim();
    if (/^(?:ファイル|画像|File|Image|Category|カテゴリ):/iu.test(trimmed)) return '';
    const visible = trimmed.includes('|') ? trimmed.slice(trimmed.lastIndexOf('|') + 1) : trimmed;
    return visible.replace(/^:+/u, '').trim();
  });
}

function stripMediaWikiArtifacts(text) {
  let stripped = stripMediaWikiJsonMetadata(text);
  stripped = stripBalancedDelimited(stripped, '{{', '}}');
  stripped = replaceMediaWikiLinks(stripped);
  return stripped
    .replace(/__[\p{Lu}0-9_]+__/gu, '')
    .replace(/\\[rn]/gu, ' ');
}

// 生 HTML タグ自体は読み手の負荷ではない(レンダリング時には消える)ので長さ計測から除外する。
// `<a id="..." class="...">` のような長い属性付きタグが本文に残ったケースで、
// 「タグの長さ」が「文の長さ」に積み上がるのを避ける。タグ内側の可視テキストは保持する。
// MathJax 等の `<math>...</math>` の本文も可視テキストとして残す(タグだけ消す)。
function stripHtmlTags(text) {
  return text.replace(/<\/?[a-zA-Z][^>]*>/gu, '');
}

export const rule = {
  id: 'long-sentence',
  defaultSeverity: 'warning',
  description: '長すぎる文を検出します。日本語の技術文では、1文に複数の論点が詰まると読み手が迷います。URL、引用リンク、MediaWiki由来のテンプレート残渣、生 HTML タグは「読み手の負荷」として扱いにくいため、長さ計測から除外します。',
  defaultOptions: { maxChars: 110, errorChars: 170 },
  suggestion: '主語、根拠、結論を分け、1文1論点に近づけてください。',
  run({ doc, options }) {
    const findings = [];
    for (const sentence of doc.sentences) {
      const proseText = stripMediaWikiArtifacts(stripHtmlTags(stripInlineUrls(sentence.text)));
      const len = visibleLength(proseText);
      if (len > options.maxChars) {
        findings.push({
          index: sentence.start,
          length: Math.min(sentence.end - sentence.start, 80),
          severity: len > options.errorChars ? 'error' : undefined,
          message: `1文が長すぎます（${len}字）。複数の論点を分けられるか確認してください。`,
        });
      }
    }
    return findings;
  },
};
