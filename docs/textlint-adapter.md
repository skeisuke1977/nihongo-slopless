# textlint アダプタ試作メモ

> この文書は実験的な設計メモです。
> v0.1.0 の公開ベータ機能ではありません。
> npm package には同梱しておらず、利用者向けの正式な textlint preset ではありません。
> 現行の利用者向け機能は root CLI (`bin/nihongo-slopless.mjs`) と公開docsを基準にしてください。

このドキュメントは ROADMAP v0.8「textlint 連携」の最初の手付けを扱います。
対象は `adapters/textlint/` に置いた 12 ルールの試作品です。
standalone CLI との差分と、既存 textlint エコシステムとの棲み分けを記録します。

実体は試作品です。npm publish 用ではありません。
現時点の root package (`nihongo-slopless`) には `adapters/textlint/` を同梱していないため、
root package からそのまま textlint ルールとして利用できるものではありません。
将来ユーザー向けに配る場合は、別 package として `textlint-rule-preset-nihongo-slopless`
系の名前を持つ preset package にする前提です。

アダプタ自身に本物の textlint ランタイム依存は入れていませんが、`adapters/textlint/smoke-test.js` で
textlint 風の `RuleError` / `report` / `getSource` / visitor 順序を最小再現し、
パッケージ入口と node 起点オフセットを検査できるようにしています。
さらに `adapters/textlint/runtime-test.js` で、ネストした Markdown AST、preset 風の複数ルール同時実行、
full rule ID の設定、空行・見出し・コード・表境界を検証します。これは本物の textlint ではありませんが、
smoke よりランタイム寄りの回帰検査です。

一部ルールは `.local/` 配下の一時検証環境で本物の `textlint@15.7.1` でも確認しています。
P8-N1 では、`adapters/textlint/index.js` を `textlint-rule-preset-nihongo-slopless`
というローカル preset package から re-export し、本物の `textlint@15.7.1` が preset-style
package として読み込めることも確認しました。
P9-F1 では同じローカル preset package alias を本物の textlint CLI から読み、
`rules: { "preset-nihongo-slopless": true }` と
`rules: { "textlint-rule-preset-nihongo-slopless": true }` の両方で、
11 個の `nihongo-slopless/<rule>` ID が出ることを確認しました。
一方、現在の package 名である `@nihongo-slopless/textlint-adapter-experimental` を
`.textlintrc` の rule key として指定する経路は `No rules found` になり、
preset-style key としては使えないことも確認しています。

P10-F1 では、この P9 の scratch CLI 結果を置き換えるのではなく、依存ゼロの
`adapters/textlint/preset-resolution-test.js` でローカルの export/name contract を固定しました。
この fixture は本物の textlint をインストールせず、将来 package 名と rule IDs の対応だけを検査します。
P13-F1 では `list-intro-padding` をローカル adapter 入口に追加し、fixture 上の対応を 12 rule IDs に更新しました。
P14-F1 では既存 `.local` scratch を使い、`examples/sloppy.md` を加えた本物の textlint CLI 経路でも全12 rule ID と `list-intro-padding` の発火を確認しました。
P9-N4 では `hidden-unicode-controls` を本物の `textlint@15.7.1` kernel と
`@textlint/textlint-plugin-markdown@15.7.1` で確認し、見出し・本文・インラインコード・
コードブロック・表・引用ブロック内の不可視制御文字を raw source index で重複なく報告することを確認しました。

---

## 1. 対象範囲

