# nihongo-slopless

**日本語 Markdown の弱い文章の癖を、決定論的な編集候補として返す散文リンターです。**

これは**AIが書いたかどうかを判定する道具ではありません**。目的は、AI由来でも人間由来でも起こりうる、弱い文章の癖を見つけることです。

- 抽象語が多く、具体性がない
- 「今後の発展が期待される」のように、成果や次の行動が読み取りにくい締めがある
- チャット応答の残骸が文書に混じっている
- 根拠のない「近年」「多くの研究」「世界初」がある
- 長すぎる文・段落がある
- 丁寧表現の重なり、翻訳調、バズワードが多い

本プロジェクトは、英語Markdown向けの [Slopless](https://github.com/seochecks-ai/slopless) が示した「決定論的な散文リンター」という設計思想に影響を受け、日本語文書向けに独立実装した公開ベータです。英語版のtextlintルールをそのまま翻訳したものではなく、日本語の文体、根拠提示、チャット応答残骸、校務・研究・広報文書で起こりやすい弱さを編集候補として扱います。

## このプロジェクトの本丸

- **本丸 1: 手元の汎用 CLI** — Markdown とプレーンテキストに対して、決定論的な品質指摘を JSON で返す。個人が日常的に手元で動かすことを最優先に設計。
- **本丸 2: AI 時代の品質管理レイヤー** — AIエージェント出力や公開前草稿も、AI利用推定ではなく文章品質の確認対象として扱う。チャット応答の残骸、未編集の兆候、根拠不足を、決定論的な編集候補として出す。

### 要件外として整理しているもの

次のものは **本リポジトリのスコープに含みません**。

- VS Code 拡張、JetBrains プラグイン
- MCP サーバ
- GitHub Actions 公式テンプレート配布
- textlint プリセット正式配布
- 組織向けダッシュボード、多言語展開

GitHub Actions の公式テンプレート配布は v0.1.0 の範囲外です。ただし、SARIF 出力を使った連携の考え方と参考例は `docs/ci-sarif.md` に置いています。textlint プリセット正式配布も必須機能化しません。

## 誤用防止

`agent-output` プロファイルや指摘件数は、AI利用の推定、文章の点数化、成績・採否・処分の根拠には使えません。出力は「編集者が確認する候補」であり、著者や生成元を示す証拠ではありません。

授業、組織レビュー、公開前確認で使う場合は、先に `docs/ethical-use.md` の倫理的利用方針を確認してください。導入手順とCIへ入れる前の確認事項は `docs/adoption-guide.md` にまとめています。Codexから呼び出す場合は `docs/codex.md`、観測されやすい誤検出のパターンと無視コメントの判断基準は `docs/troubleshooting.md` を参照してください。

## 謝辞と由来

`nihongo-slopless` は [Slopless](https://github.com/seochecks-ai/slopless) の設計思想に着想を得ています。コードベース、ルール実装、検証データは日本語文書向けに本リポジトリで独立に整備しています。詳しくは `ACKNOWLEDGEMENTS.md` を参照してください。

## すぐ試す

依存パッケージはありません。Node.js 20以上だけで動きます。

```bash
npm test
node bin/nihongo-slopless.mjs examples/sloppy.md --pretty
```

グロブ、ファイル、ディレクトリ、標準入力に対応します。

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --pretty
cat report.md | node bin/nihongo-slopless.mjs - --pretty
```

### 個人の常時活用例

```bash
# ブログ記事を書いた後
node bin/nihongo-slopless.mjs post.md --profile web --pretty

# AI エージェントが書いた草案を確認
node bin/nihongo-slopless.mjs ai-draft.md --profile agent-output --pretty

# 業務文書、稟議、報告書
node bin/nihongo-slopless.mjs document.md --profile business --pretty

# 研究計画、概要、申請書
node bin/nihongo-slopless.mjs plan.md --profile research --pretty
```

### Codexから使う

Codexが日本語Markdownを新規作成または大きく編集した後は、編集補助として次を使えます。

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile agent-output --pretty --fail-on off
```

npm公開後は、同じ用途で `npx -y nihongo-slopless@latest ...` も使えます。詳しいJSON handoff、SARIF利用、AGENTS雛形、Skill例は `docs/codex.md` を参照してください。

### ドッグフード

本リポジトリ自身のドキュメントを `nihongo-slopless` 自身で lint できます。

```bash
npm run lint:docs
```

リンターを育てる活動と、リンターを使う活動が同じループに乗ります。`README.md` と公開用 `docs/` が lint 対象です。

簡易globとして `*`、`**`、`?` に対応します。`**/` は0個以上のディレクトリに一致するため、`docs/**/*.md` は `docs/a.md` と `docs/sub/a.md` の両方を検査します。brace展開や文字クラスはサポート対象外です。`docs/*.{md,markdown}` や `docs/[ac]*.md` は一般的なglob互換として期待しないでください。globやディレクトリ入力が検査対象ファイルに一致しない場合は実行エラーになります。CIなどで空の対象を意図的に許す場合は `--allow-empty` を指定してください。

終了コードは次の通りです。

| 終了コード | 意味 |
|---:|---|
| 0 | 指摘なし |
| 1 | 指摘あり |
| 2 | 実行エラー |

CIなどで失敗条件を調整する場合は、重要度と件数の条件を分けて指定できます。指摘件数は品質スコアではなく、レビュー負荷を制御するための機械的なしきい値です。

```bash
node bin/nihongo-slopless.mjs docs --fail-on error --pretty
node bin/nihongo-slopless.mjs docs --fail-on off --max-findings 20 --pretty
```

レポートをファイルに保存する場合は `--output` を使えます。指定先のファイルは上書きされ、親ディレクトリがなければ作成されます。

```bash
node bin/nihongo-slopless.mjs docs --format sarif --output reports/nihongo-slopless.sarif
```

出力は既定でJSONです。`--format sarif` を指定するとSARIF 2.1.0形式で出力できます。`--pretty` はどちらの形式にも効きます。JSONの `files[].path` とSARIFの `artifactLocation.uri` は、既定で作業ディレクトリからの相対パスになります。絶対パスが必要な場合は `--absolute-paths` を指定してください。

```json
{
  "tool": "nihongo-slopless",
  "version": "0.1.0",
  "language": "ja",
  "files": [
    {
      "path": "examples/sloppy.md",
      "messages": [
        {
          "ruleId": "nihongo-slopless/chat-response-leakage",
          "severity": "warning",
          "line": 3,
          "column": 1,
          "message": "チャット応答の残骸に見える表現です。独立した文書なら削るか、本文の役割を明確にしてください。"
        }
      ]
    }
  ]
}
```

```bash
node bin/nihongo-slopless.mjs examples/sloppy.md --format sarif --pretty
```

SARIF出力は `tool.driver.name` / `tool.driver.version` / `tool.driver.rules` と、各指摘の `ruleId`、`level`、`message.text`、`locations` を含みます。重要度は `error` を `error`、`warning` を `warning`、`info` を `note` に変換します。`--absolute-paths` 指定時のSARIFは、絶対ファイルパスを `file:///...` 形式のURIとして出力します。

CIやSARIFファイルとして保存する最小例は `docs/ci-sarif.md` を参照してください。

## プロファイル

用途に応じて、初期設定を `--profile` で切り替えられます。

```bash
node bin/nihongo-slopless.mjs docs --profile minimal --pretty
node bin/nihongo-slopless.mjs docs --profile general --pretty
node bin/nihongo-slopless.mjs docs --profile business --pretty
node bin/nihongo-slopless.mjs docs --profile technical --pretty
node bin/nihongo-slopless.mjs docs --profile research --pretty
node bin/nihongo-slopless.mjs docs --profile agent-output --pretty
```

- `minimal`: 初回導入向け。誤検出を抑え、明確な未完成箇所を中心に見る
- `general`: 一般文章向け。読みやすさ、根拠不足、抽象度などを広く見る
- `business`: 企画書、報告書、稟議向け。責任、根拠、行動の曖昧さを見る
- `technical`: 仕様書、マニュアル向け。手順、条件、対象の曖昧さを見る
- `research`: 研究計画、概要、申請書向け。根拠、限定、新規性、検証可能性を見る
- `public`: 行政、学校、公共文書向け。読み手の判断可能性を重視する
- `web`: ブログ、記事、広報向け。抽象的な導入、薄い締め、装飾の強さを見る
- `agent-output`: AI生成判定ではなく、チャット応答の残骸、未置換プレースホルダ、未編集の兆候を強めに見る。指摘数をAI利用推定や処分根拠には使わない
- `strict`: 公開前・導入前の強めレビュー向け。確認負荷を許容して広めに検出する

`.nihongo-slopless.json`、`nihongo-slopless.config.json`、または `--config` を併用すると、プロファイルを下敷きにして設定ファイル側が上書きします。

## 設定ファイル

設定ファイルはJSONです。`--config` を指定しない場合、作業ディレクトリの `.nihongo-slopless.json`、次に `nihongo-slopless.config.json` を探し、最初に見つかった1つを自動読込します。

`--config config/recommended.json` のように明示した場合は、そのファイルだけを読みます。この場合、自動読込対象の `.nihongo-slopless.json` / `nihongo-slopless.config.json` は追加では読みません。

```bash
node bin/nihongo-slopless.mjs docs --config config/recommended.json --pretty
```

`--profile` と併用した場合は、profile設定を先に読み、設定ファイルが上書きします。設定ファイル用のJSON Schemaは `config/schema.json` です。詳しい設定形式と、本文行除外設定は `docs/configuration.md` にあります。

例:

```json
{
  "rules": {
    "nihongo-slopless/long-sentence": ["warning", { "maxChars": 120 }],
    "nihongo-slopless/chat-response-leakage": "error",
    "nihongo-slopless/buzzword-density": false
  },
  "ignoreFiles": [
    "docs/generated/**"
  ],
  "allowTerms": [
    {
      "term": "世界初",
      "rules": ["nihongo-slopless/citation-needed"],
      "reason": "出典付きの固有表現として使う"
    }
  ]
}
```

指定方法:

- `false`: 無効化
- `"warning"` / `"error"` / `"info"`: 重要度を上書き
- `["warning", { ...options }]`: 重要度とオプションを上書き
- `{ "severity": "warning", "options": { ... } }`: 明示指定

## 無視コメント

意図的な例外はMarkdownコメントで囲めます。

```markdown
<!-- nihongo-slopless-disable nihongo-slopless/empty-conclusion -->
今後の発展が期待される。
<!-- nihongo-slopless-enable nihongo-slopless/empty-conclusion -->
```

直後の1行だけを無視する場合:

```markdown
<!-- nihongo-slopless-disable-next-line nihongo-slopless/empty-conclusion -->
今後の発展が期待される。
```

理由を残す場合は、指摘を機械的に消すのではなく、人間が修正しない判断を記録します。

```markdown
<!-- nihongo-slopless-ignore empty-conclusion: 文脈上の例として残す -->
今後の発展が期待される。
```

`ignore` は `disable-next-line` と同じく、コメント直後の物理行だけを対象にします。直後が空行なら空行だけ、EOFなら何も無視しません。複数行にまたがる指摘は、指摘の `finding.index` が無視範囲に入る場合だけ抑制され得ます。コードフェンス内の無視コメントは、本文への無視指定としては扱いません。

すべてのルールを一時的に止める場合:

```markdown
<!-- nihongo-slopless-disable -->
ここは検査しない。
<!-- nihongo-slopless-enable -->
```

textlint風コメントも読めます。

```markdown
<!-- textlint-disable nihongo-slopless/long-sentence -->
...
<!-- textlint-enable nihongo-slopless/long-sentence -->
```

## ルール一覧

初期実装では次のルールを入れています。詳しくは `docs/rules.md` を参照してください。

- `hidden-unicode-controls`
- `placeholder`
- `chat-response-leakage`
- `list-intro-padding`
- `long-sentence`
- `long-paragraph`
- `empty-conclusion`
- `weasel-phrases`
- `citation-needed`
- `absolute-claim`
- `unscoped-generalization`
- `no-numerics-claim`
- `abstract-noun-stack`
- `nominalization-density`
- `excessive-politeness`
- `actorless-action`
- `deadline-missing`
- `same-ending`
- `repeated-connectors`
- `translationese`
- `buzzword-density`
- `thin-sentence`
- `excessive-parentheses`
- `headline-decoration`
- `over-possibility`
- `unclear-deictic`

## 保守者向けの改善ループ

公開利用面は、文章 lint の CLI、設定、ルール文書、検証用seedに限定します。内部開発設定、ローカル運用ログ、開発補助用の設定や手順は公開対象に含めません。

### 推奨ループ(1ルール改定)

1. 公開可能なMarkdown、自作サンプル、またはmanifestで固定した公開資料を10〜30本集める
2. `node bin/nihongo-slopless.mjs docs --pretty` を実行する
3. 誤検出と見逃しを `validation/goldset.example.jsonl` 形式で記録する
4. 1ルールずつ修正し、`npm test` と `npm run evaluate` を回す
5. ルールの説明、閾値、例外条件を更新する

## 検証の考え方

このリンターの価値は「正解を言い切ること」ではなく、「編集者が確認すべき箇所を低コストで出すこと」です。したがって、検証では次を分けて評価します。

- 精度: 指摘が本当に修正候補だった割合
- 再現率: 修正候補をどれだけ拾えたか
- 教育的有用性: 指摘を読んだ学生・教員が、より良い修正理由を説明できたか
- 文体適合性: 研究概要、授業資料、校務文書、広報文で同じ閾値が妥当か

検証計画は `docs/validation-plan.md` にあります。公開資料を使う反復検証は `docs/open-corpus-loop.md`、manifest例は `validation/open-corpus-manifest.example.jsonl` を参照してください。manifestに固定した資料の取得とローカル最小抽出には `node scripts/fetch-open-corpus.mjs --dry-run` から使えます。第三者本文は原則としてnpm公開物に同梱せず、検出数をAI判定や文章スコアに使いません。

## npm公開ベータの配布境界

公開ベータでは、npmパッケージだけを見てもCLI、設定、公開docs、examplesの役割が分かる状態を目指します。配布対象は `package.json` の `files` で固定し、内部運用ログ、ローカル検証データ、第三者本文、生成済みレビュー成果物、開発用テスト fixture は含めません。

GitHub Actions の公式テンプレート配布は v0.1.0 の範囲外です。ただし、SARIF 出力を使った連携の考え方と参考例は `docs/ci-sarif.md` に置いています。ローカル開発で回す最小確認は `npm test`、評価とdocs lintを含む公開前確認は `npm run check` で実行します。

npm配布する場合の梱包対象は `package.json` の `files` で固定しています。`npm pack --dry-run --json` で、内部開発設定、ローカル運用ログ、run記録、非公開validation、ローカルcorpus、生成済みreview bundle、開発用の `test/` と `validation/` が含まれないことを確認します。`docs/` は公開利用に必要な文書だけを明示列挙します。Codex向けには `docs/codex.md`、`examples/AGENTS.md`、`examples/skills/nihongo-slopless/SKILL.md` を同梱します。

`npm test`、`npm run evaluate`、`npm run check` は、GitHub から clone したソースチェックアウトで実行する開発者向け確認です。npm パッケージ本体は利用者向けの CLI 配布を優先し、開発用の `test/` と `validation/` は同梱しません。

`package.json` の `repository`, `bugs`, `homepage` は、公開先として `https://github.com/skeisuke1977/nihongo-slopless` を指します。公開前に、GitHub上でリポジトリとIssueページが実在することを `RELEASE_CHECKLIST.md` に沿って確認してください。

## ライセンス

MIT
