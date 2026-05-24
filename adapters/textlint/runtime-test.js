#!/usr/bin/env node
// Local textlint-kernel-like harness with a nested Markdown AST.

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
  List: 'List',
  ListItem: 'ListItem',
  BlockQuote: 'BlockQuote',
  HorizontalRule: 'HorizontalRule',
  Table: 'Table',
  TableRow: 'TableRow',
  TableCell: 'TableCell',
  Html: 'Html',
});

class RuleError {
  constructor(message, options) {
    this.message = message;
    this.index = options && Number.isInteger(options.index) ? options.index : 0;
  }
}

function createNode(type, start, end, raw, children, extra) {
  const node = Object.assign(
    {
      type,
      range: [start, end],
      raw,
      children: children || [],
    },
    extra || {},
  );
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

function peekLine(text, start) {
  return start < text.length ? readLine(text, start) : null;
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

function createParagraph(start, end, raw) {
  return createNode(Syntax.Paragraph, start, end, raw, parseInline(raw, start));
}

function isBlank(line) {
  return /^\s*$/u.test(line);
}

function isHeading(line) {
  return /^\s{0,3}#{1,6}\s+\S/u.test(line);
}

function isListLine(line) {
  return /^\s{0,3}(?:[-+*]|\d+[.)])\s+\S/u.test(line);
}

function isBlockQuoteLine(line) {
  return /^\s{0,3}>\s?/u.test(line);
}

function isThematicBreak(line) {
  return /^\s{0,3}(?:[-*_]\s*){3,}$/u.test(line);
}

function isYamlFrontMatterLine(line) {
  return /^---\s*$/u.test(line);
}

function isHtmlBlockStart(line) {
  return /^\s{0,3}<\/?(?:article|aside|blockquote|body|div|footer|form|h[1-6]|head|header|hr|html|main|nav|ol|p|pre|section|table|ul)(?:\s|>|\/>)/iu.test(
    line,
  );
}

function isPipeLine(line) {
  return /\|/u.test(line) && !isBlank(line);
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}

function startsTable(text, line) {
  if (!isPipeLine(line.line)) return false;
  const nextLine = peekLine(text, line.next);
  return Boolean(nextLine && isTableSeparator(nextLine.line));
}

function fenceMarker(line) {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
  if (!match) return null;
  return { char: match[1][0], length: match[1].length };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isClosingFence(line, marker) {
  const fence = escapeRegExp(marker.char);
  return new RegExp(`^\\s{0,3}${fence}{${marker.length},}\\s*$`, 'u').test(line);
}

function createListItem(line) {
  const match = line.line.match(/^(\s{0,3}(?:[-+*]|\d+[.)])\s+)(.*)$/u);
  const prefix = match ? match[1] : '';
  const content = match ? match[2] : line.line;
  const contentStart = line.start + prefix.length;
  const paragraph = createParagraph(contentStart, line.end, content);
  return createNode(Syntax.ListItem, line.start, line.end, line.line, [paragraph]);
}

function parseList(text, firstLine) {
  const start = firstLine.start;
  let pos = firstLine.start;
  const children = [];

  while (pos < text.length) {
    const line = readLine(text, pos);
    if (!isListLine(line.line)) break;
    children.push(createListItem(line));
    pos = line.next;
  }

  return {
    node: createNode(Syntax.List, start, pos, text.slice(start, pos), children),
    next: pos,
  };
}

function parseFencedCode(text, firstLine, marker) {
  const start = firstLine.start;
  let pos = firstLine.next;

  while (pos < text.length) {
    const line = readLine(text, pos);
    pos = line.next;
    if (isClosingFence(line.line, marker)) break;
  }

  return {
    node: createNode(Syntax.CodeBlock, start, pos, text.slice(start, pos)),
    next: pos,
  };
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
    if (isBlank(line.line) || (closePattern && closePattern.test(line.line))) break;
  }

  return {
    node: createNode(Syntax.Html, start, pos, text.slice(start, pos)),
    next: pos,
  };
}

