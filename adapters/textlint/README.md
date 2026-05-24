# @nihongo-slopless/textlint-adapter-experimental

これは **試作品** です。npm publish 用ではありません。
nihongo-slopless v0.8 ロードマップにおける「textlint 連携の棚卸し」の手付けとして、
nihongo-slopless の standalone ルールのうち 12 個を textlint ルール形式に書き写したものです。

## このディレクトリに含まれるもの

| ファイル | 移植元 | 用途 |
|---|---|---|
| `long-sentence.js` | `src/rules/long-sentence.mjs` | 1 文が長すぎる箇所を検出 (既定 110 字 / 170 字) |
| `same-ending.js` | `src/rules/same-ending.mjs` | 同一文末が 4 文以上連続する読みのリズムを検出 |
| `chat-response-leakage.js` | `src/rules/chat-response-leakage.mjs` | チャット応答の前置きや締めの定型句を検出 |
| `placeholder.js` | `src/rules/placeholder.mjs` | TODO、未記入、仮置きなどの明確なプレースホルダを検出 |
| `hidden-unicode-controls.js` | `src/rules/hidden-unicode-controls.mjs` | ゼロ幅文字や双方向制御文字など、見えない Unicode 制御文字を検出 |
| `headline-decoration.js` | `src/rules/headline-decoration.mjs` | 本文情報より目立つ見出し装飾を検出 |
| `excessive-parentheses.js` | `src/rules/excessive-parentheses.mjs` | 段落内の括弧補足の過密を検出 |
| `empty-conclusion.js` | `src/rules/empty-conclusion.mjs` | 成果、対象、条件、次の確認事項が読み取りにくい抽象的な総括を検出 |
| `citation-needed.js` | `src/rules/citation-needed.mjs` | 根拠や出典を確認したい強い主張を検出 |
| `actorless-action.js` | `src/rules/actorless-action.mjs` | 主体や期限が見えにくい対応・検討表現を検出 |
| `buzzword-density.js` | `src/rules/buzzword-density.mjs` | 段落内のバズワード過密を検出 |
| `list-intro-padding.js` | `src/rules/list-intro-padding.mjs` | 情報量の少ない前置きやリスト導入を検出 |
| `index.js` | - | textlint preset 風に 12 ルールをまとめる入口 |
| `smoke-test.js` | - | textlint 未インストール環境向けの最小 AST / context ハーネス |
| `runtime-test.js` | - | ネストした Markdown AST と複数ルール同時実行を再現する runtime 寄りハーネス |
| `preset-resolution-test.js` | - | 将来の preset 名と rule ID のローカル契約を検査する依存ゼロ fixture |
| `package.json` | - | 形式上のパッケージ宣言 (peerDependencies のみ、依存ゼロ) |

## このアダプタの目的

- nihongo-slopless が掲げる「意味密度」「責任のぼかし」「AI エージェント残骸」の検出ルールが、
  textlint AST 上でどこまで自然に動くかを確認する。
- standalone CLI を維持したまま、textlint エコシステム (prh, ja-technical-writing, etc.) と
  併用したい利用者の参照実装を残す。
- ルールロジックそのもの (閾値、語彙、除外ヒューリスティック) を変えずに、AST 走査の差だけ
  局所化することで、将来 textlint プリセット化するときの diff を最小にする。

## このアダプタの「非目的」

- npm publish と公開バージョン管理。
- standalone と完全に同一の検出結果を保証すること。
  - Markdown のマスキング、段落判定、節境界判定は textlint 側の AST に委ねるため、
    細かい境界例で結果が分かれる可能性がある。
- textlint の既存定番ルール (`textlint-rule-ja-no-mixed-period`, `textlint-rule-no-doubled-joshi`,
  `textlint-rule-sentence-length` ほか) を置き換えること。
  - 文長や句読点に関するチェックは既存 textlint ルールが豊富で熟成している。
    nihongo-slopless は意味密度・責任の所在・エージェント残骸といった「textlint で薄い領域」を
    重ねて担当する役割でこそ価値が出る。

