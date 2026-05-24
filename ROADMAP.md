# 日本語Slopless ロードマップ

このロードマップは、日本語Sloplessを「教育用の実験ツール」ではなく、教育、研究、企業、行政、OSS、AIエージェント運用で使える日本語文章品質リンターへ育てるための実行計画です。

目的は、ルール数を増やすことではありません。
目的は、編集に役立つ指摘を、説明可能で、調整可能で、検証可能な形で届けることです。

---

## 現在地

### 現時点の位置づけ

v0.1.0の最小実行可能版から、v0.2.0からv0.4.0相当の基盤整備はおおむね実装済みです。さらに、v0.6.0の設定・無視コメント・許可語・ファイル除外の大部分と、v0.7.0のSARIF基本出力も先行して入っています。

この文書のマイルストーン節には当初計画を残しています。過去に完了した項目、未対応項目、将来構想が混ざって見えないよう、まずこの現在地節を優先して参照してください。

すでに備えているもの:

- Node.js 20以上で動くCLI
- Markdownと標準入力への対応
- JSON出力
- SARIF 2.1.0の基本出力
- 依存なしの決定論的ルール
- 26個のルール
- ルールごとのメタデータ
- `--rules` によるルール情報出力
- 設定ファイル
- 9種の用途別プロファイル
- サンプル文書
- `test/cases/*.cases.mjs` の自動ロードによる陽性・陰性ケースの一括検証
- 公開同梱208件、ローカル検証用36件のseed goldset
- ルール別、profile別、同一ルール件数別、件数profile別、指摘位置別の評価集計
- `expectedByProfile` によるprofile別期待ラベル
- `expectedCounts` / `expectedCountsByProfile` と `countProfiles` による重複指摘の件数評価
- `expectedFindings` / `expectedFindingsByProfile` と `findingSummary` による指摘位置・抜粋レベルの評価
- 同一行近接 finding の `occurrences[]` 折りたたみ
- `scripts/lint-report.mjs` によるMarkdownレポート整形
- `scripts/benchmark.mjs` による複数profile一括計測
- `scripts/improvement-summary.mjs` による改良前後の差分計測
- `scripts/profile-matrix.mjs` と `docs/profiles-matrix.md` による profile × rule 設定差分監査
- 無視コメント
- 1行スコープの無視コメント
- 設定ファイル用JSON Schema
- ファイル除外と許可語設定
- 現行設定仕様と本文行除外仕様の文書
- 倫理的利用方針
- 導入運用ガイド
- 試作 `adapters/textlint/` による 12 ルールの textlint 移植プロトタイプ(root package外、private/prototype)
- 誤検出パターンと無視コメント判断基準を整理した `docs/troubleshooting.md`
- 公開CLIは文章 lint 機能に限定。Codex運用文書、`skills/codex/`、`install-skill codex` は公開面に含めない

直近で改善したもの:

- Markdownの見出し、表、箇条書き、引用の構造境界を文・段落分割に反映した。
- `long-sentence` と `long-paragraph` がMarkdown構造をまたいで過剰検出されるケースを抑えた。
- `same-ending` が見出し、空行、表、罫線、コードフェンスなどの節境界をまたいで文末連続を数えないようにした。
- `same-ending` の節境界判定を、ルール内の正規表現判定から `doc` 側の構造メタデータへ寄せた。
- 同じ連続リスト内の項目は、均質な箇条書きとして `same-ending` の検出対象に残した。
- `same-ending` の文言を「単調さ」よりも観察語に近い「読みのリズム」へ寄せた。
- 評価スクリプトに `expectedCounts` / `expectedCountsByProfile` と `countProfiles` を追加し、同一ルールの重複指摘の過剰分と不足分をprofile別にも評価できるようにした。
- `weasel-phrases` の文言を「ぼかし」の断定から、主体、根拠、条件を確認する観察語へ寄せた。
- `empty-conclusion` と `excessive-politeness` の文言と説明を、さらに観察語寄りに調整した。
- README、docs、ROADMAP由来の実文書抜粋を、ルール境界例とprofile差分例としてseed goldsetに追加した。
- `nihongo-slopless-disable-next-line`、`textlint-disable-next-line`、理由付き `nihongo-slopless-ignore` を追加し、コードフェンス内の制御コメントは本文への無視指定として扱わないようにした。
- `--format sarif` によるSARIF 2.1.0基本出力を追加した。
- `--max-findings` による件数しきい値と、`--output` によるJSON/SARIF保存を追加した。
- `expectedFindings` / `expectedFindingsByProfile` を追加し、同一ルール内の指摘位置と抜粋のずれを評価できるようにした。
- `absolute-claim` の否定文脈と仕様説明の境界を絞り、説明可能な過剰検出を減らした。
- `allowTerms` を実装し、理由付きで特定語句に起因する一部ルールの指摘を抑制できるようにした。
- `config/schema.json` と `docs/configuration.md` を更新し、現行設定形式と本文除外予定仕様を分けて文書化した。
- `docs/adoption-guide.md` を追加し、導入時のprofile選択、例外運用、CI前の確認手順を整理した。
- `scripts/fetch-open-corpus.mjs` に HTML/Markdown/text の最小ローカル抽出、GitHubリポジトリトップの抽出スキップ、外部公開資料の `validation/` 出力拒否を追加した。
- 既存 goldset の不一致を整理し、当時203件の seed goldset の集合・件数・位置評価に不一致がない状態にした。
- `absolute-claim` を引用ブロック、見出し、量的単位(100%負担など)、ヘッジ副詞(ほぼ必ず)、自己言及メタ言及で抑制し、private_corpus 43件→25件にした
- `thin-sentence` を箇条書き先頭の主体宣言、譲歩接続辞、具体名詞密度スコア、引用句内述語で抑制し、private_corpus 22件→2件にした
- `placeholder` の「ここに」を動詞要求パターン限定にし、private_corpus 10件→1件にした
- `excessive-parentheses` を略号展開や英訳補足の glossary 括弧と実質補足の二段階閾値で抑制し、private_corpus 6件→0件にした
- `long-sentence` `long-paragraph` でインラインリンクの URL 長を visibleLength から除外した
- `weasel-phrases` `citation-needed` を同段落・隣接文の出典マーカーで抑制した
- `repeated-connectors` を見出し・水平線・コードフェンス境界でカウントカットするよう拡張した
- 新ルール 5 本(`unscoped-generalization`, `no-numerics-claim`, `deadline-missing`, `over-possibility`, `unclear-deictic`)を追加し、9 profile に配分した
- 同一行近接 finding を `--collapse-occurrences` で `occurrences[]` に折りたたみ、SARIF にも適用した
- `scripts/lint-report.mjs` で JSON→Markdown 整形レポート、`scripts/benchmark.mjs` で複数 profile 一括計測、`scripts/improvement-summary.mjs` で改良前後の差分、`scripts/profile-matrix.mjs` で 9 profile × 26 rule の設定差分監査を追加した
- `adapters/textlint/` で当時3ルールの textlint 移植プロトタイプを設置した
- `test/cases/*.cases.mjs` を `test/run-tests.mjs` が自動ロードするハーネスを追加した
- `docs/troubleshooting.md` を新設し、`docs/rules.md` 全 21 既存ルールに「誤検出になりやすい例」セクションを追加した
- `validation/goldset.example.jsonl` を 147→203 件に拡充した
- ルール総数 21→26、private_corpus の `general` profile 既存ルール検出 125件→55件(56%削減)を確認した