function parseBlockQuote(text, firstLine) {
  const start = firstLine.start;
  let pos = firstLine.start;
  const children = [];

  while (pos < text.length) {
    const line = readLine(text, pos);
    if (!isBlockQuoteLine(line.line)) break;
    const match = line.line.match(/^(\s{0,3}>\s?)(.*)$/u);
    if (match && match[2]) {
      const contentStart = line.start + match[1].length;
      if (isHeading(match[2])) {
        children.push(createNode(Syntax.Header, contentStart, line.end, match[2], parseInline(match[2], contentStart)));
      } else {
        children.push(createParagraph(contentStart, line.end, match[2]));
      }
    }
    pos = line.next;
  }

  return {
    node: createNode(Syntax.BlockQuote, start, pos, text.slice(start, pos), children),
    next: pos,
  };
}

function parseTable(text, firstLine) {
  const start = firstLine.start;
  let pos = firstLine.start;
  const rows = [];

  while (pos < text.length) {
    const line = readLine(text, pos);
    if (!isPipeLine(line.line)) break;
    rows.push(createNode(Syntax.TableRow, line.start, line.end, line.line));
    pos = line.next;
  }

  return {
    node: createNode(Syntax.Table, start, pos, text.slice(start, pos), rows),
    next: pos,
  };
}

function isParagraphBoundary(text, line) {
  if (isBlank(line.line)) return true;
  if (fenceMarker(line.line)) return true;
  if (isHeading(line.line)) return true;
  if (isThematicBreak(line.line)) return true;
  if (isListLine(line.line)) return true;
  if (isBlockQuoteLine(line.line)) return true;
  if (isHtmlBlockStart(line.line)) return true;
  if (startsTable(text, line)) return true;
  return false;
}

function parseParagraph(text, firstLine) {
  const start = firstLine.start;
  let end = firstLine.end;
  let pos = firstLine.next;

  while (pos < text.length) {
    const line = readLine(text, pos);
    if (isParagraphBoundary(text, line)) break;
    end = line.end;
    pos = line.next;
  }

  return {
    node: createParagraph(start, end, text.slice(start, end)),
    next: pos,
  };
}

function parseDocument(text) {
  const root = createNode(Syntax.Document, 0, text.length, text, []);
  let pos = 0;

  while (pos < text.length) {
    const line = readLine(text, pos);

    if (isBlank(line.line)) {
      pos = line.next;
      continue;
    }

    if (pos === 0 && isYamlFrontMatterLine(line.line)) {
      const parsed = parseYamlFrontMatter(text, line);
      root.children.push(parsed.node);
      pos = parsed.next;
      continue;
    }

    const marker = fenceMarker(line.line);
    if (marker) {
      const parsed = parseFencedCode(text, line, marker);
      root.children.push(parsed.node);
      pos = parsed.next;
      continue;
    }

    if (isHeading(line.line)) {
      root.children.push(
        createNode(Syntax.Header, line.start, line.end, line.line, parseInline(line.line, line.start)),
      );
      pos = line.next;
      continue;
    }

    if (isThematicBreak(line.line)) {
      root.children.push(createNode(Syntax.HorizontalRule, line.start, line.end, line.line));
      pos = line.next;
      continue;
    }

    if (isHtmlBlockStart(line.line)) {
      const parsed = parseHtmlBlock(text, line);
      root.children.push(parsed.node);
      pos = parsed.next;
      continue;
    }

    if (startsTable(text, line)) {
      const parsed = parseTable(text, line);
      root.children.push(parsed.node);
      pos = parsed.next;
      continue;
    }

    if (isListLine(line.line)) {
      const parsed = parseList(text, line);
      root.children.push(parsed.node);
      pos = parsed.next;
      continue;
    }

    if (isBlockQuoteLine(line.line)) {
      const parsed = parseBlockQuote(text, line);
      root.children.push(parsed.node);
      pos = parsed.next;
      continue;
    }

    const parsed = parseParagraph(text, line);
    root.children.push(parsed.node);
    pos = parsed.next;
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

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function offsetToLocation(lineStarts, index) {
  let lineIndex = 0;
  for (let i = 0; i < lineStarts.length; i += 1) {
    if (lineStarts[i] > index) break;
    lineIndex = i;
  }
  return {
    line: lineIndex + 1,
    column: index - lineStarts[lineIndex] + 1,
  };
}

function normalizeRuleOptions(ruleName, rulesConfig) {
  const fullRuleId = adapter.fullRuleIds[ruleName];
  const hasShort = Object.prototype.hasOwnProperty.call(rulesConfig, ruleName);
  const hasFull = Object.prototype.hasOwnProperty.call(rulesConfig, fullRuleId);
  if (!hasShort && !hasFull) return null;

  const value = hasShort ? rulesConfig[ruleName] : rulesConfig[fullRuleId];
  if (value === false || value === 'off') return null;
  if (value === true || value === undefined) return {};

  if (Array.isArray(value)) {
    const severity = value[0];
    if (severity === false || severity === 'off') return null;
    return value[1] && typeof value[1] === 'object' ? value[1] : {};
  }

  if (value && typeof value === 'object') return value;
  return {};
}

function runTextlintLike(text, options) {
  return runTextlintLikeAst(text, parseDocument(text), options);
}

function runTextlintLikeAst(text, ast, options) {
  const lineStarts = buildLineStarts(text);
  const rulesConfig = Object.assign({}, adapter.rulesConfig, (options && options.rulesConfig) || {});
  const findings = [];

  for (const [ruleName, rule] of Object.entries(adapter.rules)) {
    const ruleOptions = normalizeRuleOptions(ruleName, rulesConfig);
    if (ruleOptions === null) continue;

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
        const index = base + error.index;
        findings.push({
          ruleId: adapter.fullRuleIds[ruleName],
          message: error.message,
          index,
          nodeType: node && node.type,
          ...offsetToLocation(lineStarts, index),
        });
      },
    };

    visit(ast, rule(context, ruleOptions));
  }

  return findings.sort((a, b) => a.index - b.index || a.ruleId.localeCompare(b.ruleId));
}

