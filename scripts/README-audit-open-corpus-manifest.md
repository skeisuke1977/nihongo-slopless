# scripts/audit-open-corpus-manifest.mjs

公開コーパスmanifestをローカルで監査するスクリプトです。検索、外部取得、本文抽出、ライセンス可否の自動判定は行いません。目的は、第三者本文を `validation/` やnpm公開物に混ぜないこと、また `profile` と `genre` の混同を早めに見つけることです。

## 前提

- Node 20+
- 作業ディレクトリはリポジトリ直下
- PowerShellで実行する
- 監査対象はJSONL manifestのみ

## 基本的な使い方

```powershell
node scripts/audit-open-corpus-manifest.mjs
```

manifestを明示する場合:

```powershell
node scripts/audit-open-corpus-manifest.mjs `
  --manifest validation/open-corpus-manifest.example.jsonl
```

Markdownレポートを残す場合:

```powershell
node scripts/audit-open-corpus-manifest.mjs `
  --manifest validation/open-corpus-manifest.example.jsonl `
  --output reports/dispatch/open-corpus-manifest-audit.report.md
```

機械的に読み直したい場合はJSONを標準出力できます。

```powershell
node scripts/audit-open-corpus-manifest.mjs `
  --manifest validation/open-corpus-manifest.example.jsonl `
  --json
```

## 主な検証

| 項目 | 判定 |
|---|---|
| 必須フィールド | 欠落、空文字、型違いをエラーにする |
| `profile` | `src/profiles.mjs` の実在profile名に限る |
| `external-public` | `includeText`、`repositoryIncluded`、`packageIncluded` はすべて `false` 必須 |
| 本文らしいフィールド | `text`、`body`、`content`、`excerpt` などを `external-public` のトップレベルまたは入れ子のobject/arrayに含めたらエラー |
| `termsCheckedAt` | `YYYY-MM-DD`、`TBD-before-fetch`、`self-authored` の `not-applicable` のみ許可 |
| `reviewFocus` | 空でない文字列配列を要求する |
| `profile` / `genre` | 同一値や既存profile名のgenre流用を警告する |

`TBD-before-fetch` は暫定値として形式上は許可しますが、実取得前に人間が利用条件を確認し、`YYYY-MM-DD` に更新する必要があります。

## 終了コード

- エラーが0件なら終了コード0
- エラーが1件以上なら終了コード1
- 警告のみの場合は終了コード0

警告は運用上の確認対象です。例えば `profile=technical`、`genre=technical` は即時失敗にはしませんが、`profile` は実行設定、`genre` は文書種別として分けるべきかを確認してください。

本文らしいフィールドの検出メッセージには `metadata.excerpt` や `samples[0].text` のようなmanifest内pathを出します。`notes` や `purpose` は通常の説明欄として扱い、本文混入検出の対象にはしません。
