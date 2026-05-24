# scripts/lint-report.mjs

`nihongo-slopless` の JSON 出力（または対象ディレクトリ／glob）を入力に、
`reports/private_corpus_lint_report.md` と同じ構造の Markdown レポートを生成する
スクリプトです。依存関係は Node 20+ の組み込みモジュールのみ。

## 前提

- Node 20+
- 作業ディレクトリはリポジトリ直下
- conda 環境を使う場合は `conda activate sci` 後に `node` を呼び出す

```powershell
conda activate sci
```

## 基本的な使い方

### 1. 既存 JSON を読み直して Markdown を生成する

`bin/nihongo-slopless.mjs ... --pretty --output reports/foo.json` で出力した
JSON をそのまま入力に使えます。

```powershell
node scripts/lint-report.mjs `
  --input reports/private_corpus_lint_latest.json `
  --output reports/private_corpus_lint_regenerated.md
```

`--input` モードでは、`実際の行` を埋めるために対象 Markdown を読み直します。
ファイルが見つからない場合は `(ファイル取得不可)` と書かれます。
対象ファイルの探索順は次のとおりです。

1. `--base-dir` で渡したディレクトリ（指定した場合）
2. `--input` で渡した JSON の親ディレクトリ
3. カレントディレクトリ
4. リポジトリルート（`scripts/` の親）

別ディレクトリの JSON を取り回す場合は `--base-dir` を明示してください。

### 2. 対象ディレクトリ／ファイル／glob から直接 lint してレポート生成する

`--input` の代わりに `--target` を渡すと、内部で `lintText` を呼び出して
レポートを生成します。

```powershell
node scripts/lint-report.mjs `
  --target private_corpus `
  --profile general `
  --output reports/private_corpus_general.md
```

```powershell
node scripts/lint-report.mjs `
  --target "docs/**/*.md" `
  --output reports/docs.md
```

`--target` は複数指定でき、`bin/nihongo-slopless.mjs` と同じく
ディレクトリ／ファイル／glob を受け付けます。

## オプション

| オプション | 説明 |
|---|---|
| `--input <path>` | 既存 JSON 出力を読み込む。`--target` と排他 |
| `--target <input>` | lint 対象 (繰り返し指定可) |
| `--output <path>` | Markdown 出力先 (省略時は標準出力) |
| `--profile <name>` | `general`、`technical`、`business` 等のプロファイル名 |
| `--config <path>` | 任意の設定 JSON を読み込む |
| `--min-severity <level>` | `info`/`warning`/`error` の最小表示レベル |
| `--fail-on <level>` | `info`/`warning`/`error`/`off`。指定レベル以上の指摘があれば終了コード1 |
| `--max-detail <count>` | 指摘詳細をこの件数までに抑える (上位 N 件) |
| `--base-dir <path>` | `実際の行` 解決の基点ディレクトリ |
| `--title <text>` | レポート見出しタイトル (省略時は自動生成) |
| `--no-fail` | 終了コードを常に 0 にする |
| `--help`, `--version` | ヘルプ／バージョン表示 |

## 出力フォーマット

`reports/private_corpus_lint_report.md` と同じ並びです。

1. ヘッダ (タイトル、生成日時、対象、実行コマンド)
2. サマリー (対象ファイル数／指摘総数／指摘ありファイル数／指摘なしファイル数)
3. 重要度別テーブル
4. ルール別テーブル (件数降順、同値はルール名昇順)
5. 指摘なしファイル一覧
6. ファイル別一覧テーブル (指摘数、主なルール)
7. 指摘詳細（ファイル別、各指摘について `L行:C列 ruleId [重要度]`、指摘文、
   検出語、修正方針、検出周辺、実際の行）

各ファイル節の見出しは GitHub アンカー互換の URL エンコード形式
(`#<encodeURIComponent(path.toLowerCase())>`) でリンクされます。

## 既存レポートとの突き合わせ

`reports/private_corpus_lint_latest.json` から再生成し、既存レポートと比較したい
場合は次のように差分を確認できます (ヘッダの日時と末尾の手書きコメント部分
以外は一致するはずです)。

```powershell
node scripts/lint-report.mjs `
  --input reports/private_corpus_lint_latest.json `
  --output reports/lint-report.regenerated.md `
  --fail-on off

# Git Bash / WSL
diff reports/private_corpus_lint_report.md reports/lint-report.regenerated.md
```

## トラブルシュート

- `(ファイル取得不可)` が `実際の行` に出る場合は、`--base-dir` で対象 Markdown
  の探索基点を指定してください。
- 大量ファイルを扱う場合、対象 Markdown のキャッシュは一度読み込んだファイル
  単位で行ごとに保持します。レポート生成終了時に解放します。
- `--target` で渡したパスにマッチするファイルが 0 件のときは
  `bin/nihongo-slopless.mjs` と同じくエラー終了します。空でも続行したい場合は
  対象を事前に存在確認してください。