function byRule(findings, shortRuleId) {
  return findings.filter(finding => finding.ruleId === `nihongo-slopless/${shortRuleId}`);
}

function testPresetRunsAllRulesAgainstNestedAst() {
  const longSentence =
    `この段落では、${'確認事項、提出期限、相談窓口、再提出条件、'.repeat(4)}` +
    '担当者への連絡順序を一文のまま説明しており、読み手が途中で迷いやすい状態です。';
  const text = [
    '承知しました。次に進めます。',
    '',
    longSentence,
    '',
    '- `資料`を確認します。',
    '- 結果を共有します。',
    '- 質問を整理します。',
    '- 次回に説明します。',
    '',
    '`承知しました` という文字列を例示します。',
  ].join('\n');

  const findings = runTextlintLike(text);
  const chatFindings = byRule(findings, 'chat-response-leakage');
  const longFindings = byRule(findings, 'long-sentence');
  const sameEndingFindings = byRule(findings, 'same-ending');

  assert.equal(chatFindings.length, 1, 'preset runtime should report one chat-response-leakage finding');
  assert.equal(chatFindings[0].line, 1, 'chat-response-leakage should keep line location');
  assert.equal(chatFindings[0].index, text.indexOf('承知しました。次に'));

  assert.equal(longFindings.length, 1, 'preset runtime should report one long-sentence finding');
  assert.equal(longFindings[0].line, 3, 'long-sentence should keep paragraph location');

  assert.equal(sameEndingFindings.length, 1, 'nested list paragraphs should create one same-ending finding');
  assert.match(
    sameEndingFindings[0].message,
    /4文連続/u,
    'nested ListItem -> Paragraph traversal should not double-count list item text',
  );
  assert.equal(sameEndingFindings[0].index, text.indexOf('`資料`を確認します。'));
}

function testBlankAndBlockBoundariesResetSameEnding() {
  const text = [
    '資料を確認します。結果を共有します。',
    '',
    '質問を整理します。次回に説明します。',
    '',
    '## 当日の流れ',
    '',
    '会場を確認します。資料を配布します。',
    '```js',
    'const sample = "質問を整理します。次回に説明します。";',
    '```',
    '記録を保存します。担当者へ連絡します。',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    '| A | B |',
    '予定を確認します。次回に説明します。',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'chat-response-leakage': false,
      'same-ending': { consecutive: 4 },
    },
  });

  assert.deepEqual(
    findings,
    [],
    'same-ending should not bridge blank lines, headings, code blocks, or tables',
  );
}

