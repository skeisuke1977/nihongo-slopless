// @nihongo-slopless/textlint-adapter-experimental
// hidden-unicode-controls: ゼロ幅文字や双方向制御文字など、見えない Unicode 制御文字を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/hidden-unicode-controls.mjs) と同じコードポイント集合を使う。
//
// 移植時の方針:
//   - hidden controls は文章スタイルではなく文書整合性の問題として扱う。
//   - standalone と同じく raw text 全体を一度だけ走査し、inline code / code block 内も拾う。
//   - Str / Code / CodeBlock などの子ノード visitor は持たず、重複報告を避ける。
//   - 見えない文字そのものを抜粋表示しにくいため、メッセージは standalone と同じ説明に留める。

'use strict';

const DEFAULT_OPTIONS = Object.freeze({});
const HIDDEN_UNICODE_CONTROL_REGEX = /[\u200B\u200C\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu;
const MESSAGE = '見えないUnicode制御文字があります。コピー由来の混入なら削除してください。';

function getDocumentSource(context, node) {
  if (context && typeof context.getSource === 'function') {
    const fromNode = context.getSource(node);
    if (typeof fromNode === 'string' && fromNode.length > 0) return fromNode;

    const wholeDocument = context.getSource();
    if (typeof wholeDocument === 'string') return wholeDocument;
  }

  if (node && typeof node.raw === 'string') return node.raw;
  return '';
}

module.exports = function nihongoSloplessHiddenUnicodeControls(context) {
  const { Syntax, RuleError, report } = context || {};
  const DocumentType = (Syntax && Syntax.Document) || 'Document';

  return {
    [DocumentType](node) {
      const source = getDocumentSource(context, node);
      if (!source) return;

      HIDDEN_UNICODE_CONTROL_REGEX.lastIndex = 0;
      let match;
      while ((match = HIDDEN_UNICODE_CONTROL_REGEX.exec(source)) !== null) {
        const index = match.index;
        const length = match[0].length;

        if (typeof RuleError === 'function' && typeof report === 'function') {
          report(node, new RuleError(MESSAGE, { index }));
        } else if (context && context._fallbackFindings) {
          context._fallbackFindings.push({
            ruleId: 'nihongo-slopless/hidden-unicode-controls',
            severity: 'error',
            message: MESSAGE,
            index,
            length,
          });
        }
      }
    },
  };
};

module.exports.meta = {
  id: 'nihongo-slopless/hidden-unicode-controls',
  description: 'ゼロ幅文字や双方向制御文字など、見えないUnicode制御文字を検出する。',
  defaultOptions: DEFAULT_OPTIONS,
};
