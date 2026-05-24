import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allRules, lintText, listRuleMetadata, loadConfigFile } from '../src/index.mjs';
import { prepareMarkdown } from '../src/markdown.mjs';
import { PROFILE_NAMES, loadProfileConfig, mergeConfigs, normalizeProfileName } from '../src/profiles.mjs';
import { VERSION } from '../src/version.mjs';
import { runExtractorTests } from './extractor-tests.mjs';

function ruleIds(text, config = {}) {
  return new Set(lintText(text, { filePath: '<test>', config }).messages.map(m => m.ruleId));
}

function expectRule(name, text, config = {}) {
  const ids = ruleIds(text, config);
  assert(ids.has(`nihongo-slopless/${name}`), `expected ${name}\n${text}\nfound: ${[...ids].join(', ')}`);
}

function expectNoRule(name, text, config = {}) {
  const ids = ruleIds(text, config);
  assert(!ids.has(`nihongo-slopless/${name}`), `did not expect ${name}\n${text}\nfound: ${[...ids].join(', ')}`);
}

function messagesFor(name, text, config = {}) {
  return lintText(text, { filePath: '<test>', config }).messages
    .filter(m => m.ruleId === `nihongo-slopless/${name}`)
    .map(m => m.message);
}

function findingsFor(name, text, config = {}) {
  return lintText(text, { filePath: '<test>', config }).messages
    .filter(m => m.ruleId === `nihongo-slopless/${name}`);
}

function isDisabledRuleConfig(value) {
  return value === false || value === 'off';
}

function runCli(args, { input = undefined } = {}) {
  const cliPath = fileURLToPath(new URL('../bin/nihongo-slopless.mjs', import.meta.url));
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
  });
}