function testSameEndingStructuralRepetitionParity() {
  const sameEndingOnlyConfig = {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': { consecutive: 4 },
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': false,
      'empty-conclusion': false,
      'citation-needed': false,
      'actorless-action': false,
      'buzzword-density': false,
    },
  };
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
      byRule(runTextlintLike(text, sameEndingOnlyConfig), 'same-ending').length,
      1,
      `same-ending should keep positive F1 case: ${name}`,
    );
  }

  for (const [name, text] of negativeCases) {
    assert.deepEqual(
      byRule(runTextlintLike(text, sameEndingOnlyConfig), 'same-ending'),
      [],
      `same-ending should suppress structural repetition F1 case: ${name}`,
    );
  }
}

function testFullRuleIdConfigAndDisabledRule() {
  const text = '承知しました。資料を確認します。結果を共有します。質問を整理します。次回に説明します。';
  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'nihongo-slopless/chat-response-leakage': ['warning', { phrases: ['承知しました'] }],
    },
  });

  assert.deepEqual(
    findings.map(finding => finding.ruleId),
    ['nihongo-slopless/chat-response-leakage'],
    'runtime harness should accept full textlint rule IDs and disabled rules',
  );
}

function testPlaceholderRuntimeBoundaries() {
  const text = [
    'TODO: 担当者は未記入です。',
    '',
    'ここに具体例を書く。',
    '',
    'ここにあります。',
    '',
    '`TODO` という文字列を例示します。',
    '',
    '- [ ] globstar修正',
    '',
    '[ ](/docs/reference/) は空のリンクラベルです。',
    '',
    '```js',
    'const marker = "仮置き";',
    '```',
    '',
    '値は仮置きです。',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: true,
    },
  });

  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index]),
    [
      ['nihongo-slopless/placeholder', text.indexOf('TODO: 担当者')],
      ['nihongo-slopless/placeholder', text.indexOf('ここに具体例')],
      ['nihongo-slopless/placeholder', text.indexOf('仮置きです。')],
    ],
    'placeholder should report prose placeholders while ignoring inline code, code blocks, task checkboxes, and link labels',
  );
}

function testHiddenUnicodeControlsRuntimeBoundaries() {
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

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': true,
      'headline-decoration': false,
      'excessive-parentheses': false,
      'empty-conclusion': false,
      'citation-needed': false,
      'actorless-action': false,
      'buzzword-density': false,
    },
  });

  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index, finding.nodeType]),
    [
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u2060'), 'Document'],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u200B'), 'Document'],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u200C'), 'Document'],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u202E'), 'Document'],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\uFEFF'), 'Document'],
      ['nihongo-slopless/hidden-unicode-controls', text.indexOf('\u2066'), 'Document'],
    ],
    'hidden-unicode-controls should scan the raw document once, including inline code, code blocks, tables, and blockquotes',
  );
}

function testHeadlineDecorationRuntimeBoundaries() {
  const text = [
    '## ★★ 重要なお知らせ',
    '',
    '### ★ 通常の強調',
    '',
    '本文の★★は見出しではありません。',
    '',
    '```md',
    '## ◆◆ コード内の例',
    '```',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    '| ## ●● 表内の例 | A |',
    '',
    '### ◆◆ 更新情報',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': true,
    },
  });

  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index, finding.nodeType]),
    [
      ['nihongo-slopless/headline-decoration', text.indexOf('## ★★'), 'Header'],
      ['nihongo-slopless/headline-decoration', text.indexOf('### ◆◆'), 'Header'],
    ],
    'headline-decoration should report Heading/Header nodes while ignoring body, code, and table text',
  );
  assert.match(
    findings[0].message,
    /媒体の目的、読者、情報構造に合うか確認してください/u,
    'headline-decoration should keep standalone message',
  );
}

