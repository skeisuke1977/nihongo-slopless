# Release Checklist

公開前に、メンテナが次を確認する。

- `package.json` の `repository`, `bugs`, `homepage` が実在する公開先URLを指していることを確認する。
- npm公開アカウント、二要素認証、公開タグ、リリースノートを確認する。
- npm公開時は `v0.1.0` tag、GitHub Release、`RELEASE_NOTES.md`、npm version、READMEのnpm公開後導線が同じ状態を指していることを確認する。
- `ACKNOWLEDGEMENTS.md` とREADMEの謝辞が、影響関係を過不足なく説明していることを確認する。
- `SECURITY.md` があり、秘密情報を公開ログ、SARIF、Issueへ貼らない運用を説明していることを確認する。
- 公開用 `docs/` に、過去の作業指示書、内部レビュー記録、未整理の検討メモが残っていないことを確認する。
- `npm test`、`npm run evaluate`、SARIF検証、`npm pack --dry-run --json` を実行する。
- `npm pack --dry-run --json` で、内部開発ログ、ローカル検証データ、第三者本文、非公開manifestが含まれていないことを確認する。
- READMEからリンクしているdocsとexamplesが、公開パッケージ内に存在することを確認する。
- `nihongo-slopless` をAI生成判定、著者推定、採点、不正認定の道具として説明していないことを確認する。
