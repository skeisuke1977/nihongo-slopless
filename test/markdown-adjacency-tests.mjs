import assert from 'node:assert/strict';
import { allRules, lintText } from '../src/index.mjs';
import { createMarkdownAdjacency } from '../src/markdown-adjacency.mjs';
import { prepareMarkdown } from '../src/markdown.mjs';

const URL = 'https://example.invalid';
const DECORATIONS = [
  ['plain', value => value],
  ['strong', value => `**${value}**`],
  ['emphasis', value => `*${value}*`],
  ['underscore emphasis', value => `_${value}_`],
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

    const underscoreStrong = '__語__';
    const underscoreAfter = createMarkdownAdjacency(underscoreStrong).after(underscoreStrong.indexOf('語') + 1, {
      maxViewChars: 4,
      maxSourceOffset: underscoreStrong.length,
    });
    equal(underscoreAfter.text, '', 'double underscore delimiter is transparent');
    equal(underscoreAfter.stopReason, 'source-boundary', 'double underscore reaches boundary');
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
      groups.push({ name, format, text: replaceOnce(plain, target, decorate(target)), expected });
    }
  };

  addDecoratedGroup(
    'technical correspondence',
    'この規格に対応するアプリケーションの動作を確認した。',
    '対応する',
    0,
  );
  addDecoratedGroup(
    'capability',
    '申請フローを改善することができる仕組みです。',
    '改善する',
    0,
  );
  for (const [format, decorate] of [DECORATIONS[1], DECORATIONS[5], DECORATIONS[6]]) {
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
  for (const [format, decorate] of [DECORATIONS[1], DECORATIONS[5], DECORATIONS[6]]) {
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
  for (const [format, decorate] of [DECORATIONS[1], DECORATIONS[5], DECORATIONS[6]]) {
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
  }

  equal(groups.length, 58, 'deadline-missing audit matrix size');
  for (const item of groups) {
    const findings = findingsFor('deadline-missing', item.text);
    equal(findings.length, item.expected, `${item.name} ${item.format}: ${item.text}`);
    if (item.expected === 1) {
      const finding = findings[0];
      equal(finding.index, item.text.indexOf('改善する'), `${item.name} ${item.format} index`);
      equal(finding.length, '改善する'.length, `${item.name} ${item.format} length`);
      equal(finding.line, 1, `${item.name} ${item.format} line`);
      equal(finding.column, finding.index + 1, `${item.name} ${item.format} column`);
    }
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

  return assertions;
}