2026-05-20 の改善:

- `absolute-claim` を引用ブロック・見出し・量的単位・ヘッジ語・自己言及メタ言及で抑制した。
- `thin-sentence` を箇条書き先頭主体宣言・譲歩接続辞・具体名詞密度・引用句内述語で抑制した。
- `placeholder` の「ここに」を動詞要求パターンと存在動詞除外で構造的判定に置き換えた。
- `excessive-parentheses` を略号展開・英訳補足・列挙ラベルなど glossary 括弧の二段階閾値で抑制した。
- `long-sentence` と `long-paragraph` でインラインリンクの URL 長を `visibleLength` から除外した。
- `weasel-phrases` と `citation-needed` を同段落・隣接文の出典マーカーで抑制した。
- `repeated-connectors` を見出し・水平線・コードフェンス境界でカウントカットするよう拡張した。
- 新ルール 5 本(`unscoped-generalization`, `no-numerics-claim`, `deadline-missing`, `over-possibility`, `unclear-deictic`)を追加し、9 profile に配分した。
- 同一行近接 finding を `--collapse-occurrences` で `occurrences[]` に折りたたみ、SARIF にも適用した。
- `scripts/lint-report.mjs` でJSON→Markdown 整形レポートを生成可能にした。
- `scripts/benchmark.mjs` で複数profileを一括計測する基盤を追加した。
- `scripts/improvement-summary.mjs` で改良前後の差分計測を可能にした。
- `scripts/profile-matrix.mjs` と `docs/profiles-matrix.md` で 9 profile × 26 rule の設定差分監査を可能にした。
- 試作 `adapters/textlint/` で当時3ルールの textlint 移植プロトタイプを設置した。
- `test/cases/*.cases.mjs` を `test/run-tests.mjs` が自動ロードするハーネスを追加した。
- `docs/troubleshooting.md` を新設し、private_corpus 観測由来の誤検出パターンと無視コメント判断基準を整理した。
- `docs/rules.md` の全 21 既存ルール + 5 新ルールに「誤検出になりやすい例」セクションを追加した。
- `validation/goldset.example.jsonl` を 147→203 件に拡充(private_corpus 由来 56 件)した。

まだ不足しているもの:

- 実文書に基づくgoldsetのさらなる蓄積
- 誤検出、見逃し、保留の体系的な分析
- 同一ルールの件数評価と指摘位置評価に使う実文書由来の境界例
- textlint adapterをuser-facing packageにするかどうかの別判断。現状は12ルールのprivate/prototypeで、root packageの公開面には含めない。
- エディタ連携(VS Code、MCP)の試作
- ルール改善の運用手順の実例
- 本文パターン除外の実装
- GitHub ActionsなどCI連携の実行検証
- GitHub code scanning上でのSARIF表示とPR注釈の追加検証

現状は完成品ではなく、検証可能な足場です。seed goldset上の高い評価値は、実文書での品質保証ではありません。

