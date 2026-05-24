// @nihongo-slopless/textlint-adapter-experimental
// headline-decoration: 本文情報より目立つ見出し装飾を検出する。
//
// これは「試作品」です。npm publish を目的としていません。
// standalone (src/rules/headline-decoration.mjs) と同じ正規表現・メッセージを使う。
//
// 移植時の差分メモ:
//   - standalone は maskedText 全体の行頭を走査する。
//   - textlint 版は Heading/Header ノードだけを走査し、本文・表・コード内の同じ記号列は対象外にする。
//   - textlint parser の種類により見出しノード名が Header / Heading に分かれるため両方に対応する。

'use strict';

const DEFAULT_OPTIONS = Object.freeze({});
const HEADLINE_DECORATION_REGEX = /^(?:#{1,6}\s*)?(?:[★☆◆◇■□●◎✨🔥🚀]+\s*){2,}.+$/gmu;
const MESSAGE =
  '見出し装飾が本文情報より目立つ可能性があります。媒体の目的、読者、情報構造に合うか確認してください。';

module.exports = function nihongoSloplessHeadlineDecoration(context) {
  const { Syntax, RuleError, report, getSource } = context || {};
  const HeaderType = (Syntax && Syntax.Header) || 'Header';
  const HeadingType = (Syntax && Syntax.Heading) || 'Heading';

  function visitHeading(node) {
    const source =
      typeof getSource === 'function' ? getSource(node) : (node && (node.raw || node.value)) || '';
    if (!source) return;

    const absBase = (node && node.range && node.range[0]) || 0;
    HEADLINE_DECORATION_REGEX.lastIndex = 0;
    let match;
    while ((match = HEADLINE_DECORATION_REGEX.exec(source)) !== null) {
      const index = match.index;
      const length = Math.min(match[0].length, 80);

      if (typeof RuleError === 'function' && typeof report === 'function') {
        report(node, new RuleError(MESSAGE, { index }));
      } else if (context && context._fallbackFindings) {
        context._fallbackFindings.push({
          ruleId: 'nihongo-slopless/headline-decoration',
          severity: 'info',
          message: MESSAGE,
          index: absBase + index,
          length,
        });
      }
    }
  }

  const handlers = {};
  handlers[HeaderType] = visitHeading;
  handlers[HeadingType] = visitHeading;
  return handlers;
};

module.exports.meta = {
  id: 'nihongo-slopless/headline-decoration',
  description: '本文情報より目立つ見出し装飾を検出します。',
  defaultOptions: DEFAULT_OPTIONS,
};
