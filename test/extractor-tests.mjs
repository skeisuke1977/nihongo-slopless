import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function runCli(args, { input = undefined } = {}) {
  const cliPath = fileURLToPath(new URL('../bin/nihongo-slopless.mjs', import.meta.url));
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
  });
}

function runFetchOpenCorpus(args = []) {
  const cliPath = fileURLToPath(new URL('../scripts/fetch-open-corpus.mjs', import.meta.url));
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

function parseJsonStdout(result, label) {
  assert(result.stdout.trim(), `${label} should emit JSON on stdout`);
  return JSON.parse(result.stdout);
}

export async function runExtractorTests() {
  const mediaWikiIndexHtml = [
    '<html><body>',
    '<div class="mw-parser-output">',
    '<p>数学科目 : 数と式 - 集合と命題; 二次関数 - 図形と計量 : データの分析 - 場合の数と確率; 確率分布 - 統計的な推測 : ベクトル - 複素数平面; 微分法 - 積分法; 整数の性質 - 図形の性質; 数列 - 関数の極限</p>',
    '<p>授業では、例題を読み、次に練習問題を解く。</p>',
    '</div>',
    '</body></html>',
  ].join('\n');
  const technicalMarkdown = [
    '---',
    'title: Vue component options',
    '---',
    '',
    '設定例: props: { active: Boolean; size: String }; emits: update:modelValue - computed: readyState; watch: route - setup: useDialog; template: ModalPanel; slots: default',
  ].join('\n');
  const routes = new Map([
    ['/mediawiki-index.html', { body: mediaWikiIndexHtml, contentType: 'text/html; charset=utf-8' }],
    ['/technical-markdown.md', { body: technicalMarkdown, contentType: 'text/markdown; charset=utf-8' }],
  ]);
  const server = createServer((request, response) => {
    const route = routes.get(new URL(request.url, 'http://127.0.0.1').pathname);
    if (!route) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': route.contentType });
    response.end(route.body);
  });
  const dir = mkdtempSync(join(tmpdir(), 'nihongo-slopless-fetch-open-corpus-'));

  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const manifestPath = join(dir, 'manifest.jsonl');
    const outDir = join(dir, 'out');
    const records = [
      {
        id: 'self-mediawiki-index-fixture',
        origin: 'self-authored',
        sourceName: 'Self-authored MediaWiki index fixture',
        sourceUrl: `http://127.0.0.1:${port}/mediawiki-index.html`,
        license: 'project test fixture',
        termsCheckedAt: 'not-applicable',
        purpose: 'MediaWiki index extractor regression fixture',
        validationRole: 'extractor-regression',
        storagePolicy: 'temporary self-authored test fixture',
        includeText: true,
        repositoryIncluded: false,
        packageIncluded: false,
        profile: 'general',
        genre: 'synthetic',
        reviewFocus: ['markdown-boundary', 'long-sentence'],
        notes: 'Self-authored fixture only.',
      },
      {
        id: 'self-technical-markdown-separators',
        origin: 'self-authored',
        sourceName: 'Self-authored technical Markdown separator fixture',
        sourceUrl: `http://127.0.0.1:${port}/technical-markdown.md`,
        license: 'project test fixture',
        termsCheckedAt: 'not-applicable',
        purpose: 'Non-MediaWiki separator preservation fixture',
        validationRole: 'extractor-regression',
        storagePolicy: 'temporary self-authored test fixture',
        includeText: true,
        repositoryIncluded: false,
        packageIncluded: false,
        profile: 'technical',
        genre: 'synthetic',
        reviewFocus: ['markdown-boundary', 'technical-terms'],
        notes: 'Self-authored fixture only.',
      },
    ];
    writeFileSync(manifestPath, `${records.map(record => JSON.stringify(record)).join('\n')}\n`, 'utf8');
    const warmup = await fetch(records[0].sourceUrl);
    assert.equal(warmup.status, 200, 'local fixture server should serve the MediaWiki HTML fixture before the child fetch run');
    await warmup.text();

    const fetchResult = await runFetchOpenCorpus([
      '--manifest',
      manifestPath,
      '--out',
      outDir,
      '--include-self-authored',
      '--timeout-ms',
      '5000',
    ]);
    const fetchReportPath = join(outDir, 'fetch-report.json');
    const fetchReportText = readFileSync(fetchReportPath, 'utf8');
    assert.equal(fetchResult.status, 0, `fetch-open-corpus fixture run should pass\nstdout:\n${fetchResult.stdout}\nstderr:\n${fetchResult.stderr}\nreport:\n${fetchReportText}`);
    const fetchReport = JSON.parse(fetchReportText);
    assert.equal(fetchReport.summary.byExtractAction.extracted, 2, 'both self-authored extractor fixtures should be extracted');

    const mediaWikiExtractedPath = join(outDir, 'extracted', 'self-mediawiki-index-fixture.md');
    const mediaWikiExtracted = readFileSync(mediaWikiExtractedPath, 'utf8');
    assert.match(mediaWikiExtracted, /^- 数と式$/m, 'MediaWiki index fixture should split spaced colon-delimited subjects into list items');
    assert.match(mediaWikiExtracted, /^- 集合と命題$/m, 'MediaWiki index fixture should split spaced dash-delimited subjects into list items');
    assert.match(mediaWikiExtracted, /^- 統計的な推測$/m, 'MediaWiki index fixture should split semicolon-delimited subjects into list items');
    assert(!mediaWikiExtracted.includes('数学科目 : 数と式 - 集合と命題; 二次関数'), 'MediaWiki index fixture should not keep the original index line as one paragraph');
    const mediaWikiLint = runCli([mediaWikiExtractedPath, '--profile', 'general', '--format', 'json', '--fail-on', 'off']);
    assert.equal(mediaWikiLint.status, 0, 'linting the extracted MediaWiki fixture should pass with --fail-on off');
    const mediaWikiLintPayload = parseJsonStdout(mediaWikiLint, 'MediaWiki fixture lint');
    const mediaWikiLongSentence = mediaWikiLintPayload.files.flatMap(file => file.messages)
      .filter(message => message.ruleId === 'nihongo-slopless/long-sentence');
    assert.equal(mediaWikiLongSentence.length, 0, 'MediaWiki index fixture should not create long-sentence noise after list structuring');

    const technicalExtracted = readFileSync(join(outDir, 'extracted', 'self-technical-markdown-separators.md'), 'utf8');
    assert(technicalExtracted.includes('設定例: props: { active: Boolean; size: String }; emits: update:modelValue - computed: readyState; watch: route - setup: useDialog; template: ModalPanel; slots: default'), 'non-MediaWiki technical Markdown separators should be preserved');
    assert(!/^- props\b/mu.test(technicalExtracted), 'non-MediaWiki technical Markdown should not be split into props bullet items');
    assert(!/^- computed\b/mu.test(technicalExtracted), 'non-MediaWiki technical Markdown should not be split into computed bullet items');
    assert(!/^- setup\b/mu.test(technicalExtracted), 'non-MediaWiki technical Markdown should not be split into setup bullet items');
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}