---

## 全体方針(2026-05-20 改定後)

### 0. 本丸は「個人 + Claude Code/Codex で自己進化する手元CLI」

`VISION.md` の改定に伴い、本プロジェクトの本丸を「個人開発者が自分自身で育てながら日常的に使えるリンター」に絞ります。公開先と公開タイミングは保留し、npm publish や VS Code 拡張、MCP サーバ、GitHub Actions テンプレ配布は要件外とします。

具体的に「要件外」として整理したもの:

- VS Code 拡張、JetBrains プラグイン等のエディタ拡張(本リポジトリでは配布しない)
- MCP サーバ
- GitHub Actions サンプル workflow の配布(SARIF 出力機能は残すが、ワークフローテンプレ提供はしない)
- 組織向けダッシュボード、ダッシュボード型可視化
- 多言語展開
- HTML/PDF/Word からの汎用抽出パイプライン
- textlint プリセットとしての正式配布(`adapters/textlint/` は試作のまま、必須機能化しない)

### 1. ルールを増やす前に、評価の型を作る

リンターは、ルールが増えるほど便利になるとは限りません。検出が多すぎると、書き手は指摘を読まなくなります。

まず、どの指摘が編集行動につながったのか、どの指摘が邪魔だったのかを測る仕組みを作ります。「ルール数 40〜60」は目安であり目標値ではありません。本丸は「sato 個人が常時活用したときに編集行動につながる指摘になっているか」で測ります。

### 2. 用途別プロファイルで広げる

単一の厳格なルールセットでは、用途が広がりません。

研究文書、ビジネス文書、行政文書、技術文書、ブログ、AIエージェント出力では、必要な厳しさが異なります。したがって、プロファイル設計を早い段階で導入します。

### 3. Claude Code / Codex オーケストラモードで小さく改善する

一度に大改造しません。

一つの作業では、一つのルール、一つの評価軸、一つのプロファイルを扱うことを基本にします。変更後は必ずテストと評価を通します。

P1〜P4 で確立したオーケストラモード(Claude オーケストレータ + Codex 並列、最大6体、ファイル所有権分離による衝突回避)を、開発の標準形とします。`HANDOFF.md` / `AGENTS.md` / `.local/agent-<id>-*.md` / `reports/dispatch/` / `04_runs/` の規約が、自己進化サイクルそのものです。

### 4. 既存ツールと競合せず、補完する

日本語Sloplessは、誤字脱字検出、表記統一、技術文書校正をすべて自前で担う必要はありません。

既存のtextlint、prh、RedPenなどと併用できるようにし、日本語Sloplessは主に次を担当します。

- 意味密度
- 根拠不足
- 責任のぼかし
- 文体の空転
- AIエージェント出力の残骸
- 編集不足の兆候

ただし、textlint プリセットとしての正式配布は **行いません**。`adapters/textlint/` は実装可能性の試作として残し、利用者がローカルで併用したい場合の参考実装に留めます。

### 5. ドッグフード

`HANDOFF.md`、`VISION.md`、`ROADMAP.md`、`README.md` 等のプロジェクト内ドキュメントを、`nihongo-slopless` 自身で lint することを推奨します。`npm run lint:docs` で実行できます。これにより、リンターの実用性と、リンターを育てる活動が同じループに乗ります。

---

## マイルストーン

以下は設計履歴を含むロードマップです。v0.2からv0.4の多くはすでに実装済みで、v0.6とv0.7の一部も先行実装されています。次に注力するのは、公開資料を固定した検証ループ、実文書由来goldset、誤検出・見逃し・保留の記録、CI/SARIF運用の検証、Codex運用テンプレートの定着です。

## v0.2.0 ビジョンとルールメタデータの整備

### 目的

プロジェクトの思想を固定し、ルールを単なる正規表現の集合から、説明可能な品質ルールへ引き上げます。

### 追加するもの

- `VISION.md`
- `ROADMAP.md`
- ルールメタデータ形式
- ルール一覧の再編
- 倫理的利用方針
- 無視コメントの設計方針

### ルールメタデータ例

```json
{
  "id": "nihongo-slopless/abstract-noun-stack",
  "category": "semantic-density",
  "severity": "warning",
  "goal": "抽象語が密集し、対象や行動が見えにくい文を検出する",
  "notGoal": "哲学的、文学的、理論的な抽象表現を否定することではない",
  "fixHint": "対象、数値、事例、条件、行動のいずれかを補う",
  "profiles": ["general", "business", "research", "agent-output"]
}
```

### 完了条件

- すべての既存ルールにメタデータがある
- `docs/rules.md` がメタデータに基づいて整理されている
- ルールメッセージが攻撃的でない
- 「AI判定に使わない」方針が明文化されている
- `npm test` が通る

---

## v0.3.0 goldsetと評価基盤

### 目的

ルール改善を感覚ではなく、検証に基づいて進めるための基盤を作ります。

### 追加するもの

- 実文書ベースのgoldset
- goldset作成ガイド
- 評価指標
- 誤検出、見逃し、保留の分類
- ルール別評価レポート

### goldsetの構成

最初の目標は100件です。

