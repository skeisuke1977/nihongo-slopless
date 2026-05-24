# audit-packaged-goldset.mjs

`validation/goldset.example.jsonl` を公開リポジトリ上の回帰seedとして扱ってよい公開属性か、ローカルで監査する補助スクリプトです。

このスクリプトは、権利可否の自動判定、外部取得、文章品質のスコア化、著者推定、AI生成判定を行いません。
同梱seedに本文を入れてよいかを人間が確認するため、`origin` と本文同梱リスクの兆候だけを機械的に確認します。

## 前提

- Node 20+
- 作業ディレクトリはリポジトリ直下
- 入力は JSONL 形式の goldset
- npm同梱seedの `origin` は `self-authored` または `rights-cleared`

## 使い方

### 1. 既定のgoldsetを監査する

```powershell
node scripts/audit-packaged-goldset.mjs
```

通常モードでは、後方互換のため `origin` 欠落だけではfailしません。
ただし、`sourceFile` / `note` / `notes` に `private_corpus`、`公開属性未確認`、`抜粋` など公開属性確認が必要な語がある場合は error にします。
`origin:"self-authored"` で `sourceFile` が `private_corpus/` を指す断片は、ローカル下書き由来が見えるよう warning にします。

### 2. origin必須で監査する

```powershell
node scripts/audit-packaged-goldset.mjs --strict-origin
```

`--strict-origin` では、全recordに `origin` が必要です。
同梱seedとして固定する前のゲートに使います。

### 3. ローカル下書き由来をfailさせる

```powershell
node scripts/audit-packaged-goldset.mjs --strict-local-source
```

`--strict-local-source` では、`origin:"self-authored"` で `sourceFile` が `private_corpus/` 配下を指すrecordを error にします。
配布前の厳しめの確認や、下書き由来断片を別seedへ移す判断に使います。

### 4. JSONで確認する

```powershell
node scripts/audit-packaged-goldset.mjs `
  --goldset validation/goldset.example.jsonl `
  --json
```

### 5. レポートファイルへ出力する

```powershell
node scripts/audit-packaged-goldset.mjs `
  --strict-origin `
  --output reports/dispatch/packaged-goldset-audit.report.md
```

## オプション

| オプション | 説明 |
|---|---|
| `--goldset <path>` | 入力goldset。既定は `validation/goldset.example.jsonl` |
| `--strict-origin` | 全recordで `origin` を必須にする |
| `--strict-local-source` | `self-authored` のローカル下書き由来断片を error にする |
| `--output <path>` | Markdownレポート出力先。省略時はファイル出力しない |
| `--json` | JSONを標準出力する |
| `--help` | 使い方を表示 |

## 判定の読み方

- `origin-missing`: 通常モードでは warning。後方互換のためfailしないが、同梱seedでは `origin` 追加を推奨する。
- `origin-required`: `--strict-origin` で `origin` がないrecord。
- `origin-missing-public-attribute-term`: `origin` がなく、`sourceFile` / `note` / `notes` に公開属性確認が必要な語があるrecord。
- `origin-not-packaged`: `origin` が `self-authored` / `rights-cleared` 以外のrecord。
- `external-public-body-included`: `external-public` で本文同梱相当のフィールドを持つrecord。
- `self-authored-local-source`: `origin:"self-authored"` だが `sourceFile` が `private_corpus/` を指すrecord。通常モードでは warning、`--strict-local-source` では error。

`external-public` の本文は、公開されていてもnpm同梱seedには入れません。
必要な場合は、本文を同梱せず、取得元や利用条件をmanifestで管理します。
`private_corpus/` 由来断片は第三者本文とは限らないため通常モードではfailさせませんが、配布seedにローカル下書き由来が残っている事実は監査結果に明示します。

## 注意

- `rights-cleared` は、人間が権利処理済みと確認した短いseedだけに使います。
- `origin` は生成元や著者の推定ラベルではありません。npm同梱可否を確認するための由来・権利処理属性です。
- 検出数を文章品質の点数やAI生成確率として扱わないでください。