function testExcessiveParenthesesRuntimeBoundaries() {
  const text = [
    '```md',
    '本文（前提を別に置く）では、手順（例外も含む）と担当（未確定の範囲）と期限（再調整の可能性）と影響（利用者への説明）を並べます。',
    '```',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    '| 本文（前提を別に置く） | 手順（例外も含む） |',
    '| 担当（未確定の範囲） | 期限（再調整の可能性）と影響（利用者への説明） |',
    '',
    '> 本文（前提を別に置く）では、手順（例外も含む）と担当（未確定の範囲）と期限（再調整の可能性）と影響（利用者への説明）を並べます。',
    '',
    '本文（前提を別に置く）では、手順（例外も含む）と担当（未確定の範囲）と期限（再調整の可能性）と影響（利用者への説明）を並べます。',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': true,
    },
  });

  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index, finding.nodeType]),
    [
      [
        'nihongo-slopless/excessive-parentheses',
        text.lastIndexOf('本文（前提を別に置く）'),
        'Paragraph',
      ],
    ],
    'excessive-parentheses should report Paragraph prose while ignoring code blocks, tables, and blockquotes',
  );
  assert.match(
    findings[0].message,
    /実質補足が5組（総5組）/u,
    'excessive-parentheses should keep standalone message and reason',
  );
}

function testEmptyConclusionRuntimeBoundaries() {
  const text = [
    '```md',
    '最後に、この取り組みは今後の課題であるとまとめています。',
    '```',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    '| 結論 | 今後の課題である |',
    '',
    '> 最後に、この取り組みは今後の課題であるとまとめています。',
    '',
    '最後に、この取り組みは今後の課題であるとまとめています。',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': false,
      'empty-conclusion': true,
    },
  });

  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index, finding.nodeType]),
    [
      [
        'nihongo-slopless/empty-conclusion',
        text.lastIndexOf('今後の課題である'),
        'Paragraph',
      ],
    ],
    'empty-conclusion should report Paragraph prose while ignoring code blocks, tables, and blockquotes',
  );
  assert.match(
    findings[0].message,
    /締めの内容が抽象的です/u,
    'empty-conclusion should keep standalone message',
  );
}

function testCitationNeededRuntimeBoundaries() {
  // P6 Agent I 9 ルール目移植テスト(runtime)。
  // BlockQuote / CodeBlock / Table 配下は抑制、Paragraph 単位で sentence 分割して
  // 主張パターンを検出し、Paragraph 内に出典/出典名があれば抑制。
  const text = [
    '```md',
    '近年、生成AIの利用が急速に拡大している。',
    '```',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    '| 観察 | 近年、生成AIの利用が拡大している |',
    '',
    '> 近年、生成AIの利用が急速に拡大している。',
    '',
    '近年、生成AIの利用が急速に拡大している。',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': false,
      'empty-conclusion': false,
      'citation-needed': true,
    },
  });

  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index, finding.nodeType]),
    [
      [
        'nihongo-slopless/citation-needed',
        text.lastIndexOf('近年、生成AI'),
        'Paragraph',
      ],
    ],
    'citation-needed should report Paragraph prose while ignoring code blocks, tables, and blockquotes',
  );
  assert.match(
    findings[0].message,
    /根拠が必要そうな主張です/u,
    'citation-needed should keep standalone wording',
  );

  const citationOnlyConfig = {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': false,
      'empty-conclusion': false,
      'citation-needed': true,
    },
  };

  const authorYearEvidence = '近年、生成AIの利用が急速に拡大している。この傾向は既存研究（山田 2024）でも扱われている。';
  assert.deepEqual(
    byRule(runTextlintLike(authorYearEvidence, citationOnlyConfig), 'citation-needed'),
    [],
    'citation-needed should suppress author-year citation evidence in the same paragraph',
  );

  const yearOnlyParen = '近年、生成AIの利用が急速に拡大している（2025）。';
  assert.equal(
    byRule(runTextlintLike(yearOnlyParen, citationOnlyConfig), 'citation-needed').length,
    1,
    'citation-needed should not suppress a bare year parenthesis',
  );

  const numericEvidence = '近年、生成AIの利用が急速に拡大している。調査では回答者300人を対象にした。';
  assert.deepEqual(
    byRule(runTextlintLike(numericEvidence, citationOnlyConfig), 'citation-needed'),
    [],
    'citation-needed should suppress numeric evidence in the same paragraph',
  );

  const narrowResearchBridge = '研究でも、LLM応答に埋め込まれた広告は「見抜かれにくい」という結果が報告されている。';
  assert.deepEqual(
    byRule(runTextlintLike(narrowResearchBridge, citationOnlyConfig), 'citation-needed'),
    [],
    'citation-needed should suppress narrow research bridge phrasing',
  );

  const broadResearchClaim = '研究でも、効果が報告されている。';
  assert.equal(
    byRule(runTextlintLike(broadResearchClaim, citationOnlyConfig), 'citation-needed').length,
    1,
    'citation-needed should not suppress broad research claims without result/tendency bridge wording',
  );
}