| 群 | 件数目安 | 内容 |
|---|---:|---|
| 良い人間文 | 20 | 指摘されすぎないことを確認する |
| 弱い人間文 | 20 | AI由来でない文章の弱さを拾う |
| AI未編集文 | 20 | 応答残骸、空疎な総括、抽象語密度を見る |
| AI編集済み文 | 20 | 良く編集された文章を過剰に責めない |
| 領域別文書 | 20 | 研究、企業、行政、技術、広報を含める |

### ラベル方針

ラベルは「AIっぽい」ではなく、編集観点で付けます。

```json
{
  "id": "business-001",
  "profile": "business",
  "text": "今後、関係部署と連携しながら総合的に検討していく必要がある。",
  "expected": [
    "nihongo-slopless/weasel-phrases",
    "nihongo-slopless/thin-sentence"
  ],
  "note": "主体、期限、判断基準が見えない"
}
```

### 評価指標

- ルール別の適合率
- ルール別の再現率
- 指摘の有用性
- 指摘の説明可能性
- 修正可能性
- プロファイル別の誤検出率

### 完了条件

- 100件以上のgoldsetがある
- 評価スクリプトがルール別の結果を出す
- 誤検出と見逃しの代表例が文書化されている
- Codexが評価結果を読んでルール改善できる
- `npm test` と `npm run evaluate` が通る

---

## v0.3.1 公開コーパス検証ループ

### 目的

seed goldsetだけで品質を判断せず、公開資料を固定した小さなコーパスで、実文書に対する過剰検出、見逃し、保留を観察します。実務手順は `docs/open-corpus-loop.md` に、manifest例は `validation/open-corpus-manifest.example.jsonl` に置きます。

このフェーズの目的は、検索エンジンのように公開Webを広く探して順位付けすることではありません。出典を明示できる既存文書をmanifestで固定し、同じ入力に同じ評価を返す検証ループを作ることです。

### 対象資料の配分

最初の目標は100件前後です。ただし、件数達成よりも、利用条件、ジャンル分布、profile、レビュー判断の質を優先します。まず10〜30件の種まき検証で運用を確認し、その後に90〜110件程度の固定コーパスへ広げます。

| 群 | 件数目安 | 主なprofile | 目的 |
|---|---:|---|---|
| 行政・学校・公共案内 | 20 | `public` | 責任、期限、対象、読み手の行動が見えるかを確認する |
| 研究・大学・助成関連 | 20 | `research` | 根拠、限定、新規性、評価指標への過剰検出を確認する |
| 企業・団体の告知、規程、採用文 | 20 | `business` / `web` | 抽象語、主体不明、空疎な総括の検出妥当性を見る |
| OSS、技術文書、README | 20 | `technical` | 手順、条件、Markdown構造、コード周辺の誤検出を確認する |
| 広報、利用ガイド、説明記事 | 20 | `general` / `web` | 読みやすさと個性を過剰に均質化しないかを見る |

### manifest

公開資料は `validation/open-corpus-manifest.example.jsonl` の形式を基準に、manifestで固定します。各行に少なくとも次を持たせます。`profile` は `minimal`、`general`、`business`、`technical`、`research`、`public`、`web`、`agent-output`、`strict` のような実在profile名にします。ジャンル名は `genre` に分けます。

- `id`: 安定した資料ID
- `origin`: `external-public` または `self-authored`
- `sourceName`: 人間が読む取得元名
- `sourceUrl`: 取得元URL
- `license`: 利用条件、引用範囲、再配布可否の短いメモ
- `termsCheckedAt`: 利用条件を確認した日付
- `purpose`: 検証に使う理由
- `validationRole`: `false-positive-observation`、`false-negative-observation`、`markdown-boundary` など
- `storagePolicy`: 本文保存方針
- `includeText`: 本文を同梱するか
- `repositoryIncluded` / `packageIncluded`: リポジトリやnpm公開物に含めるか
- `profile`: 既定評価profile
- `genre`: 文書ジャンル
- `reviewFocus`: 主な観察観点
- `notes`: 第三者著作物、図版、引用、ShareAlikeなどの注意

manifestにないURLは検証対象にしません。ログイン、個人投稿、会員限定、削除依頼があり得る資料は初期対象から外します。

### fetch script

`scripts/fetch-open-corpus.mjs` は、manifestを唯一の入力にします。

- manifestのURLだけを取得する
- 第三者本文は `.local/open-corpus/<run-id>/raw/` と `.local/open-corpus/<run-id>/extracted/` に保存し、`validation/` へ自動コピーしない
- `includeText: true` かつ自作または権利確認済みの資料だけを、明示的な判断でseed化する
- HTML、Markdown、プレーンテキストの抽出結果に `sourceUrl`、`profile`、`sha256`、`storagePolicy` を残す。PDFなど未対応形式は抽出せず、失敗理由またはスキップ理由を記録する
- 取得済み資料はハッシュ差分を表示し、暗黙に上書きしない
- ネットワーク失敗、文字化け、本文抽出失敗をskipではなく失敗理由として記録する

### lint report

公開コーパスに対して、profile別のlint結果と、人間が読むMarkdownレポートを残します。