function runCliOnText(text, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'nihongo-slopless-cli-'));
  const filePath = join(dir, 'sample.md');
  writeFileSync(filePath, text, 'utf8');

  try {
    return runCli([filePath, ...args]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runEvaluateCorpus(records, args = []) {
  const cliPath = fileURLToPath(new URL('../scripts/evaluate-corpus.mjs', import.meta.url));
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'nihongo-slopless-evaluate-'));
  const corpusPath = join(dir, 'goldset.jsonl');
  const jsonl = `${records.map(record => JSON.stringify(record)).join('\n')}\n`;
  writeFileSync(corpusPath, jsonl, 'utf8');

  try {
    return spawnSync(process.execPath, [cliPath, corpusPath, '--pretty', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runScript(scriptRelativePath, args = [], { cwd = null } = {}) {
  const scriptPath = fileURLToPath(new URL(`../${scriptRelativePath}`, import.meta.url));
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: cwd ?? repoRoot,
    encoding: 'utf8',
  });
}

function parseJsonStdout(result, label) {
  assert(result.stdout.trim(), `${label} should emit JSON on stdout`);
  return JSON.parse(result.stdout);
}

function expectNoZeroLengthFindings(name, text, config) {
  const findings = findingsFor(name, text, config);
  assert.deepEqual(
    findings,
    [],
    `${name} should not create findings when its configured phrase list is empty`,
  );
}

assert(
  !readFileSync(fileURLToPath(new URL('../src/index.mjs', import.meta.url)), 'utf8').includes('\u0000'),
  'src/index.mjs should not contain literal NUL characters',
);

expectRule('chat-response-leakage', '承知しました。以下にまとめます。');
expectNoRule('chat-response-leakage', 'FAQの回答例は「もちろんです」から始まる。');
expectNoRule('chat-response-leakage', '回答例として「承知しました。以下にまとめます。」を示す。');
expectNoRule('chat-response-leakage', '次の節では、フレックスアイテムの配置方法を詳しく説明します。');
expectRule('chat-response-leakage', 'ご希望であれば、さらに詳しく説明します。');
expectRule('empty-conclusion', '本研究は教育改善に貢献することが期待される。');
expectRule('placeholder', 'TODO: ここに具体例を書く。');
expectRule('placeholder', 'テンプレートではTODO: ここに具体例を書く。');
expectNoRule('placeholder', 'テンプレートでは「ここに氏名を書く」と示す。');
expectNoRule('placeholder', 'テンプレートではTODOという文字列を仮置きの印として説明する。');
expectNoRule('placeholder', '- [ ] globstar修正');
expectNoRule('placeholder', '1. [ ] 空マッチ時の終了コード設計');
expectNoRule('placeholder', 'API操作は[`patch`](/docs/reference/#patch)と[`replace`](/docs/reference/#replace)で説明される。');
expectRule('placeholder', '回答欄は[ ]のまま提出された。');
expectRule('citation-needed', '近年、生成AIの利用は急速に広がっている。');
expectRule('citation-needed', '近年、生成AIの利用は急速に広がっている（2025）。');
expectRule('citation-needed', '2025年現在、生成AIの利用は急速に広がっている。');
expectNoRule('citation-needed', '近年、生成AIの利用は急速に広がっている（https://example.jp/report）。');
expectNoRule('citation-needed', '調査によれば、提出率は78%だった。');
expectNoRule('citation-needed', '先行研究では、授業改善に効果があると報告されている（佐藤, 2025）。');
expectRule('absolute-claim', 'この方法を使えば、誰でも必ず成果を出せる。');
expectRule('absolute-claim', 'この方法はすべての授業で必ず効果を出す。');
expectNoRule('absolute-claim', '指摘された箇所は、必ず直すべき箇所ではない。');
expectNoRule('absolute-claim', '指摘をすべて消すことは、良い文章を書くことと同じではありません。');
expectNoRule('absolute-claim', 'すべてのルールを一時的に止める場合:');
expectNoRule('absolute-claim', 'ルールIDはすべて `nihongo-slopless/<rule>` です。');
assert.equal(
  findingsFor('absolute-claim', 'この方法で必ず成功するわけではないが、すべての授業で有効です。').length,
  1,
  'absolute-claim should keep later claims in mixed negation sentences',
);
assert.equal(
  findingsFor('absolute-claim', 'この方法はすべての授業で必ず効果を出す。', {
    rules: { 'nihongo-slopless/absolute-claim': ['warning', { terms: [] }] },
  }).length,
  0,
  'absolute-claim should not create zero-length findings when terms is empty',
);
expectNoZeroLengthFindings('chat-response-leakage', '承知しました。以下にまとめます。', {
  rules: { 'nihongo-slopless/chat-response-leakage': ['warning', { phrases: [] }] },
});
expectNoZeroLengthFindings('empty-conclusion', '本研究は教育改善に貢献することが期待される。', {
  rules: { 'nihongo-slopless/empty-conclusion': ['warning', { patterns: [] }] },
});
expectNoZeroLengthFindings('citation-needed', '近年、生成AIの利用は急速に広がっている。', {
  rules: { 'nihongo-slopless/citation-needed': ['warning', { claimPatterns: [] }] },
});
expectNoZeroLengthFindings('list-intro-padding', '以下に要点を示します。', {
  rules: { 'nihongo-slopless/list-intro-padding': ['info', { phrases: [] }] },
});
expectNoZeroLengthFindings('weasel-phrases', '一般的に、多くの場合、重要である可能性があると考えられる。', {
  rules: { 'nihongo-slopless/weasel-phrases': ['warning', { phrases: [] }] },
});
expectNoZeroLengthFindings('abstract-noun-stack', '重要で有用で必要な価値と効果がある。', {
  rules: { 'nihongo-slopless/abstract-noun-stack': ['warning', { abstractWords: [] }] },
});
expectNoZeroLengthFindings('translationese', 'この手法は学習を改善することができる。教育において観点から踏まえて伴ってということを整理するものである。', {
  rules: { 'nihongo-slopless/translationese': ['info', { directPatterns: [], densityPatterns: [] }] },
});
expectNoZeroLengthFindings('buzzword-density', 'DXと生成AIとイノベーションを通じて、個別最適な学びと探究と社会実装を推進する。', {
  rules: { 'nihongo-slopless/buzzword-density': ['info', { buzzwords: [] }] },
});
expectNoZeroLengthFindings('thin-sentence', 'この取り組みは教育現場において非常に重要であり、今後も継続的な改善が必要である。', {
  rules: { 'nihongo-slopless/thin-sentence': ['warning', { vaguePredicates: [] }] },
});
expectNoZeroLengthFindings('actorless-action', '今後、申請手順の見直しを進める。', {
  rules: { 'nihongo-slopless/actorless-action': ['warning', { actionPatterns: [] }] },
});
assert.equal(
  findingsFor('chat-response-leakage', '承知しました。', {
    rules: { 'nihongo-slopless/chat-response-leakage': ['warning', { phrases: ['', 1, '承知しました'] }] },
  }).length,
  1,
  'phrase-list options should ignore empty and non-string entries while keeping valid strings',
);
expectRule('translationese', 'この手法は学習を改善することができる。');
assert(
  messagesFor('translationese', 'この手法は学習を改善することができる。')
    .some(message => message.includes('文が重くなりやすい表現です')),
  'translationese should use observational wording',
);
assert(
  messagesFor('translationese', 'この手法は学習を改善することができる。')
    .every(message => !message.includes('翻訳調・遠回りな表現です')),
  'translationese should not use old evaluative wording',
);
expectRule('thin-sentence', 'この取り組みは教育現場において非常に重要であり、今後も継続的な改善が必要である。');
expectRule('actorless-action', '今後、関係部署と連携しながら総合的に検討していく必要がある。');
expectRule('actorless-action', '今後、申請手順の見直しを進める。');
expectRule('actorless-action', '担当者は問い合わせへの対応を行う。');
expectRule('actorless-action', '来月までに申込手順の見直しを進める。');
expectNoRule('actorless-action', '担当部署は5月20日までに申込手順を見直すこととする。');
expectNoRule('actorless-action', '事務局は6月10日までに申請手順の見直しを進める。');
expectNoRule('actorless-action', '本稿では、調査結果を比較し、限界を検討することとする。');
expectNoRule('actorless-action', '本資料では、申請手順の見直しを検討することとする。');
assert.equal(
  findingsFor('actorless-action', '申請手順の見直しを進める。問い合わせへの対応を行う。').length,
  2,
  'actorless-action should count separate owner/deadline gaps in the same text',
);
expectRule('buzzword-density', 'DXと生成AIとイノベーションを通じて、個別最適な学びと探究と社会実装を推進する。');
expectRule('hidden-unicode-controls', 'ここにゼロ幅文字\u200Bがあります。');
expectRule('same-ending', 'これは一文目です。これは二文目です。これは三文目です。これは四文目です。');
expectNoRule('same-ending', '資料を確認します。結果を共有します。\n\n質問を整理します。次回に説明します。');
expectNoRule('same-ending', '受付で資料を配布します。教員が目的を説明します。\n\n## 当日の流れ\n\n学生が質問を提出します。担当者が回答を共有します。');
expectNoRule('same-ending', '資料を確認します。結果を共有します。\n```js\nconst x = 1;\n```\n質問を整理します。次回に説明します。');
expectNoRule('same-ending', '資料を確認します。結果を共有します。\n| 項目 | 値 |\n|---|---|\n| A | B |\n質問を整理します。次回に説明します。');
expectNoRule('same-ending', '資料を確認します。結果を共有します。\n\n---\n\n質問を整理します。次回に説明します。');
expectRule('same-ending', '- 資料を確認します。\n- 結果を共有します。\n- 質問を整理します。\n- 次回に説明します。');
const sameEndingSectionDoc = prepareMarkdown('- 資料を確認します。\n- 結果を共有します。\n- 質問を整理します。\n- 次回に説明します。');
assert.equal(
  new Set(sameEndingSectionDoc.sentences.map(sentence => sentence.structureSectionIndex)).size,
  1,
  'same-ending structure metadata should keep continuous list items in one section',
);
const sameEndingSplitDoc = prepareMarkdown('資料を確認します。結果を共有します。\n\n## 当日の流れ\n\n質問を整理します。次回に説明します。');
assert(
  sameEndingSplitDoc.sentences[1].structureSectionIndex !== sameEndingSplitDoc.sentences[2].structureSectionIndex,
  'same-ending structure metadata should split sections across Markdown boundaries',
);

const bomCrlfFrontMatterText = '\uFEFF---\r\ntitle: TODO: 概要を書く。\r\nsummary: 近年、生成AIの利用は急速に広がっている。\r\n---\r\nTODO: 本文を書く。';
const bomCrlfFrontMatterDoc = prepareMarkdown(bomCrlfFrontMatterText);
const bomCrlfFrontMatterBodyStart = bomCrlfFrontMatterText.indexOf('TODO: 本文');
assert(
  !bomCrlfFrontMatterDoc.maskedText.slice(0, bomCrlfFrontMatterBodyStart).includes('TODO'),
  'BOM and CRLF YAML front matter should be masked',
);
const bomCrlfFrontMatterPlaceholder = findingsFor('placeholder', bomCrlfFrontMatterText);
assert.equal(bomCrlfFrontMatterPlaceholder.length, 1, 'BOM and CRLF YAML front matter should not be linted as prose');
assert.equal(bomCrlfFrontMatterPlaceholder[0].line, 5, 'BOM and CRLF YAML front matter should keep body line numbers stable');

const commentedFrontMatterText = '<!-- sourceId: sample -->\n---\ntitle: TODO: 概要を書く。\ndescription: >\n  近年、生成AIの利用は急速に広がっている。\n---\nTODO: 本文を書く。';
const commentedFrontMatterPlaceholder = findingsFor('placeholder', commentedFrontMatterText);
assert.equal(commentedFrontMatterPlaceholder.length, 1, 'YAML front matter after leading HTML metadata comments should be masked');
assert.equal(commentedFrontMatterPlaceholder[0].line, 7, 'commented front matter masks should leave body line numbers stable');

const hugoShortcodeText = '本文は短い説明です。\n\n{{< figure src="/images/docs/components.svg" alt="Kubernetesのコンポーネント" caption="Kubernetesクラスターのコンポーネント" class="diagram-large" clicktozoom="true" >}}\n\n次の本文です。';
expectNoRule('long-sentence', hugoShortcodeText, {
  rules: { 'nihongo-slopless/long-sentence': ['warning', { maxChars: 25 }] },
});
expectNoRule(
  'deadline-missing',
  'レプリケーションされたPodは、通常ワークロードリソースと、それに対応する{{< glossary_tooltip text="コントローラー" term_id="controller" >}}によって、作成・管理されます。',
);
const hugoShortcodeVisibleTextDoc = prepareMarkdown('本文では{{< glossary_tooltip text="コントローラー" term_id="controller" >}}によって管理されます。');
assert(
  hugoShortcodeVisibleTextDoc.sentences[0].text.includes('コントローラー'),
  'Hugo shortcode text attributes should remain visible prose',
);

const mdnXrefMacroText = '{{cssxref("display")}}は要素の表示形式を設定します。\n{{domxref("Element")}}はDOM要素を表します。';
const mdnXrefMacroDoc = prepareMarkdown(mdnXrefMacroText);
assert(
  mdnXrefMacroDoc.sentences.every(sentence => !sentence.text.includes('{{')),
  'MDN xref macros should be masked from visible prose',
);

const mdnDisplayTextMacro = 'HTTPはアプリケーション{{Glossary("Protocol", "プロトコル")}}です。';
const mdnDisplayTextMacroDoc = prepareMarkdown(mdnDisplayTextMacro);
assert(
  !mdnDisplayTextMacroDoc.sentences[0].text.includes('プロトコル'),
  'MDN macro arguments should not be treated as recovered display text',
);

const surrogateFencePlaceholder = findingsFor(
  'placeholder',
  '😀\n```\nTODO: コード\n```\nTODO: 本文を書く。',
);
assert.equal(surrogateFencePlaceholder.length, 1, 'surrogate pairs before fenced code should not shift Markdown masks');
assert.equal(surrogateFencePlaceholder[0].line, 5, 'surrogate-pair fence masks should leave prose after the fence visible');

const longFencePlaceholder = findingsFor(
  'placeholder',
  '````js\nTODO: コード\n```\nTODO: まだコード\n````js\nTODO: まだコード\n````\nTODO: 本文を書く。',
);
assert.equal(longFencePlaceholder.length, 1, 'long fences should not close on shorter fences or info strings');
assert.equal(longFencePlaceholder[0].line, 8, 'long fences should close only on same-character fences with at least the opening length');

const indentedCodePlaceholder = findingsFor(
  'placeholder',
  '説明です。\n\n    TODO: コード\nTODO: 本文を書く。',
);
assert.equal(indentedCodePlaceholder.length, 1, 'indented code blocks should be masked');
assert.equal(indentedCodePlaceholder[0].line, 4, 'indented code masks should leave following prose visible');

const paragraphContinuationPlaceholder = findingsFor(
  'placeholder',
  'これは通常段落です\n    TODO: 本文を書く。',
);
assert.equal(paragraphContinuationPlaceholder.length, 1, 'indented paragraph continuations should remain lintable');
assert.equal(paragraphContinuationPlaceholder[0].line, 2, 'paragraph continuation findings should keep their line number');

const listContinuationPlaceholder = findingsFor(
  'placeholder',
  '- 手順です\n    TODO: 本文を書く。',
);
assert.equal(listContinuationPlaceholder.length, 1, 'indented list continuations should remain lintable');
assert.equal(listContinuationPlaceholder[0].line, 2, 'list continuation findings should keep their line number');

const surrogateInlineText = '😀`TODO: コード`\nTODO: 本文を書く。';
const surrogateInlineDoc = prepareMarkdown(surrogateInlineText);
const surrogateInlineStart = surrogateInlineText.indexOf('`');
const surrogateInlineEnd = surrogateInlineText.indexOf('\n');
assert.equal(
  surrogateInlineDoc.maskedText.slice(surrogateInlineStart, surrogateInlineEnd),
  ' '.repeat(surrogateInlineEnd - surrogateInlineStart),
  'surrogate pairs before inline code should not shift Markdown masks',
);

const surrogateLinkText = '😀[本文](https://example.com/TODO)\nTODO: 本文を書く。';
const surrogateLinkDoc = prepareMarkdown(surrogateLinkText);
const surrogateUrlStart = surrogateLinkText.indexOf('(') + 1;
const surrogateUrlEnd = surrogateLinkText.indexOf(')');
assert.equal(
  surrogateLinkDoc.maskedText.slice(surrogateUrlStart, surrogateUrlEnd),
  ' '.repeat(surrogateUrlEnd - surrogateUrlStart),
  'surrogate pairs before link URLs should not shift Markdown masks',
);
expectRule('repeated-connectors', 'また、Aです。また、Bです。また、Cです。');
expectRule('long-sentence', '本研究では、学生が生成AIを用いて作成した初稿を対象として、主張の明確さ、根拠の具体性、図表説明の妥当性、誤情報の訂正過程、教員コメントへの応答、最終稿における改善の持続性を総合的に評価し、AI利用そのものではなく、改稿過程における判断の質を明らかにする。');
expectNoRule('long-sentence', '- 受付で資料を配る\n- 教員が目的を説明する\n- 学生が質問を書く', {
  rules: { 'nihongo-slopless/long-sentence': ['warning', { maxChars: 18 }] },
});
expectNoRule('long-paragraph', '- 受付で資料を配る。\n- 教員が目的を説明する。\n- 学生が質問を書く。', {
  rules: { 'nihongo-slopless/long-paragraph': ['warning', { maxChars: 999, maxSentences: 2 }] },
});
expectRule('long-sentence', '- 受付で配る資料には、提出期限、相談窓口、引用方法、再提出条件をまとめて記載する。', {
  rules: { 'nihongo-slopless/long-sentence': ['warning', { maxChars: 25 }] },
});
expectRule('long-sentence', '- 受付で配る資料には、提出期限、相談窓口、引用方法、\n  再提出条件、問い合わせ先、欠席者への連絡手順をまとめて記載する。', {
  rules: { 'nihongo-slopless/long-sentence': ['warning', { maxChars: 25 }] },
});
expectNoRule('long-paragraph', '    - 受付で資料を配る。\n    - 教員が目的を説明する。\n    - 学生が質問を書く。', {
  rules: { 'nihongo-slopless/long-paragraph': ['warning', { maxChars: 999, maxSentences: 2 }] },
});
expectNoRule('long-paragraph', '| 項目 | 説明 |\n|---|---|\n| A | 資料を配る。 |\n| B | 質問を書く。 |\n| C | 回答する。 |', {
  rules: { 'nihongo-slopless/long-paragraph': ['warning', { maxChars: 999, maxSentences: 2 }] },
});

assert(
  messagesFor('empty-conclusion', '本研究は教育改善に貢献することが期待される。')
    .some(message => message.includes('締めの内容が抽象的です')),
  'empty-conclusion should use observational wording',
);
assert(
  messagesFor('absolute-claim', 'この方法を使えば、誰でも必ず成果を出せる。')
    .some(message => message.includes('適用範囲や例外条件の確認が必要になりやすい断定表現です')),
  'absolute-claim should use observational wording',
);
assert(
  messagesFor('absolute-claim', 'この方法を使えば、誰でも必ず成果を出せる。')
    .every(message => !message.includes('強い断定です')),
  'absolute-claim should not use accusatory wording',
);
assert(
  messagesFor('excessive-politeness', 'このたび説明させていただくこととなりました。')
    .some(message => message.includes('敬語が重なり、行動が見えにくくなっています')),
  'excessive-politeness should use observational wording',
);
assert(
  messagesFor('headline-decoration', '## ★★ 重要なお知らせ')
    .some(message => message.includes('本文情報より目立つ可能性があります')),
  'headline-decoration should use observational wording',
);
assert(
  messagesFor('headline-decoration', '## ★★ 重要なお知らせ')
    .every(message => !message.includes('強すぎる')),
  'headline-decoration should not use evaluative wording',
);
assert(
  messagesFor('weasel-phrases', '一般的に、多くの場合、重要である可能性があると考えられる。')
    .some(message => message.includes('確認したい表現が重なっています')),
  'weasel-phrases should describe repeated phrases observationally',
);
assert(
  messagesFor('weasel-phrases', '多くの研究で有効とされている。')
    .some(message => message.includes('根拠や見解の出どころが本文だけでは見えにくい')),
  'weasel-phrases should describe missing source visibility observationally',
);
assert(
  messagesFor('weasel-phrases', '一般的に、多くの場合、重要である可能性があると考えられる。多くの研究で有効とされている。')
    .every(message => !message.includes('ぼかし表現が多くあります') && !message.includes('根拠の主体がぼやけています')),
  'weasel-phrases should not use old evaluative wording',
);

const ignored = lintText(`<!-- nihongo-slopless-disable nihongo-slopless/empty-conclusion -->\n今後の発展が期待される。\n<!-- nihongo-slopless-enable nihongo-slopless/empty-conclusion -->`, { filePath: '<test>' });
assert(!ignored.messages.some(m => m.ruleId === 'nihongo-slopless/empty-conclusion'), 'ignore comments should suppress empty-conclusion');

const nextLineDisableEmptyConclusion = findingsFor(
  'empty-conclusion',
  `<!-- nihongo-slopless-disable-next-line nihongo-slopless/empty-conclusion -->\n今後の発展が期待される。\n今後の発展が期待される。`,
);
assert.equal(nextLineDisableEmptyConclusion.length, 1, 'disable-next-line should suppress only the next empty-conclusion finding');
assert.equal(nextLineDisableEmptyConclusion[0].line, 3, 'disable-next-line should keep empty-conclusion findings after the next line');

const ignoreEmptyConclusion = findingsFor(
  'empty-conclusion',
  `<!-- nihongo-slopless-ignore empty-conclusion: 文脈上の例として残す -->\n今後の発展が期待される。\n今後の発展が期待される。`,
);
assert.equal(ignoreEmptyConclusion.length, 1, 'ignore should suppress empty-conclusion on the next line');
assert.equal(ignoreEmptyConclusion[0].line, 3, 'ignore should keep empty-conclusion findings after the next line');

const fullWidthReasonIgnore = findingsFor(
  'empty-conclusion',
  `<!-- nihongo-slopless-ignore empty-conclusion：文脈上の例として残す -->\n今後の発展が期待される。\n今後の発展が期待される。`,
);
assert.equal(fullWidthReasonIgnore.length, 1, 'ignore should allow full-width colon before the reason');
assert.equal(fullWidthReasonIgnore[0].line, 3, 'full-width reason separator should not become part of the rule id');

const textlintNextLineDisableLongSentence = findingsFor(
  'long-sentence',
  `<!-- textlint-disable-next-line nihongo-slopless/long-sentence -->\n受付で配る資料には、提出期限、相談窓口、引用方法をまとめて記載する。\n受付で配る資料には、提出期限、相談窓口、引用方法をまとめて記載する。`,
  { rules: { 'nihongo-slopless/long-sentence': ['warning', { maxChars: 25 }] } },
);
assert.equal(textlintNextLineDisableLongSentence.length, 1, 'textlint disable-next-line should suppress only the next long-sentence finding');
assert.equal(textlintNextLineDisableLongSentence[0].line, 3, 'textlint disable-next-line should keep long-sentence findings after the next line');

const crlfIgnoreEmptyConclusion = findingsFor(
  'empty-conclusion',
  '<!-- nihongo-slopless-ignore empty-conclusion -->\r\n今後の発展が期待される。\r\n今後の発展が期待される。',
);
assert.equal(crlfIgnoreEmptyConclusion.length, 1, 'ignore should suppress only the next physical CRLF line');
assert.equal(crlfIgnoreEmptyConclusion[0].line, 3, 'ignore should keep findings after the next CRLF line');

const blankLineAfterIgnore = findingsFor(
  'empty-conclusion',
  '<!-- nihongo-slopless-ignore empty-conclusion -->\n\n今後の発展が期待される。\n今後の発展が期待される。',
);
assert.equal(blankLineAfterIgnore.length, 2, 'ignore followed by a blank line should not skip ahead to the next prose line');
assert.deepEqual(blankLineAfterIgnore.map(message => message.line), [3, 4], 'ignore followed by a blank line should keep later prose findings');

const eofIgnoreEmptyConclusion = findingsFor(
  'empty-conclusion',
  '今後の発展が期待される。\n<!-- nihongo-slopless-ignore empty-conclusion -->',
);
assert.equal(eofIgnoreEmptyConclusion.length, 1, 'ignore at EOF should not suppress previous findings or create a carryover range');
assert.equal(eofIgnoreEmptyConclusion[0].line, 1, 'ignore at EOF should leave the previous finding location unchanged');

const fencedIgnoreEmptyConclusion = findingsFor(
  'empty-conclusion',
  '```md\n<!-- nihongo-slopless-ignore empty-conclusion -->\n```\n今後の発展が期待される。',
);
assert.equal(fencedIgnoreEmptyConclusion.length, 1, 'ignore comments inside code fences should not suppress prose findings');
assert.equal(fencedIgnoreEmptyConclusion[0].line, 4, 'code fence ignore comments should leave following prose findings visible');

const longFenceIgnoreEmptyConclusion = findingsFor(
  'empty-conclusion',
  '````md\n<!-- nihongo-slopless-ignore empty-conclusion -->\n```\n今後の発展が期待される。\n````\n今後の発展が期待される。',
);
assert.equal(longFenceIgnoreEmptyConclusion.length, 1, 'ignore comments inside long code fences should not suppress prose findings');
assert.equal(longFenceIgnoreEmptyConclusion[0].line, 6, 'long code fences should ignore shorter closing fences for disable ranges');

const indentedIgnoreEmptyConclusion = findingsFor(
  'empty-conclusion',
  '    <!-- nihongo-slopless-ignore empty-conclusion -->\n今後の発展が期待される。',
);
assert.equal(indentedIgnoreEmptyConclusion.length, 1, 'ignore comments inside indented code should not suppress prose findings');
assert.equal(indentedIgnoreEmptyConclusion[0].line, 2, 'indented code ignore comments should leave following prose findings visible');

const metadata = listRuleMetadata();
assert.equal(metadata.length, 26, 'all rules should expose metadata');
for (const item of metadata) {
  assert(item.category, `${item.id} should have category`);
  assert(item.goal, `${item.id} should have goal`);
  assert(item.notGoal, `${item.id} should have notGoal`);
  assert(item.fixHint, `${item.id} should have fixHint`);
  assert(Array.isArray(item.profiles), `${item.id} should have profiles`);
}

const expectedProfiles = ['minimal', 'general', 'business', 'technical', 'research', 'public', 'web', 'agent-output', 'strict'];
assert.deepEqual(PROFILE_NAMES, expectedProfiles, 'public profile names should stay documented and deterministic');

const metadataIds = new Set(metadata.map(item => item.id));
const enabledProfilesByRule = new Map(metadata.map(item => [item.id, []]));
for (const profileName of PROFILE_NAMES) {
  const profileConfig = await loadProfileConfig(profileName);
  const profileRules = Object.keys(profileConfig.rules ?? {});
  assert.equal(profileRules.length, metadata.length, `${profileName} should configure every rule explicitly`);
  for (const ruleId of profileRules) {
    assert(metadataIds.has(ruleId), `${profileName} references unknown rule ${ruleId}`);
    if (!isDisabledRuleConfig(profileConfig.rules[ruleId])) {
      enabledProfilesByRule.get(ruleId).push(profileName);
    }
  }
}
for (const item of metadata) {
  assert.deepEqual(
    item.profiles,
    enabledProfilesByRule.get(item.id),
    `${item.id} metadata profiles should match enabled profile configs`,
  );
}
await assert.rejects(() => loadProfileConfig('unknown-profile'), /未知のプロファイル/);
assert.equal(normalizeProfileName(null), null);

const minimalConfig = await loadConfigFile(null, { profile: 'minimal' });
expectNoRule('citation-needed', '近年、生成AIの利用は急速に広がっている。', minimalConfig);
expectNoRule('actorless-action', '今後、関係部署と連携しながら総合的に検討していく必要がある。', minimalConfig);
expectRule('placeholder', 'TODO: ここに具体例を書く。', minimalConfig);

const businessProfile = await loadProfileConfig('business');
expectNoRule('same-ending', '資料を確認します。結果を共有します。質問を整理します。次回に説明します。', businessProfile);

const technicalProfile = await loadProfileConfig('technical');
expectNoRule('empty-conclusion', '本仕様は運用改善に貢献することが期待される。', technicalProfile);

const researchProfile = await loadProfileConfig('research');
expectNoRule('list-intro-padding', '以下にまとめます。', researchProfile);

const publicProfile = await loadProfileConfig('public');
expectRule('translationese', '窓口において、申請に関して、確認することができる。', publicProfile);

const webProfile = await loadProfileConfig('web');
expectRule('headline-decoration', '## ★★ 重要なお知らせ', webProfile);

const strictProfile = await loadProfileConfig('strict');
expectRule('weasel-phrases', '一般的に重要である可能性がある。', strictProfile);

const minimalProfile = await loadProfileConfig('minimal');
const reenabledCitation = mergeConfigs(minimalProfile, {
  rules: {
    'nihongo-slopless/citation-needed': 'warning',
  },
});
expectRule('citation-needed', '近年、生成AIの利用は急速に広がっている。', reenabledCitation);

const fullIdWins = mergeConfigs({
  rules: {
    'nihongo-slopless/citation-needed': 'warning',
    'citation-needed': false,
  },
}, {});
expectRule('citation-needed', '近年、生成AIの利用は急速に広がっている。', fullIdWins);

const allowWorldFirstCitation = {
  allowTerms: [
    {
      term: '世界初',
      rules: ['nihongo-slopless/citation-needed'],
      reason: '出典付きの定型表現として別途確認済み',
    },
  ],
};
expectNoRule('citation-needed', '世界初の取り組みです。', allowWorldFirstCitation);
expectRule('citation-needed', '世界初の取り組みです。', {
  allowTerms: [
    {
      term: '世界初',
      rules: ['nihongo-slopless/absolute-claim'],
      reason: '別ルールだけを許可する確認用',
    },
  ],
});
expectRule('empty-conclusion', '今後の発展が期待される。', {
  allowTerms: [
    {
      term: '期待される',
      rules: ['nihongo-slopless/empty-conclusion'],
      reason: '部分語だけでは文全体の指摘を消さない確認',
    },
  ],
});
assert.throws(
  () => lintText('世界初の取り組みです。', {
    config: {
      allowTerms: [{ term: '世界初', rules: ['citation-needed'], reason: '短縮IDは使わない' }],
    },
  }),
  /完全なルールID/,
  'allowTerms should reject short rule IDs at runtime',
);
assert.throws(
  () => lintText('世界初の取り組みです。', {
    config: {
      allowTerms: [{ term: '世界初', rules: ['nihongo-slopless/citation-needed'] }],
    },
  }),
  /reason/,
  'allowTerms should require a reason at runtime',
);

const quotedEmptyConclusion = '> 今後の発展が期待される。\n今後の発展が期待される。';
assert.equal(
  findingsFor('empty-conclusion', quotedEmptyConclusion).length,
  2,
  'quoted prose should be linted without ignorePatterns',
);
const ignoreQuotedLines = {
  ignorePatterns: [
    {
      pattern: '^> ',
      scope: 'line',
      reason: '引用行は原文保持を優先する',
    },
  ],
};
const quotedEmptyConclusionIgnored = findingsFor('empty-conclusion', quotedEmptyConclusion, ignoreQuotedLines);
assert.equal(quotedEmptyConclusionIgnored.length, 1, 'ignorePatterns should suppress findings on matching lines only');
assert.equal(quotedEmptyConclusionIgnored[0].line, 2, 'ignorePatterns should keep findings on non-matching lines');
expectRule('empty-conclusion', quotedEmptyConclusion, {
  ...ignoreQuotedLines,
  allowTerms: [
    {
      term: '期待される',
      rules: ['nihongo-slopless/empty-conclusion'],
      reason: '部分語だけでは文全体の指摘を消さない確認',
    },
  ],
});
assert.throws(
  () => lintText('今後の発展が期待される。', {
    config: {
      ignorePatterns: [{ pattern: '^> ', scope: 'line' }],
    },
  }),
  /reason/,
  'ignorePatterns should require a reason at runtime',
);
assert.throws(
  () => lintText('今後の発展が期待される。', {
    config: {
      ignorePatterns: [{ pattern: '.*', scope: 'line', reason: '広すぎる指定を拒否する' }],
    },
  }),
  /空文字/,
  'ignorePatterns should reject regexes that match an empty string',
);

const secretNeedle = 'SECRET_SHOULD_NOT_LEAK';
const secretLeakPattern = /SECRET_SHOULD_NOT_LEAK|SHOULD_NOT_LEAK|SECRET/u;

function assertNoSecretLeak(label, text, config = {}) {
  const result = lintText(text, { filePath: '<test>', config });
  assert(result.messages.length > 0, `${label} should produce a following finding`);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, secretLeakPattern, `${label} should not leak secrets through JSON excerpts`);
  for (const message of result.messages) {
    assert.doesNotMatch(message.excerpt, secretLeakPattern, `${label} excerpt should be redacted`);
  }
  return result;
}

{
  const cases = [
    {
      label: 'HTML comments',
      text: `<!-- internal token: ${secretNeedle} -->\n今後の発展が期待される。`,
      line: 2,
    },
    {
      label: 'fenced code blocks',
      text: `\`\`\`\n${secretNeedle}\n\`\`\`\n今後の発展が期待される。`,
      line: 4,
    },
    {
      label: 'inline code spans',
      text: `\`${secretNeedle}\` 今後の発展が期待される。`,
      line: 1,
    },
    {
      label: 'inline code spans after findings',
      text: `今後の発展が期待される。 \`${secretNeedle}\``,
      line: 1,
    },
    {
      label: 'YAML front matter',
      text: `---\ntitle: ${secretNeedle}\n---\n今後の発展が期待される。`,
      line: 4,
    },
    {
      label: 'ignorePatterns',
      text: `> ${secretNeedle}\n今後の発展が期待される。`,
      line: 2,
      config: {
        ignorePatterns: [
          {
            pattern: '^> ',
            scope: 'line',
            reason: '引用行は公開出力から除外する',
          },
        ],
      },
    },
    {
      label: 'disable ranges',
      text: `<!-- nihongo-slopless-disable -->\n${secretNeedle}\n<!-- nihongo-slopless-enable -->\n今後の発展が期待される。`,
      line: 4,
    },
    {
      label: 'disable-next-line ranges',
      text: `<!-- nihongo-slopless-disable-next-line -->\n${secretNeedle}\n今後の発展が期待される。`,
      line: 3,
    },
  ];

  for (const item of cases) {
    const result = assertNoSecretLeak(item.label, item.text, item.config ?? {});
    const firstFinding = result.messages[0];
    const expectedIndex = item.text.indexOf('今後');
    assert.equal(firstFinding.index, expectedIndex, `${item.label} should keep original index positions`);
    assert.equal(firstFinding.line, item.line, `${item.label} should keep original line numbers`);
    assert.equal(firstFinding.column, item.text.slice(0, expectedIndex).split('\n').at(-1).length + 1, `${item.label} should keep original columns`);
    assert(firstFinding.length > 0, `${item.label} should keep positive finding lengths`);
  }

  const cliJsonLeak = runCliOnText(`<!-- ${secretNeedle} -->\n今後の発展が期待される。`, ['--profile', 'general', '--fail-on', 'off']);
  assert.equal(cliJsonLeak.status, 0, 'CLI JSON leak fixture should run');
  assert.doesNotMatch(cliJsonLeak.stdout, secretLeakPattern, 'CLI JSON output should not leak masked secret text');
  assert(parseJsonStdout(cliJsonLeak, 'CLI JSON leak fixture').summary.findings > 0, 'CLI JSON leak fixture should keep findings');

  const cliSarifLeak = runCliOnText(`\`\`\`\n${secretNeedle}\n\`\`\`\n今後の発展が期待される。`, ['--format', 'sarif', '--profile', 'general', '--fail-on', 'off']);
  assert.equal(cliSarifLeak.status, 0, 'CLI SARIF leak fixture should run');
  assert.doesNotMatch(cliSarifLeak.stdout, secretLeakPattern, 'CLI SARIF output should not leak masked secret text');
  assert(parseJsonStdout(cliSarifLeak, 'CLI SARIF leak fixture').runs[0].results.length > 0, 'CLI SARIF leak fixture should keep findings');
}

const invalidMinSeverity = runCli(['examples/clean.md', '--min-severity', 'nonsense']);
assert.equal(invalidMinSeverity.status, 2, '--min-severity should reject unknown values');
assert.match(invalidMinSeverity.stderr, /--min-severity/, '--min-severity error should name the option');

const invalidFailOn = runCli(['examples/clean.md', '--fail-on', 'nonsense']);
assert.equal(invalidFailOn.status, 2, '--fail-on should reject unknown values');
assert.match(invalidFailOn.stderr, /--fail-on/, '--fail-on error should name the option');

const invalidMaxFindings = runCli(['examples/clean.md', '--max-findings', '-1']);
assert.equal(invalidMaxFindings.status, 2, '--max-findings should reject negative values');
assert.match(invalidMaxFindings.stderr, /--max-findings/, '--max-findings error should name the option');

const missingOutputPath = runCli(['examples/clean.md', '--output']);
assert.equal(missingOutputPath.status, 2, '--output should require a path value');
assert.match(missingOutputPath.stderr, /--output/, '--output missing value error should name the option');

const invalidFormat = runCli(['examples/clean.md', '--format', 'xml']);
assert.equal(invalidFormat.status, 2, '--format should reject unknown values');
assert.match(invalidFormat.stderr, /--format/, '--format error should name the option');

const missingConfig = runCli(['examples/clean.md', '--config', '__missing_nihongo_slopless_config__.json']);
assert.equal(missingConfig.status, 2, '--config should reject an explicitly missing config file');
assert.match(missingConfig.stderr, /Config file not found/, '--config missing error should explain the missing file');

{
  const invalidConfigDir = mkdtempSync(join(tmpdir(), 'nihongo-slopless-invalid-config-'));
  const unknownRuleConfigPath = join(invalidConfigDir, 'unknown-rule.json');
  const unknownTopLevelConfigPath = join(invalidConfigDir, 'unknown-top-level.json');
  const invalidSeverityConfigPath = join(invalidConfigDir, 'invalid-severity.json');
  const invalidRuleShapeConfigPath = join(invalidConfigDir, 'invalid-rule-shape.json');
  const invalidAllowTermsConfigPath = join(invalidConfigDir, 'invalid-allow-terms.json');

  try {
    writeFileSync(unknownRuleConfigPath, JSON.stringify({
      rules: {
        'nihongo-slopless/long-sentnce': 'warning',
      },
    }), 'utf8');
    writeFileSync(unknownTopLevelConfigPath, JSON.stringify({
      score: true,
    }), 'utf8');
    writeFileSync(invalidSeverityConfigPath, JSON.stringify({
      rules: {
        'nihongo-slopless/long-sentence': 'warnng',
      },
    }), 'utf8');
    writeFileSync(invalidRuleShapeConfigPath, JSON.stringify({
      rules: {
        'nihongo-slopless/long-sentence': true,
      },
    }), 'utf8');
    writeFileSync(invalidAllowTermsConfigPath, JSON.stringify({
      allowTerms: 'bad',
    }), 'utf8');

    await assert.rejects(
      () => loadConfigFile(unknownRuleConfigPath),
      /未知のルールID.*nihongo-slopless\/long-sentnce/,
      'loadConfigFile should reject unknown rule IDs before linting',
    );

    assert.throws(
      () => lintText('TODO: 本文を書く。', {
        config: { rules: { 'nihongo-slopless/long-sentnce': 'warning' } },
      }),
      /未知のルールID.*nihongo-slopless\/long-sentnce/,
      'lintText should reject unknown rule IDs passed through the library API',
    );

    const unknownRuleConfig = runCli(['examples/clean.md', '--config', unknownRuleConfigPath]);
    assert.equal(unknownRuleConfig.status, 2, '--config should fail on unknown rule IDs');
    assert.match(unknownRuleConfig.stderr, /未知のルールID/, '--config unknown rule error should explain the invalid rule key');
    assert.match(unknownRuleConfig.stderr, /nihongo-slopless\/long-sentnce/, '--config unknown rule error should name the invalid rule key');

    const unknownTopLevelConfig = runCli(['examples/clean.md', '--config', unknownTopLevelConfigPath]);
    assert.equal(unknownTopLevelConfig.status, 2, '--config should fail on unknown top-level config keys');
    assert.match(unknownTopLevelConfig.stderr, /未知の設定項目 score/, '--config unknown top-level error should name the invalid key');

    await assert.rejects(
      () => loadConfigFile(invalidSeverityConfigPath),
      /severity.*info, warning, error.*warnng/,
      'loadConfigFile should reject rule severity typos before linting',
    );

    assert.throws(
      () => lintText('これはとても長い文なので長文として検出される可能性があります。', {
        config: { rules: { 'nihongo-slopless/long-sentence': ['warnng', { maxChars: 10 }] } },
      }),
      /severity.*info, warning, error.*warnng/,
      'lintText should reject invalid rule severity passed through the library API',
    );

    assert.throws(
      () => lintText('これはとても長い文なので長文として検出される可能性があります。', {
        config: { rules: { 'nihongo-slopless/long-sentence': true } },
      }),
      /false, "off", severity文字列/,
      'lintText should reject invalid rule config shapes passed through the library API',
    );

    const invalidSeverityConfig = runCli(['examples/clean.md', '--config', invalidSeverityConfigPath]);
    assert.equal(invalidSeverityConfig.status, 2, '--config should fail on invalid rule severity');
    assert.match(invalidSeverityConfig.stderr, /severity/, '--config invalid severity error should name severity');
    assert.match(invalidSeverityConfig.stderr, /warnng/, '--config invalid severity error should name the invalid value');

    const invalidRuleShapeConfig = runCli(['examples/clean.md', '--config', invalidRuleShapeConfigPath]);
    assert.equal(invalidRuleShapeConfig.status, 2, '--config should fail on invalid rule config shapes');
    assert.match(invalidRuleShapeConfig.stderr, /severity文字列/, '--config invalid rule shape error should explain valid forms');

    await assert.rejects(
      () => loadConfigFile(invalidAllowTermsConfigPath),
      /allowTerms は配列/,
      'loadConfigFile should reject invalid allowTerms before linting',
    );

    const invalidAllowTermsEmptyInput = runCli([
      '__definitely_no_such_input_*.md',
      '--allow-empty',
      '--config',
      invalidAllowTermsConfigPath,
    ]);
    assert.equal(
      invalidAllowTermsEmptyInput.status,
      2,
      '--config should reject invalid allowTerms even when --allow-empty leaves no files to lint',
    );
    assert.match(invalidAllowTermsEmptyInput.stderr, /allowTerms は配列/, '--config invalid allowTerms error should be visible');
  } finally {
    rmSync(invalidConfigDir, { recursive: true, force: true });
  }
}

{
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const manifestDir = mkdtempSync(join(tmpdir(), 'nihongo-slopless-fetch-manifest-'));
  const manifestPath = join(manifestDir, 'manifest.jsonl');
  const outDir = join(repoRoot, '.local', 'open-corpus', 'test-terms-block');
  const record = {
    id: 'terms-tbd-external',
    origin: 'external-public',
    sourceName: 'Example',
    sourceUrl: 'https://example.invalid/docs/page',
    license: 'verify before fetch',
    termsCheckedAt: 'TBD-before-fetch',
    purpose: 'test unapproved terms blocking',
    validationRole: 'false-positive-observation',
    storagePolicy: 'manifest-only',
    includeText: false,
    repositoryIncluded: false,
    packageIncluded: false,
    profile: 'technical',
    genre: 'reference-docs',
    reviewFocus: ['terms'],
    notes: 'No network should be attempted while terms are TBD.',
  };
  writeFileSync(manifestPath, `${JSON.stringify(record)}\n`, 'utf8');

  try {
    const blockedFetch = runScript('scripts/fetch-open-corpus.mjs', [
      '--manifest',
      manifestPath,
      '--id',
      'terms-tbd-external',
      '--out',
      outDir,
    ]);
    assert.equal(blockedFetch.status, 2, 'fetch-open-corpus should block external-public fetches before terms approval');
    assert.match(blockedFetch.stderr, /termsCheckedAt が未確認/, 'fetch-open-corpus should explain the missing terms approval');
    assert.match(blockedFetch.stderr, /terms-tbd-external/, 'fetch-open-corpus terms error should name the blocked record');
  } finally {
    rmSync(manifestDir, { recursive: true, force: true });
  }
}

{
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const globDir = mkdtempSync(join(repoRoot, 'tmp-glob-'));
  const globDirName = basename(globDir);
  const nestedDir = join(globDir, 'nested');
  const emptyDir = join(globDir, 'empty');
  const directPath = join(globDir, 'direct.md');
  const nestedPath = join(nestedDir, 'nested.md');

  try {
    mkdirSync(nestedDir);
    mkdirSync(emptyDir);
    writeFileSync(directPath, 'TODO: 直下のファイルです。', 'utf8');
    writeFileSync(nestedPath, 'TODO: ネストしたファイルです。', 'utf8');

    const globstarInput = runCli([`${globDirName}/**/*.md`, '--fail-on', 'off']);
    assert.equal(globstarInput.status, 0, 'globstar input should not fail when files match');
    assert.deepEqual(
      parseJsonStdout(globstarInput, 'globstar input').files.map(file => basename(file.path)),
      ['direct.md', 'nested.md'],
      'globstar should match direct files and nested files',
    );

    const emptyGlob = runCli([`${globDirName}/missing/**/*.md`, '--fail-on', 'off']);
    assert.equal(emptyGlob.status, 2, 'empty glob input should fail by default');
    assert.match(emptyGlob.stderr, /一致するファイルがありません/, 'empty glob error should explain the unmatched pattern');

    const allowedEmptyGlob = runCli([`${globDirName}/missing/**/*.md`, '--allow-empty', '--fail-on', 'off']);
    assert.equal(allowedEmptyGlob.status, 0, '--allow-empty should allow empty glob input');
    assert.equal(parseJsonStdout(allowedEmptyGlob, 'allowed empty glob').files.length, 0, '--allow-empty should emit an empty files array');

    const emptyDirectory = runCli([emptyDir, '--fail-on', 'off']);
    assert.equal(emptyDirectory.status, 2, 'empty directory input should fail by default');
    assert.match(emptyDirectory.stderr, /検査対象ファイルがありません/, 'empty directory error should explain the empty target');

    const allowedEmptyDirectory = runCli([emptyDir, '--allow-empty', '--fail-on', 'off']);
    assert.equal(allowedEmptyDirectory.status, 0, '--allow-empty should allow empty directory input');
    assert.equal(parseJsonStdout(allowedEmptyDirectory, 'allowed empty directory').files.length, 0, '--allow-empty should emit an empty files array for directories');
  } finally {
    rmSync(globDir, { recursive: true, force: true });
  }
}

{
  const absoluteGlobDir = mkdtempSync(join(tmpdir(), 'nihongo-slopless-absolute-glob-'));
  const nestedDir = join(absoluteGlobDir, 'nested');
  const directPath = join(absoluteGlobDir, 'direct.md');
  const nestedPath = join(nestedDir, 'nested.md');

  try {
    mkdirSync(nestedDir);
    writeFileSync(directPath, 'TODO: 絶対glob直下のファイルです。', 'utf8');
    writeFileSync(nestedPath, 'TODO: 絶対globでネストしたファイルです。', 'utf8');

    const absoluteGlobstarInput = runCli([join(absoluteGlobDir, '**', '*.md'), '--fail-on', 'off']);
    assert.equal(absoluteGlobstarInput.status, 0, 'absolute globstar input should not fail when files match outside cwd');
    assert.deepEqual(
      parseJsonStdout(absoluteGlobstarInput, 'absolute globstar input').files.map(file => basename(file.path)).sort(),
      ['direct.md', 'nested.md'],
      'absolute globstar should match direct files and nested files outside cwd',
    );
  } finally {
    rmSync(absoluteGlobDir, { recursive: true, force: true });
  }
}

{
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const ignoreFilesDir = mkdtempSync(join(repoRoot, 'tmp-ignoreFiles-'));
  const ignoreFilesDirName = basename(ignoreFilesDir);
  const nestedDir = join(ignoreFilesDir, 'nested');
  const keepPath = join(ignoreFilesDir, 'keep.md');
  const ignoredPath = join(ignoreFilesDir, 'ignored.md');
  const nestedIgnoredPath = join(nestedDir, 'ignored.md');
  const ignoreConfigPath = join(ignoreFilesDir, 'config.json');

  try {
    mkdirSync(nestedDir);
    writeFileSync(keepPath, 'TODO: 残す対象です。', 'utf8');
    writeFileSync(ignoredPath, 'TODO: 除外対象です。', 'utf8');
    writeFileSync(nestedIgnoredPath, 'TODO: ネストした除外対象です。', 'utf8');
    writeFileSync(ignoreConfigPath, JSON.stringify({
      ignoreFiles: [
        `${ignoreFilesDirName}/ignored.md`,
        `${ignoreFilesDirName}/nested/**`,
      ],
    }), 'utf8');

    const ignoredFileInput = runCli([ignoredPath, '--config', ignoreConfigPath, '--fail-on', 'off']);
    assert.equal(ignoredFileInput.status, 0, 'ignoreFiles should not fail when a direct file input is excluded');
    assert.equal(parseJsonStdout(ignoredFileInput, 'ignoreFiles direct file input').files.length, 0, 'ignoreFiles should exclude direct file input after expansion');

    const directoryInput = runCli([ignoreFilesDir, '--config', ignoreConfigPath, '--fail-on', 'off']);
    const directoryPayload = parseJsonStdout(directoryInput, 'ignoreFiles directory input');
    assert.deepEqual(directoryPayload.files.map(file => basename(file.path)), ['keep.md'], 'ignoreFiles should exclude files found from directory input');

    const globInput = runCli([`${ignoreFilesDirName}/*.md`, '--config', ignoreConfigPath, '--fail-on', 'off']);
    const globPayload = parseJsonStdout(globInput, 'ignoreFiles glob input');
    assert.deepEqual(globPayload.files.map(file => basename(file.path)), ['keep.md'], 'ignoreFiles should exclude files found from glob input');

    const stdinInput = runCli(['-', '--config', ignoreConfigPath, '--fail-on', 'off'], {
      input: 'TODO: 標準入力は除外しない。',
    });
    const stdinPayload = parseJsonStdout(stdinInput, 'ignoreFiles stdin input');
    assert.equal(stdinPayload.files.length, 1, 'ignoreFiles should not exclude stdin');
    assert.equal(stdinPayload.files[0].path, '<stdin>', 'stdin path should remain visible as <stdin>');
    assert(stdinPayload.files[0].messages.some(message => message.ruleId === 'nihongo-slopless/placeholder'), 'stdin should still be linted with ignoreFiles configured');
  } finally {
    rmSync(ignoreFilesDir, { recursive: true, force: true });
  }
}

const failOnOff = runCli(['examples/sloppy.md', '--fail-on', 'off']);
assert.equal(failOnOff.status, 0, '--fail-on off should keep findings from failing the command');

const agentOutputProfile = runCliOnText('承知しました。以下にまとめます。', ['--profile', 'agent-output', '--fail-on', 'off']);
assert.equal(agentOutputProfile.status, 0, '--profile agent-output should run from the CLI');
assert(
  parseJsonStdout(agentOutputProfile, 'agent-output profile').files[0].messages
    .some(message => message.ruleId === 'nihongo-slopless/chat-response-leakage'),
  '--profile agent-output should keep chat-response-leakage available',
);

const cleanExample = runCli(['examples/clean.md', '--profile', 'general', '--fail-on', 'off']);
assert.equal(cleanExample.status, 0, 'examples/clean.md should run with --profile general');
assert.equal(parseJsonStdout(cleanExample, 'clean example').summary.findings, 0, 'examples/clean.md should remain clean');

const sloppyExample = runCli(['examples/sloppy.md', '--profile', 'agent-output', '--fail-on', 'off']);
assert.equal(sloppyExample.status, 0, 'examples/sloppy.md should run with --profile agent-output');
const sloppyRuleIds = new Set(parseJsonStdout(sloppyExample, 'sloppy example').files.flatMap(file => file.messages.map(message => message.ruleId)));
for (const ruleId of [
  'nihongo-slopless/chat-response-leakage',
  'nihongo-slopless/placeholder',
  'nihongo-slopless/empty-conclusion',
]) {
  assert(sloppyRuleIds.has(ruleId), `examples/sloppy.md should keep representative ${ruleId} findings`);
}

const docsGlob = runCli(['docs/**/*.md', '--profile', 'agent-output', '--fail-on', 'off']);
assert.equal(docsGlob.status, 0, 'docs/**/*.md should work as a basic glob');
const docsGlobPayload = parseJsonStdout(docsGlob, 'docs glob');
assert(docsGlobPayload.files.length > 0, 'docs glob should match at least one file');
assert(
  docsGlobPayload.files.every(file => file.path.startsWith('docs/')),
  'docs glob should report docs/ relative paths',
);

const maxFindingsPassing = runCliOnText('TODO: ここに具体例を書く。', ['--fail-on', 'off', '--max-findings', '10']);
assert.equal(maxFindingsPassing.status, 0, '--max-findings should pass when findings are within the threshold');
assert(parseJsonStdout(maxFindingsPassing, 'passing max findings').summary.findings > 0, '--max-findings should not hide findings from JSON output');

const maxFindingsFailing = runCliOnText('TODO: ここに具体例を書く。', ['--fail-on', 'off', '--max-findings', '0']);
assert.equal(maxFindingsFailing.status, 1, '--max-findings should fail when findings exceed the threshold even with --fail-on off');
assert(parseJsonStdout(maxFindingsFailing, 'failing max findings').summary.findings > 0, '--max-findings failure should still emit the normal JSON output');

const maxFindingsAfterMinSeverity = runCliOnText('今後の発展が期待される。', ['--fail-on', 'off', '--min-severity', 'error', '--max-findings', '0']);
assert.equal(maxFindingsAfterMinSeverity.status, 0, '--max-findings should count findings after --min-severity filtering');
assert.equal(parseJsonStdout(maxFindingsAfterMinSeverity, 'filtered max findings').summary.findings, 0, '--min-severity should reduce the count used by --max-findings');

{
  const outputDir = mkdtempSync(join(tmpdir(), 'nihongo-slopless-output-'));
  const jsonOutputPath = join(outputDir, 'nested', 'result.json');
  const sarifOutputPath = join(outputDir, 'result.sarif');
  const publishSarifOutputPath = join(outputDir, 'publish.sarif');
  const failingOutputPath = join(outputDir, 'failing.json');
  const rulesOutputPath = join(outputDir, 'rules.json');

  try {
    const outputJson = runCliOnText('TODO: ここに具体例を書く。', ['--output', jsonOutputPath, '--fail-on', 'off']);
    assert.equal(outputJson.status, 0, '--output should preserve a successful exit code when --fail-on off is used');
    assert.equal(outputJson.stdout, '', '--output should not duplicate JSON to stdout');
    const outputJsonPayload = JSON.parse(readFileSync(jsonOutputPath, 'utf8'));
    assert.equal(outputJsonPayload.tool, 'nihongo-slopless', '--output should save the normal JSON payload');
    assert(outputJsonPayload.summary.findings > 0, '--output should not hide findings from the saved JSON payload');

    const outputSarif = runCliOnText('TODO: ここに具体例を書く。', ['--format', 'sarif', '--output', sarifOutputPath, '--fail-on', 'off']);
    assert.equal(outputSarif.status, 0, '--output should support SARIF output');
    assert.equal(outputSarif.stdout, '', '--output SARIF should not duplicate content to stdout');
    assert.equal(JSON.parse(readFileSync(sarifOutputPath, 'utf8')).version, '2.1.0', '--output should save SARIF 2.1.0 payloads');

    const publishSarif = runCli(['examples/sloppy.md', '--format', 'sarif', '--output', publishSarifOutputPath, '--fail-on', 'off']);
    assert.equal(publishSarif.status, 0, 'SARIF publish validation fixture should be generated');
    const validatePublishSarif = runScript('scripts/validate-sarif.mjs', [publishSarifOutputPath, '--for-publish']);
    assert.equal(validatePublishSarif.status, 0, 'generated SARIF should pass validate-sarif --for-publish');
    assert.match(validatePublishSarif.stdout, /SARIF OK/, 'validate-sarif should report SARIF OK');

    const outputFailing = runCliOnText('TODO: ここに具体例を書く。', ['--output', failingOutputPath]);
    assert.equal(outputFailing.status, 1, '--output should preserve failing lint exit codes');
    assert.equal(outputFailing.stdout, '', '--output should keep stdout empty even when lint fails');
    assert(JSON.parse(readFileSync(failingOutputPath, 'utf8')).summary.findings > 0, '--output should write the report before returning a lint failure');

    const outputRules = runCli(['--rules', '--output', rulesOutputPath]);
    assert.equal(outputRules.status, 0, '--rules should support --output');
    assert.equal(outputRules.stdout, '', '--rules --output should keep stdout empty');
    assert(Array.isArray(JSON.parse(readFileSync(rulesOutputPath, 'utf8')).rules), '--rules --output should save rule metadata');
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

const explicitJson = runCli(['examples/clean.md', '--format', 'json']);
assert.equal(explicitJson.status, 0, '--format json should keep the default JSON behavior');
const explicitJsonPayload = parseJsonStdout(explicitJson, 'explicit JSON format');
assert.equal(explicitJsonPayload.tool, 'nihongo-slopless', '--format json should emit the existing JSON payload');
assert.equal(explicitJsonPayload.version, VERSION, 'JSON payload should use package.json version');
assert(Array.isArray(explicitJsonPayload.files), '--format json should keep files array output');

const cliVersion = runCli(['--version']);
assert.equal(cliVersion.status, 0, '--version should succeed');
assert.equal(cliVersion.stdout.trim(), VERSION, '--version should match package.json version');
const rulesVersion = runCli(['--rules']);
assert.equal(rulesVersion.status, 0, '--rules should succeed');
assert.equal(parseJsonStdout(rulesVersion, '--rules version').version, VERSION, '--rules payload should use package.json version');
const auditVersion = runScript('scripts/audit-packaged-goldset.mjs', ['--strict-origin', '--json']);
assert.equal(auditVersion.status, 0, 'audit-packaged-goldset should succeed for packaged example goldset');
assert.equal(parseJsonStdout(auditVersion, 'audit-packaged-goldset version').version, VERSION, 'audit-packaged-goldset should use package.json version');

const jsonPathResult = runCli(['examples/sloppy.md', '--fail-on', 'off']);
assert.equal(jsonPathResult.status, 0, 'JSON file run should support --fail-on off');
const jsonPathPayload = parseJsonStdout(jsonPathResult, 'JSON file path output');
assert(
  jsonPathPayload.files.every(file => file.path === 'examples/sloppy.md'),
  'JSON file.path should be relative to cwd with forward slashes by default',
);

const jsonAbsolutePathResult = runCli(['examples/sloppy.md', '--absolute-paths', '--fail-on', 'off']);
assert.equal(jsonAbsolutePathResult.status, 0, 'JSON file run should support --absolute-paths');
const jsonAbsolutePathPayload = parseJsonStdout(jsonAbsolutePathResult, 'JSON absolute file path output');
assert(
  jsonAbsolutePathPayload.files.every(file => isAbsolute(file.path) && file.path.endsWith(join('examples', 'sloppy.md'))),
  '--absolute-paths should keep JSON file.path as an absolute filesystem path',
);

const sarifResult = runCliOnText(
  'TODO: ここに具体例を書く。\n今後の発展が期待される。\n資料を確認します。結果を共有します。質問を整理します。次回に説明します。',
  ['--format', 'sarif', '--pretty', '--fail-on', 'off'],
);
assert.equal(sarifResult.status, 0, '--format sarif with --fail-on off should not fail on findings');
assert(sarifResult.stdout.includes('\n  "version"'), '--pretty should format SARIF output across multiple lines');
const sarifPayload = parseJsonStdout(sarifResult, 'SARIF output');
assert.equal(sarifPayload.version, '2.1.0', 'SARIF output should declare version 2.1.0');
assert.equal(sarifPayload.runs[0].tool.driver.name, 'nihongo-slopless', 'SARIF tool driver should name this tool');
assert.equal(sarifPayload.runs[0].tool.driver.version, VERSION, 'SARIF tool driver should include the package.json version');
assert(Array.isArray(sarifPayload.runs[0].tool.driver.rules), 'SARIF tool driver should include rule descriptors');
assert(sarifPayload.runs[0].tool.driver.rules.some(rule => rule.id === 'nihongo-slopless/empty-conclusion'), 'SARIF rule descriptors should include lint rules');
const sarifDriverRuleIds = new Set(sarifPayload.runs[0].tool.driver.rules.map(rule => rule.id));
assert(
  sarifPayload.runs[0].results.every(result => sarifDriverRuleIds.has(result.ruleId)),
  'SARIF result ruleId should exist in tool.driver.rules',
);
const sarifLevels = new Set(sarifPayload.runs[0].results.map(result => result.level));
assert(sarifLevels.has('error'), 'SARIF should map error severity to error level');
assert(sarifLevels.has('warning'), 'SARIF should map warning severity to warning level');
assert(sarifLevels.has('note'), 'SARIF should map info severity to note level');
assert(
  sarifPayload.runs[0].results.every(result => result.ruleId && result.message?.text && result.locations?.[0]?.physicalLocation?.region),
  'SARIF results should include ruleId, message text, and physical locations',
);
assert(
  sarifPayload.runs[0].results.every(result => {
    const region = result.locations[0].physicalLocation.region;
    return Number.isInteger(region.startLine) && region.startLine > 0
      && Number.isInteger(region.startColumn) && region.startColumn > 0;
  }),
  'SARIF regions should use positive integer line and column values',
);
const sarifPathResult = runCli(['examples/sloppy.md', '--format', 'sarif', '--fail-on', 'off']);
assert.equal(sarifPathResult.status, 0, 'SARIF file run should support --fail-on off');
const sarifPathPayload = parseJsonStdout(sarifPathResult, 'SARIF file path output');
assert(
  sarifPathPayload.runs[0].results.every(result => result.locations[0].physicalLocation.artifactLocation.uri === 'examples/sloppy.md'),
  'SARIF artifactLocation.uri should be relative to cwd with forward slashes',
);
const sarifAbsolutePathResult = runCli(['examples/sloppy.md', '--format', 'sarif', '--absolute-paths', '--fail-on', 'off']);
assert.equal(sarifAbsolutePathResult.status, 0, 'SARIF file run should support --absolute-paths');
const sarifAbsolutePathPayload = parseJsonStdout(sarifAbsolutePathResult, 'SARIF absolute file path output');
assert(
  sarifAbsolutePathPayload.runs[0].results.every(result => {
    const uri = result.locations[0].physicalLocation.artifactLocation.uri;
    return uri.startsWith('file:') && isAbsolute(fileURLToPath(uri)) && fileURLToPath(uri).endsWith(join('examples', 'sloppy.md'));
  }),
  '--absolute-paths should emit absolute file URIs in SARIF artifactLocation.uri',
);
const sarifStdinResult = runCli(['-', '--format', 'sarif', '--fail-on', 'off'], {
  input: '今後の発展が期待される。',
});
assert.equal(sarifStdinResult.status, 0, 'SARIF stdin run should support --fail-on off');
const sarifStdinPayload = parseJsonStdout(sarifStdinResult, 'SARIF stdin output');
assert(sarifStdinPayload.runs[0].results.length > 0, 'SARIF stdin fixture should produce findings');
assert(
  sarifStdinPayload.runs[0].results.every(result => result.locations[0].physicalLocation.artifactLocation.uri === 'stdin'),
  'SARIF artifactLocation.uri should keep stdin input as stdin',
);

const schemaPath = fileURLToPath(new URL('../config/schema.json', import.meta.url));
const configSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));
assert.equal(configSchema.properties.rules.type, 'object', 'config schema should describe rules as an object');
assert(
  configSchema.properties.rules.propertyNames.enum.includes('nihongo-slopless/long-sentence'),
  'config schema should allow full rule IDs as rule keys',
);
assert(
  configSchema.properties.rules.propertyNames.enum.includes('long-sentence'),
  'config schema should allow short rule IDs as rule keys',
);
assert(
  !configSchema.properties.rules.propertyNames.enum.includes('nihongo-slopless/long-sentnce'),
  'config schema should reject unknown rule keys through propertyNames',
);
for (const rule of allRules) {
  assert(
    configSchema.properties.rules.propertyNames.enum.includes(`nihongo-slopless/${rule.id}`),
    `config schema should allow full rule ID for ${rule.id}`,
  );
  assert(
    configSchema.properties.rules.propertyNames.enum.includes(rule.id),
    `config schema should allow short rule ID for ${rule.id}`,
  );
}
assert.equal(configSchema.properties.ignoreFiles.type, 'array', 'config schema should describe implemented ignoreFiles as an array');
assert.equal(configSchema.properties.ignoreFiles.items.type, 'string', 'config schema should restrict ignoreFiles entries to strings');
assert.equal(configSchema.properties.ignorePatterns.type, 'array', 'config schema should describe implemented ignorePatterns as an array');
assert.deepEqual(configSchema.$defs.ignorePattern.required, ['pattern', 'scope', 'reason'], 'ignorePatterns schema should require pattern, scope, and reason');
assert.equal(configSchema.$defs.ignorePattern.properties.scope.const, 'line', 'ignorePatterns schema should expose only line scope');
assert(configSchema.$defs.ignorePattern.additionalProperties === false, 'ignorePatterns schema should reject unknown fields');
assert.equal(configSchema.properties.allowTerms.type, 'array', 'config schema should describe implemented allowTerms as an array');
assert.deepEqual(configSchema.$defs.allowTerm.required, ['term', 'rules', 'reason'], 'allowTerms schema should require term, rules, and reason');
assert(configSchema.$defs.allowTerm.additionalProperties === false, 'allowTerms schema should reject unknown fields');
assert.equal(configSchema.properties.collapseOccurrences.type, 'boolean', 'config schema should describe collapseOccurrences as a boolean');
assert.equal(configSchema.properties.occurrenceMergeDistance.type, 'integer', 'config schema should describe occurrenceMergeDistance as an integer');
assert(
  configSchema.$defs.allowTermRuleId.enum.includes('nihongo-slopless/citation-needed'),
  'allowTerms schema should list compatible full rule IDs',
);
assert.equal(configSchema.additionalProperties, false, 'config schema should not expose unknown options');
const ruleConfigVariants = JSON.stringify(configSchema.$defs.ruleConfig.oneOf);
assert(ruleConfigVariants.includes('"const":"off"'), 'config schema should allow "off" rule settings');
assert(ruleConfigVariants.includes('"const":false'), 'config schema should allow false rule settings');
assert(ruleConfigVariants.includes('"prefixItems"'), 'config schema should allow array rule settings');
assert(ruleConfigVariants.includes('"severity"'), 'config schema should allow object rule settings with severity');
assert.doesNotThrow(
  () => JSON.parse(readFileSync(fileURLToPath(new URL('../config/recommended.json', import.meta.url)), 'utf8')),
  'recommended config should remain valid JSON alongside the schema',
);

const placeholderCountText = 'TODOを確認する。\nFIXMEを確認する。';

const invalidGoldsetMissingText = runEvaluateCorpus([{
  id: 'invalid-missing-text',
  expectedRules: [],
}]);
assert.equal(invalidGoldsetMissingText.status, 2, 'goldset validation should reject records without text');
assert.match(invalidGoldsetMissingText.stderr, /invalid-missing-text/, 'goldset validation error should include the record id');
assert.match(invalidGoldsetMissingText.stderr, /text/, 'goldset validation error should name the invalid field');

const invalidGoldsetExpectedRules = runEvaluateCorpus([{
  id: 'invalid-expected-rules',
  text: '本文です。',
  expectedRules: 'placeholder',
}]);
assert.equal(invalidGoldsetExpectedRules.status, 2, 'goldset validation should reject non-array expectedRules');
assert.match(invalidGoldsetExpectedRules.stderr, /expectedRules/, 'goldset validation error should name expectedRules');

const invalidGoldsetUnknownRule = runEvaluateCorpus([{
  id: 'invalid-unknown-rule',
  text: '本文です。',
  expectedRules: ['unknown-rule'],
}]);
assert.equal(invalidGoldsetUnknownRule.status, 2, 'goldset validation should reject unknown rule IDs');
assert.match(invalidGoldsetUnknownRule.stderr, /unknown-rule/, 'goldset validation error should include the unknown rule id');

const invalidGoldsetCount = runEvaluateCorpus([{
  id: 'invalid-count',
  text: 'TODOを確認する。',
  expectedCounts: { placeholder: -1 },
}]);
assert.equal(invalidGoldsetCount.status, 2, 'goldset validation should reject negative expectedCounts');
assert.match(invalidGoldsetCount.stderr, /expectedCounts/, 'goldset validation error should name expectedCounts');

const invalidGoldsetExpectedFindings = runEvaluateCorpus([{
  id: 'invalid-expected-findings',
  text: 'TODOを確認する。',
  expectedFindings: [{ ruleId: 'placeholder' }],
}]);
assert.equal(invalidGoldsetExpectedFindings.status, 2, 'goldset validation should reject expectedFindings without a locator');
assert.match(invalidGoldsetExpectedFindings.stderr, /expectedFindings/, 'goldset validation error should name expectedFindings');

const invalidGoldsetExpectedFindingsRule = runEvaluateCorpus([{
  id: 'invalid-expected-findings-rule',
  text: 'TODOを確認する。',
  expectedFindings: [{ ruleId: 'unknown-rule', excerpt: 'TODO' }],
}]);
assert.equal(invalidGoldsetExpectedFindingsRule.status, 2, 'goldset validation should reject unknown expectedFindings rule IDs');
assert.match(invalidGoldsetExpectedFindingsRule.stderr, /unknown-rule/, 'expectedFindings validation should include unknown rule IDs');

const invalidGoldsetExpectedFindingsLineOnly = runEvaluateCorpus([{
  id: 'invalid-expected-findings-line-only',
  text: 'TODOを確認する。',
  expectedFindings: [{ ruleId: 'placeholder', line: 1 }],
}]);
assert.equal(invalidGoldsetExpectedFindingsLineOnly.status, 2, 'goldset validation should reject line-only expectedFindings');
assert.match(invalidGoldsetExpectedFindingsLineOnly.stderr, /excerpt|messageIncludes/, 'line-only expectedFindings error should request a stable locator');

const invalidGoldsetReviewStatus = runEvaluateCorpus([{
  id: 'invalid-review-status',
  text: '本文です。',
  expectedRules: [],
  review: { status: 'UNKNOWN', decision: 'defer' },
}]);
assert.equal(invalidGoldsetReviewStatus.status, 2, 'goldset validation should reject unknown review.status');
assert.match(invalidGoldsetReviewStatus.stderr, /review\.status/, 'goldset validation error should name review.status');

const reviewedEvaluation = runEvaluateCorpus([{
  id: 'review-citation-tp',
  profile: 'research',
  text: '近年、この手法の重要性が高まっている。',
  expectedRules: ['citation-needed'],
  review: {
    status: 'TP',
    decision: 'revise',
    reason: '根拠文献か対象範囲を補う必要がある',
  },
}]);
assert.equal(reviewedEvaluation.status, 0, 'valid review metadata should not change a successful evaluation');
const reviewedEvaluationPayload = parseJsonStdout(reviewedEvaluation, 'reviewed evaluation');
assert.deepEqual(
  reviewedEvaluationPayload.files[0].review,
  {
    status: 'TP',
    decision: 'revise',
    reason: '根拠文献か対象範囲を補う必要がある',
  },
  'evaluation files should preserve review metadata for human judgment',
);
assert.equal(reviewedEvaluationPayload.reviewSummary.records, 1, 'reviewSummary should count reviewed records');
assert.equal(reviewedEvaluationPayload.reviewSummary.byStatus.TP, 1, 'reviewSummary should count review.status values');
assert.equal(reviewedEvaluationPayload.reviewSummary.byDecision.revise, 1, 'reviewSummary should count review.decision values');

const summaryEvaluation = runEvaluateCorpus([{
  id: 'summary-placeholder',
  profile: 'general',
  text: 'TODOを確認する。',
  expectedRules: ['placeholder'],
}], ['--summary']);
assert.equal(summaryEvaluation.status, 0, '--summary should keep successful evaluations successful');
const summaryEvaluationPayload = parseJsonStdout(summaryEvaluation, 'summary evaluation');
assert(!Object.prototype.hasOwnProperty.call(summaryEvaluationPayload, 'files'), '--summary should omit detailed files output');
assert.equal(summaryEvaluationPayload.tool, 'nihongo-slopless-evaluate', '--summary should keep tool metadata');
assert(Array.isArray(summaryEvaluationPayload.ruleSummary), '--summary should keep ruleSummary');
assert(summaryEvaluationPayload.lintSummary, '--summary should keep lintSummary');

const matchingCounts = runEvaluateCorpus([{
  id: 'count-placeholder-match',
  profile: 'general',
  text: placeholderCountText,
  expectedRules: ['placeholder'],
  expectedCounts: { placeholder: 2 },
}]);
assert.equal(matchingCounts.status, 0, 'matching expectedCounts should keep evaluation successful');
const matchingCountsPayload = parseJsonStdout(matchingCounts, 'matching expectedCounts');
const matchingCountsFile = matchingCountsPayload.files[0];
assert.deepEqual(matchingCountsFile.expected, ['nihongo-slopless/placeholder'], 'expectedRules set output should remain present');
assert.deepEqual(matchingCountsFile.predicted, ['nihongo-slopless/placeholder'], 'predicted set output should remain present');
assert.deepEqual(matchingCountsFile.truePositives, ['nihongo-slopless/placeholder'], 'truePositives set output should remain present');
assert.deepEqual(matchingCountsFile.falsePositives, [], 'count matches should not create set false positives');
assert.deepEqual(matchingCountsFile.falseNegatives, [], 'count matches should not create set false negatives');
assert.equal(matchingCountsFile.expectedCountSource, 'expectedCounts', 'count source should identify expectedCounts');
assert.deepEqual(matchingCountsFile.expectedCounts, { 'nihongo-slopless/placeholder': 2 }, 'expectedCounts should be normalized to full rule IDs');
assert.deepEqual(matchingCountsFile.predictedCounts, { 'nihongo-slopless/placeholder': 2 }, 'predictedCounts should include duplicate findings');
assert.deepEqual(matchingCountsFile.countMatches, ['nihongo-slopless/placeholder'], 'matching duplicate findings should be listed as countMatches');
assert.deepEqual(matchingCountsFile.countExcesses, [], 'matching duplicate findings should have no countExcesses');
assert.deepEqual(matchingCountsFile.countShortfalls, [], 'matching duplicate findings should have no countShortfalls');
assert.deepEqual(matchingCountsPayload.countMismatches, {}, 'matching duplicate findings should have no aggregated countMismatches');

const excessCounts = runEvaluateCorpus([{
  id: 'count-placeholder-excess',
  profile: 'general',
  text: placeholderCountText,
  expectedRules: ['placeholder'],
  expectedCounts: { placeholder: 1 },
}]);
assert.equal(excessCounts.status, 1, 'count excess should fail evaluation');
const excessCountsPayload = parseJsonStdout(excessCounts, 'excess expectedCounts');
const excessCountsFile = excessCountsPayload.files[0];
assert.deepEqual(excessCountsFile.truePositives, ['nihongo-slopless/placeholder'], 'set true positive should remain independent from count excess');
assert.deepEqual(excessCountsFile.falsePositives, [], 'count excess should not become a set false positive');
assert.deepEqual(excessCountsFile.falseNegatives, [], 'count excess should not become a set false negative');
assert.deepEqual(excessCountsFile.countMatches, [], 'count excess should not be listed as a count match');
assert.deepEqual(excessCountsFile.countExcesses, [{
  ruleId: 'nihongo-slopless/placeholder',
  expectedCount: 1,
  predictedCount: 2,
  excess: 1,
}], 'countExcesses should expose one excess placeholder finding');
assert.deepEqual(excessCountsFile.countShortfalls, [], 'count excess should not create a shortfall');
assert.equal(
  excessCountsPayload.countMismatches['nihongo-slopless/placeholder'].excessRecords[0].excess,
  1,
  'aggregated countMismatches should expose one excess placeholder finding',
);

const matchingFindings = runEvaluateCorpus([{
  id: 'finding-placeholder-match',
  profile: 'general',
  text: 'TODO: 概要を書く。\nFIXME: 連絡先を書く。',
  expectedRules: ['placeholder'],
  expectedFindings: [
    { ruleId: 'placeholder', line: 1, excerpt: 'TODO' },
    { ruleId: 'placeholder', line: 2, excerpt: 'FIXME' },
  ],
}]);
assert.equal(matchingFindings.status, 0, 'matching expectedFindings should keep evaluation successful');
const matchingFindingsPayload = parseJsonStdout(matchingFindings, 'matching expectedFindings');
const matchingFindingsFile = matchingFindingsPayload.files[0];
assert.equal(matchingFindingsFile.expectedFindingSource, 'expectedFindings', 'expectedFindings should report its source');
assert.equal(matchingFindingsFile.matchedFindings.length, 2, 'expectedFindings should match both located findings');
assert.deepEqual(matchingFindingsFile.missedFindings, [], 'matching expectedFindings should have no missed findings');
assert.deepEqual(matchingFindingsFile.unexpectedFindings, [], 'matching expectedFindings should have no unexpected findings');
assert.equal(matchingFindingsPayload.findingSummary.expected, 2, 'findingSummary should count expected findings');
assert.equal(matchingFindingsPayload.findingSummary.predicted, 2, 'findingSummary should count predicted findings for evaluated rules');
assert.equal(matchingFindingsPayload.findingSummary.matched, 2, 'findingSummary should count matched findings');

const findingsOnlyExpectedRules = runEvaluateCorpus([{
  id: 'finding-only-placeholder-match',
  profile: 'general',
  text: 'TODO: 概要を書く。',
  expectedFindings: [
    { ruleId: 'placeholder', line: 1, excerpt: 'TODO' },
  ],
}]);
assert.equal(findingsOnlyExpectedRules.status, 0, 'expectedFindings alone should also satisfy rule-set evaluation');
const findingsOnlyExpectedRulesFile = parseJsonStdout(findingsOnlyExpectedRules, 'expectedFindings-only evaluation').files[0];
assert.deepEqual(
  findingsOnlyExpectedRulesFile.expected,
  ['nihongo-slopless/placeholder'],
  'expectedFindings rule IDs should be included in expected rule-set output',
);
assert.deepEqual(
  findingsOnlyExpectedRulesFile.falsePositives,
  [],
  'expectedFindings-only records should not report their located rule as a false positive',
);

const profileFindings = runEvaluateCorpus([{
  id: 'finding-profile-empty-conclusion',
  profile: 'general',
  text: '今後の発展が期待される。',
  expectedFindingsByProfile: {
    minimal: [],
    general: [
      { ruleId: 'empty-conclusion', excerpt: '今後の発展' },
    ],
  },
}]);
assert.equal(profileFindings.status, 0, 'expectedFindingsByProfile should select the record profile');
const profileFindingsFile = parseJsonStdout(profileFindings, 'profile expectedFindings').files[0];
assert.equal(
  profileFindingsFile.expectedFindingSource,
  'expectedFindingsByProfile.general',
  'expectedFindingsByProfile should report the selected profile source',
);
assert.deepEqual(
  profileFindingsFile.expected,
  ['nihongo-slopless/empty-conclusion'],
  'profile expectedFindings should also feed the rule-set expectation',
);

const profileFindingsEmpty = runEvaluateCorpus([{
  id: 'finding-profile-empty-array',
  profile: 'minimal',
  text: '今後の発展が期待される。',
  expectedFindingsByProfile: {
    minimal: [],
    general: [
      { ruleId: 'empty-conclusion', excerpt: '今後の発展' },
    ],
  },
}]);
assert.equal(profileFindingsEmpty.status, 0, 'empty expectedFindingsByProfile arrays should be valid for profiles with no matching findings');
const profileFindingsEmptyFile = parseJsonStdout(profileFindingsEmpty, 'empty profile expectedFindings').files[0];
assert.equal(
  profileFindingsEmptyFile.expectedFindingSource,
  'expectedFindingsByProfile.minimal',
  'empty expectedFindingsByProfile arrays should still report the selected profile source',
);
assert.deepEqual(profileFindingsEmptyFile.expectedFindings, [], 'empty profile expectedFindings should keep no expected findings');

const profileFindingsFallback = runEvaluateCorpus([{
  id: 'finding-profile-fallback',
  profile: 'general',
  text: 'TODO: 概要を書く。',
  expectedFindings: [
    { ruleId: 'placeholder', excerpt: 'TODO' },
  ],
  expectedFindingsByProfile: {
    minimal: [],
  },
}]);
assert.equal(profileFindingsFallback.status, 0, 'expectedFindingsByProfile should fall back to expectedFindings when the profile key is absent');
assert.equal(
  parseJsonStdout(profileFindingsFallback, 'fallback profile expectedFindings').files[0].expectedFindingSource,
  'expectedFindings',
  'expectedFindingsByProfile fallback should report expectedFindings as the source',
);

const mismatchedFindings = runEvaluateCorpus([{
  id: 'finding-placeholder-mismatch',
  profile: 'general',
  text: 'TODO: 概要を書く。\nFIXME: 連絡先を書く。',
  expectedRules: ['placeholder'],
  expectedFindings: [
    { ruleId: 'placeholder', line: 1, excerpt: 'TODO' },
  ],
}]);
assert.equal(mismatchedFindings.status, 1, 'extra same-rule locations should fail expectedFindings evaluation');
const mismatchedFindingsFile = parseJsonStdout(mismatchedFindings, 'mismatched expectedFindings').files[0];
assert.equal(mismatchedFindingsFile.matchedFindings.length, 1, 'expectedFindings mismatch should keep matched findings visible');
assert.equal(mismatchedFindingsFile.unexpectedFindings.length, 1, 'expectedFindings mismatch should expose unexpected same-rule findings');
const mismatchedFindingsSummary = runEvaluateCorpus([{
  id: 'finding-placeholder-summary-mismatch',
  profile: 'general',
  text: 'TODO: 概要を書く。\nFIXME: 連絡先を書く。',
  expectedRules: ['placeholder'],
  expectedFindings: [
    { ruleId: 'placeholder', line: 1, excerpt: 'TODO' },
  ],
}], ['--summary']);
const mismatchedFindingsSummaryPayload = parseJsonStdout(mismatchedFindingsSummary, 'summary mismatched expectedFindings');
assert.equal(mismatchedFindingsSummary.status, 1, '--summary should fail on finding-level mismatches');
assert(!Object.prototype.hasOwnProperty.call(mismatchedFindingsSummaryPayload, 'files'), '--summary should omit files for finding mismatches');
assert.equal(
  mismatchedFindingsSummaryPayload.findingMismatches['nihongo-slopless/placeholder'].unexpectedRecords.length,
  1,
  '--summary should keep findingMismatches for located finding debugging',
);

const shortfallCounts = runEvaluateCorpus([{
  id: 'count-placeholder-shortfall',
  profile: 'general',
  text: placeholderCountText,
  expectedRules: ['placeholder'],
  expectedCounts: { placeholder: 3 },
}]);
assert.equal(shortfallCounts.status, 1, 'count shortfall should fail evaluation');
const shortfallCountsPayload = parseJsonStdout(shortfallCounts, 'shortfall expectedCounts');
const shortfallCountsFile = shortfallCountsPayload.files[0];
assert.deepEqual(shortfallCountsFile.truePositives, ['nihongo-slopless/placeholder'], 'set true positive should remain independent from count shortfall');
assert.deepEqual(shortfallCountsFile.falsePositives, [], 'count shortfall should not become a set false positive');
assert.deepEqual(shortfallCountsFile.falseNegatives, [], 'count shortfall should not become a set false negative');
assert.deepEqual(shortfallCountsFile.countExcesses, [], 'count shortfall should not create an excess');
assert.deepEqual(shortfallCountsFile.countShortfalls, [{
  ruleId: 'nihongo-slopless/placeholder',
  expectedCount: 3,
  predictedCount: 2,
  shortfall: 1,
}], 'countShortfalls should expose one missing placeholder finding');
assert.equal(
  shortfallCountsPayload.countMismatches['nihongo-slopless/placeholder'].shortfallRecords[0].shortfall,
  1,
  'aggregated countMismatches should expose one missing placeholder finding',
);

const mixedProfileCounts = runEvaluateCorpus([
  {
    id: 'count-profile-general-match',
    profile: 'general',
    text: placeholderCountText,
    expectedRules: ['placeholder'],
    expectedCounts: { placeholder: 2 },
  },
  {
    id: 'count-profile-agent-output-excess',
    profile: 'agent-output',
    text: placeholderCountText,
    expectedRules: ['placeholder'],
    expectedCounts: { placeholder: 1 },
  },
  {
    id: 'count-profile-general-set-only',
    profile: 'general',
    text: '担当部署は5月20日までに申込手順を見直す。',
    expectedRules: [],
  },
]);
assert.equal(mixedProfileCounts.status, 1, 'mixed profile count excess should fail evaluation');
const mixedProfileCountsPayload = parseJsonStdout(mixedProfileCounts, 'mixed profile expectedCounts');
assert.deepEqual(
  Object.keys(mixedProfileCountsPayload.countProfiles),
  ['agent-output', 'general'],
  'countProfiles should include only profiles with count-evaluated records',
);
assert.equal(mixedProfileCountsPayload.countProfiles.general.evaluatedRecords, 1, 'general count profile should count only expectedCounts records');
assert.equal(mixedProfileCountsPayload.countProfiles.general.matchedRecords, 1, 'general count profile should keep its matching record separate');
assert.equal(mixedProfileCountsPayload.countProfiles.general.mismatchedRecords, 0, 'general count profile should not inherit agent-output mismatches');
assert.equal(mixedProfileCountsPayload.countProfiles.general.expected, 2, 'general count profile should sum expected counts separately');
assert.equal(mixedProfileCountsPayload.countProfiles.general.predicted, 2, 'general count profile should sum predicted counts separately');
assert.equal(mixedProfileCountsPayload.countProfiles.general.matched, 2, 'general count profile should sum matched counts separately');
assert.equal(mixedProfileCountsPayload.countProfiles.general.excess, 0, 'general count profile should not include agent-output excess');
assert.equal(mixedProfileCountsPayload.countProfiles.general.shortfall, 0, 'general count profile should have no shortfall');
assert.equal(mixedProfileCountsPayload.countProfiles.general.evaluatedRules, 1, 'general count profile should count evaluated rules separately');
assert.equal(mixedProfileCountsPayload.countProfiles.general.matchedRules, 1, 'general count profile should count matched rules separately');
assert.equal(mixedProfileCountsPayload.countProfiles.general.mismatchedRules, 0, 'general count profile should have no mismatched rules');
assert.equal(mixedProfileCountsPayload.countProfiles.general.precision, 1, 'general count profile precision should be independent');
assert.equal(mixedProfileCountsPayload.countProfiles.general.recall, 1, 'general count profile recall should be independent');
assert.equal(mixedProfileCountsPayload.countProfiles.general.f1, 1, 'general count profile f1 should be independent');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].evaluatedRecords, 1, 'agent-output count profile should count its own record');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].matchedRecords, 0, 'agent-output count profile should not inherit general matches');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].mismatchedRecords, 1, 'agent-output count profile should keep its excess record separate');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].expected, 1, 'agent-output count profile should sum expected counts separately');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].predicted, 2, 'agent-output count profile should sum predicted counts separately');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].matched, 1, 'agent-output count profile should sum matched counts separately');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].excess, 1, 'agent-output count profile should expose its own excess');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].shortfall, 0, 'agent-output count profile should have no shortfall');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].evaluatedRules, 1, 'agent-output count profile should count evaluated rules separately');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].matchedRules, 0, 'agent-output count profile should not count an excess as matched');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].mismatchedRules, 1, 'agent-output count profile should count its mismatched rule');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].precision, 0.5, 'agent-output count profile precision should reflect its excess');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].recall, 1, 'agent-output count profile recall should reflect no shortfall');
assert.equal(mixedProfileCountsPayload.countProfiles['agent-output'].f1, 2 / 3, 'agent-output count profile f1 should reflect its excess');
assert.equal(mixedProfileCountsPayload.profiles.general.records, 2, 'set profiles should still count all general records');
assert.equal(mixedProfileCountsPayload.profiles['agent-output'].records, 1, 'set profiles should still count all agent-output records');

