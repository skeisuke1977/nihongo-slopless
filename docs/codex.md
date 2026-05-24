# Codex から使う

この文書は、Codex が日本語 Markdown を作成または大きく編集した後に、`nihongo-slopless` を編集補助として実行するための手順である。AI生成判定、著者推定、採点、不正認定のための手順ではない。

## 最小コマンド

公開前またはローカル開発中は、リポジトリ内のCLIを直接使う。

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile agent-output --pretty --fail-on off
```

npm公開後は、同じ用途で `npx` から実行できる。

```bash
npx -y nihongo-slopless@latest "docs/**/*.md" --profile agent-output --pretty --fail-on off
```

JSONをCodexに読ませる場合は、出力ファイルに保存する。

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile agent-output --format json --output .nihongo-slopless.json --fail-on off
```

Codexへの指示例:

```md
`.nihongo-slopless.json` を読み、重要な指摘を3から5件に要約してください。指摘数を品質点やAI生成判定として扱わないでください。修正する場合は、文体を均質化しすぎず、根拠、対象、条件、次の行動が明確になる箇所だけ直してください。
```

## SARIF

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile public --format sarif --output nihongo-slopless.sarif --fail-on off
node scripts/validate-sarif.mjs nihongo-slopless.sarif --for-publish
```

SARIFをCIやPR表示へ流す場合も、指摘数を採点、品質順位、著者や生成元の推定に使わない。保存前には、ローカル絶対パス、`.local/`、内部作業ファイル、除外済み本文が含まれていないかを確認する。

## profile選択

- `agent-output`: CodexやChatGPTが生成・編集した文章の応答残骸、未編集の痕跡、過度な総括を見たいとき。
- `general`: 一般的な日本語Markdown。
- `research`: 研究概要、報告書、論文メモ。
- `business`: 業務文書、提案書、議事録。
- `public`: 公開告知、行政・学校・組織向け文書。
- `technical`: 手順書、仕様書、開発ドキュメント。
- `minimal`: まずは軽く見る場合。
- `strict`: 公開直前に厳しく見る場合。

## Codexに任せてよいこと

- 指摘の要約。
- 明らかなプレースホルダーの修正。
- 根拠不足の主張に、出典確認用の確認メモを残す。
- 抽象的な締めに、対象、条件、次の確認事項を補う。
- 長すぎる文や段落を、意味を保って分割する。

## Codexに任せきらないこと

- 研究的主張や政策的主張の真偽判断。
- 未確認の数値、出典、固有名詞の生成。
- 学生や執筆者の意図の推定。
- 指摘の一括自動修正。
- 文体の個性を消す全面的な均質化。

最終判断は人間が行う。Codexは、指摘を編集候補として整理し、必要な箇所だけを狭く直す補助として使う。
