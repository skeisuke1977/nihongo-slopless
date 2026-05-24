# benchmark.mjs

`nihongo-slopless` 改良前後の対比を取りやすくするためのベンチマークスクリプトです。
複数コーパス × 複数 profile を一括 lint し、構造化 JSON と人間可読の Markdown を
`reports/bench/` 配下に出力します。

## 使い方

```powershell
conda activate sci

# 単一プロファイル (既定 general)
node scripts/benchmark.mjs --label baseline

# 9 プロファイル全部
node scripts/benchmark.mjs --label initial --all-profiles

# 改良後にベースラインと比較
node scripts/benchmark.mjs --label after-A3 --baseline reports/bench/baseline.json
```

`git` は使わないため、計測対象のソースは作業ディレクトリの現状そのままです。
他エージェントが `src/rules/*.mjs` を改修中でも、本スクリプトは「実行時点の状態」を
測定して JSON にスナップショットを残します。改良前後で `--label` を変えて 2 回
走らせれば `--baseline` で差分が取れます。

## 既定コーパス

| 名前 | 入力 |
|---|---|
| `private_corpus` | `private_corpus/*.md` (約 35 ファイル) |
| `docs` | `docs/*.md` (約 8 ファイル) |
| `examples` | `examples/*.md` (約 2 ファイル) |
| `top-level` | `README.md`, `ROADMAP.md`, `VISION.md`, `AGENTS.md`, `HANDOFF.md` |

合計 50 前後のファイルを 9 profile × 21 rule で lint しても、全 profile 通しで
2 秒以下で完了します (Node.js v22, Windows)。

## オプション

| オプション | 説明 |
|---|---|
| `--label <name>` | 出力ファイル名のラベル (必須) |
| `--profile <name>` | 単一プロファイル。既定 `general` |
| `--all-profiles` | 9 プロファイル全部で実行 |
| `--baseline <jsonPath>` | ベースライン JSON との差分 Markdown を生成 |
| `--out-dir <path>` | 出力先ディレクトリ。既定 `reports/bench/` |

## 出力

実行ごとに以下の 2 ファイルが生成されます。

- `reports/bench/<label>.json`  
  構造化結果。
  - `tool`, `version`, `label`, `generatedAt`, `nodeVersion`, `totalRules`
  - `corpora[]` (各コーパスの入力パターンと検出ファイル一覧)
  - `profiles[]`
    - `profile`, `totals { files, findings, elapsedMs }`
    - `corpora[]` (各コーパスの `summarizeResults` 結果)

- `reports/bench/<label>.md`  
  人間可読サマリ。
  - 概要 (生成日時、Node 版、対象ファイル数)
  - コーパス一覧表
  - profile 毎の「コーパス別」「ルール別 (全コーパス合算)」テーブル

`--baseline` を指定すると、`reports/bench/<label>-diff.md` も出力されます。
profile 毎にルール件数の増減のみを抽出した差分テーブルが入ります。

## 注意

- ファイル拡張子は `.md` `.markdown` `.txt` を拾います。
- glob 展開はリポジトリルートからの相対パターンで指定してください
  (例 `private_corpus/*.md`)。
- 計測時間はベンチ専用の参考値で、I/O やプロセス起動を含みません
  (`lintText` の合計のみ)。
