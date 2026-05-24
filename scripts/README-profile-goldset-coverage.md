# profile-goldset-coverage.mjs

`validation/*.jsonl` の profile別期待ラベルが、どの profile まで書かれているかを集計する補助スクリプトです。
対象は次の3フィールドです。

- `expectedByProfile`
- `expectedCountsByProfile`
- `expectedFindingsByProfile`

このスクリプトは lint 評価の合否、文章品質のスコア、著者推定、AI生成判定を行いません。
goldsetを次に増やすとき、どの profile の期待ラベルを見直す候補が多いかを見える化するための道具です。

## 前提

- Node 20+
- 作業ディレクトリはリポジトリ直下
- 入力は JSONL 形式の goldset

## 使い方

### 1. JSONで確認する

```powershell
node scripts/profile-goldset-coverage.mjs validation/goldset.example.jsonl --pretty
```

### 2. Markdownで確認する

```powershell
node scripts/profile-goldset-coverage.mjs `
  validation/goldset.example.jsonl `
  --markdown
```

### 3. レポートファイルへ出力する

```powershell
node scripts/profile-goldset-coverage.mjs `
  validation/goldset.example.jsonl `
  --markdown `
  --output reports/dispatch/profile-goldset-coverage.report.md
```

### 4. 優先確認するprofileを絞る

```powershell
node scripts/profile-goldset-coverage.mjs `
  validation/goldset.example.jsonl `
  --markdown `
  --priority-profiles minimal,general,technical,agent-output
```

`--priority-profiles` は、集計済みprofileのうち次に確認したいprofile不足だけを先頭の priority summary に出します。
既定では `minimal,general,technical,agent-output` を優先確認profileとして扱います。

## オプション

| オプション | 説明 |
|---|---|
| `--format <json|markdown>` | 出力形式。既定は `json` |
| `--markdown` | `--format markdown` の短縮形 |
| `--pretty` | JSONをインデントして出力 |
| `--output <path>` | 出力先ファイル。省略時は標準出力 |
| `--profiles <a,b>` | 集計対象profileをカンマ区切りで指定 |
| `--priority-profiles <a,b>` | priority summaryで優先確認するprofileをカンマ区切りで指定。`--profiles` の集計対象に含まれるprofileだけ指定可能 |
| `--details-limit <n>` | Markdownの詳細行数。既定20、0で省略 |
| `--help` | 使い方を表示 |

## 出力の読み方

- `recordsWithProfileField`: 対象フィールドを持つレコード数。
- `recordsWithFallbackOnly`: profile別フィールドはなく、`expectedRules` など従来フィールドだけを持つレコード数。
- `present`: その profile のキーが書かれている件数。
- `missing`: 対象フィールドはあるが、その profile のキーがない件数。
- `non-empty`: 空でない期待ラベルが書かれている件数。
- `empty`: `[]` または `{}` として、明示的に期待なしが書かれている件数。
- `自record profileキー不足`: レコード自身の `profile` に対応するキーが対象フィールドにない件数。
- `prioritySummary`: 優先確認profileごとの不足数と、次に確認しやすい候補record。JSONでは既存フィールドを残したまま追加される。

`missing` は機械的な不足候補です。すべてを埋めるべきという意味ではありません。
境界例では、比較したい profile だけを意図的に書くことがあります。追加するかどうかは、対象レコードの目的、profile差分、既存 fallback の有無を人間が確認して決めます。

## 注意

- このスクリプトは `scripts/evaluate-corpus.mjs` の評価結果を変えません。
- coverage は期待ラベル記述の網羅状況であり、ルール精度や文章品質のスコアではありません。
- profile は文書用途に応じた設定であり、著者や生成元を推定するラベルではありません。