const profileCountRecord = {
  id: 'count-profile-switch',
  profile: 'minimal',
  text: '近年、生成AIの利用は急速に広がっている。',
  expectedByProfile: {
    minimal: [],
    general: ['citation-needed'],
  },
  expectedCountsByProfile: {
    minimal: {},
    general: { 'citation-needed': 1 },
  },
};

const minimalProfileCounts = runEvaluateCorpus([profileCountRecord]);
assert.equal(minimalProfileCounts.status, 0, 'minimal expectedCountsByProfile should pass with citation-needed disabled');
const minimalProfileCountsFile = parseJsonStdout(minimalProfileCounts, 'minimal expectedCountsByProfile').files[0];
assert.equal(minimalProfileCountsFile.profile, 'minimal');
assert.equal(minimalProfileCountsFile.expectedSource, 'expectedByProfile.minimal', 'set source should still report expectedByProfile minimal');
assert.equal(minimalProfileCountsFile.expectedCountSource, 'expectedCountsByProfile.minimal', 'count source should report expectedCountsByProfile minimal');
assert.deepEqual(minimalProfileCountsFile.expected, []);
assert.deepEqual(minimalProfileCountsFile.predicted, []);
assert.deepEqual(minimalProfileCountsFile.expectedCounts, {});
assert.deepEqual(minimalProfileCountsFile.predictedCounts, {});
assert.deepEqual(minimalProfileCountsFile.countMatches, []);
assert.deepEqual(minimalProfileCountsFile.countExcesses, []);
assert.deepEqual(minimalProfileCountsFile.countShortfalls, []);

