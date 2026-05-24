# CIとSARIFの最小運用

この文書は、現行CLIで実行できる範囲だけを扱う。未実装のPRコメント投稿、SARIFアップロード専用コマンドは前提にしない。

## 目的

CIでは、日本語SloplessをAI判定器や採点器として使わない。Markdown文書の編集候補をJSONまたはSARIFで保存し、レビューで確認しやすくするために使う。

## ローカル確認

通常の確認:

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --pretty
```

SARIFとして保存:

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --format sarif --pretty --output nihongo-slopless.sarif
```

終了コードは、既定では指摘があれば `1`、指摘なしなら `0`、実行エラーなら `2` である。globやディレクトリ入力が検査対象ファイルに一致しない場合も実行エラーになる。生成前のディレクトリなど、空の対象をCIで明示的に許す場合は `--allow-empty` を使う。CIで失敗条件を緩めたい場合は、現行実装の `--fail-on` を使う。

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --fail-on error --pretty
```

この例では `warning` や `info` の指摘は出力するが、終了コード1の対象にはしない。

既存文書が多いリポジトリでは、重要度ではなく指摘件数でCIの失敗条件を置ける。`--max-findings` は `--min-severity` で絞り込んだ後の出力件数に対して判定する。

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --fail-on off --max-findings 20 --pretty
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --min-severity warning --fail-on off --max-findings 10 --pretty
```

件数しきい値は文章品質の点数ではない。CIでレビュー負荷や移行時の許容量を管理するための条件として扱う。

## SARIF互換性と公開前確認

GitHub code scanningへアップロードする前に、まずローカルでSARIFの基本構造を確認する。`scripts/validate-sarif.mjs` で検証する範囲は、SARIF 2.1.0であること、`runs` があること、各runに `tool.driver.rules` と `results` があること、各resultに `ruleId`, `message.text`, `locations[].physicalLocation.artifactLocation.uri` があることまでである。

PowerShellでの確認例:

```powershell
$sarifPath = Join-Path $env:TEMP "nihongo-slopless.sarif"
node .\bin\nihongo-slopless.mjs .\examples\sloppy.md --format sarif --pretty --fail-on off --output $sarifPath
node .\scripts\validate-sarif.mjs $sarifPath
```

公開アーティファクトとして扱う前には `--for-publish` を付ける。このモードでは、第三者本文やローカル環境の場所を示すURIを混入させないため、`artifactLocation.uri` が `file:` URI、Windows絶対パス、Unix絶対パス、`.local/`, `reports/open-corpus/`, `private_corpus/` を指す場合に失敗する。

相対URIのSARIFは公開前確認を通過する:

```powershell
node .\scripts\validate-sarif.mjs $sarifPath --for-publish
```

`--absolute-paths` で生成したSARIFは公開前確認で失敗する:

```powershell
$absoluteSarifPath = Join-Path $env:TEMP "nihongo-slopless.absolute.sarif"
node .\bin\nihongo-slopless.mjs .\examples\sloppy.md --format sarif --pretty --fail-on off --absolute-paths --output $absoluteSarifPath
node .\scripts\validate-sarif.mjs $absoluteSarifPath --for-publish
```

JSONサマリーが必要な場合:

```powershell
node .\scripts\validate-sarif.mjs $sarifPath --json --for-publish
```

この確認は、CLIが出すSARIFの構造検査である。指摘件数はレビュー対象の量を知るための情報であり、文章品質の点数ではない。GitHub code scanningでの表示、重複統合、PR注釈の出方は、別途リポジトリ側で確認する。

## GitHub Actions例

このリポジトリの通常テスト用CIは `.github/workflows/ci.yml` に置く。以下はSARIF保存を追加したい場合の運用例であり、現行の最小CIとは分けて扱う。

SARIFをファイルとして保存するだけの最小例:

```yaml
name: nihongo-slopless

on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run nihongo-slopless
        run: |
          node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --format sarif --pretty --output nihongo-slopless.sarif
      - name: Upload SARIF artifact
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: nihongo-slopless-sarif
          path: nihongo-slopless.sarif
```

