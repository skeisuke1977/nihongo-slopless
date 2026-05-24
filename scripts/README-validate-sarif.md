# scripts/validate-sarif.mjs

`nihongo-slopless` が出力したSARIFを、GitHub code scanning等へ渡す前にローカルで確認するための補助スクリプトです。依存関係はNode 20+の組み込みモジュールのみです。

このスクリプトはSARIFを文章品質の採点には使いません。指摘件数の多い少ないを良し悪しとして扱わず、レビュー導線として必要な最低限のJSON構造だけを検査します。

## 検査する項目

- `version` が `2.1.0` であること
- `runs` が配列で、少なくとも1件あること
- 各runに `tool.driver.rules` があり、ルールdescriptorに `id` があること
- 各runに `results` 配列があること
- 各resultに `ruleId` と `message.text` があること
- 各resultに1件以上の `locations` があること
- 各locationに `physicalLocation.artifactLocation.uri` があること

`--for-publish` を付けた場合だけ、公開アーティファクト向けの安全確認として、`artifactLocation.uri` が次を指していないことも検査します。

- `file:` URI
- Windows絶対パス
- Unix絶対パス
- `.local/`, `reports/open-corpus/`, `private_corpus/`

## PowerShell例

```powershell
$sarifPath = Join-Path $env:TEMP "nihongo-slopless.sarif"
node .\bin\nihongo-slopless.mjs .\examples\sloppy.md --format sarif --pretty --fail-on off --output $sarifPath
node .\scripts\validate-sarif.mjs $sarifPath
```

公開前の確認:

```powershell
node .\scripts\validate-sarif.mjs $sarifPath --for-publish
```

相対URIのSARIFは公開前確認を通過します。`--absolute-paths` で生成したSARIFはローカル絶対パスを含むため、公開前確認では失敗します。

```powershell
$absoluteSarifPath = Join-Path $env:TEMP "nihongo-slopless.absolute.sarif"
node .\bin\nihongo-slopless.mjs .\examples\sloppy.md --format sarif --pretty --fail-on off --absolute-paths --output $absoluteSarifPath
node .\scripts\validate-sarif.mjs $absoluteSarifPath --for-publish
```

機械処理しやすいJSONで結果を見る場合:

```powershell
node .\scripts\validate-sarif.mjs $sarifPath --json --for-publish
```

## 終了コード

| 終了コード | 意味 |
|---:|---|
| `0` | SARIFの最低限の構造を満たす |
| `1` | JSONとしては読めたが、SARIF構造検査に失敗した |
| `2` | 引数、ファイル読み込み、JSON解析のエラー |

## 注意

- `results` が0件でも、構造が正しければ成功します。
- `results` 件数はレビュー対象の量を知るための情報であり、文章品質の点数ではありません。
- `--for-publish` は公開前安全確認であり、通常モードのローカル検証挙動は変えません。
- GitHub code scanning上での表示、重複統合、PR注釈の出方までは検査しません。