## 想定する textlint との接続点

```js
// .textlintrc.js (例 — 現在の experimental package 名でそのまま使える設定ではありません)
module.exports = {
  rules: {
    'nihongo-slopless/long-sentence': {
      maxChars: 110,
      errorChars: 170,
    },
    'nihongo-slopless/same-ending': {
      consecutive: 4,
    },
    'nihongo-slopless/chat-response-leakage': true,
    'nihongo-slopless/placeholder': true,
    'nihongo-slopless/hidden-unicode-controls': true,
    'nihongo-slopless/headline-decoration': true,
    'nihongo-slopless/excessive-parentheses': true,
    'nihongo-slopless/empty-conclusion': true,
    'nihongo-slopless/citation-needed': true,
    'nihongo-slopless/actorless-action': true,
    'nihongo-slopless/buzzword-density': true,
    'nihongo-slopless/list-intro-padding': true,
  },
};
```

`require()` 経路はパッケージ未公開のため、ローカルパス指定での読み込みを想定する。

```js
// textlint v12 系の Kernel から直接 rule を渡す例
const { TextlintKernel } = require('textlint');
const longSentence = require('./adapters/textlint/long-sentence.js');
```

12 ルールをまとめて読む場合は、preset 風の入口を使う。

```js
const nihongoSlopless = require('./adapters/textlint');

module.exports = {
  rules: {
    'nihongo-slopless/long-sentence': nihongoSlopless.rules['long-sentence'],
    'nihongo-slopless/same-ending': nihongoSlopless.rules['same-ending'],
    'nihongo-slopless/chat-response-leakage': nihongoSlopless.rules['chat-response-leakage'],
    'nihongo-slopless/placeholder': nihongoSlopless.rules.placeholder,
    'nihongo-slopless/hidden-unicode-controls': nihongoSlopless.rules['hidden-unicode-controls'],
    'nihongo-slopless/headline-decoration': nihongoSlopless.rules['headline-decoration'],
    'nihongo-slopless/excessive-parentheses': nihongoSlopless.rules['excessive-parentheses'],
    'nihongo-slopless/empty-conclusion': nihongoSlopless.rules['empty-conclusion'],
    'nihongo-slopless/citation-needed': nihongoSlopless.rules['citation-needed'],
    'nihongo-slopless/actorless-action': nihongoSlopless.rules['actorless-action'],
    'nihongo-slopless/buzzword-density': nihongoSlopless.rules['buzzword-density'],
    'nihongo-slopless/list-intro-padding': nihongoSlopless.rules['list-intro-padding'],
  },
};
```

## ローカル検証

このリポジトリには textlint 本体を依存追加していない。依存を入れられない環境では、次で構文と
textlint 風 visitor の最小 smoke を確認する。

```powershell
node --check adapters\textlint\index.js
node --check adapters\textlint\long-sentence.js
node --check adapters\textlint\same-ending.js
node --check adapters\textlint\chat-response-leakage.js
node --check adapters\textlint\placeholder.js
node --check adapters\textlint\hidden-unicode-controls.js
node --check adapters\textlint\headline-decoration.js
node --check adapters\textlint\excessive-parentheses.js
node --check adapters\textlint\empty-conclusion.js
node --check adapters\textlint\citation-needed.js
node --check adapters\textlint\actorless-action.js
node --check adapters\textlint\buzzword-density.js
node --check adapters\textlint\list-intro-padding.js
node --check adapters\textlint\smoke-test.js
node --check adapters\textlint\runtime-test.js
node --check adapters\textlint\preset-resolution-test.js
node adapters\textlint\smoke-test.js
node adapters\textlint\runtime-test.js
npm --prefix adapters\textlint run preset-resolution
```

`smoke-test.js` は本物の textlint ではない。`RuleError`、`report`、`getSource`、`Syntax`、
`Document:exit`、`Paragraph` / `Str` 訪問を小さく再現し、オフセットが node 起点で渡ることだけを
検査する。