```bash
node bin/nihongo-slopless.mjs ".local/open-corpus/<run-id>/extracted/**/*.md" --profile public --pretty --fail-on off --output reports/open-corpus/<run-id>/before.public.json
node scripts/lint-report.mjs reports/open-corpus/<run-id>/before.public.json --output reports/open-corpus/<run-id>/before.public.md
```

レポートには、資料ID、profile、rule、抜粋、行番号、同一資料内の指摘数を含めます。指摘が多い資料を「悪い資料」と扱わず、どのルールが編集行動に結びつくかを見るための観察材料にします。

### Codex review

Codex reviewでは、lint reportを検索結果として扱いません。固定コーパスに対する観察記録として読み、`docs/validation-plan.md` と同じ `review.status` 語彙で分類します。

- `TP`: 編集候補として有用
- `FP`: 文脈上は修正不要または過剰
- `FN`: 人間は気になるが検出されなかった
- `boundary`: profile、閾値、用途で判断が分かれる
- `defer`: 判断材料が足りない
- `keep`: 指摘は妥当だが、引用、定義、教育例などの理由で残す

review結果は、資料ID、rule、抜粋、判断、理由、修正候補を短く残します。人格、著者、AI利用の推定は書きません。

### 1ルール改定と再評価

1回のループでは、原則として1ルールだけを改定します。

1. manifestを固定する
2. fetch scriptで資料を取得し、ハッシュを確認する
3. lint reportを生成する
4. Codex reviewで誤検出、見逃し、保留を分類する
5. 影響が大きく、説明可能な1ルールを選ぶ
6. ルール、テスト、docs/rules.md、必要ならgoldsetを最小変更する
7. `npm test`、公開コーパスlint、goldset評価を再実行する
8. `scripts/improvement-summary.mjs` で改定前後の差分を残す

改定の採用条件は、公開コーパスでの見かけの件数削減だけにしません。seed goldset、profile別評価、指摘位置、説明文の妥当性を合わせて確認します。

### 完了条件

- まず10〜30件で運用確認し、その後90件以上110件以下の固定manifestへ広げる判断ができている
- 各資料に出典、profile、genre、利用条件メモ、保存方針、取得ハッシュがある
- manifest駆動のfetch scriptで再取得または差分確認ができる
- profile別のJSON lint結果とMarkdown lint reportが生成できる
- Codex reviewで `TP`、`FP`、`FN`、`boundary`、`defer`、`keep` が分類されている
- 1ルールだけを対象に、改定、テスト、文書更新、再評価が完了している
- 改定前後の差分が残り、既存goldsetの品質を大きく落としていない

---

## v0.4.0 プロファイル導入

### 目的

多様な用途で使えるように、ルールの強さと対象を切り替えられるようにします。

### 初期プロファイル

| プロファイル | 用途 | 方針 |
|---|---|---|
| `minimal` | 初回導入 | 誤検出を極力抑える |
| `general` | 一般文章 | 汎用的な弱さを検出する |
| `business` | 企画書、報告書、稟議 | 責任、根拠、行動の曖昧さを見る |
| `technical` | 仕様書、マニュアル | 手順、条件、対象の曖昧さを見る |
| `research` | 研究計画、概要、申請書 | 根拠、限定、新規性、検証可能性を見る |
| `public` | 行政、学校、公共文書 | 読み手の判断可能性を重視する |
| `web` | ブログ、記事、広報 | 空疎な導入、煽り、薄い締めを見る |
| `agent-output` | AIエージェント出力 | 応答残骸と整いすぎた薄さを見る |
| `strict` | 品質保証 | 強めに検出する |

