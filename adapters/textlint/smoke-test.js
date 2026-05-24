#!/usr/bin/env node
// Local textlint-like smoke harness for environments without textlint installed.

'use strict';

const assert = require('node:assert/strict');
const adapter = require('./index.js');

const Syntax = Object.freeze({
  Document: 'Document',
  Paragraph: 'Paragraph',
  Str: 'Str',
  Code: 'Code',
  CodeBlock: 'CodeBlock',
  Header: 'Header',
  Heading: 'Heading',
  BlockQuote: 'BlockQuote',
  Html: 'Html',
  ListItem: 'ListItem',
});

class RuleError {
  constructor(message, options) {
    this.message = message;
    this.index = options && Number.isInteger(options.index) ? options.index : 0;
  }
}

function createNode(type, start, end, raw, children) {
  const node = {
    type,
    range: [start, end],
    raw,
    children: children || [],
  };
  if (type === Syntax.Str || type === Syntax.Code) node.value = raw;
  return node;
}

function readLine(text, start) {
  let end = start;
  while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end += 1;
  let next = end;
  if (text[next] === '\r' && text[next + 1] === '\n') next += 2;
  else if (text[next] === '\n' || text[next] === '\r') next += 1;
  return {
    line: text.slice(start, end),
    start,
    end,
    next,
  };
}

function parseInline(raw, baseOffset) {
  const children = [];
  const codeRegex = /`([^`]*)`/gu;
  let cursor = 0;
  let match;
  while ((match = codeRegex.exec(raw)) !== null) {
    if (match.index > cursor) {
      children.push(
        createNode(
          Syntax.Str,
          baseOffset + cursor,
          baseOffset + match.index,
          raw.slice(cursor, match.index),
        ),
      );
    }
    children.push(
      createNode(
        Syntax.Code,
        baseOffset + match.index,
        baseOffset + match.index + match[0].length,
        match[1],
      ),
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < raw.length) {
    children.push(createNode(Syntax.Str, baseOffset + cursor, baseOffset + raw.length, raw.slice(cursor)));
  }
  return children;
}

function isBlockBoundary(line) {
  return (
    /^\s*$/u.test(line) ||
    /^#{1,6}\s/u.test(line) ||
    /^```/u.test(line.trim()) ||
    isBlockQuoteLine(line) ||
    isHtmlBlockStart(line)
  );
}

function isBlockQuoteLine(line) {
  return /^\s{0,3}>\s?/u.test(line);
}

function isHtmlBlockStart(line) {
  return /^\s{0,3}<\/?(?:article|aside|blockquote|body|div|footer|form|h[1-6]|head|header|hr|html|main|nav|ol|p|pre|section|table|ul)(?:\s|>|\/>)/iu.test(
    line,
  );
}

function isYamlFrontMatterLine(line) {
  return /^---\s*$/u.test(line);
}

function parseYamlFrontMatter(text, firstLine) {
  const start = firstLine.start;
  let pos = firstLine.next;

  while (pos < text.length) {
    const line = readLine(text, pos);
    pos = line.next;
    if (isYamlFrontMatterLine(line.line)) break;
  }

  return {
    node: createNode(Syntax.Html, start, pos, text.slice(start, pos)),
    next: pos,
  };
}

function parseHtmlBlock(text, firstLine) {
  const start = firstLine.start;
  const tag = firstLine.line.match(/^\s{0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s|>|\/>)/u);
  const closePattern = tag ? new RegExp(`</${tag[1]}>`, 'iu') : null;
  let pos = firstLine.next;

  if (closePattern && closePattern.test(firstLine.line)) {
    return {
      node: createNode(Syntax.Html, start, pos, text.slice(start, pos)),
      next: pos,
    };
  }

  while (pos < text.length) {
    const line = readLine(text, pos);
    pos = line.next;
    if (/^\s*$/u.test(line.line) || (closePattern && closePattern.test(line.line))) break;
  }

  return {
    node: createNode(Syntax.Html, start, pos, text.slice(start, pos)),
    next: pos,
  };
}

