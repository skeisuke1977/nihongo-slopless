# 導入運用ガイド

このガイドは、`nihongo-slopless` を授業、組織レビュー、研究室、OSS文書、AIエージェント運用に入れるときの最小手順をまとめる。目的は、文章の弱い箇所を編集候補として出すことであり、AI利用の推定、著者判定、採点、処分の自動化ではない。

## 導入前に決めること

最初に、次の4点を短く決める。

| 項目 | 決める内容 |
|---|---|
| 対象 | Markdown文書、研究概要、授業資料、広報文など |
| 目的 | 根拠不足、未完成箇所、チャット応答残骸など、何を見たいか |
| profile | `minimal`, `general`, `research`, `agent-output` など |
| 判断者 | 指摘を修正するか残すかを誰が決めるか |

指摘数の少なさを品質保証にしたり、指摘数の多さを文章の悪さと即断したりしない。導入時は、レビュー負荷を測るための機械的な件数として扱う。

## 5分で試す

依存パッケージはない。Node.js 20以上で、まずサンプルと対象文書を確認する。

```bash
npm test
node bin/nihongo-slopless.mjs examples/sloppy.md --pretty
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile minimal --pretty --fail-on off
```

最初は `--fail-on off` を使い、指摘を見てもCIや作業を止めない。指摘の種類、件数、修正しない理由を確認してから、失敗条件を置く。

## profileの選び方

| profile | 推奨場面 |
|---|---|
| `minimal` | 初回導入。明確な未完成箇所や残骸を中心に見る |
| `general` | 一般的なMarkdown文書を広く見る |
| `business` | 企画書、報告書、稟議の責任・期限・根拠を見る |
| `technical` | 仕様書、手順書、マニュアルの条件不足を見る |
| `research` | 研究計画、概要、申請書の根拠・限定・新規性を見る |
| `public` | 行政、学校、公共文書の読み手判断可能性を見る |
| `web` | 記事、ブログ、広報文の薄い導入や締めを見る |
| `agent-output` | チャット応答残骸や未置換プレースホルダを強めに見る |
| `strict` | リリース前確認など、強めの品質確認に使う |

`agent-output` はAI利用を推定するprofileではない。応答残骸や未編集の兆候を強めに見る設定として扱う。

## ローカル運用

日常的な確認では、対象を絞ってpretty JSONを読む。

```bash
node bin/nihongo-slopless.mjs README.md --profile general --pretty
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile research --pretty --fail-on off
```

既存文書が多い場合は、レビュー負荷の上限として `--max-findings` を使う。

```bash
node bin/nihongo-slopless.mjs docs --profile general --fail-on off --max-findings 30 --pretty
```

`--max-findings` は、文章品質の点数ではない。移行時に「今読める件数」を制御するための条件として使う。

## 設定と例外

プロジェクトごとの調整は `.nihongo-slopless.json` または `nihongo-slopless.config.json` に書く。

```json
{
  "rules": {
    "nihongo-slopless/long-sentence": ["warning", { "maxChars": 120 }],
    "nihongo-slopless/buzzword-density": false
  },
  "ignoreFiles": [
    "docs/generated/**"
  ],
  "allowTerms": [
    {
      "term": "世界初",
      "rules": ["nihongo-slopless/citation-needed"],
      "reason": "本文中で出典付きの固有表現として使う"
    }
  ]
}
```

例外を置くときは、理由を残す。`allowTerms` は語句に起因する一部ルールだけを抑制する設定であり、全体の指摘を消す用途ではない。本文中の一時的な例外は、理由付きの無視コメントを使う。

```markdown
<!-- nihongo-slopless-ignore empty-conclusion: 悪い例として授業資料に残す -->
今後の発展が期待される。
```

詳しい形式は `docs/configuration.md` を参照する。

## CI運用

CIでは、最初からレビューを止めない。SARIFやJSONを保存し、差分確認に使う。

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --format sarif --pretty --fail-on off --output reports/nihongo-slopless.sarif
```

運用が安定してから、重要度や件数で失敗条件を置く。

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --fail-on error --pretty
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile general --fail-on off --max-findings 20 --pretty
```

GitHub ActionsとSARIF保存の最小例は `docs/ci-sarif.md` を参照する。GitHub code scanningへのアップロードは、リポジトリごとに追加検証してから採用する。

## npm公開前の梱包確認

npm公開前は、公開物の候補をローカルで確認する。

```powershell
npm pack --dry-run --json
```

内部開発設定、ローカル運用ログ、run記録、非公開validation、ローカルcorpus、生成済みreview bundle、開発用の `test/` と `validation/` はnpm公開物に含めない。`docs/` は公開利用に必要な文書だけを明示列挙する。公開資料から取得した本文、抽出Markdown、レビュー用JSONはローカル作業領域に置き、npm公開物へ入れない。

## 検証データを育てる

導入後は、誤検出、見逃し、保留、修正しない判断を `validation/goldset.example.jsonl` と同じ形式で記録する。公開できない実文書は、匿名化状態とアクセス範囲を分けて管理する。

```bash
node scripts/evaluate-corpus.mjs validation/goldset.example.jsonl --pretty
```

同じルールの件数や位置まで固定したい場合は、`expectedCounts` と `expectedFindings` を使う。詳細は `docs/validation-plan.md` を参照する。

## 導入チェックリスト

- `docs/ethical-use.md` を読み、AI判定や採点に使わない方針を共有した。
- 最初のprofileを1つ決めた。
- `--fail-on off` で既存文書の指摘傾向を確認した。
- 修正しない指摘の理由を残す方法を決めた。
- 必要な `rules`, `ignoreFiles`, `allowTerms` だけを設定した。
- CIでは最初にSARIFまたはJSON保存だけを行う。
- 誤検出と見逃しをgoldsetに足す担当を決めた。

`nihongo-slopless` は、文書を均質化するための道具ではない。指摘を読んだ人間が、修正するか、残すか、追加情報を求めるかを判断するための補助として運用する。