| 移植したルール | textlint 側ファイル | 既定オプション |
|---|---|---|
| `nihongo-slopless/long-sentence` | `adapters/textlint/long-sentence.js` | `maxChars: 110`, `errorChars: 170` |
| `nihongo-slopless/same-ending` | `adapters/textlint/same-ending.js` | `consecutive: 4` |
| `nihongo-slopless/chat-response-leakage` | `adapters/textlint/chat-response-leakage.js` | 12 語の定型句リスト |
| `nihongo-slopless/placeholder` | `adapters/textlint/placeholder.js` | 公開前に埋める固定プレースホルダ語彙 |
| `nihongo-slopless/hidden-unicode-controls` | `adapters/textlint/hidden-unicode-controls.js` | なし |
| `nihongo-slopless/headline-decoration` | `adapters/textlint/headline-decoration.js` | なし |
| `nihongo-slopless/excessive-parentheses` | `adapters/textlint/excessive-parentheses.js` | `maxEffectivePairsPerParagraph: 4`, `maxTotalPairsPerParagraph: 9` ほか |
| `nihongo-slopless/empty-conclusion` | `adapters/textlint/empty-conclusion.js` | 12 語の抽象的な締め表現リスト |
| `nihongo-slopless/citation-needed` | `adapters/textlint/citation-needed.js` | 14 語の主張パターン(近年/現在/最新/世界初/...)、同一 Paragraph 内の出典記法・出典名・著者年引用・数値データ証拠、narrow research bridge による抑制(軽量版) |
| `nihongo-slopless/actorless-action` | `adapters/textlint/actorless-action.js` | 4 種の対応・検討表現、主体語、期限語、方向性紹介の抑制(軽量版) |
| `nihongo-slopless/buzzword-density` | `adapters/textlint/buzzword-density.js` | 固定バズワードリスト、`maxPerParagraph: 4` |
| `nihongo-slopless/list-intro-padding` | `adapters/textlint/list-intro-padding.js` | 8 語の薄い前置き・リスト導入句リスト |

補助ファイル:

- `adapters/textlint/index.js`: 12 ルールを `rules` / `rulesConfig` としてまとめる preset 風入口。
- `adapters/textlint/smoke-test.js`: textlint 未導入環境向けの最小 smoke ハーネス。
- `adapters/textlint/runtime-test.js`: nested AST と複数ルール同時実行を持つ runtime 寄りハーネス。

選定理由:

- `long-sentence` は文単位の閾値だけで動き、AST 上の文分割の差が見えやすい。
- `same-ending` は節境界判定の差が出やすく、textlint AST の利点と欠点が浮かぶ。
- `chat-response-leakage` は固定語彙 + 文脈除外で、AI エージェント残骸というプロジェクトの
  特色領域そのものを textlint 上にどう載せるかの試金石になる。
- `placeholder` は固定語彙 + Str 走査で移植でき、inline code / code block 境界の確認に向く。
- `hidden-unicode-controls` はコードポイントスキャンのみで、文章スタイルというより文書整合性の
  ルールである。P9-N1 で `Document` 起点の raw source scan に変更し、`Str` / `Code` /
  `CodeBlock` などの子ノード visitor は持たない。P9-N4 では本物の `textlint@15.7.1`
  kernel 上で、見出し・本文・インラインコード・コードブロック・表・引用ブロック内の
  不可視制御文字を重複なく拾うことを確認した。
- `headline-decoration` は Heading/Header ノードに閉じて走査でき、表・引用・フロントマターなどの
  parser 境界差を受けにくい。
- `excessive-parentheses` は Paragraph 単位のカウンタ系で、glossary と effective の分類、
  3 条件の検出ロジック、message を standalone から局所的に移植しやすい。
- `empty-conclusion` は固定語彙の literal alternation と単一 message で動き、Paragraph 走査へ
  局所移植しやすい。
- `citation-needed` は固定語彙(claim パターン)+ Paragraph 単位の出典/出典名抑制で
  軽量版を移植可能。P8-I1 で同一 Paragraph 内の著者年引用と数値データ証拠も抑制に追加し、
  P8-I2 で本物 `textlint@15.7.1` 上でも確認した。P10-I1 で
  narrow research bridge 例外(`研究でも...結果が報告されている`)も軽量移植した。
  P11-I1 で、同じ ListItem 内の兄弟 Paragraph にある強い evidence
  (URL/DOI/番号引用/著者年引用/数値データ証拠) だけを抑制に使う軽量 parity も追加した。
  文書全体または List 全体の引用収集は移植対象外として残す。
- `actorless-action` は文単位の対応・検討表現、主体語、期限語、外部資料の
  方向性紹介抑制で軽量移植可能。textlint 版は Paragraph 内の sentence split に
  限定し、隣接 Paragraph をまたぐ主体・期限の補完は行わない。
- `buzzword-density` は Paragraph-local な固定語彙 + 閾値の密度検出で、semantic-density
  系ルールを textlint アダプタに載せる最初の軽量試作になる。P8-F3 で local
  smoke/runtime ハーネスを通し、P8-F4 で本物の textlint ランタイム上でも陽性、閾値以下、
  CodeBlock / BlockQuote / Table 境界を確認した。