function createBlockQuoteChild(line) {
  const match = line.line.match(/^(\s{0,3}>\s?)(.*)$/u);
  const content = match ? match[2] : line.line;
  const contentStart = line.start + (match ? match[1].length : 0);
  if (/^#{1,6}\s/u.test(content)) {
    return createNode(Syntax.Header, contentStart, line.end, content, parseInline(content, contentStart));
  }
  return createNode(Syntax.Paragraph, contentStart, line.end, content, parseInline(content, contentStart));
}

function parseBlockQuote(text, firstLine) {
  const start = firstLine.start;
  let pos = firstLine.start;
  const children = [];

  while (pos < text.length) {
    const line = readLine(text, pos);
    if (!isBlockQuoteLine(line.line)) break;
    children.push(createBlockQuoteChild(line));
    pos = line.next;
  }

  return {
    node: createNode(Syntax.BlockQuote, start, pos, text.slice(start, pos), children),
    next: pos,
  };
}

function parseDocument(text) {
  const root = createNode(Syntax.Document, 0, text.length, text, []);
  let pos = 0;

  while (pos < text.length) {
    const current = readLine(text, pos);
    if (/^\s*$/u.test(current.line)) {
      pos = current.next;
      continue;
    }

    if (current.start === 0 && isYamlFrontMatterLine(current.line)) {
      const parsed = parseYamlFrontMatter(text, current);
      root.children.push(parsed.node);
      pos = parsed.next;
      continue;
    }

    if (/^```/u.test(current.line.trim())) {
      const start = current.start;
      pos = current.next;
      while (pos < text.length) {
        const line = readLine(text, pos);
        pos = line.next;
        if (/^```/u.test(line.line.trim())) break;
      }
      root.children.push(createNode(Syntax.CodeBlock, start, pos, text.slice(start, pos)));
      continue;
    }

    if (/^#{1,6}\s/u.test(current.line)) {
      root.children.push(
        createNode(Syntax.Header, current.start, current.end, current.line, parseInline(current.line, current.start)),
      );
      pos = current.next;
      continue;
    }

    if (isHtmlBlockStart(current.line)) {
      const parsed = parseHtmlBlock(text, current);
      root.children.push(parsed.node);
      pos = parsed.next;
      continue;
    }

    if (isBlockQuoteLine(current.line)) {
      const parsed = parseBlockQuote(text, current);
      root.children.push(parsed.node);
      pos = parsed.next;
      continue;
    }

    const start = current.start;
    let end = current.end;
    pos = current.next;
    while (pos < text.length) {
      const nextLine = readLine(text, pos);
      if (isBlockBoundary(nextLine.line)) break;
      end = nextLine.end;
      pos = nextLine.next;
    }
    const raw = text.slice(start, end);
    root.children.push(createNode(Syntax.Paragraph, start, end, raw, parseInline(raw, start)));
  }

  return root;
}

function visit(node, handlers) {
  const enter = handlers[node.type];
  if (typeof enter === 'function') enter(node);
  for (const child of node.children || []) visit(child, handlers);
  const exit = handlers[`${node.type}:exit`];
  if (typeof exit === 'function') exit(node);
}

function runRule(ruleName, text, options) {
  const rule = adapter.rules[ruleName];
  assert.equal(typeof rule, 'function', `${ruleName} is exported as a rule function`);

  const findings = [];
  const context = {
    Syntax,
    RuleError,
    getSource(node) {
      if (!node) return text;
      if (node && typeof node.raw === 'string') return node.raw;
      if (node && Array.isArray(node.range)) return text.slice(node.range[0], node.range[1]);
      return '';
    },
    report(node, error) {
      const base = node && Array.isArray(node.range) ? node.range[0] : 0;
      findings.push({
        ruleId: adapter.fullRuleIds[ruleName],
        message: error.message,
        index: base + error.index,
      });
    },
  };

  visit(parseDocument(text), rule(context, options || {}));
  return findings;
}

