# nihongo-slopless v0.1.0 公開ベータ

`nihongo-slopless` は、日本語Markdownや日本語テキストの弱い主張、根拠不足、抽象的な締め、応答残骸、未編集の痕跡を、決定論的な編集候補として返す散文リンターです。

AI生成判定器、著者推定器、採点器、不正認定器ではありません。

## 主な内容

- Node.js 20以上で動く依存なしCLI
- JSON / SARIF出力
- `general`, `business`, `technical`, `research`, `public`, `web`, `agent-output`, `minimal`, `strict` profile
- コード、HTMLコメント、front matter、inline code、disable範囲を外した安全な抜粋生成
- Codex向け `docs/codex.md`、`examples/AGENTS.md`、Skill例
- 自作seedによる回帰評価と公開前監査

## 使い方

```bash
npx -y nihongo-slopless@latest "docs/**/*.md" --profile general --pretty
```

## 注意

- 指摘数は品質点ではありません。
- `agent-output` はAI利用の推定ではありません。
- goldsetの評価値は自己作成seedに対する回帰確認であり、一般性能ではありません。
- globは簡易対応です。brace展開や文字クラスは対象外です。

## 謝辞

本プロジェクトは、英語Markdown向けの [Slopless](https://github.com/seochecks-ai/slopless) の「決定論的な散文リンター」という設計思想に影響を受け、日本語文書向けに独立実装したものです。

English summary: `nihongo-slopless` is a deterministic prose linter for Japanese text and Markdown; it is not an AI detector.