### CLI例

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile business --pretty
node bin/nihongo-slopless.mjs "research/**/*.md" --profile research --pretty
node bin/nihongo-slopless.mjs "drafts/**/*.md" --profile agent-output --pretty
```

### 完了条件

- プロファイルごとの設定ファイルがある
- CLIでプロファイルを指定できる
- ルールの有効、無効、閾値をプロファイルで変えられる
- プロファイル別のgoldset評価ができる
- `minimal` で誤検出が少ない

---

## v0.5.0 ルール拡張と分類体系の確立

### 目的

ルール数を増やすだけでなく、日本語Sloplessらしい品質分類を確立します。

### ルール分類

| 分類 | 内容 |
|---|---|
| surface-readability | 文の長さ、段落、括弧、装飾など |
| semantic-density | 抽象語、具体性、意味の薄さ |
| evidence-responsibility | 根拠、条件、範囲、断定、リスク |
| agency-action | 主体、行動、期限、判断基準 |
| style-drift | 空疎な締め、紋切り型、予定調和 |
| agent-artifacts | チャット残骸、プレースホルダ、過剰Markdown |
| domain-sensitivity | 高リスク領域、個人情報、機密、倫理 |

### 追加候補ルール

- 数値なしの効果主張
- 対象範囲のない一般化
- 評価指標のない改善表現
- 主体のない行動要求
- 期限のない対応表現
- 研究新規性のぼかし
- 仕様書における条件不足
- 行政文書における責任回避表現
- AI出力に特有の均質な箇条書き
- 過剰な結論前置き
- 意味の薄い導入段落
- 過剰な可能性表現
- リスクなしの推奨
- 読者の行動が見えない案内文

### 完了条件

- ルール数40個程度
- 各分類に最低3ルールがある
- すべてのルールにメタデータがある
- ルールごとの誤検出例がある
- 既存goldsetで意図しないFP/FN増加がない

---

## v0.6.0 設定、無視、許可リスト

### 目的

現場導入に必要な調整機能を整えます。

### 追加するもの

- ルールごとの閾値設定
- ルールごとの有効、無効
- ファイル単位の除外
- 語句の許可リスト
- 無視コメント
- プロジェクト設定ファイル

### 無視コメントの案

```markdown
<!-- nihongo-slopless-disable-next-line citation-needed -->
この表現は、文脈上の合意事項として扱う。
```

または、理由の記録を推奨します。

```markdown
<!-- nihongo-slopless-ignore citation-needed: 社内資料の前段で根拠を示している -->
```

### 完了条件

- 無視コメントが安定して動く
- 設定ファイルの仕様が文書化されている
- 設定のスキーマがある
- プロジェクトごとの許可リストが使える
- 無視が乱用されないよう、理由を書く運用例がある

---

## v0.7.0 SARIF対応(CIサンプル配布は要件外化)

### 目的

SARIF 形式の出力を CLI から得られるようにします。GitHub Actions ワークフローの **配布パッケージ提供は要件外** とし、SARIF を使う CI 連携は利用者が必要なら手元で組み立てる前提に変更しました(2026-05-20 改定)。

### 追加するもの(SARIF 出力機能のみ)

- SARIF出力(`--format sarif`)
- 終了コードの整理(`--fail-on`)
- 指摘件数のしきい値(`--max-findings`)
- レポート保存用オプション(`--output`)

### 要件外として整理したもの

- GitHub Actions サンプル workflow の配布
- PR コメント投稿コマンド
- SARIF アップロード専用コマンド
- GitHub code scanning UI の動作保証

これらは、利用者が必要な場合に手元で構築可能であり、本リポジトリではテンプレ提供を行いません。`docs/ci-sarif.md` には参考用の実行例を残します(配布パッケージではなく、参考実装)。

### 現在の実装状況

- `--format sarif` によるSARIF 2.1.0基本出力は実装済み。
- `--fail-on` による終了コード調整は実装済み。
- `--max-findings` による指摘件数しきい値は実装済み。
- `--output` によるJSON/SARIFレポート保存は実装済み。
- CI/SARIFの参考実行例は `docs/ci-sarif.md` に分離。

### CLI例

```bash
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile technical --format sarif > results.sarif
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile technical --fail-on error
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile technical --fail-on off --max-findings 20
node bin/nihongo-slopless.mjs "docs/**/*.md" --profile technical --format sarif --output results.sarif
```

### 完了条件

- GitHub Actionsで実行できる
- SARIFが基本的なコードスキャン互換を持つ
- pull requestで文章品質の変化を確認できる
- JSON出力は後方互換を保つ

---

## v0.8.0 textlint連携(試作止まり、必須化しない)

### 目的

日本語の既存文章校正エコシステムとの接続可能性を **試作で示す** ことです(2026-05-20 改定: textlint プリセットとしての正式配布は要件から外しました)。

### 方針

standalone CLIが本丸であり、textlint アダプタは互換性の参考実装に留めます。`adapters/textlint/` 配下に試作を残し、ローカルで併用したい利用者向けの素材として保持しますが、npm publish や preset 配布は行いません。

### 試作内容

- textlint移植可能なルールの棚卸し(済)
- textlint用アダプタの試作(P2 ガンマ、P3 ゼータ、P4 デルタ で 6→7→8 ルール化、進行中)
- 既存textlintルールとの棲み分け文書(`docs/textlint-adapter.md`)

### 完了条件(緩めた基準)

- 少なくとも 5 ルール以上が textlint 形式で動く参考実装が存在する(達成済み)
- standalone CLIとの挙動差が文書化されている(達成済み)
- 「正式配布はしない」方針が明確である(本改定で達成)

---

## v0.9.0 Claude Code / Codex CLI での自己進化サイクル定着

### 目的

VS Code 拡張・MCP サーバ等の配布パッケージ提供は **要件外** に変更しました(2026-05-20 改定)。本マイルストーンの目的は、個人開発者が **Claude Code または Codex CLI を介して**、本リポジトリを自分自身で自己進化させられる状態を整えることです。

### 追加するもの

- `HANDOFF.md` の運用モード規約(P2 で達成)
- `AGENTS.md` のエージェント向け規約
- `reports/dispatch/<batch>-agent-<id>.report.md` 形式の標準化(P1〜P4 で達成)
- `.local/agent-<id>-*.md` プロンプト雛形(P3〜P4 で達成)
- `04_runs/<run-id>/run.md` の run record 標準化(達成)
- 最大6体並列実行の規約(P3 で 3体、P4 で 4体達成、上限6体未到達)
- ドッグフード(`npm run lint:docs`)による自己 lint(本改定で追加)
- 指摘を機械的に消しすぎないためのガイド

### 要件外として整理したもの

- VS Code 拡張
- MCP サーバ
- GitHub Actions サンプル workflow の配布(SARIF 出力機能は残す)
- 組織向けダッシュボード
- 多言語対応

### エージェント指示例(現在の運用形)

新規セッションで Claude Code または Codex CLI に渡す最小指示:

```text
HANDOFF.md を読んでください。
タスク一覧を確認し、次にやることを 1〜6 体並列で進めてください。
ファイル所有権を明示し、衝突回避してください。
1機能/1ルール改定の範囲を守ってください。
変更後は npm test、evaluate-corpus、audit、npm pack の回帰を確認してください。
完了後は reports/dispatch/ と HANDOFF.md を更新してください。
```

### 完了条件

- Claude Code / Codex CLI のいずれでも、HANDOFF.md を読んだだけで開発再開できる(達成済み、P1〜P4 で再開実例あり)
- 6体並列の運用手順がある(P8記録では4体並列まで確認、6体は要素技術的には可能)
- ドッグフードコマンドが動く
- 残すべき指摘を説明する運用がある(`docs/troubleshooting.md` に蓄積中)
- エージェントが文章を過剰に均質化しないための注意がある(`VISION.md` の「指摘は正解ではなく編集候補」)
- 人間の最終判断を前提にした運用文書がある(`docs/ethical-use.md`)

---

## v1.0.0 安定版(公開先・公開タイミングは保留)

### 目的

個人開発者が、日常的に手元で使える日本語文章品質リンターとして安定版を出します。公開先と公開タイミングは保留です。公開する場合も、公開面は slopless の文章 lint 機能、設定、文書、公開用seedに限定します。

### v1.0.0の条件(2026-05-20 改定)

| 項目 | 条件 | 現状(2026-05-22時点)|
|---|---|---|
| ルール | 26 以上、目安として 30〜40 程度(40〜60 ではない) | 26 |
| プロファイル | minimal, general, business, technical, research, public, web, agent-output, strict | **9 ✓** |
| 入力 | Markdown、プレーンテキスト、標準入力 | ✓ |
| 出力 | JSON、pretty、SARIF(参考) | ✓ |
| 設定 | ルール単位の有効化、無効化、閾値、許可リスト | ✓ |
| 検証 | seed 200 件以上、本番 manifest 30 件以上(300 ではない) | 公開同梱seed 208、ローカル36、manifest 30 ✓ |
| 評価 | ルール別、プロファイル別の評価レポート | ✓ |
| 連携 | Claude Code / Codex CLI 自己進化サイクル(GitHub Actions・textlint は試作止まり) | ✓ |
| 倫理 | AI判定に使わない方針が明文化されている | ✓ |
| 文書 | ルール意図、誤検出例、修正例、運用例がある | ✓ |
| ドッグフード | `npm run lint:docs` で自リポジトリ docs を lint できる | 本改定で追加 |
| **公開面** | 公開対象が slopless の文章 lint 機能に限られ、Codex開発運用物を含まない | 公開先・公開タイミングは保留。READMEは公開面の境界を反映済み |

### v1.0.0で保証したいこと

- 同じ入力に対して同じ出力を返す
- JSON出力の基本構造が安定している
- 主要ルールの意図と限界が説明されている
- 誤検出の多いルールはstrict側に逃がせる
- プロファイルにより現場ごとに調整できる
- AI判定器として誤用しない方針が明確である
- **sato 個人が常時活用できる**(自分の文書、AI出力、業務文書、研究計画、ブログ記事を手元で lint できる)
- **Claude Code または Codex CLI で自己進化できる**(新規セッションで HANDOFF.md を読むだけで開発再開可能)

### v1.0.0で保証しないこと

- すべての悪文を検出すること
- すべての誤字脱字を検出すること
- 文学的品質を評価すること
- 著者がAIか人間かを判定すること
- 文章の良し悪しを単一スコアで決めること
- 専門的判断を代替すること
- **エディタ拡張、MCP サーバ、GitHub Actions テンプレ等の配布パッケージ**(要件外)
- **npm publish の保証**(npm 配布は任意)

---

## v1.1以降(2026-05-20 改定: スコープを大幅縮小)

VISION.md の改定に伴い、v1.0 以降の展開は **本リポジトリのスコープから外す方針** に変更しました。この節の項目は「やる」と約束したものではなく、もし誰かが必要として別 repo でフォーク・派生する場合の参考リストです。本リポジトリでは v1.0 到達後、安定運用と sato 個人の常時活用に集中します。

### 別 repo / フォーク向けの参考アイデア(本リポジトリでは扱わない)

- ダッシュボード型可視化
- 組織向け設定管理
- リスク領域対応(医療・法務・金融・安全・個人情報・研究倫理)の補助ルール
- HTML/Google Docs/PDF/Word/Zenn/Qiita/note 等の多形式入力
- 日本語以外への展開
- エディタ拡張(VS Code 等)
- MCP サーバ
- GitHub Actions ワークフローテンプレート配布
- textlint プリセットとしての正式配布

本リポジトリは「個人 + Claude Code/Codex で自己進化する手元 CLI」に集中するため、これらに着手することは v1.0 達成後の判断保留事項とします。

---

## 最初の90日計画

### 1週目から2週目

- `VISION.md` と `ROADMAP.md` を追加
- 既存ルール20個にメタデータを付与
- ルール文言を見直す
- 「AI判定ではない」方針をREADMEに反映

### 3週目から4週目

- goldsetを30件作る
- 評価スクリプトを改善する
- 誤検出と見逃しを分類する
- Codexに1ルールずつ改善させる運用を試す

### 5週目から6週目

- プロファイル設計を導入する
- `minimal`, `general`, `agent-output` を先に作る
- CLIでプロファイル指定を可能にする
- サンプル文書をプロファイル別に追加する

### 7週目から8週目

- `business`, `research`, `technical` を追加
- ルール数を30個前後に増やす
- ルールごとの誤検出例を文書化する
- READMEに実運用例を追加する

### 9週目から10週目

- goldsetを100件に増やす
- 評価レポートをルール別にする
- GitHub Actionsサンプルを整える
- Codex用プロンプトテンプレートを整備する

### 11週目から12週目

- v0.4またはv0.5として公開可能な形に整理する
- 導入事例風のサンプルを作る
- 今後のtextlint連携方針を決める
- v1.0条件との差分を明文化する

---

## Codexでの作業単位

Codexには、大きな指示を一度に投げないことを推奨します。

良い作業単位:

- 一つのルールにメタデータを追加する
- 一つのルールの誤検出を減らす
- 一つのプロファイルを追加する
- goldsetを10件増やす
- docs/rules.mdの一分類だけ整える
- 評価スクリプトに一つの指標を足す

避けたい作業単位:

- 全ルールを一気に改善する
- すべてのプロファイルを同時に作る
- CLI、評価、ルール、ドキュメントを同時に大改造する
- 検証なしに新ルールを大量追加する

### Codex指示テンプレート

```text
AGENTS.md と VISION.md に従ってください。
目的はAI生成判定ではなく、日本語文章の編集可能性を高めることです。