function testPackageEntry() {
  assert.deepEqual(Object.keys(adapter.rules).sort(), [
    'actorless-action',
    'buzzword-density',
    'chat-response-leakage',
    'citation-needed',
    'empty-conclusion',
    'excessive-parentheses',
    'headline-decoration',
    'hidden-unicode-controls',
    'list-intro-padding',
    'long-sentence',
    'placeholder',
    'same-ending',
  ]);
  for (const [name, rule] of Object.entries(adapter.rules)) {
    assert.equal(typeof rule, 'function', `${name} rule should be callable`);
  }
}

function testLongSentence() {
  const sentence = `これは${'長い説明'.repeat(35)}です。`;
  const text = `短い前置きです。\n\n${sentence}`;
  const findings = runRule('long-sentence', text);
  assert.equal(findings.length, 1, 'long-sentence should report one long sentence');
  assert.equal(findings[0].index, text.indexOf('これは'));
}

function testSameEndingOffset() {
  const text = '# 見出し\n\n一つ目です。二つ目です。三つ目です。四つ目です。';
  const findings = runRule('same-ending', text, { consecutive: 4 });
  assert.equal(findings.length, 1, 'same-ending should report one streak');
  assert.equal(findings[0].index, text.indexOf('一つ目です。'));
}

function testSameEndingStructuralRepetitionParity() {
  const positiveCases = [
    [
      '同一段落の通常文末反復',
      '事実を述べるなら根拠が必要です。提案するなら条件が必要です。リスクを扱うなら範囲が必要です。依頼するなら次の行動が必要です。',
    ],
    [
      '通常の箇条書きのます調反復',
      '- 資料を確認します。\n- 結果を共有します。\n- 質問を整理します。\n- 次回に説明します。',
    ],
    [
      'コード参照だけではない通常リスト反復',
      '- `alpha` を確認します。\n- 会議で結果を共有します。\n- 質問を整理します。\n- 次回に説明します。',
    ],
  ];

  const negativeCases = [
    [
      '更新履歴のコード参照つき反復',
      [
        '2026-05-20 の改善:',
        '',
        '- `absolute-claim` を引用ブロックで抑制した。',
        '- `thin-sentence` を主体宣言で抑制した。',
        '- `placeholder` の判定を構造的条件へ置き換えた。',
        '- `repeated-connectors` を節境界でカウントカットした。',
      ].join('\n'),
    ],
    [
      '望ましい表現の例示リスト',
      [
        '望ましい表現:',
        '',
        '- 抽象的な締めになっています。対象を補うと読み手に残りやすくなります。',
        '- 強い一般化に見えます。条件を補うと誤読を防げます。',
        '- 丁寧な表現が重なっています。誰が何をするのかを補うと明確になります。',
        '- 前置きが残っている可能性があります。公開文書では削除を検討してください。',
      ].join('\n'),
    ],
    [
      '仕様説明のインラインコード反復',
      '`ignore` は `disable-next-line` と同じく、コメント直後の物理行だけを対象にします。直後が空行なら空行だけ、EOFなら何も無視しません。複数行にまたがる指摘は、指摘の `finding.index` が無視範囲に入る場合だけ抑制され得ます。コードフェンス内の無視コメントは、本文への無視指定としては扱いません。',
    ],
    [
      '仕様ラベルが反復する箇条書き',
      [
        '- `id`: 安定した資料IDを保存します。',
        '- `profile`: 既定評価profileを保存します。',
        '- `genre`: 文書ジャンルを保存します。',
        '- `notes`: 注意事項を保存します。',
      ].join('\n'),
    ],
  ];

  for (const [name, text] of positiveCases) {
    assert.equal(
      runRule('same-ending', text, { consecutive: 4 }).length,
      1,
      `same-ending should keep positive F1 case: ${name}`,
    );
  }

  for (const [name, text] of negativeCases) {
    assert.deepEqual(
      runRule('same-ending', text, { consecutive: 4 }),
      [],
      `same-ending should suppress structural repetition F1 case: ${name}`,
    );
  }
}