- `list-intro-padding` は固定語彙の literal alternation と単一 message で動き、
  P13-F1 では Paragraph 走査へ局所移植した。standalone の `maskedText` 全体走査とは違い、
  textlint 版は Paragraph 配下の `Str` だけを走査して inline code を避け、`BlockQuote`,
  `CodeBlock`, `Table` 配下を prose 境界として除外する。

残り 14 ルール (`absolute-claim`, `weasel-phrases` ほか) は今回は対象外。
今後の評価対象として「§5 移植可否棚卸し」に表で列挙する。

---

## 2. standalone と textlint アダプタの差分

| 観点 | standalone (`src/rules/*.mjs`) | textlint アダプタ (`adapters/textlint/*.js`) |
|---|---|---|
| 段落判定 | `src/markdown.mjs` の `splitStructureBlocks`。空行・見出し・表・引用・コードフェンスを自前で扱い、`structureSectionIndex` を sentence に付与する。 | textlint AST の `Paragraph` ノードに従う。Markdown AST の `ListItem` は内側の `Paragraph` で消費し、二重カウントを避ける。`Heading` / `BlockQuote` / `CodeBlock` / `HorizontalRule` / `Table` などを境界としてフラッシュする。 |
| 文分割 | `splitSentencesInRange` で `[。！？!?]` + 閉じ括弧を走査。20 字未満の末尾断片は破棄。 | Paragraph 単位で同等の正規表現走査を行う。短い末尾断片の扱いは textlint AST の Paragraph 境界に委ねる (試作のため厳密一致は保証しない)。 |
| マスキング | `maskMarkdown` で YAML フロントマター、コードブロック、HTML コメント、Hugo shortcode、MDN/KumaScript マクロ、インラインコード、画像、リンク URL を空白に置換した `maskedText` を作成。 | 多くの prose ルールでは、textlint AST が `Code`, `CodeBlock`, `Html` を別ノードに分解しているため、Str ノードを訪問するだけで概ね同等の効果が得られる。例外として `hidden-unicode-controls` は文書整合性チェックとして `Document` の raw source 全体を一度だけ走査し、コード・表・引用・Markdown 構文面も意図的に対象にする。フロントマターの扱いは textlint のプラグインに依存する。 |
| 無視コメント | `<!-- nihongo-slopless-disable-next-line ... -->`、`<!-- textlint-disable-next-line ... -->`、理由付き `<!-- nihongo-slopless-ignore ... -->` を `src/ignore.mjs` で解釈し、`disableRanges` として findings から除外する。 | textlint 側の `textlint-filter-rule-comments` に委ねる。アダプタ自体は無視コメントを実装しない。 |
| 設定経路 | `config/*.json` (プロファイル) + JSON Schema (`config/schema.json`)。CLI フラグ `--profile`, `--config`, `--rules` で切替。 | `.textlintrc.js` の rules セクション。アダプタは `module.exports = function(context, options)` の `options` をそのまま受ける。プロファイル概念は textlint 側には無いため、`.textlintrc` プロファイルの自作が必要。 |
| 出力形式 | JSON, pretty, SARIF 2.1.0 (`--format sarif`)。`--output` でファイル保存。 | textlint の reporter (stylish / compact / json / checkstyle / etc.) に従う。SARIF は textlint-formatter のサードパーティに依存。 |
| severity 制御 | rule の `defaultSeverity` と CLI の `--fail-on` で 3 段階 (info / warning / error)。`long-sentence` は `errorChars` 超で error に昇格。 | textlint v12 系の rule API では severity を rule 内から直接設定できない。`severity: "error"` は `.textlintrc` 側の指定に依る。アダプタはメッセージに字数を含めて警戒度を伝えるに留める。 |
| 性能 | 単一パスの正規表現走査が中心。900 KB の Markdown でも秒未満を想定。 | textlint の AST 構築 + visitor 呼び出しオーバーヘッドが加わる。実測は未取得。 |
| 依存 | ランタイム依存ゼロ (Node.js 20+ のみ)。 | peerDependency に `textlint >= 12.0.0`。アダプタ自身は依存ゼロ。 |
| エラー位置 | `findings[i].index` が `text` (元の Markdown) における 0 基点オフセット。`offsetToLocation` で line/column を出す。 | `RuleError` の `index` または `padding` を node.range 起点で渡す。textlint が line/column へ展開する。 |
| 抜粋 | `excerptAt(text, index, length)` で前後の文脈を含めた抜粋を返す。 | textlint reporter が source snippet を生成する (アダプタ側は生成しない)。 |
| Markdown 以外の入力 | 標準入力 / プレーンテキストに対応。Markdown 以外ではマスキングを最小化。 | textlint プラグイン (`@textlint/textlint-plugin-text`, `@textlint/textlint-plugin-markdown` ほか) に従う。 |

