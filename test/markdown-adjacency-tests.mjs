import assert from 'node:assert/strict';
import { allRules, lintText } from '../src/index.mjs';
import { createMarkdownAdjacency } from '../src/markdown-adjacency.mjs';
import { prepareMarkdown } from '../src/markdown.mjs';

const URL = 'https://example.invalid';
const DECORATIONS = [
  ['plain', value => value],
  ['strong', value => `**${value}**`],
  ['emphasis', value => `*${value}*`],
  ['strikethrough', value => `~~${value}~~`],
  ['inline link', value => `[${value}](${URL})`],
  ['nested strong + link', value => `**[${value}](${URL})**`],
];

const decoratedOnly = DECORATIONS.slice(1);
const onlyRuleConfig = shortId => ({
  rules: Object.fromEntries(allRules.map(rule => [rule.id, rule.id === shortId ? 'warning' : false])),
});

function findingsFor(shortId, text) {
  return lintText(text, {
    filePath: '<markdown-adjacency-test>',
    config: onlyRuleConfig(shortId),
  }).messages.filter(message => message.ruleId === `nihongo-slopless/${shortId}`);
}

function replaceOnce(text, target, replacement) {
  const index = text.indexOf(target);
  assert.notEqual(index, -1, `fixture target must exist: ${target}`);
  return text.slice(0, index) + replacement + text.slice(index + target.length);
}