function testChatResponseLeakageIgnoresInlineCode() {
  const text = '本文です。\n\n承知しました。次に進めます。\n\n`承知しました` という文字列を例示します。';
  const findings = runRule('chat-response-leakage', text);
  assert.equal(findings.length, 1, 'chat-response-leakage should ignore inline code content');
  assert.equal(findings[0].index, text.indexOf('承知しました。次に'));
}

function testPlaceholderIgnoresCodeAndTaskCheckbox() {
  const text = [
    'TODO: 連絡先を未記入のままにしない。',
    '',
    'ここに具体例を書く。',
    '',
    'ここにあります。',
    '',
    '`TODO` という文字列を例示します。',
    '',
    '- [ ] globstar修正',
    '',
    '```js',
    'const marker = "TODO";',
    '```',
    '',
    '仮置きの値です。',
  ].join('\n');
  const findings = runRule('placeholder', text);
  assert.equal(findings.length, 3, 'placeholder should report prose placeholders only');
  assert.equal(findings[0].index, text.indexOf('TODO: 連絡先'));
  assert.equal(findings[1].index, text.indexOf('ここに具体例'));
  assert.equal(findings[2].index, text.indexOf('仮置き'));
}

function testHiddenUnicodeControlsScansRawDocument() {
  const text = [
    '# 見出し\u2060',
    '',
    '資料\u200Bを確認します。',
    '',
    '`資料\u200C` という文字列を例示します。',
    '',
    '```js',
    'const marker = "資料\u202E";',
    '```',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    '| A | 資料\uFEFF |',
    '',
    '> 引用\u2066を確認します。',
    '',
    '通常の本文です。',
  ].join('\n');
  const findings = runRule('hidden-unicode-controls', text);
  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index]),
    [
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u2060')],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u200B')],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u200C')],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u202E')],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\uFEFF')],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u2066')],
    ],
    'hidden-unicode-controls should scan the raw document once, including inline code, code blocks, tables, and blockquotes',
  );
}

function testExcessiveParenthesesBoundary() {
  const positive = [
    '本文（前提を別に置く）では、手順（例外も含む）を説明し、担当（未確定の範囲）と期限（再調整の可能性）と影響（利用者への説明）を一文に入れます。',
  ].join('\n');
  const positiveFindings = runRule('excessive-parentheses', positive);
  assert.equal(positiveFindings.length, 1, 'excessive-parentheses should report five effective pairs');
  assert.equal(positiveFindings[0].index, 0);
  assert.match(
    positiveFindings[0].message,
    /実質補足が5組（総5組）/u,
    'excessive-parentheses should keep standalone reason wording',
  );

  const negative = [
    '本文（前提を別に置く）では、手順（例外も含む）を説明し、担当（未確定の範囲）と期限（再調整の可能性）を一文に入れます。',
  ].join('\n');
  const negativeFindings = runRule('excessive-parentheses', negative);
  assert.deepEqual(negativeFindings, [], 'excessive-parentheses should not report four effective pairs');
}

function testHeadlineDecorationHeadingOnly() {
  const text = [
    '## ★★ 重要なお知らせ',
    '',
    '## ★ 通常の強調',
    '',
    '本文の★★は見出しではありません。',
    '',
    '```md',
    '## ◆◆ コード内の例',
    '```',
    '',
    '### ◆◆ 更新情報',
  ].join('\n');
  const findings = runRule('headline-decoration', text);
  assert.equal(findings.length, 2, 'headline-decoration should report decorated headings only');
  assert.equal(findings[0].index, text.indexOf('## ★★'));
  assert.equal(findings[1].index, text.indexOf('### ◆◆'));
  assert.match(
    findings[0].message,
    /本文情報より目立つ可能性があります/u,
    'headline-decoration should keep standalone wording',
  );
}