### `citation-needed` の軽量 parity と残る差分

`citation-needed` の textlint 版は Paragraph visitor 内で完結する軽量移植である。
同一 Paragraph 内に URL / DOI / 番号引用 / Markdown URL / 表番号・図番号 / 著者年引用 /
数値データ証拠 / 出典名があれば、その Paragraph 内の主張を抑制する。

P8-I2 では、著者年引用と数値データ証拠の抑制、年だけの括弧を抑制しない境界を
本物 `textlint@15.7.1` + `@textlint/textlint-plugin-markdown@15.7.1` でも確認した。
P10-I1 では、`研究でも` / `学術論文でも` と `結果` / `傾向` + `報告されている` が
近接する narrow research bridge 例外を、Paragraph 内の sentence-local 判定として
smoke/runtime ハーネスで確認した。

P11-I1 では、同じ ListItem 内に複数 Paragraph がある場合だけを対象にした。
その場合、兄弟 Paragraph の URL / DOI / 番号引用 / 著者年引用 / 数値データ証拠を
strong evidence として扱うようにした。
出典名だけの兄弟 Paragraph は抑制に使わず、別 ListItem の evidence も使わない。

ただし standalone との完全一致ではない。以下は明示的に未対応のまま残している。

- Document 全体または List 全体での引用・証拠収集。

P12-I1 では、この残差分を v1.0 の必須実装にはせず、prototype limitation として維持する判断にした。
理由は、文書全体や List 全体にある evidence を広く抑制に使うと、
参考文献欄や別 ListItem の根拠まで抑制材料になるためである。
無関係な主張まで見逃す false negative / over-suppression のリスクがある。
standalone CLI が v1.0 の主対象であり、textlint adapter は Paragraph と同じ ListItem 内の
兄弟 Paragraph に閉じた軽量 parity として扱う。

### `hidden-unicode-controls` の raw scan parity

`hidden-unicode-controls` の textlint 版は、P9-N1 で prose-only `Str` 走査から
`Document` 起点の raw source scan に変更した。これは、不可視制御文字を文章表現の癖ではなく、
コピー混入や表示偽装につながる文書整合性の問題として扱うためである。
同じ raw source を一度だけ走査するため、`Str` / `Code` / `CodeBlock` / `TableCell`
などの子ノードを追加では訪問せず、同じ制御文字の重複報告を避ける。

P9-N4 では、本物の `textlint@15.7.1` kernel と
`@textlint/textlint-plugin-markdown@15.7.1` 上で次の 6 箇所を確認した。

| 箇所 | 制御文字 | raw index |
|---|---:|---:|
| 見出し | `U+2060` | 5 |
| 本文 | `U+200B` | 10 |
| インラインコード | `U+200C` | 23 |
| コードブロック | `U+202E` | 65 |
| 表 | `U+FEFF` | 103 |
| 引用ブロック | `U+2066` | 112 |

上記 6 件は `nihongo-slopless/hidden-unicode-controls` として報告され、raw source index は期待値と一致した。
6 件の index は一意で、重複報告は観測されていない。

この設計では、コードフェンス、インラインコード、表、引用、フロントマター、HTML、URL、
Markdown 構文面、例示テキスト内の不可視制御文字も報告対象になる。これは prose lint の
均質化ではなく、見えない制御文字を文書全体から見つけるための意図的な差分である。

### 「マスキング」と「AST 走査」の差が結果に影響する例

- 表 (`|---|---|`) の中の本文は、standalone では `markdownLineKind === 'table'` で
  `shouldLintStructure` から外れるため lint 対象外。textlint アダプタは `Table` ノードを
  境界とすることで結果的に表セルを訪問しないが、textlint プラグインが Table をどう分解する
  かに依存する (`@textlint/markdown-to-ast` は TableCell を持つ)。`same-ending` の連続カウントは
  ここで挙動が分かれる可能性がある。
- インラインコードを含む文 (例: 「``foo`` は便利です。」) では、standalone はインラインコードを
  空白マスクしてから文長を測るため、コード断片が長くても可視長に算入されない。textlint
  アダプタは Paragraph の `getSource(node)` を文字列として扱うので、Markdown のバッククォート
  自体が長さに含まれる可能性がある。
