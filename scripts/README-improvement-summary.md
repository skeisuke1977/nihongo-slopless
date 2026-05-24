# improvement-summary.mjs

`nihongo-slopless` の lint JSON を旧/新で比較し、改善・退行の差分を Markdown レポートにまとめるスクリプト。

ルール改修やプロファイル変更、`bin/nihongo-slopless.mjs` のロジック修正の前後で「どのファイルのどの行のどのルールが減ったか／増えたか」を追跡することを目的とする。

## 前提

- Node.js 18+ (本リポジトリは v22 で確認済)。
- 旧/新の入力 JSON は `bin/nihongo-slopless.mjs ... --pretty` 形式 (`files[].messages[]` を持つ payload)。
- `--regen-new` モードでは `bin/nihongo-slopless.mjs` を `spawnSync` で呼ぶため、リポジトリルートから実行することを推奨する。

## 使い方

### 1. 既存 JSON 同士を比較する

```powershell
conda activate sci
node scripts/improvement-summary.mjs `
  --old reports/private_corpus_lint_latest.json `
  --new reports/private_corpus_lint_after.json `
  --output reports/improvement-summary.md
```

### 2. 新スナップショットをその場で再生成して比較する

```powershell
conda activate sci
node scripts/improvement-summary.mjs `
  --old reports/private_corpus_lint_latest.json `
  --regen-new private_corpus --profile general `
  --output reports/improvement-summary.md
```

- `--regen-new <target>` を指定すると、`node bin/nihongo-slopless.mjs <target> --profile <name> --fail-on off --pretty --output <path>` を `spawnSync` で実行する。
- 既定の出力先は `reports/<targetBase>_lint_after.json` で、明示したい場合は `--regen-output <path>` を渡す。

### 3. その他のオプション

| オプション | 役割 |
|---|---|
| `--top <count>` | "消えた指摘 / 新規発生した指摘" のトップ件数 (既定: 20)。 |
| `--profile-strict` | 旧/新 JSON の `profile` フィールドが一致しないとエラーにする。現状の JSON には profile が記録されていないため、将来用フック。 |
| `--output <path>` | Markdown 出力先。省略時は標準出力。 |

## 比較キーの設計

同一指摘の判定キーは `file:line:column:ruleId` を採用している。

- `index` / `length` はマークダウンの空行や改行差で揺れやすいので含めない。
- `severity` も改修によって動くため含めない (severity 推移は重要度別テーブルで別途レポート)。
- 同じ位置に同一ルールが2件以上検出されることもあるため、集合差ではなく**多重集合差**で扱う。
  - 旧 2 件・新 1 件 → "消えた" 1 件、"新規" 0 件
  - 旧 0 件・新 1 件 → "消えた" 0 件、"新規" 1 件

## 出力レイアウト

1. **ヘッダ**: 生成日時、旧/新 JSON のパス、対象ファイル数、指摘総数の差分。
2. **ハイライト**: 消えた件数・新規件数のサマリ。
3. **差分サマリ表 (ルール別)**: 旧 → 新 件数、新−旧 差分。改善幅の大きい順に並ぶ。
4. **消えた指摘トップN**: severity 降順 → file:line で並べる。
5. **新規発生した指摘トップN**: 同じ並び方で退行候補を抽出。
6. **重要度別の推移**: info/warning/error の旧/新/差分。
7. **ファイル別の前後件数**: 全対象ファイルを a→z 順で並べ、改善・退行・変化なしを表示。
8. **対象ファイル集合の差**: 旧側にしかない／新側にしかないファイル一覧。

## 同一 JSON を渡した時の挙動

`--old` と `--new` に同じ JSON を渡すと、すべての差分が 0 になることをユニット的に確認できる。スクリプトの動作確認に使える。

```powershell
node scripts/improvement-summary.mjs `
  --old reports/private_corpus_lint_latest.json `
  --new reports/private_corpus_lint_latest.json
```

## 既知の制約

- `bin/nihongo-slopless.mjs` の JSON 出力には profile 情報が残っていないため、`--profile-strict` は将来 payload に profile を持たせる前提の予約フックである。現状は profile が一致しないことを警告として表示する経路だけ用意してある。
- マークダウン表のセルはパイプ・改行を自動エスケープし、`excerpt` は 60 字で切り詰めるため、大量差分でも表構造は保たれる。
- `bin/nihongo-slopless.mjs` 実行が失敗した場合 (`exit 2`) はスクリプトもエラー終了する。