function testEmptyConclusionBoundary() {
  const positive = [
    '本稿では校務文書の点検手順を整理しました。',
    '',
    '最後に、この取り組みは今後の課題であるとまとめています。',
  ].join('\n');
  const positiveFindings = runRule('empty-conclusion', positive);
  assert.equal(positiveFindings.length, 1, 'empty-conclusion should report a configured abstract closing phrase');
  assert.equal(positiveFindings[0].index, positive.indexOf('今後の課題である'));
  assert.match(
    positiveFindings[0].message,
    /成果、対象、条件、次の確認事項を補えるか確認してください/u,
    'empty-conclusion should keep standalone wording',
  );

  const negative = [
    '本稿では校務文書の点検手順を整理しました。',
    '',
    '次回は対象校、確認期間、判断基準を分けて検証します。',
  ].join('\n');
  const negativeFindings = runRule('empty-conclusion', negative);
  assert.deepEqual(negativeFindings, [], 'empty-conclusion should not report a concrete next-step sentence');
}

function testCitationNeededBoundary() {
  // P6 Agent I 9 ルール目移植テスト。
  // standalone 同等の主要境界を確認。Paragraph 範囲内で sentence 単位検出、
  // Paragraph 内に出典記法または出典名があれば抑制。
  const positive = '近年、生成AIの利用が急速に拡大している。';
  const positiveFindings = runRule('citation-needed', positive);
  assert.equal(positiveFindings.length, 1, 'citation-needed should report a claim without citation');
  assert.equal(positiveFindings[0].index, positive.indexOf('近年'));
  assert.match(
    positiveFindings[0].message,
    /根拠が必要そうな主張です/u,
    'citation-needed should keep standalone wording',
  );

  // 同一文に URL があれば抑制
  const withUrl = '近年、生成AIの利用が急速に拡大している（出典: https://example.com/report ）。';
  assert.deepEqual(runRule('citation-needed', withUrl), [], 'citation-needed should suppress when URL is in same sentence');

  // Paragraph 内の別文に URL があれば抑制
  const paraSuppressed = '近年、生成AIの利用が急速に拡大している。詳細は https://example.com/report を参照。';
  assert.deepEqual(runRule('citation-needed', paraSuppressed), [], 'citation-needed should suppress when URL is elsewhere in the same paragraph');

  // Paragraph 内の別文に著者年引用があれば抑制
  const authorYearEvidence = '近年、生成AIの利用が急速に拡大している。この傾向は既存研究（山田 2024）でも扱われている。';
  assert.deepEqual(
    runRule('citation-needed', authorYearEvidence),
    [],
    'citation-needed should suppress when author-year citation is elsewhere in the same paragraph',
  );

  // 年だけの括弧は著者年引用として扱わず、根拠不足の可能性を維持
  const yearOnlyParen = '近年、生成AIの利用が急速に拡大している（2025）。';
  const yearOnlyFindings = runRule('citation-needed', yearOnlyParen);
  assert.equal(yearOnlyFindings.length, 1, 'citation-needed should not suppress a bare year parenthesis');

  // Paragraph 内の別文に数値データ証拠があれば抑制
  const numericEvidence = '近年、生成AIの利用が急速に拡大している。調査では回答者300人を対象にした。';
  assert.deepEqual(
    runRule('citation-needed', numericEvidence),
    [],
    'citation-needed should suppress when numeric evidence is elsewhere in the same paragraph',
  );

  // 出典名 (報じられている) があれば抑制
  const withSourceName = '生成AIの利用は近年急速に拡大しているとロイターによって報じられている。';
  assert.deepEqual(runRule('citation-needed', withSourceName), [], 'citation-needed should suppress when a source name is present');

  // narrow research bridge は standalone と同じ狭い条件だけ抑制
  const narrowResearchBridge = '研究でも、自動応答に混ざった案内文は「見落とされやすい」という結果が報告されている。';
  assert.deepEqual(
    runRule('citation-needed', narrowResearchBridge),
    [],
    'citation-needed should suppress narrow research bridge phrasing',
  );

  const broadResearchClaim = '研究でも、効果が報告されている。';
  assert.equal(
    runRule('citation-needed', broadResearchClaim).length,
    1,
    'citation-needed should not suppress broad research claims without result/tendency bridge wording',
  );

  // 技術状態用法 (現在のバージョン) は時事主張ではない → 抑制
  const techState = '現在のバージョンでは、この機能は利用できません。';
  assert.deepEqual(runRule('citation-needed', techState), [], 'citation-needed should suppress 現在のバージョン as technical-state usage');
}