今回の作業対象は nihongo-slopless/<rule-name> のみです。
validation/goldset.example.jsonl の誤検出と見逃しを確認し、必要最小限の変更を行ってください。
ルールメッセージは攻撃的にせず、修正のヒントを含めてください。
変更後、npm test と npm run evaluate を実行してください。
関連する docs/rules.md も更新してください。
```

---

## リスクと対策

### リスク1 指摘が多すぎて使われなくなる

対策:

- `minimal` プロファイルを用意する
- strict系ルールを分離する
- ルール別の誤検出率を見る
- 指摘件数のしきい値を設定できるようにする

### リスク2 文体を均質化してしまう

対策:

- ルールごとにnotGoalを明記する
- 文学的、哲学的、専門的表現の例外を記録する
- 無視コメントと許可リストを用意する
- 修正しない判断を尊重する文書を用意する

### リスク3 AI判定器として誤用される

対策:

- README、VISION、CLI出力に方針を明記する
- 「AIっぽい」という表現をルールメッセージから避ける
- 出力を著者推定に使えない形式で設計する
- 不正判定への利用禁止を明文化する

### リスク4 ルールが属人的になる

対策:

- ルールメタデータを必須にする
- goldsetで検証する
- 誤検出例を蓄積する
- 複数領域の文書で評価する

### リスク5 既存ツールと重複する

対策:

- 表記統一や一般校正を主戦場にしない
- 意味密度、根拠、責任、エージェント残骸に集中する
- textlintやprhとの併用例を示す

---

## リリース判定チェックリスト

各リリース前に確認します。

- `npm test` が通る
- `npm run evaluate` が通る
- 新ルールにメタデータがある
- 新ルールに少なくとも一つの陽性例と陰性例がある
- ルールメッセージが攻撃的でない
- AI判定を示唆する表現がない
- READMEまたはdocsが更新されている
- 既存goldsetで大きな後退がない
- プロファイルへの影響が確認されている

---

## v1.0までの判断基準(2026-05-20 改定)

v1.0 に進むかどうかは、次の問いで判断します。

- **sato 個人が、自分の書いた文書を日常的に手元で lint しているか**(常時活用)
- **新規セッションで Claude Code または Codex CLI に「HANDOFF.md を読んでください」と頼むだけで、開発が再開できるか**(自己進化サイクル成立)
- **ドッグフードコマンド `npm run lint:docs` が、リポジトリ内の主要ドキュメントに対して妥当な指摘を出すか**
- 指摘は、編集行動につながるか
- 誤検出が多いルールを切り分けられているか
- 使い手が、なぜ指摘されたか理解できるか
- Claude Code や Codex CLI が、JSON 出力を読んで改善できるか
- 人間が、修正しない判断を残せるか
- AI判定器ではないという方針が守られているか
- 公開時の README が、slopless の文章 lint 機能と誤用防止を中心に書かれているか

この問いに答えられる状態になったとき、日本語 Slopless は、**個人が AI エージェントと並走しながら、自分の手元で育てて使う文章品質リンター** として完成形に達します。

---

## 最後に

日本語Sloplessが目指すのは、きれいな文章を量産することではありません。

目指すのは、読み手が判断でき、書き手が責任を引き受け、AIエージェントが出力した文章も人間の編集文化の中に戻せる状態です。

そしてもう一つ。リンター自身も、ひとりの開発者が Claude Code または Codex CLI と並走しながら、責任を持って育てていけるものでなければなりません。

生成は速く。
検証は静かに。
編集は深く。
リンターは、自分で育てる。