const generalProfileCounts = runEvaluateCorpus([profileCountRecord], ['--profile', 'general']);
assert.equal(generalProfileCounts.status, 0, 'general expectedCountsByProfile should pass with one citation-needed finding');
const generalProfileCountsFile = parseJsonStdout(generalProfileCounts, 'general expectedCountsByProfile').files[0];
assert.equal(generalProfileCountsFile.profile, 'general');
assert.equal(generalProfileCountsFile.expectedSource, 'expectedByProfile.general', 'set source should still report expectedByProfile general');
assert.equal(generalProfileCountsFile.expectedCountSource, 'expectedCountsByProfile.general', 'count source should report expectedCountsByProfile general');
assert.deepEqual(generalProfileCountsFile.expected, ['nihongo-slopless/citation-needed']);
assert.deepEqual(generalProfileCountsFile.predicted, ['nihongo-slopless/citation-needed']);
assert.deepEqual(generalProfileCountsFile.expectedCounts, { 'nihongo-slopless/citation-needed': 1 });
assert.deepEqual(generalProfileCountsFile.predictedCounts, { 'nihongo-slopless/citation-needed': 1 });
assert.deepEqual(generalProfileCountsFile.countMatches, ['nihongo-slopless/citation-needed']);
assert.deepEqual(generalProfileCountsFile.countExcesses, []);
assert.deepEqual(generalProfileCountsFile.countShortfalls, []);