- `hidden-unicode-controls` は上記の prose rule とは違い、マスキングや AST の prose 境界に
  従わない。standalone と同じコードポイント集合を raw source 全体から検出するため、
  表セルやコードブロック内の不可視制御文字も報告する。

---

## 3. 棲み分け方針 — なぜ既存 textlint PINK ルールを置き換えないか

nihongo-slopless が補完したい領域と、既存 textlint プリセットが熟成している領域はずれている。

| 領域 | 既存 textlint で十分 | nihongo-slopless が重ねる価値 |
|---|---|---|
| 句読点・表記揺れ | `textlint-rule-ja-no-mixed-period`, `textlint-rule-no-doubled-joshi`, `prh` | - (置き換えない) |
| 文長 | `textlint-rule-sentence-length` | 文長そのものは textlint で足りる。nihongo-slopless 側の `long-sentence` は **URL 除外** と **error 昇格 (170 字)** の差別化が薄ければ、textlint 単体で十分。 |
| 助詞・接続 | `textlint-rule-no-doubled-conjunction`, `textlint-rule-ja-no-successive-word` | - (置き換えない) |
| 用語ゆれ | `prh`, `textlint-rule-prh` | - (置き換えない) |
| 意味密度・抽象語密度 | (薄い) | `abstract-noun-stack`, `nominalization-density`, `thin-sentence` ほかが nihongo-slopless の中心領域。 |
| 責任・根拠の所在 | (薄い) | `weasel-phrases`, `actorless-action`, `unscoped-generalization`, `citation-needed`, `over-possibility` ほか。 |
| AI エージェント残骸 | (textlint には対応ルールがほぼ無い) | `chat-response-leakage`, `placeholder`, `hidden-unicode-controls`, `excessive-politeness` ほか。 |
| 編集不足の兆候 | (textlint には対応ルールが薄い) | `empty-conclusion`, `headline-decoration`, `list-intro-padding`, `repeated-connectors` ほか。 |

したがって textlint アダプタは、

- **置き換える** ことを狙わない。
- **重ねて使える** 形を狙う。
- standalone CLI で十分に賄える環境では、わざわざ textlint 経由で動かす必要は無い。

逆に、既に textlint を回している現場では、`nihongo-slopless/*` ルールを併用しやすい。
対象は、CI で `textlint --fix` を含めている現場、エディタプラグインを配っている現場、
prh で用語統一を運用している現場などである。
nihongo-slopless 本体の意図領域 (意味密度・責任のぼかし・エージェント残骸) を、
既存ワークフローへねじ込まずに重ねられる。これがアダプタの主な存在意義になる。

---

## 4. textlint との併用時の推奨

### preset-style package として読む場合

P8-N1 の real runtime 検証と P9-F1 の CLI/package resolution 検証では、
成功した設定経路は top-level `presets` ではなく、`rules` 内の preset key でした。
したがって、将来この試作品を別 package として
`textlint-rule-preset-nihongo-slopless` 名で置く場合の想定設定は次の形になります。
この試作品の `@nihongo-slopless/textlint-adapter-experimental` は正式な preset package 名ではなく、
その名前を `.textlintrc` に指定しても preset として読み込まれません。

```js
// .textlintrc.js
module.exports = {
  plugins: ['@textlint/markdown'],
  filters: {
    comments: true, // textlint-filter-rule-comments で無視コメントを統一
  },
  rules: {
    // 既存 textlint 領域
    'ja-no-mixed-period': true,
    'no-doubled-joshi': true,
    prh: { rulePaths: ['./prh.yml'] },

    // nihongo-slopless 領域 (別 package 化した場合の preset-style 経路)
    'preset-nihongo-slopless': {
      'long-sentence': { maxChars: 110, errorChars: 170 },
      'same-ending': { consecutive: 4 },
      'chat-response-leakage': true,
      placeholder: true,
      'hidden-unicode-controls': true,
      'headline-decoration': true,
      'excessive-parentheses': true,
      'empty-conclusion': true,
        'citation-needed': true,
        'actorless-action': true,
        'buzzword-density': true,
        'list-intro-padding': true,
      },
    },
  };
```

これは配布済み package の利用例ではなく、`textlint-rule-preset-nihongo-slopless` という名前で
adapter を別 package 化した場合の CLI/runtime 互換メモである。P9-F1 では scratch 環境で
次の 2 経路が本物の textlint CLI から成功した。