function testActorlessActionBoundary() {
  // P7 Agent N3 10 ルール目移植テスト。
  // standalone と同じ主要境界を確認。Paragraph 範囲内で sentence 単位検出し、
  // 主体と期限が同じ文にあれば抑制、外部資料の方向性紹介も抑制する。
  const positive = '今後、申請手順の見直しを進める。';
  const positiveFindings = runRule('actorless-action', positive);
  assert.equal(positiveFindings.length, 1, 'actorless-action should report an action without owner/deadline');
  assert.equal(positiveFindings[0].index, positive.indexOf('見直しを進める'));
  assert.match(
    positiveFindings[0].message,
    /行動の主体や期限が見えにくい対応表現です/u,
    'actorless-action should keep standalone wording',
  );

  const withOwnerAndDeadline = '担当部署は5月20日までに申込手順を見直すこととする。';
  assert.deepEqual(
    runRule('actorless-action', withOwnerAndDeadline),
    [],
    'actorless-action should suppress when owner and deadline are visible',
  );

  const reportedDirection = '他資料にも、申請手順の見直しを進める、という方向性が書かれている。';
  assert.deepEqual(
    runRule('actorless-action', reportedDirection),
    [],
    'actorless-action should suppress reported direction introductions',
  );

  const mixed = '同じ資料では、申請手順の見直しを進める、という方向性も書かれているが、問い合わせへの対応を行う。';
  const mixedFindings = runRule('actorless-action', mixed);
  assert.equal(mixedFindings.length, 1, 'actorless-action should keep a separate unsourced action in the same sentence');
  assert.equal(mixedFindings[0].index, mixed.indexOf('対応を行う'));
}

function testBuzzwordDensityBoundary() {
  // P8 Agent F3 11 ルール目移植テスト。
  // Paragraph-local に固定語彙の件数だけを見る。CodeBlock / BlockQuote 配下は対象外。
  const positive = 'DXと生成AIとイノベーションを通じて、個別最適な学びと探究と社会実装を推進する。';
  const positiveFindings = runRule('buzzword-density', positive);
  assert.equal(positiveFindings.length, 1, 'buzzword-density should report a paragraph over the default threshold');
  assert.equal(positiveFindings[0].index, 0);
  assert.match(
    positiveFindings[0].message,
    /バズワードが密集しています（段落内6件）/u,
    'buzzword-density should keep standalone wording and count',
  );

  const negative = 'DXと生成AIとイノベーションを使い、参加者の提出物を評価する。';
  assert.deepEqual(
    runRule('buzzword-density', negative),
    [],
    'buzzword-density should not report a paragraph at or below the default threshold',
  );

  const boundary = [
    '```md',
    'DXと生成AIとイノベーションと個別最適と探究と社会実装を推進する。',
    '```',
    '',
    '> DXと生成AIとイノベーションと個別最適と探究と社会実装を推進する。',
  ].join('\n');
  assert.deepEqual(
    runRule('buzzword-density', boundary),
    [],
    'buzzword-density should ignore code blocks and blockquotes',
  );
}

function testListIntroPaddingBoundary() {
  const text = [
    '以下では、確認手順を整理します。',
    '',
    '具体的には、担当者、期限、対象文書を分けます。',
    '',
    '`以下では` という文字列を例示します。',
    '',
    '```md',
    '以下では、コード内の例を示します。',
    '```',
    '',
    '> 以下では、引用内の表現を示します。',
  ].join('\n');
  const findings = runRule('list-intro-padding', text);
  assert.equal(findings.length, 1, 'list-intro-padding should report prose intro phrases only');
  assert.equal(findings[0].index, text.indexOf('以下では'));
  assert.match(
    findings[0].message,
    /前置きとして機能が薄い可能性があります/u,
    'list-intro-padding should keep standalone wording',
  );

  const custom = '冒頭で、確認手順を整理します。';
  const customFindings = runRule('list-intro-padding', custom, { phrases: ['冒頭で'] });
  assert.equal(customFindings.length, 1, 'list-intro-padding should accept custom phrase options');
  assert.equal(customFindings[0].index, 0);
}