await runExtractorTests();

// -------------------------------------------------------------------------
// test/cases/<rule-name>.cases.mjs を動的に読み込んで rule-bound 検証を行う。
// 既存テストに対する追加レイヤであり、cases ディレクトリが空でも(あるいは未生成
// でも)既存 assertion を壊さないように防御的に書く。
// -------------------------------------------------------------------------
{
  const { readdirSync, existsSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  const { runCaseFile, deriveShortIdFromFilename } = await import('./cases/_loader.mjs');

  const casesDirUrl = new URL('./cases/', import.meta.url);
  const casesDirPath = fileURLToPath(casesDirUrl);

  let totalAsserted = 0;
  let totalSkipped = 0;
  let filesLoaded = 0;

  if (existsSync(casesDirPath)) {
    const entries = readdirSync(casesDirPath, { withFileTypes: true });
    // `_` プレフィックスはローダ内部ファイル / フィクスチャ扱いで自動走査の対象外。
    const caseFiles = entries
      .filter(e => e.isFile() && /\.cases\.mjs$/i.test(e.name) && !e.name.startsWith('_'))
      .map(e => e.name)
      .sort();

    const loaded = await Promise.all(caseFiles.map(async name => {
      const fileUrl = new URL(name, casesDirUrl);
      const mod = await import(fileUrl.href);
      return { name, mod };
    }));

    let filesSeenButNotLoaded = 0;
    for (const { name, mod } of loaded) {
      const defaultShortId = deriveShortIdFromFilename(name);
      const exported = mod.default;
      if (!Array.isArray(exported)) {
        // default が array でないファイル(named export だけ / default が object 等)は
        // スキップ。ケース生成側との形式合わせは別チケットで扱う。
        filesSeenButNotLoaded += 1;
        continue;
      }
      filesLoaded += 1;
      const { asserted, skipped } = runCaseFile({
        filePath: name,
        defaultShortId,
        entries: exported,
      });
      totalAsserted += asserted;
      totalSkipped += skipped;
    }
    if (filesSeenButNotLoaded > 0) {
      console.log(`note - cases loader: ${filesSeenButNotLoaded} file(s) seen but skipped (no array default export)`);
    }
  }

  // Smoke fixture を明示 import してローダ自体の挙動を毎回検証する。
  const smokeUrl = new URL('./cases/_smoke.cases.mjs', import.meta.url);
  if (existsSync(fileURLToPath(smokeUrl))) {
    const smokeMod = await import(smokeUrl.href);
    const smokeEntries = smokeMod.default;
    assert.ok(Array.isArray(smokeEntries), '_smoke.cases.mjs must default-export an array');
    const { asserted, skipped } = runCaseFile({
      filePath: '_smoke.cases.mjs',
      defaultShortId: 'placeholder', // 既定推定の例として placeholder を渡す
      entries: smokeEntries,
    });
    assert.ok(asserted > 0, '_smoke.cases.mjs should assert at least one entry');
    totalAsserted += asserted;
    totalSkipped += skipped;
  }

  console.log(`ok - cases loader: ${filesLoaded} file(s), ${totalAsserted} asserted, ${totalSkipped} skipped`);
}

console.log('ok - nihongo-slopless tests passed');