```json
{
  "rules": {
    "preset-nihongo-slopless": true
  }
}
```

```json
{
  "rules": {
    "textlint-rule-preset-nihongo-slopless": true
  }
}
```

P9-F1 時点では、どちらの経路でも次の 11 rule IDs が観測された。

- `nihongo-slopless/long-sentence`
- `nihongo-slopless/same-ending`
- `nihongo-slopless/chat-response-leakage`
- `nihongo-slopless/placeholder`
- `nihongo-slopless/hidden-unicode-controls`
- `nihongo-slopless/headline-decoration`
- `nihongo-slopless/excessive-parentheses`
- `nihongo-slopless/empty-conclusion`
- `nihongo-slopless/citation-needed`
- `nihongo-slopless/actorless-action`
- `nihongo-slopless/buzzword-density`

P13-F1 では本物の textlint CLI は再実行せず、ローカルの adapter 入口と
`preset-resolution-test.js` の name-contract fixture に `nihongo-slopless/list-intro-padding`
を追加し、12 rule IDs の対応として固定した。

確認済みの失敗経路は次のとおりである。この experimental package 名をそのまま rule key にする
次の設定は、P9-F1 の scratch CLI 検証で `No rules found` になった。

```json
{
  "rules": {
    "@nihongo-slopless/textlint-adapter-experimental": true
  }
}
```

これはアダプタの rule runtime 失敗ではなく、textlint の package-name / rule-key 解決の制限である。
実際に P9-F1 では `TextlintKernel + @textlint/textlint-plugin-markdown` から
`adapters/textlint/index.js` を直接読ませる経路では、同じ 11 rule IDs が出ている。
P13-F1 で追加した 12 個目は当初依存ゼロ harness 上の確認に留まったが、P14-F1 で既存 `.local` scratch を使った本物の textlint CLI 経路でも全12 rule IDを観測した。
top-level `presets: { ... }` は採用しない。

P10-F1 の `npm --prefix adapters\textlint run preset-resolution` は、この名前契約をローカルで固定する
依存ゼロ fixture である。本物の textlint CLI の設定探索や package install を再実行するものではない。

「文長」を 1 つに統合したい場合は、`textlint-rule-sentence-length` を入れて
preset config 内の `long-sentence` を `false` にする、あるいはその逆を選ぶ。
重複検出を許容できる場合は両方有効でも構わない。

---

## 5. 未移植ルールの移植可否棚卸し (暫定)

| ルール | 移植難易度 | 備考 |
|---|---|---|
| `absolute-claim` | 中 | 否定文脈や仕様説明文脈の除外があるが、Str + sentenceBounds で再現可能。 |
| `abstract-noun-stack` | 高 | 形態素レベルの抽象名詞リストと密度判定。textlint 上では Str ノードで十分実装可能だが、辞書管理コストが大きい。 |
| `deadline-missing` | 中 | 期限関連の語彙と除外パターンの移植。 |
| `excessive-politeness` | 中 | 敬語表現リストと密度。 |
| `long-paragraph` | 中 | Paragraph 単位の長さ計測。`long-sentence` と組で考えやすい。 |
| `no-numerics-claim` | 中 | 効果主張 + 数値不在の判定。 |
| `nominalization-density` | 高 | 名詞化表現の辞書と密度。 |
| `over-possibility` | 中 | 可能表現の連発。 |
| `repeated-connectors` | 中 | 段落間連続の判定。Document visitor で順序を保つ実装が必要。 |
| `thin-sentence` | 中 | 形態素密度。 |
| `translationese` | 中 | 翻訳調パターンの辞書。 |
| `unscoped-generalization` | 中 | 一般化表現 + 範囲限定の不在判定。 |
| `weasel-phrases` | 中 | ぼかし表現の辞書 + 文脈判定。 |

「高」評価のものは textlint 上での自然な実装が AST だけでは足りず、外部辞書や形態素解析の
プラグイン化を要する。最小コミットの精神 (AGENTS.md) からは、ここまで踏み込む前に standalone
での評価軸を固めるのが先になる。

---

## 6. 既知の未整備項目

- 本物の textlint ランタイムでの詳細境界確認は一部ルールに限られる。
  `citation-needed` は `textlint@15.7.1` 上で、同一 Paragraph URL、著者年引用、
  数値データ証拠、年だけ括弧などの主要境界を確認済み。