// ---------------- 2026-05-20 P6 Agent G / 2026-05-21 P7 Agent G2 境界テスト ----------------
// 本物 textlint@15.7.1 と local harness の既知差分を、local parser の最小補強で狭める。
// adapter rule 本体は触らず、local AST boundary の改善だけを assertion として固定する。

function testHeadlineDecorationBlockquoteHeadingBoundary() {
  // 観察(P4 Agent C):
  //   `> ## ★★ 重要なお知らせ` を、本物 textlint(@textlint/markdown-to-ast)は
  //   BlockQuote 配下の Header として認識し、`headline-decoration` が 1 件発火する。
  // P7-G2:
  //   local harness も `> ` を剥がした内容を Header 子ノードとして visit する。
  const text = [
    '> ## ★★ 重要なお知らせ',
    '',
    '通常の本文です。',
  ].join('\n');
  const findings = runRule('headline-decoration', text);
  assert.equal(
    findings.length,
    1,
    'local harness should recognize blockquote-internal decorated Heading like real textlint',
  );
  assert.equal(findings[0].index, text.indexOf('## ★★'));
}

function testExcessiveParenthesesYamlHtmlBoundary() {
  // 観察(P4 Agent C):
  //   YAML front-matter(`---` 囲み)と raw HTML ブロックは、本物 textlint
  //   (@textlint/markdown-to-ast)では HtmlBlock / YamlFrontMatter として
  //   prose visit から外れるため括弧計上は 0。
  // P7-G2:
  //   local harness も YAML / HTML block を子なし non-prose node として扱う。
  const text = [
    '---',
    'title: テスト記事(仮)',
    'note: 担当（未確定）と期限（再調整）と対象（読者）と影響（範囲）',
    '---',
    '',
    '<div data-note="保留（再調整の可能性）">本文（前置き）と注意点（例外も含む）を示し、対象（読者）と期限（再確認の必要性）を一文に入れます。</div>',
  ].join('\n');
  const findings = runRule('excessive-parentheses', text);
  assert.equal(
    findings.length,
    0,
    'local harness should ignore YAML front matter and raw HTML block parens like real textlint',
  );
}

const tests = [
  ['package-entry', testPackageEntry],
  ['long-sentence', testLongSentence],
  ['same-ending-offset', testSameEndingOffset],
  ['same-ending-structural-repetition-parity', testSameEndingStructuralRepetitionParity],
  ['chat-response-leakage-inline-code', testChatResponseLeakageIgnoresInlineCode],
  ['placeholder-code-boundary', testPlaceholderIgnoresCodeAndTaskCheckbox],
  ['hidden-unicode-controls-raw-document', testHiddenUnicodeControlsScansRawDocument],
  ['excessive-parentheses-boundary', testExcessiveParenthesesBoundary],
  ['headline-decoration-heading-only', testHeadlineDecorationHeadingOnly],
  ['empty-conclusion-boundary', testEmptyConclusionBoundary],
  ['citation-needed-boundary', testCitationNeededBoundary],
  ['actorless-action-boundary', testActorlessActionBoundary],
  ['buzzword-density-boundary', testBuzzwordDensityBoundary],
  ['list-intro-padding-boundary', testListIntroPaddingBoundary],
  ['headline-decoration-blockquote-heading-boundary', testHeadlineDecorationBlockquoteHeadingBoundary],
  ['excessive-parentheses-yaml-html-boundary', testExcessiveParenthesesYamlHtmlBoundary],
];

for (const [, test] of tests) test();

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: 'local-textlint-like-harness',
      tests: tests.map(([name]) => name),
    },
    null,
    2,
  ),
);
