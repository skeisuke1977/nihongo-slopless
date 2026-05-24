---
name: nihongo-slopless
description: 日本語Markdownや日本語テキストをレビューするときに使う。弱い主張、根拠不足、抽象的な締め、応答残骸、プレースホルダー、過度に整ったが中身の薄い文章を編集候補として確認する。AI生成判定、著者推定、採点、不正認定には使わない。
---

# nihongo-slopless Skill

このSkillは、日本語文書を公開前に点検するための補助である。指摘は編集候補であり、品質点やAI生成判定ではない。

## 使う場面

- Codexが日本語Markdownを作成または大幅に編集した後。
- README、docs、授業資料、研究メモ、公開告知、提案書などの文章を見直すとき。
- プレースホルダー、応答残骸、抽象的な総括、根拠不足の主張を確認したいとき。

## 使わない場面

- 執筆者がAIを使ったかどうかを判定したいとき。
- 学生や職員の不正を認定したいとき。
- 指摘数で文章を採点したいとき。
- 未確認の出典や数値をCodexに作らせたいとき。

## 基本コマンド

公開前またはローカル開発中は次を使う。

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile agent-output --format json --output .nihongo-slopless.json --fail-on off
```

npm公開後は、同じ用途で `npx` から実行できる。

```bash
npx -y nihongo-slopless@latest "docs/**/*.md" --profile agent-output --format json --output .nihongo-slopless.json --fail-on off
```

## 出力の扱い

1. `error` を先に確認する。
2. `warning` は重要なものを3から5件に絞って要約する。
3. `info` は必要な場合だけ扱う。
4. 指摘をすべて自動修正しない。
5. 修正する場合は、対象、条件、根拠、次の行動が明確になるようにする。
6. 出力の `excerpt` に機密らしい文字列が含まれていた場合は、PRコメントや要約に転記せず、ツール側の問題として報告する。

## 報告形式

最後に次を短く報告する。

- 実行したコマンド。
- 指摘の概要。
- 修正した箇所。
- 修正しなかった指摘と理由。
- 人間の確認が必要な箇所。