- P8-N1 では `textlint-rule-preset-nihongo-slopless` というローカル preset package 経由で、
  本物の `textlint@15.7.1` が `rules: { "preset-nihongo-slopless": true }` を読み、
  `nihongo-slopless/<rule>` の rule ID を出力することを確認した。
- P9-F1 では本物の textlint CLI から `rules: { "preset-nihongo-slopless": true }` と
  `rules: { "textlint-rule-preset-nihongo-slopless": true }` の両方が成功し、
  `buzzword-density` を含む 11 rule IDs が出ることを確認した。
- P14-F1 では既存 `.local` scratch に `examples/sloppy.md` を加え、本物の textlint CLI 経路でも全12 rule IDを観測した。
- `buzzword-density` は P8-F4 で本物の textlint ランタイムでも、陽性、閾値以下、
  CodeBlock / BlockQuote / Table 境界を確認済み。
- `hidden-unicode-controls` は P9-N4 で本物の `textlint@15.7.1` kernel 上の
  raw Document scan を確認済み。見出し・本文・インラインコード・コードブロック・表・
  引用ブロックの不可視制御文字を raw index で重複なく報告する。
- 現在の package 名 `@nihongo-slopless/textlint-adapter-experimental` は preset-style key ではない。
  P9-F1 の scratch CLI 検証では `rules: { "@nihongo-slopless/textlint-adapter-experimental": true }`
  は `No rules found` になった。この名前で正式な textlint preset として利用できるとは書かない。
- `adapters/textlint/preset-resolution-test.js` は依存ゼロの name-contract fixture であり、
  `preset-nihongo-slopless` / `textlint-rule-preset-nihongo-slopless` と 12 rule IDs の対応を検査する。
  本物の textlint CLI、Markdown parser、filter rule、reporter、formatter、設定探索は再現しない。
- `adapters/textlint/smoke-test.js` は textlint 風の局所ハーネスであり、Markdown parser、
  filter rule、reporter、formatter、設定解決までは再現しない。
- `adapters/textlint/runtime-test.js` は smoke より textlint runtime に近いが、実際の
  `@textlint/markdown-to-ast`、filter rule、reporter、formatter、設定探索は再現しない。
- `textlint-tester` を使った陽性 / 陰性例のスナップショットテスト。
- 設定経路の二重化問題: standalone の `--profile business` と `.textlintrc` の rules セクションを
  どう同期させるか。プロファイル → `.textlintrc` フラグメント生成スクリプトを将来的に検討。
- SARIF 出力経路: textlint からの SARIF 生成は別 reporter が必要。standalone と統一する設計は未着手。
- 無視コメントの統一規約: standalone 側 `nihongo-slopless-disable-next-line` と textlint 側
  `textlint-disable` の両対応はすでに standalone で実装済み (`src/ignore.mjs`)。textlint 経由で動かす
  ときは `textlint-filter-rule-comments` 側に寄せる。

依存を増やさない範囲での検証コマンド:

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

---

## 7. v0.8 完了条件との対応

ROADMAP v0.8 の完了条件:

- 最低 5 ルールが textlint 形式で動く → **12 ルール到達**。
- 本物の textlint ランタイムでは `headline-decoration` / `excessive-parentheses` /
  `empty-conclusion` / `citation-needed` / `actorless-action` の主要境界を個別検証済み。
- P8-N1 で preset-style package としての読み込み経路も確認済み。
- `buzzword-density` は P8-F4 で主要境界を個別検証済み。
- `hidden-unicode-controls` は P9-N4 で raw Document scan として、見出し・本文・
  インラインコード・コードブロック・表・引用ブロックを本物の textlint kernel で確認済み。
- P9-F1 では本物の textlint CLI で `preset-nihongo-slopless` /
  `textlint-rule-preset-nihongo-slopless` の 2 経路から 11 rule IDs が出ることを確認済み。
- P13-F1 で `list-intro-padding` を依存ゼロ harness 上の 12 個目として追加し、P14-F1 で本物の textlint CLI 経路でも全12 rule IDを観測した。
- 横断的な詳細境界検証は、残作業として扱う。
- standalone CLI との挙動差が文書化されている → **本ドキュメントで対応**。
- 併用時の推奨設定がある → **§4 で暫定**。
- 既存エコシステムを置き換えない方針が明確である → **§3 で明示**。

完了とはまだ言えない。試作の足場ができた段階。