`runtime-test.js` も本物の textlint ではないが、smoke より実ランタイムに寄せている。preset 風入口から
12 ルールを同時に起動し、`List` → `ListItem` → `Paragraph` のネスト、空行・見出し・コードフェンス・表の
境界、full rule ID の設定経路、line / column 変換、placeholder の code 境界を検査する。

`preset-resolution-test.js` は本物の textlint CLI を再現しない。将来の preset-style package 名と、
この入口が公開する 12 個の `nihongo-slopless/<rule>` ID の対応だけを依存ゼロで固定する。

## ルール挙動の要約

### long-sentence

- 既定オプション: `maxChars: 110`, `errorChars: 170`
- 走査対象ノード: `Paragraph` (textlint AST)
- 文分割: Paragraph の `getSource(node)` を `[。！？!?]` で割る。
- URL は `stripInlineUrls` で除外してから可視長を算出する (standalone と同じ正規表現)。
- 110 字超 → warning、170 字超 → error 想定 (textlint 標準の severity 拡張ではメッセージで補足)。

### same-ending

- 既定オプション: `consecutive: 4`
- 走査対象ノード: `Paragraph` の本文。Markdown AST では `ListItem` 配下に `Paragraph` があるため、
  `ListItem` 自体は消費しない。
- 節境界: `Heading`, `BlockQuote`, `CodeBlock`, `HorizontalRule`, `Table`, `Html` 系ノードに当たったら
  streak をリセットする。空行で分かれた Paragraph 間も `getSource()` 全体取得ができる環境ではリセットする。
- 連続するリスト項目は streak を維持 (standalone の「同じ連続リスト内の項目は均質な箇条書きとして対象に残す」と一致)。

### chat-response-leakage

- 既定オプション: `phrases` (12 語の定型句リスト)
- 走査対象ノード: `Str` (textlint AST の生テキストノード)。Code / CodeBlock は対象外。
- 除外: 引用記号 (「 」, 『 』, “ ”, ‘ ’) に挟まれた場合、および例示マーカー + 説明動詞の同居。
- standalone の `isQuotedOrExplained` を、`node.value` 1 つに閉じる形でそのまま実装。

### placeholder

- 既定オプション: `terms` (TODO / TBD / FIXME / 未記入 / 仮置き などの固定語彙)
- 走査対象ノード: `Str`。inline code / code block は対象外。
- 除外: Markdown タスクチェックボックス、空の Markdown リンクラベル、引用・例示文脈。
- standalone の `ここに` 専用判定や広い語彙は未移植。明確な未完成マーカーを優先する。

### hidden-unicode-controls

- 既定オプション: なし。
- 走査対象ノード: `Document` の raw source。`Str` / `Code` / `CodeBlock` などの子ノード visitor は持たず、
  同じ制御文字の重複報告を避ける。
- 検出対象: `U+200B`, `U+200C`, `U+200D`, `U+2060`, `U+FEFF`, `U+202A`-`U+202E`, `U+2066`-`U+2069`。
- prose lint ではなく文書整合性のチェックとして扱うため、コードフェンス、インラインコード、表、引用、
  Markdown 構文面に混入した不可視制御文字も検出対象にする。

### headline-decoration

- 既定オプション: なし。
- 走査対象ノード: `Heading` / `Header`。本文、表、inline code、code block は対象外。
- 検出対象: `★`, `◆`, `●`, 絵文字などの装飾記号を複数重ねた見出し。
- standalone と同じメッセージを使い、読み手が媒体目的や情報構造との適合を確認できる表現に留める。

### excessive-parentheses

- 既定オプション: `maxEffectivePairsPerParagraph: 4`, `maxTotalPairsPerParagraph: 9`,
  `minDensePairsPerParagraph: 5`, `minEffectivePairsInDenseParagraph: 3`,
  `maxGlossaryInnerLength: 25`
- 走査対象ノード: `Paragraph`。`BlockQuote`, `CodeBlock`, `Table` 配下の Paragraph は対象外。
- 検出対象: 段落内の括弧 `(...)` / `（...）`。略語展開、英訳、短い数値注記などは glossary として扱い、
  実質的な日本語補足の重なりを standalone と同じ 3 条件で報告する。