export function runMarkdownAdjacencyTests() {
  let assertions = 0;
  const equal = (actual, expected, message) => {
    assertions += 1;
    assert.equal(actual, expected, message);
  };
  const deepEqual = (actual, expected, message) => {
    assertions += 1;
    assert.deepEqual(actual, expected, message);
  };
  const ok = (value, message) => {
    assertions += 1;
    assert.ok(value, message);
  };

  // Helper completeness and source mapping contracts.
  {
    const text = '甲乙丙丁';
    const adjacency = createMarkdownAdjacency(text);
    const before = adjacency.before(3, { maxViewChars: 8, minSourceOffset: 0 });
    equal(before.text, '甲乙丙', 'before text is returned left-to-right');
    deepEqual(before.sourceOffsets, [0, 1, 2], 'before offsets are left-to-right');
    equal(before.stopReason, 'source-boundary', 'before reaches source boundary');
    equal(before.complete, true, 'source-boundary is complete');
    equal(before.reachedSourceBoundary, true, 'source-boundary is reached');
    equal(before.complete, before.reachedSourceBoundary, 'completeness invariant');
    equal(before.sourceStart, 0, 'before sourceStart');
    equal(before.sourceEnd, 3, 'before sourceEnd');
    equal(text.slice(before.sourceStart, before.sourceEnd), '甲乙丙', 'before half-open source range');
    equal(before.originalOffsetAt(1), 1, 'originalOffsetAt');
    deepEqual(before.originalRange(1, 3), { start: 1, end: 3 }, 'originalRange');

    const limited = adjacency.after(0, { maxViewChars: 2, maxSourceOffset: text.length });
    equal(limited.text, '甲乙', 'max-view-chars text');
    equal(limited.stopReason, 'max-view-chars', 'max-view-chars stop reason');
    equal(limited.complete, false, 'max-view-chars incomplete');
    equal(limited.reachedSourceBoundary, false, 'max-view-chars does not reach boundary');
    equal(limited.complete, limited.reachedSourceBoundary, 'limited completeness invariant');

    const simultaneous = adjacency.after(0, { maxViewChars: 2, maxSourceOffset: 2 });
    equal(simultaneous.stopReason, 'source-boundary', 'source boundary wins simultaneous limit');
    equal(simultaneous.complete, true, 'simultaneous boundary is complete');

    const bounded = adjacency.after(0, { maxViewChars: 8, maxSourceOffset: 2 });
    equal(bounded.text, '甲乙', 'source boundary limits collected text');
    ok(bounded.sourceOffsets.every(offset => offset < 2), 'source boundary limits offsets');

    deepEqual(before.originalRange(-10, 999), { start: 0, end: 3 }, 'originalRange clamps to full view');
    deepEqual(before.originalRange(999, 999), { start: before.sourceEnd, end: before.sourceEnd }, 'originalRange clamps beyond view to sourceEnd');
    deepEqual(before.originalRange(NaN, NaN), { start: 0, end: 3 }, 'originalRange normalizes non-finite values');
    deepEqual(before.originalRange(1, 0), { start: 1, end: 1 }, 'originalRange normalizes reversed range to empty');
  }

  // Presentation-only tails do not make an otherwise complete view incomplete.
  for (const text of ['**甲**', '[甲](https://example.invalid)', '~~甲~~']) {
    const view = createMarkdownAdjacency(text).after(0, {
      maxViewChars: 1,
      maxSourceOffset: text.length,
    });
    equal(view.text, '甲', `presentation-only after text: ${text}`);
    equal(view.stopReason, 'source-boundary', `presentation-only after stop: ${text}`);
    equal(view.complete, true, `presentation-only after complete: ${text}`);
    equal(view.reachedSourceBoundary, true, `presentation-only after reached boundary: ${text}`);
    equal(view.sourceEnd, text.length, `presentation-only after sourceEnd: ${text}`);
  }

  {
    const text = '**甲**';
    const view = createMarkdownAdjacency(text).before(text.length, {
      maxViewChars: 1,
      minSourceOffset: 0,
    });
    equal(view.text, '甲', 'presentation-only before text');
    equal(view.stopReason, 'source-boundary', 'presentation-only before stop');
    equal(view.complete, true, 'presentation-only before complete');
    equal(view.reachedSourceBoundary, true, 'presentation-only before reached boundary');
    equal(view.sourceStart, 0, 'presentation-only before sourceStart');
  }

  for (const [text, direction] of [['**甲**乙', 'after'], ['乙**甲**', 'before']]) {
    const adjacency = createMarkdownAdjacency(text);
    const view = direction === 'after'
      ? adjacency.after(0, { maxViewChars: 1, maxSourceOffset: text.length })
      : adjacency.before(text.length, { maxViewChars: 1, minSourceOffset: 0 });
    equal(view.text, '甲', `literal remainder text: ${text}`);
    equal(view.stopReason, 'max-view-chars', `literal remainder stop: ${text}`);
    equal(view.complete, false, `literal remainder incomplete: ${text}`);
    equal(view.reachedSourceBoundary, false, `literal remainder boundary: ${text}`);
  }

  // Transparent presentation delimiters and hidden link destinations.
  for (const [format, decorate] of decoratedOnly) {
    const text = `前${decorate('語')}後`;
    const matchIndex = text.indexOf('語');
    const before = createMarkdownAdjacency(text).before(matchIndex, {
      maxViewChars: 8,
      minSourceOffset: 0,
    });
    const after = createMarkdownAdjacency(text).after(matchIndex + 1, {
      maxViewChars: 8,
      maxSourceOffset: text.length,
    });
    equal(before.text, '前', `${format} before delimiter transparency`);
    equal(after.text, '後', `${format} after delimiter transparency`);
    ok(before.sourceOffsets.every((offset, index, list) => index === 0 || list[index - 1] < offset), `${format} before offsets monotonic`);
    ok(after.sourceOffsets.every((offset, index, list) => index === 0 || list[index - 1] < offset), `${format} after offsets monotonic`);
  }

  {
    const text = '[現在](https://example.invalid)の設定値';
    const labelEnd = text.indexOf('在') + 1;
    const after = createMarkdownAdjacency(text).after(labelEnd, {
      maxViewChars: 16,
      maxSourceOffset: text.length,
    });
    equal(after.text, 'の設定値', 'link destination bridges label to right prose');
    ok(!after.text.includes('https'), 'URL is absent from compact view');
    ok(after.sourceOffsets.every(offset => !text.slice(offset).startsWith('https')), 'URL offsets are absent');
    equal(text.slice(after.sourceStart, after.sourceEnd), '](https://example.invalid)の設定値', 'hidden destination remains in source range');

    const rightStart = text.indexOf('の設定値');
    const before = createMarkdownAdjacency(text).before(rightStart, {
      maxViewChars: 2,
      minSourceOffset: 0,
    });
    equal(before.text, '現在', 'link destination bridges right prose to label');
    deepEqual(before.sourceOffsets, [1, 2], 'left bridge label offsets');

    const urlStart = text.indexOf('https');
    const insideUrl = createMarkdownAdjacency(text).after(urlStart, {
      maxViewChars: 8,
      maxSourceOffset: text.length,
    });
    equal(insideUrl.text, '', 'hidden destination is not an unconditional bridge');
    equal(insideUrl.stopReason, 'opaque-barrier', 'starting inside destination stops traversal');

    const hiddenAtBoundary = createMarkdownAdjacency(text).after(urlStart, {
      maxViewChars: 8,
      maxSourceOffset: urlStart,
    });
    equal(hiddenAtBoundary.stopReason, 'source-boundary', 'source boundary wins inside hidden destination');
    equal(hiddenAtBoundary.complete, true, 'hidden source boundary is complete');
    equal(hiddenAtBoundary.reachedSourceBoundary, true, 'hidden source boundary is reached');

    const underscoreStrong = '__語__';
    const underscoreAfter = createMarkdownAdjacency(underscoreStrong).after(underscoreStrong.indexOf('語') + 1, {
      maxViewChars: 4,
      maxSourceOffset: underscoreStrong.length,
    });
    equal(underscoreAfter.text, '', 'double underscore delimiter is transparent');
    equal(underscoreAfter.stopReason, 'source-boundary', 'double underscore reaches boundary');
  }

  for (const text of [
    '日本語_識別子',
    '変数_名',
    'α_β',
    '１２_３',
    '𠮷_名',
    'e\u0301_語_名',
    'snake_case',
  ]) {
    const view = createMarkdownAdjacency(text).after(0, {
      maxViewChars: text.length,
      maxSourceOffset: text.length,
    });
    equal(view.text, text, `Unicode intraword underscore stays literal: ${text}`);
    deepEqual(view.sourceOffsets, [...text].flatMap((char, index, list) => {
      const start = list.slice(0, index).join('').length;
      return Array.from({ length: char.length }, (_, offset) => start + offset);
    }), `Unicode intraword underscore offsets: ${text}`);
  }

  for (const text of ['_ダミー_', '__ダミー__']) {
    const matchStart = text.indexOf('ダミー');
    const before = createMarkdownAdjacency(text).before(matchStart, {
      maxViewChars: 8,
      minSourceOffset: 0,
    });
    const after = createMarkdownAdjacency(text).after(matchStart + 'ダミー'.length, {
      maxViewChars: 8,
      maxSourceOffset: text.length,
    });
    equal(before.text, '', `standalone underscore opening delimiter is transparent: ${text}`);
    equal(after.text, '', `standalone underscore closing delimiter is transparent: ${text}`);
    equal(before.sourceEnd, matchStart, `standalone underscore source end: ${text}`);
    equal(after.sourceStart, matchStart + 'ダミー'.length, `standalone underscore source start: ${text}`);
    const findings = findingsFor('placeholder', text);
    equal(findings.length, 1, `standalone underscore placeholder remains visible: ${text}`);
    equal(findings[0]?.index, matchStart, `standalone underscore finding source index: ${text}`);
    equal(findings[0]?.length, 'ダミー'.length, `standalone underscore finding source length: ${text}`);
  }

  {
    const invalid = '前[ダミー](not a url)後';
    const invalidView = createMarkdownAdjacency(invalid).after(0, {
      maxViewChars: invalid.length,
      maxSourceOffset: invalid.length,
    });
    equal(invalidView.text, invalid, 'invalid bare link destination stays literal');
    deepEqual(invalidView.sourceOffsets, Array.from({ length: invalid.length }, (_, index) => index), 'invalid bare link source offsets stay unchanged');

    for (const valid of [
      '前[ダミー]()後',
      '前[ダミー](relative-path)後',
      '前[ダミー](https://example.invalid)後',
      '前[ダミー](<not a url>)後',
    ]) {
      const view = createMarkdownAdjacency(valid).after(0, {
        maxViewChars: valid.length,
        maxSourceOffset: valid.length,
      });
      equal(view.text, '前ダミー後', `valid inline link destination is hidden: ${valid}`);
      ok(!view.text.includes('url') && !view.text.includes('relative'), `valid destination is absent from view: ${valid}`);
      equal(view.sourceOffsets.length, '前ダミー後'.length, `valid destination source offset count: ${valid}`);
    }
  }

  for (const text of [
    '前**[語](https://example.invalid/a**b)**後',
    '前*[語](https://example.invalid/a*b)*後',
    '前~~[語](https://example.invalid/a~~b)~~後',
  ]) {
    const matchEnd = text.indexOf('語') + 1;
    const view = createMarkdownAdjacency(text).after(matchEnd, {
      maxViewChars: 8,
      maxSourceOffset: text.length,
    });
    equal(view.text, '後', `hidden destination delimiter is ignored: ${text}`);
    equal(view.complete, true, `hidden destination delimiter reaches boundary: ${text}`);
    ok(!view.text.startsWith('*') && !view.text.startsWith('_') && !view.text.startsWith('~'), `hidden destination leaves no delimiter: ${text}`);
  }
  {
    const text = '前_[語](https://example.invalid/a_b)_後';
    const matchEnd = text.indexOf('語') + 1;
    const view = createMarkdownAdjacency(text).after(matchEnd, {
      maxViewChars: 8,
      maxSourceOffset: text.length,
    });
    equal(view.text, '_後', 'intraword underscore stays literal around a linked label');
    equal(view.complete, true, 'intraword underscore link reaches boundary');
  }

  {
    const text = '[甲](https://example.invalid)';
    const view = createMarkdownAdjacency(text).after(0, {
      maxViewChars: 1,
      maxSourceOffset: text.length,
    });
    deepEqual(view.originalRange(-10, 999), { start: 1, end: 2 }, 'originalRange stays finite through hidden source');
    ok(Number.isFinite(view.originalRange(NaN, NaN).start) && Number.isFinite(view.originalRange(NaN, NaN).end), 'hidden originalRange is finite');
    ok(view.originalRange(-10, 999).start <= view.originalRange(-10, 999).end, 'hidden originalRange is monotonic');
  }

  // Opaque barriers stop traversal and are never bridged.
  for (const fixture of [
    '前`注記`後',
    '前![図](image.png)後',
    '前<!-- 注記 -->後',
    '前{{< note >}}後',
  ]) {
    const doc = prepareMarkdown(fixture);
    const after = doc.adjacency.after(fixture.indexOf('前') + 1, {
      maxViewChars: 16,
      maxSourceOffset: fixture.length,
    });
    equal(after.text, '', `opaque barrier text: ${fixture}`);
    equal(after.stopReason, 'opaque-barrier', `opaque barrier reason: ${fixture}`);
    equal(after.complete, false, `opaque barrier incomplete: ${fixture}`);
    equal(after.reachedSourceBoundary, false, `opaque barrier boundary: ${fixture}`);
  }

  {
    const fixture = '前\n```\n注記\n```\n後';
    const fenceStart = fixture.indexOf('```');
    const doc = prepareMarkdown(fixture);
    const after = doc.adjacency.after(fenceStart, {
      maxViewChars: 16,
      maxSourceOffset: fixture.length,
    });
    equal(after.text, '', 'fenced code is opaque');
    equal(after.stopReason, 'opaque-barrier', 'fenced code stops traversal');
    equal(after.complete, false, 'fenced code is incomplete');
    equal(after.reachedSourceBoundary, false, 'fenced code does not reach boundary');
  }

  {
    const ignored = prepareMarkdown('前秘密後', {
      ignorePatterns: [{ pattern: '秘密', scope: 'line', reason: 'helperのopaque range確認' }],
    });
    const after = ignored.adjacency.after(0, { maxViewChars: 8, maxSourceOffset: 4 });
    equal(after.stopReason, 'opaque-barrier', 'ignore range is opaque');

    const disabledText = '<!-- slopless-disable -->\n前秘密後\n<!-- slopless-enable -->';
    const disabled = prepareMarkdown(disabledText);
    const secret = disabledText.indexOf('秘密');
    const disabledView = disabled.adjacency.after(secret, {
      maxViewChars: 8,
      maxSourceOffset: disabledText.length,
    });
    equal(disabledView.stopReason, 'opaque-barrier', 'disable range is opaque');
  }

  // Literal syntax remains visible; malformed presentation is conservative.
  for (const text of [
    '\\*すべて\\*',
    '\\**すべて**',
    '* 箇条書き',
    '- [ ] タスク',
    '2 * 3 = 6',
    'snake_case',
    'snake_case_value',
    '---',
    '***',
    '___',
    '<span data-x="**100%**">',
    '閉じていない**強調',
  ]) {
    const view = createMarkdownAdjacency(text).after(0, {
      maxViewChars: text.length,
      maxSourceOffset: text.length,
    });
    equal(view.text, text, `literal range is preserved: ${text}`);
  }

  // UTF-16 code-unit mapping: BMP, surrogate pair, and combining mark.
  {
    const text = '甲😀e\u0301乙';
    const adjacency = createMarkdownAdjacency(text);
    const view = adjacency.after(0, { maxViewChars: text.length, maxSourceOffset: text.length });
    equal(view.text, text, 'UTF-16 fixture text');
    equal(view.text.length, 6, 'UTF-16 compact length');
    deepEqual(view.sourceOffsets, [0, 1, 2, 3, 4, 5], 'UTF-16 source offsets');
    equal(view.originalOffsetAt(2), 2, 'surrogate second code unit offset');
    deepEqual(view.originalRange(1, 5), { start: 1, end: 5 }, 'surrogate and combining range');
    ok(view.sourceOffsets.every((offset, index, list) => index === 0 || list[index - 1] < offset), 'UTF-16 offsets monotonic');
  }

  // Existing maskedText and structural segmentation stay unchanged.
  {
    const text = '本文の[`リンク`](https://example.invalid)を確認する。\n\n次の段落です。';
    const doc = prepareMarkdown(text);
    equal(doc.maskedText.length, text.length, 'maskedText length parity');
    equal(doc.maskedText.slice(text.indexOf('https'), text.indexOf('https') + 'https://example.invalid'.length).trim(), '', 'link URL remains masked');
    equal(doc.sentences.length, 2, 'sentence count parity');
    equal(doc.paragraphs.length, 2, 'paragraph count parity');
    equal(doc.structureBlocks.length, 2, 'structure block count parity');
    equal(doc.sentences[0].start, 0, 'sentence start parity');
    equal(doc.sentences[0].end, text.indexOf('。') + 1, 'sentence end parity');
  }

  const absoluteNonFindings = [
    ['六つすべてが公表値と一致する。', 'すべて'],
    ['四つの合計は100%を超える。', '100%'],
  ];
  for (const [plain, target] of absoluteNonFindings) {
    for (const [format, decorate] of decoratedOnly) {
      const text = replaceOnce(plain, target, decorate(target));
      equal(findingsFor('absolute-claim', text).length, 0, `absolute-claim ${format}: ${text}`);
    }
  }

  {
    const text = '六つ**[すべて](https://example.invalid/a**b)**が公表値と一致する。';
    equal(findingsFor('absolute-claim', text).length, 0, 'absolute-claim ignores delimiters inside hidden destination');
  }

  const generalThenBounded = 'すべての授業で、六つ**すべて**が公表値と一致する。';
  const generalThenBoundedFindings = findingsFor('absolute-claim', generalThenBounded);
  equal(generalThenBoundedFindings.length, 1, 'only generalizing すべて should remain');
  equal(generalThenBoundedFindings[0]?.index, generalThenBounded.indexOf('すべて'), 'first すべて index');
  equal(generalThenBoundedFindings[0]?.length, 'すべて'.length, 'first すべて length');

  const arithmeticThenGuarantee = '各項目の合計は**100%**を超えるが、この教材の合格率も100%を超える。';
  const arithmeticThenGuaranteeFindings = findingsFor('absolute-claim', arithmeticThenGuarantee);
  equal(arithmeticThenGuaranteeFindings.length, 1, 'only guarantee 100% should remain');
  equal(arithmeticThenGuaranteeFindings[0]?.index, arithmeticThenGuarantee.lastIndexOf('100%'), 'guarantee 100% index');
  equal(arithmeticThenGuaranteeFindings[0]?.length, '100%'.length, 'guarantee 100% length');

  const boundedThenGeneral = '六つ**すべて**が公表値と一致するが、すべての授業で有効である。';
  const boundedThenGeneralFindings = findingsFor('absolute-claim', boundedThenGeneral);
  equal(boundedThenGeneralFindings.length, 1, 'only later generalizing すべて should remain');
  equal(boundedThenGeneralFindings[0]?.index, boundedThenGeneral.lastIndexOf('すべて'), 'later すべて index');
  equal(boundedThenGeneralFindings[0]?.length, 'すべて'.length, 'later すべて length');

  const guaranteeThenArithmetic = 'この教材の合格率は100%を超えるが、各項目の合計も**100%**を超える。';
  const guaranteeThenArithmeticFindings = findingsFor('absolute-claim', guaranteeThenArithmetic);
  equal(guaranteeThenArithmeticFindings.length, 1, 'only first guarantee 100% should remain');
  equal(guaranteeThenArithmeticFindings[0]?.index, guaranteeThenArithmetic.indexOf('100%'), 'first guarantee 100% index');
  equal(guaranteeThenArithmeticFindings[0]?.length, '100%'.length, 'first guarantee 100% length');

  const placeholderPlain = 'カテゴリ変数からダミー変数を作成した。';
  for (const [format, decorate] of decoratedOnly) {
    const text = replaceOnce(placeholderPlain, 'ダミー', decorate('ダミー'));
    equal(findingsFor('placeholder', text).length, 0, `placeholder statistical dummy ${format}`);
  }
  {
    const text = 'カテゴリ変数から**[ダミー](https://example.invalid/a**b)**変数を作成した。';
    equal(findingsFor('placeholder', text).length, 0, 'placeholder ignores delimiters inside hidden destination');
  }

  for (const text of [
    '性別**ダミー**の係数を推定した。',
    '性別[ダミー](https://example.invalid)の係数を推定した。',
  ]) {
    equal(findingsFor('placeholder', text).length, 0, `statistical suffix through decoration: ${text}`);
  }
  for (const text of [
    '本番値の代わりに**ダミー**変数を入力しておく。',
    '本番値の代わりに[ダミー](https://example.invalid)変数を入力しておく。',
  ]) {
    const findings = findingsFor('placeholder', text);
    equal(findings.length, 1, `explicit replacement remains placeholder: ${text}`);
    equal(findings[0]?.index, text.indexOf('ダミー'), `explicit replacement index: ${text}`);
    equal(findings[0]?.length, 'ダミー'.length, `explicit replacement length: ${text}`);
  }
  {
    const text = '公開前の画面には**ダミー**と表示し性別**ダミー**を説明変数に加えた。';
    const findings = findingsFor('placeholder', text);
    equal(findings.length, 1, 'only UI dummy remains in mixed decorated sentence');
    equal(findings[0]?.index, text.indexOf('ダミー'), 'mixed decorated UI dummy index');
    equal(findings[0]?.length, 'ダミー'.length, 'mixed decorated UI dummy length');
  }
  for (const text of [
    'カテゴリ変数から_ダミー_変数を作成した。',
    'カテゴリ変数から__ダミー__変数を作成した。',
  ]) {
    const findings = findingsFor('placeholder', text);
    equal(findings.length, 1, `intraword underscore does not create statistical adjacency: ${text}`);
    equal(findings[0]?.index, text.indexOf('ダミー'), `intraword placeholder index: ${text}`);
    equal(findings[0]?.length, 'ダミー'.length, `intraword placeholder length: ${text}`);
  }
  {
    const text = '六つ_すべて_が公表値と一致する。';
    const findings = findingsFor('absolute-claim', text);
    equal(findings.length, 1, 'intraword underscores do not create a bounded-result adjacency');
    equal(findings[0]?.index, text.indexOf('すべて'), 'intraword absolute-claim index');
    equal(findings[0]?.length, 'すべて'.length, 'intraword absolute-claim length');
  }
  {
    const text = 'カテゴリ変数から`注記`ダミー変数を作成した。';
    const findings = findingsFor('placeholder', text);
    equal(findings.length, 1, 'opaque barrier prevents statistical creation context bridging');
    equal(findings[0]?.index, text.indexOf('ダミー'), 'opaque barrier placeholder index');
    equal(findings[0]?.length, 'ダミー'.length, 'opaque barrier placeholder length');
  }
  {
    const text = `公開前のフォームにはダミー項${' '.repeat(220)}番を残した。`;
    const findings = findingsFor('placeholder', text);
    equal(findings.length, 1, 'incomplete placeholder view is not treated as sentence end');
    equal(findings[0]?.index, text.indexOf('ダミー'), 'incomplete placeholder view index');
  }

  const groups = [];
  const addDecoratedGroup = (name, plain, target, expected) => {
    for (const [format, decorate] of DECORATIONS) {
      groups.push({ name, format, text: replaceOnce(plain, target, decorate(target)), target, expected });
    }
  };
  const addIntrawordUnderscoreGroup = (name, plain, target, expected) => {
    groups.push({
      name,
      format: 'intraword underscore literal',
      text: replaceOnce(plain, target, `_${target}_`),
      target,
      expected,
    });
  };

  addDecoratedGroup(
    'technical correspondence',
    'この規格に対応するアプリケーションの動作を確認した。',
    '対応する',
    0,
  );
  addIntrawordUnderscoreGroup(
    'technical correspondence',
    'この規格に対応するアプリケーションの動作を確認した。',
    '対応する',
    1,
  );
  addDecoratedGroup(
    'capability',
    '申請フローを改善することができる仕組みです。',
    '改善する',
    0,
  );
  addIntrawordUnderscoreGroup(
    'capability',
    '申請フローを改善することができる仕組みです。',
    '改善する',
    1,
  );
  for (const [format, decorate] of [DECORATIONS[1], DECORATIONS[4], DECORATIONS[5]]) {
    groups.push({
      name: 'capability whole exclusion',
      format,
      text: replaceOnce(
        '申請フローを改善することができる仕組みです。',
        '改善することができる',
        decorate('改善することができる'),
      ),
      expected: 0,
    });
  }
  addDecoratedGroup(
    'scope explanation',
    '設計し、作り、動かし、評価して改善するところまでが入る。',
    '改善する',
    0,
  );
  addIntrawordUnderscoreGroup(
    'scope explanation',
    '設計し、作り、動かし、評価して改善するところまでが入る。',
    '改善する',
    1,
  );
  for (const [format, decorate] of [DECORATIONS[1], DECORATIONS[4], DECORATIONS[5]]) {
    groups.push({
      name: 'scope whole exclusion',
      format,
      text: replaceOnce(
        '設計し、作り、動かし、評価して改善するところまでが入る。',
        '改善するところまでが入る',
        decorate('改善するところまでが入る'),
      ),
      expected: 0,
    });
  }
  addDecoratedGroup(
    'operation definition',
    'ログを取り、問題が起きたら止めて、原因を調べて改善する運用を指している。',
    '改善する',
    0,
  );
  addIntrawordUnderscoreGroup(
    'operation definition',
    'ログを取り、問題が起きたら止めて、原因を調べて改善する運用を指している。',
    '改善する',
    1,
  );
  for (const [format, decorate] of [DECORATIONS[1], DECORATIONS[4], DECORATIONS[5]]) {
    groups.push({
      name: 'operation whole exclusion',
      format,
      text: replaceOnce(
        'ログを取り、問題が起きたら止めて、原因を調べて改善する運用を指している。',
        '改善する運用を指している',
        decorate('改善する運用を指している'),
      ),
      expected: 0,
    });
  }

  const positiveBoundaries = [
    '新事業では、申請フローを改善するところまで含む予定です。',
    '当社は申請フローを改善する範囲まで含むことを決定した。',
    '当社は、利用者の声を踏まえて申請フローを改善する運用を継続する。',
  ];
  for (const plain of positiveBoundaries) {
    addDecoratedGroup('positive boundary', plain, '改善する', 1);
    addIntrawordUnderscoreGroup('positive boundary', plain, '改善する', 1);
  }

  equal(groups.length, 58, 'deadline-missing audit matrix size');
  for (const item of groups) {
    const findings = findingsFor('deadline-missing', item.text);
    equal(findings.length, item.expected, `${item.name} ${item.format}: ${item.text}`);
    if (item.expected === 1) {
      const finding = findings[0];
      equal(finding.index, item.text.indexOf(item.target), `${item.name} ${item.format} index`);
      equal(finding.length, item.target.length, `${item.name} ${item.format} length`);
      equal(finding.line, 1, `${item.name} ${item.format} line`);
      equal(finding.column, finding.index + 1, `${item.name} ${item.format} column`);
    }
  }

  for (const text of [
    '申請フローを**[改善する](https://example.invalid/a**b)**ことができる仕組みです。',
  ]) {
    equal(findingsFor('deadline-missing', text).length, 0, 'deadline exclusion ignores delimiters inside hidden destination');
  }

  {
    const text = '新事業では、申請フローを**[改善する](https://example.invalid/a**b)**ところまで含む予定です。';
    const findings = findingsFor('deadline-missing', text);
    equal(findings.length, 1, 'deadline positive survives delimiters inside hidden destination');
    equal(findings[0]?.index, text.indexOf('改善する'), 'hidden destination positive index');
    equal(findings[0]?.length, '改善する'.length, 'hidden destination positive length');
  }

  {
    const text = '申請フローを_改善する_ことができる仕組みです。';
    const findings = findingsFor('deadline-missing', text);
    equal(findings.length, 1, 'intraword underscores do not create a capability suffix adjacency');
    equal(findings[0]?.index, text.indexOf('改善する'), 'intraword capability index');
    equal(findings[0]?.length, '改善する'.length, 'intraword capability length');
  }
  for (const plain of positiveBoundaries) {
    const text = replaceOnce(plain, '改善する', '_改善する_');
    const findings = findingsFor('deadline-missing', text);
    equal(findings.length, 1, `intraword future action remains detectable: ${text}`);
    equal(findings[0]?.index, text.indexOf('改善する'), `intraword future action index: ${text}`);
    equal(findings[0]?.length, '改善する'.length, `intraword future action length: ${text}`);
  }

  for (const fixture of [
    ['カテゴリ変数から[ダミー](not a url)変数を作成した。', 1],
    ['カテゴリ変数から[ダミー](relative-path)変数を作成した。', 0],
    ['カテゴリ変数から[ダミー](<not a url>)変数を作成した。', 0],
    ['カテゴリ変数から[ダミー]()変数を作成した。', 0],
  ]) {
    const [text, expected] = fixture;
    const findings = findingsFor('placeholder', text);
    equal(findings.length, expected, `valid/invalid inline destination boundary: ${text}`);
    if (expected === 1) {
      equal(findings[0]?.index, text.indexOf('ダミー'), 'invalid destination placeholder index');
      equal(findings[0]?.length, 'ダミー'.length, 'invalid destination placeholder length');
    }
  }

  {
    const shortcodeFixtures = [
      ['placeholder', '{{< note text="カテゴリ変数からダミー変数を作成した。" >}}', 0],
      ['placeholder', '{{< note text="公開前にダミー変数を作成した。" >}}', 1],
      ['absolute-claim', '{{< note text="六つすべてが公表値と一致する。" >}}', 0],
      ['deadline-missing', '{{< note text="この規格に対応するアプリケーションの動作を確認した。" >}}', 0],
    ];
    for (const [ruleId, text, expected] of shortcodeFixtures) {
      const doc = prepareMarkdown(text);
      const visibleText = text.match(/\btext="([^"]*)"/u)?.[1] ?? '';
      equal(doc.maskedText, visibleText + ' '.repeat(text.length - visibleText.length), `Hugo maskedText parity: ${ruleId}`);
      equal(doc.sentences[0]?.text, visibleText, `Hugo sentence text parity: ${ruleId}`);
      equal(doc.sentences[0]?.start, 0, `Hugo sentence start parity: ${ruleId}`);
      equal(doc.sentences[0]?.end, visibleText.length, `Hugo sentence end parity: ${ruleId}`);
      const findings = findingsFor(ruleId, text);
      equal(findings.length, expected, `Hugo visible text keeps base rule behavior: ${ruleId}`);
      if (ruleId === 'placeholder' && expected === 1) {
        equal(findings[0]?.index, 4, 'Hugo visible replacement keeps base index');
        equal(findings[0]?.length, 'ダミー'.length, 'Hugo visible replacement keeps base length');
      }
    }

    const text = '{{< note text="前" term_id="x" >}}後';
    const doc = prepareMarkdown(text);
    const view = doc.adjacency.after(1, {
      maxViewChars: 8,
      maxSourceOffset: text.length,
    });
    equal(view.text, '', 'Hugo visible prefix does not bridge opaque shortcode remainder');
    equal(view.stopReason, 'opaque-barrier', 'Hugo shortcode remainder remains opaque');
  }

  for (const text of [
    `設計し、作り、動かし、評価して改善するところまでが入る${' '.repeat(32)}と説明した。`,
    '設計し、作り、動かし、評価して改善するところまでが入る`注記`と説明した。',
  ]) {
    const findings = findingsFor('deadline-missing', text);
    equal(findings.length, 1, `incomplete terminal suffix view stays detectable: ${text}`);
    equal(findings[0]?.index, text.indexOf('改善する'), `incomplete terminal suffix index: ${text}`);
  }

  {
    const text = '当社は申請フローを改善すること$を説明した。';
    const config = onlyRuleConfig('deadline-missing');
    config.rules['deadline-missing'] = ['warning', { actionSuffixExclusionPatterns: ['こと\\$'] }];
    const findings = lintText(text, { filePath: '<markdown-adjacency-test>', config }).messages
      .filter(message => message.ruleId === 'nihongo-slopless/deadline-missing');
    equal(findings.length, 0, 'escaped dollar remains a local custom suffix pattern');
  }

  const customActionSuffixFindings = (text, pattern) => {
    const config = onlyRuleConfig('deadline-missing');
    config.rules['deadline-missing'] = ['warning', { actionSuffixExclusionPatterns: [pattern] }];
    return lintText(text, { filePath: '<markdown-adjacency-test>', config }).messages
      .filter(message => message.ruleId === 'nihongo-slopless/deadline-missing');
  };
  const capabilityWithLongTail = '申請フローを改善することができる仕組みであり、担当者が日常的に利用します。';
  const incompleteScope = `設計し、作り、動かし、評価して改善するところまでが入る${' '.repeat(32)}と説明した。`;

  equal(
    customActionSuffixFindings(capabilityWithLongTail, 'ことができる|ところまでが入る\\s*$').length,
    0,
    'mixed custom suffix keeps local first alternative on incomplete view',
  );
  {
    const findings = customActionSuffixFindings(incompleteScope, '(?:ところまでが入る\\s*$)');
    equal(findings.length, 1, 'parenthesized terminal custom suffix does not match incomplete view');
    equal(findings[0]?.index, incompleteScope.indexOf('改善する'), 'parenthesized terminal custom suffix index');
    equal(findings[0]?.length, '改善する'.length, 'parenthesized terminal custom suffix length');
  }
  equal(
    customActionSuffixFindings(capabilityWithLongTail, 'ところまでが入る\\s*$|ことができる').length,
    0,
    'mixed custom suffix keeps local later alternative on incomplete view',
  );
  {
    const findings = customActionSuffixFindings(incompleteScope, 'ところまでが入る\\s*$|ことができる');
    equal(findings.length, 1, 'leading terminal alternative does not match incomplete view');
    equal(findings[0]?.index, incompleteScope.indexOf('改善する'), 'leading terminal alternative index');
    equal(findings[0]?.length, '改善する'.length, 'leading terminal alternative length');
  }
  equal(
    customActionSuffixFindings('当社は申請フローを改善すること$を説明した。', 'こと\\$').length,
    0,
    'escaped literal dollar remains a local custom suffix',
  );
  equal(
    customActionSuffixFindings('設計し、作り、動かし、評価して改善するところまでが入る。', '(?:ところまでが入る\\s*$)').length,
    0,
    'parenthesized terminal custom suffix matches complete view',
  );

  return assertions;
}