レビューを止めずにSARIFを保存したい場合:

```yaml
      - name: Run nihongo-slopless
        run: |
          node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --format sarif --pretty --fail-on off --output nihongo-slopless.sarif
```

## 運用メモ

- `agent-output` はAI利用の推定ではなく、応答残骸や未編集の兆候を強めに見るprofileである。
- 指摘件数を文章品質の点数や処分根拠にしない。
- `--output` は指定先のファイルを上書きし、親ディレクトリがなければ作成する。
- SARIFの `level` は重要度の表示であり、著者や生成元のラベルではない。
- SARIFの `artifactLocation.uri` は、通常ファイルでは実行時の作業ディレクトリからの相対URIとして出力する。Windows環境でも区切りは `/` に揃える。
- 公開前に保存するSARIFは `scripts/validate-sarif.mjs --for-publish` で確認し、ローカル絶対パスや `.local/` などの内部作業パスを含めない。
- 標準入力 `-` を使った場合、SARIFの `artifactLocation.uri` は `stdin` として出力する。
- GitHub code scanningへのアップロード、PRコメント化は追加検証が必要な運用領域として扱う。
- JSONやSARIFからPRコメントを作る場合、`excerpt` に機密らしい文字列や除外したはずの本文が見えたら転記せず、ツール側の不具合として扱う。

## GitHub Code Scanning へのアップロード手順

以下は、リポジトリ管理者がCode scanning設定とPR表示を確認するための手順である。2026-05-20時点のGitHub Docs例では `github/codeql-action/upload-sarif@v4` が使われている。既存ワークフローで `@v3` 固定が必要かは、リポジトリ側のActions互換性と合わせて確認する。

1. リポジトリの Settings > Code security and analysis で Code scanning が利用できる状態か確認する。
2. CIワークフローでSARIFを生成し、アップロード前に公開前検証を通す。

```yaml
name: nihongo-slopless-code-scanning

on:
  pull_request:
  push:
    branches: [main]

jobs:
  sarif:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      actions: read
      security-events: write
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Generate nihongo-slopless SARIF
        run: |
          node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --format sarif --pretty --fail-on off --collapse-occurrences --output nihongo-slopless.sarif
          node scripts/validate-sarif.mjs nihongo-slopless.sarif --for-publish
      - name: Upload SARIF to code scanning
        uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: nihongo-slopless.sarif
          category: nihongo-slopless/general
```

3. PRでCode scanning alertsと行アノテーションの表示を確認する。

確認待ち事項:

- working-tree相対パスの `artifactLocation.uri` で、対象Markdownのファイルと行へ正しくリンクされるか。
- PR上のアノテーションが変更行または近傍行に表示されるか。
- `nihongo-slopless/...` 形式のルールIDがCode scanning UIで読みやすく表示されるか。
- `level` の `error` / `warning` / `note` が、レビュー運用上強すぎない表示になるか。
- 現行SARIFには `partialFingerprints` が含まれないため、`upload-sarif` action側の補完で重複alertが安定するか。
- 複数profileを扱う場合、まずは1 profile 1 SARIF 1 `category` で表示を確認できるか。

既知の制約:

- `--absolute-paths` は使用しない。`file:` URIは `scripts/validate-sarif.mjs --for-publish` で拒否される。
- `.local/`, `reports/open-corpus/`, `private_corpus/` を指すSARIFは公開前検証で拒否される。
- 現行SARIFは `tool.driver.informationUri` と `results[].partialFingerprints` を出力しない。GitHub Actionsの `upload-sarif` actionは、SARIFと解析対象ソースが同じリポジトリにある場合にfingerprint補完を試みる。
- SARIFディレクトリをまとめてアップロードする運用は未確認である。まず単一SARIFファイルのアップロードから確認する。

参考:

- https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github
- https://docs.github.com/code-security/secure-coding/sarif-support-for-code-scanning