- message と reason の動的組み立ては standalone と同じ。

### empty-conclusion

- 既定オプション: `patterns` (12 語の抽象的な締め表現リスト)、`defaultSeverity: warning`
- 走査対象ノード: `Paragraph`。`BlockQuote`, `CodeBlock`, `Table` 配下の Paragraph は対象外。
- 検出対象: `今後の課題である`、`さらなる検討が必要`、`一助となる` など、成果や次の確認事項が
  読み取りにくい総括表現。
- standalone と同じ literal alternation、同じ message を使う。

### citation-needed

- 既定オプション: 主張パターン、出典記法、出典名、著者年引用、数値データ証拠など。
- 走査対象ノード: `Paragraph`。`BlockQuote`, `CodeBlock`, `Table` 配下の Paragraph は対象外。
- 同一 Paragraph 内の証拠と、同じ `ListItem` 内の兄弟 Paragraph にある強い evidence は抑制に使う。
- Document 全体または List 全体での引用・証拠収集は未移植であり、prototype limitation として残す。

### actorless-action

- 既定オプション: 対応・検討表現、主体語、期限語、方向性紹介の抑制語彙。
- 走査対象ノード: `Paragraph`。Paragraph 内で文を分け、主体や期限が見えにくい対応・検討表現を報告する。
- 隣接 Paragraph をまたぐ主体・期限の補完は行わない軽量版。

### buzzword-density

- 既定オプション: 固定バズワードリスト、`maxPerParagraph: 4`。
- 走査対象ノード: `Paragraph`。`BlockQuote`, `CodeBlock`, `Table` 配下の Paragraph は対象外。
- 段落内の固定語彙数だけを見る軽量な density ルールとして移植している。

### list-intro-padding

- 既定オプション: `phrases` (8 語の薄い前置き・リスト導入句リスト)、`defaultSeverity: info`。
- 走査対象ノード: `Paragraph` 配下の `Str`。inline code と `BlockQuote`, `CodeBlock`, `Table` 配下の Paragraph は対象外。
- standalone と同じ literal alternation、同じ message を使う。

## standalone との挙動差

詳細は `docs/textlint-adapter.md` を参照。代表的な差分:

- 段落判定: standalone は独自マスキングと空行ベース。textlint は AST の Paragraph 単位。
- 無視コメント: standalone は `<!-- nihongo-slopless-disable-next-line ... -->` を独自に解釈する。
  textlint には `textlint-filter-rule-comments` がある。今回のアダプタは無視コメントを
  実装しない (textlint 側のフィルタに委ねる)。
- 出力形式: standalone は JSON / SARIF / pretty を選べる。textlint は textlint の reporter に従う。
- severity: textlint v12 系では rule から severity を直接指定できないため、`error` 相当も
  warning メッセージ内に字数を含めて表現するに留めている。
- 性能: standalone は単一パスの正規表現走査が中心。textlint は AST 構築コストが上乗せされる。

## 未整備項目

- 本物の textlint ランタイムでの全ルール横断の詳細境界確認。
  - 一部ルールと preset-style package 解決は `.local/` 配下の一時検証環境で確認済み。
  - 代替として `smoke-test.js` で textlint 風 context / visitor / offset の局所検証を行う。
  - 追加で `runtime-test.js` により nested AST、複数ルール同時実行、境界リセットを依存ゼロで検証する。
- `textlint-tester` を用いた陽性例 / 陰性例のスナップショット。
- `RuleHelper.isChildNode` などの textlint SDK ヘルパへの差し替え (現状は自前で範囲計算)。
- 未移植ルールの移植可否評価。`docs/textlint-adapter.md` の棚卸し表に列挙する。
- 設定経路統一: standalone 側 `config/schema.json` と textlint 側 `.textlintrc` の重複設定の扱い。

## 試作品としての注意

このアダプタを通った結果を、自動的に最終判断に使わないでください。
nihongo-slopless 本体のビジョン (AI 判定器ではなく編集の余地を照らす道具) を引き継ぎます。