function testCitationNeededListItemSiblingParagraphEvidence() {
  const citationOnlyConfig = {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': false,
      'empty-conclusion': false,
      'citation-needed': true,
      'actorless-action': false,
      'buzzword-density': false,
    },
  };

  function runListItemParagraphs(text, paragraphTexts) {
    const paragraphs = paragraphTexts.map((paragraphText) => {
      const start = text.indexOf(paragraphText);
      assert.notEqual(start, -1, `${paragraphText} should exist in fixture text`);
      return createParagraph(start, start + paragraphText.length, paragraphText);
    });
    const listItem = createNode(Syntax.ListItem, 0, text.length, text, paragraphs);
    const list = createNode(Syntax.List, 0, text.length, text, [listItem]);
    const ast = createNode(Syntax.Document, 0, text.length, text, [list]);
    return byRule(runTextlintLikeAst(text, ast, citationOnlyConfig), 'citation-needed');
  }

  const positive = [
    '- 近年、生成AIの利用が急速に拡大している。',
    '',
    '  補足説明を後段に置く。',
  ].join('\n');
  const positiveFindings = runListItemParagraphs(positive, [
    '近年、生成AIの利用が急速に拡大している。',
    '補足説明を後段に置く。',
  ]);
  assert.equal(
    positiveFindings.length,
    1,
    'citation-needed should still report a ListItem claim when sibling Paragraph has no evidence',
  );
  assert.equal(positiveFindings[0].index, positive.indexOf('近年'));

  const siblingUrlEvidence = [
    '- 近年、生成AIの利用が急速に拡大している。',
    '',
    '  詳細は https://example.com/report を参照。',
  ].join('\n');
  assert.deepEqual(
    runListItemParagraphs(siblingUrlEvidence, [
      '近年、生成AIの利用が急速に拡大している。',
      '詳細は https://example.com/report を参照。',
    ]),
    [],
    'citation-needed should suppress a ListItem claim when a sibling Paragraph has strong evidence',
  );

  const siblingSourceNameOnly = [
    '- 近年、生成AIの利用が急速に拡大している。',
    '',
    '  ロイターが報じている。',
  ].join('\n');
  const boundaryFindings = runListItemParagraphs(siblingSourceNameOnly, [
    '近年、生成AIの利用が急速に拡大している。',
    'ロイターが報じている。',
  ]);
  assert.equal(
    boundaryFindings.length,
    1,
    'citation-needed should not suppress ListItem sibling Paragraph claims with source-name-only evidence',
  );
  assert.equal(boundaryFindings[0].index, siblingSourceNameOnly.indexOf('近年'));

  const differentListItems = [
    '- 近年、生成AIの利用が急速に拡大している。',
    '- 詳細は https://example.com/report を参照。',
  ].join('\n');
  const differentItemFindings = byRule(runTextlintLike(differentListItems, citationOnlyConfig), 'citation-needed');
  assert.equal(
    differentItemFindings.length,
    1,
    'citation-needed should not use evidence from a different ListItem',
  );
  assert.equal(differentItemFindings[0].index, differentListItems.indexOf('近年'));
}

function testActorlessActionRuntimeBoundaries() {
  // P7 Agent N3 10 ルール目移植テスト(runtime)。
  // BlockQuote / CodeBlock / Table 配下は抑制し、Paragraph 内の sentence で
  // 主体・期限の不足と外部資料の方向性紹介を判定する。
  const text = [
    '```md',
    '今後、申請手順の見直しを進める。',
    '```',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    '| 対応 | 今後、申請手順の見直しを進める |',
    '',
    '> 今後、申請手順の見直しを進める。',
    '',
    '担当部署は5月20日までに申込手順を見直すこととする。',
    '',
    '他資料にも、申請手順の見直しを進める、という方向性が書かれている。',
    '',
    '同じ資料では、申請手順の見直しを進める、という方向性も書かれているが、問い合わせへの対応を行う。',
    '',
    '今後、申請手順の見直しを進める。',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': false,
      'empty-conclusion': false,
      'citation-needed': false,
      'actorless-action': true,
    },
  });

  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index, finding.nodeType]),
    [
      [
        'nihongo-slopless/actorless-action',
        text.indexOf('対応を行う'),
        'Paragraph',
      ],
      [
        'nihongo-slopless/actorless-action',
        text.lastIndexOf('見直しを進める'),
        'Paragraph',
      ],
    ],
    'actorless-action should report Paragraph prose while ignoring code blocks, tables, blockquotes, owner/deadline cases, and reported directions',
  );
  assert.match(
    findings[0].message,
    /行動の主体や期限が見えにくい対応表現です/u,
    'actorless-action should keep standalone wording',
  );
}

function testBuzzwordDensityRuntimeBoundaries() {
  // P8 Agent F3 11 ルール目移植テスト(runtime)。
  // BlockQuote / CodeBlock / Table 配下は抑制し、Paragraph 単位で固定語彙の密度だけを見る。
  const text = [
    '```md',
    'DXと生成AIとイノベーションと個別最適と探究と社会実装を推進する。',
    '```',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    '| 方針 | DXと生成AIとイノベーションと個別最適と探究と社会実装 |',
    '',
    '> DXと生成AIとイノベーションと個別最適と探究と社会実装を推進する。',
    '',
    'DXと生成AIとイノベーションを使い、参加者の提出物を評価する。',
    '',
    'DXと生成AIとイノベーションを通じて、個別最適な学びと探究と社会実装を推進する。',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': false,
      'empty-conclusion': false,
      'citation-needed': false,
      'actorless-action': false,
      'buzzword-density': true,
    },
  });

  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index, finding.nodeType]),
    [
      [
        'nihongo-slopless/buzzword-density',
        text.lastIndexOf('DXと生成AI'),
        'Paragraph',
      ],
    ],
    'buzzword-density should report Paragraph prose while ignoring code blocks, tables, blockquotes, and threshold-level paragraphs',
  );
  assert.match(
    findings[0].message,
    /バズワードが密集しています（段落内6件）/u,
    'buzzword-density should keep standalone wording and count',
  );
}

function testListIntroPaddingRuntimeBoundaries() {
  // P13-F1 12 ルール目移植テスト(runtime)。
  // BlockQuote / CodeBlock / Table 配下は抑制し、Paragraph 本文の固定導入句だけを検出する。
  const text = [
    '```md',
    '以下では、コード内の例を示します。',
    '```',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    '| 導入 | 以下では、表内の説明を示します |',
    '',
    '> 以下では、引用内の説明を示します。',
    '',
    '以下では、確認手順を整理します。',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': false,
      'empty-conclusion': false,
      'citation-needed': false,
      'actorless-action': false,
      'buzzword-density': false,
      'list-intro-padding': true,
    },
  });

  assert.deepEqual(
    findings.map(finding => [finding.ruleId, finding.index, finding.nodeType]),
    [
      [
        'nihongo-slopless/list-intro-padding',
        text.lastIndexOf('以下では'),
        'Paragraph',
      ],
    ],
    'list-intro-padding should report Paragraph prose while ignoring code blocks, tables, and blockquotes',
  );
  assert.match(
    findings[0].message,
    /削っても意味が保てるか確認してください/u,
    'list-intro-padding should keep standalone wording',
  );
}

// ---------------- 2026-05-20 P6 Agent G / 2026-05-21 P7 Agent G2 境界テスト ----------------
// 本物 textlint@15.7.1 と local runtime harness の既知差分を、local parser の最小補強で狭める。
// adapter rule 本体は触らず、local AST boundary の改善だけを assertion として固定する。

function testHeadlineDecorationBlockquoteHeadingBoundary() {
  // 観察(P4 Agent C):
  //   本物 textlint は BlockQuote 配下の Header を認識し `headline-decoration` が
  //   発火する。
  // P7-G2:
  //   local runtime parser も `> ` を剥がした内容を Header 子ノードとして visit する。
  const text = [
    '> ## ★★ 重要なお知らせ',
    '',
    '通常の本文です。',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': true,
    },
  });

  assert.equal(
    findings.length,
    1,
    'local runtime harness should recognize blockquote-internal decorated Heading like real textlint',
  );
  assert.equal(findings[0].index, text.indexOf('## ★★'));
  assert.equal(findings[0].nodeType, 'Header');
}

function testExcessiveParenthesesYamlHtmlBoundary() {
  // 観察(P4 Agent C):
  //   本物 textlint は YAML front-matter(`---`)と raw HTML ブロックを HtmlBlock /
  //   YamlFrontMatter として prose visit から外すため `excessive-parentheses` は 0 件。
  // P7-G2:
  //   local runtime parser も YAML / HTML block を子なし non-prose node として扱う。
  const text = [
    '---',
    'title: テスト記事(仮)',
    'note: 担当（未確定）と期限（再調整）と対象（読者）と影響（範囲）',
    '---',
    '',
    '<div data-note="保留（再調整の可能性）">本文（前置き）と注意点（例外も含む）を示し、対象（読者）と期限（再確認の必要性）を一文に入れます。</div>',
  ].join('\n');

  const findings = runTextlintLike(text, {
    rulesConfig: {
      'long-sentence': false,
      'same-ending': false,
      'chat-response-leakage': false,
      placeholder: false,
      'hidden-unicode-controls': false,
      'headline-decoration': false,
      'excessive-parentheses': true,
    },
  });

  assert.equal(
    findings.length,
    0,
    'local runtime harness should ignore YAML front matter and raw HTML block parens like real textlint',
  );
}

const tests = [
  ['preset-nested-ast', testPresetRunsAllRulesAgainstNestedAst],
  ['same-ending-boundaries', testBlankAndBlockBoundariesResetSameEnding],
  ['same-ending-structural-repetition-parity', testSameEndingStructuralRepetitionParity],
  ['full-rule-id-config', testFullRuleIdConfigAndDisabledRule],
  ['placeholder-runtime-boundaries', testPlaceholderRuntimeBoundaries],
  ['hidden-unicode-controls-runtime-boundaries', testHiddenUnicodeControlsRuntimeBoundaries],
  ['headline-decoration-runtime-boundaries', testHeadlineDecorationRuntimeBoundaries],
  ['excessive-parentheses-runtime-boundaries', testExcessiveParenthesesRuntimeBoundaries],
  ['empty-conclusion-runtime-boundaries', testEmptyConclusionRuntimeBoundaries],
  ['citation-needed-runtime-boundaries', testCitationNeededRuntimeBoundaries],
  ['citation-needed-listitem-sibling-paragraph-evidence', testCitationNeededListItemSiblingParagraphEvidence],
  ['actorless-action-runtime-boundaries', testActorlessActionRuntimeBoundaries],
  ['buzzword-density-runtime-boundaries', testBuzzwordDensityRuntimeBoundaries],
  ['list-intro-padding-runtime-boundaries', testListIntroPaddingRuntimeBoundaries],
  ['headline-decoration-blockquote-heading-boundary', testHeadlineDecorationBlockquoteHeadingBoundary],
  ['excessive-parentheses-yaml-html-boundary', testExcessiveParenthesesYamlHtmlBoundary],
];

for (const [, test] of tests) test();

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: 'local-textlint-runtime-harness',
      tests: tests.map(([name]) => name),
    },
    null,
    2,
  ),
);
