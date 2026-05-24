# 公開資料コーパス運用ループ

この文書は、公開資料を使って `nihongo-slopless` のルールを検証し、1回に1ルールだけ小さく改定するための運用手順である。目的は、実文書に近い入力で誤検出、見逃し、境界例を増やし、編集に役立つ決定論的ルールへ近づけることにある。

この運用はAI生成判定ではない。著者、生成元、不正の有無を推定しない。検出数を文章品質スコア、採点、ランキング、処分、AI利用推定に使わない。

## 原則

- 第三者本文は、原則としてnpmパッケージに同梱しない。
- リポジトリに残すのは、取得元、ライセンス、用途、確認日、評価判断、必要最小限の自作または匿名化済みseedに限る。
- 公開資料の本文は、ローカル作業用の `.local/open-corpus/` に置く。`validation/`、`docs/`、`scripts/` など、npmの `files` 対象配下へ自動投入しない。
- AIエージェントを検索エンジンとして使わない。URL選定、利用条件確認、第三者著作物の有無は、人間が出典ページを見て確認する。
- manifest の `termsCheckedAt` は、page-specific な第三者素材と利用条件を人間が確認した日付にする。`TBD-before-fetch` のままでも `audit-open-corpus-manifest` は警告のみで PASS するが、`scripts/fetch-open-corpus.mjs` は外部公開資料の実取得を拒否する。取得前に必ず `YYYY-MM-DD` へ更新する。
- `agent-output` profileや指摘数を、AIが書いた証拠として扱わない。
- 検出数の多寡をスコア化しない。件数はレビュー負荷と差分確認のための機械的な観測値に限る。
- 1回の改定では1ルールだけを扱う。複数ルールに影響が見えても、次回の候補として記録する。
- ルール改定後は、通常テストとgoldset評価を実行する。
- manifest例は `validation/open-corpus-manifest.example.jsonl` に置く。`profile` は実行可能なprofile名、文書種別は `genre` として分ける。

## ディレクトリ

推奨する作業場所は次の通り。

```text
.local/
  open-corpus/
    2026-05-20-public-technical/
      manifest.jsonl
      raw/
      extracted/
      review-notes.jsonl
reports/
  open-corpus/
    2026-05-20-public-technical/
      before.general.json
      after.general.json
      diff-notes.md
validation/
  goldset.example.jsonl
```

`.local/open-corpus/` は公開資料本文を置くローカル作業領域である。`.gitignore` で除外し、npm公開物にも含めない。`validation/goldset.example.jsonl` へ移す場合は、本文をそのまま流し込まず、自作の最小例、匿名化済み短文、または権利確認済みの短いseedにする。`docs/`、`scripts/`、`examples/`、`skills/` など `package.json` の `files` 対象配下にも、取得本文や抽出Markdownを自動生成しない。

npm公開前は `npm pack --dry-run --json` を実行し、`.local/`、`reports/`、取得本文、抽出Markdownが含まれていないことを確認する。`validation/` から公開物に入れるのは、本文を含まないmanifest例と自作seedに限定する。`docs/` や `scripts/` など、通常は配布対象になる場所へ第三者本文を混ぜない。

## 1. download対象を決める

最初に、資料群の目的を1つだけ決める。

| 目的 | 候補 | 主に見ること |
|---|---|---|
| 技術Markdown | MDN日本語版、Kubernetes日本語文書、Rust/Vue日本語文書 | コード、URL、表、箇条書き、翻訳調 |
| 公的文書 | 文科省、e-Gov、デジタル庁など | 長文、抽象語、責任のぼかし、硬い文体 |
| 一般説明文・教材 | Wikipedia、Wikibooks | 定義文、脚注、専門語、教材調 |
| 文学・古い文体 | 青空文庫の著作権切れ作品 | 文体差、長文、文学的表現への過剰検出 |

1回の実行では、ジャンルを混ぜすぎない。例えば「技術Markdown 5本」または「公的文書 5本」のように、小さくまとめる。

取得前に次を確認する。

| 項目 | 確認内容 |
|---|---|
| URL | 取得するページまたはファイルの正規URL |
| ライセンス | CC BY、CC BY-SA、MIT、政府標準利用規約など |
| 第三者素材 | 図版、写真、引用、外部データなど本文と別条件の要素 |
| 利用範囲 | ローカル検証のみか、短いseed化まで可能か |
| 確認日 | 利用条件を確認した日付 |

manifestには本文を入れない。取得元と判断材料だけを残す。最低限の項目は次の通り。

| 項目 | 目的 |
|---|---|
| `id` | 取得、lint結果、レビュー記録をつなぐ安定ID |
| `origin` | `external-public` または `self-authored` |
| `sourceName` / `sourceUrl` | 取得元名とURL |
| `license` / `termsCheckedAt` | 利用条件と確認日 |
| `purpose` / `validationRole` | 検証目的と主な観察役割 |
| `storagePolicy` | 本文保存方針 |
| `includeText` / `repositoryIncluded` / `packageIncluded` | 本文を含めるか、配布対象にするか |
| `profile` / `genre` | 実行profileと文書ジャンル |
| `reviewFocus` / `notes` | 主な観察観点と権利・抽出上の注意 |

```jsonl
{"id":"tech-001","origin":"external-public","sourceName":"example technical docs","sourceUrl":"https://example.invalid/docs/page","license":"CC BY 4.0; verify page-specific terms","termsCheckedAt":"2026-05-20","purpose":"technical Markdown false-positive checks","validationRole":"false-positive-observation","storagePolicy":"manifest-only; fetch into .local/open-corpus when needed","includeText":false,"repositoryIncluded":false,"packageIncluded":false,"profile":"technical","genre":"technical","reviewFocus":["code-blocks","links","long-sentence"],"notes":"本文はnpm同梱しない。第三者素材は抽出対象から除く。"}
{"id":"public-001","origin":"external-public","sourceName":"example public page","sourceUrl":"https://example.invalid/policy/page","license":"government-standard-terms-compatible; verify page-specific terms","termsCheckedAt":"2026-05-20","purpose":"public prose false-positive checks","validationRole":"false-positive-observation","storagePolicy":"manifest-only; local extraction only","includeText":false,"repositoryIncluded":false,"packageIncluded":false,"profile":"public","genre":"government","reviewFocus":["formal-prose","abstract-nouns","long-sentence"],"notes":"本文テキストのみ抽出し、図版、外部引用、別条件の資料は除く。"}
```

## 1.5. manifestを監査する

取得前に `scripts/audit-open-corpus-manifest.mjs` でmanifestだけを監査する。この監査はローカルJSONLを読むだけで、検索、外部取得、本文抽出、ライセンス可否の自動判定は行わない。

```powershell
node scripts/audit-open-corpus-manifest.mjs `
  --manifest validation/open-corpus-manifest.example.jsonl
```

レポートを残す場合:

```powershell
node scripts/audit-open-corpus-manifest.mjs `
  --manifest validation/open-corpus-manifest.example.jsonl `
  --output reports/dispatch/open-corpus-manifest-audit.report.md
```

監査では、必須フィールド、実在profile名、`external-public` の `includeText=false` / `repositoryIncluded=false` / `packageIncluded=false`、`termsCheckedAt` の形式、`reviewFocus` 配列を確認する。`profile` は `nihongo-slopless` の実行設定、`genre` は文書種別である。同じ値になっている場合や、`genre` に既存profile名を流用している場合は、取り違えの可能性として警告する。

`termsCheckedAt=TBD-before-fetch` はmanifest例の暫定値として許容されるが、実取得前に人間が利用条件を確認し、`YYYY-MM-DD` に更新する。`external-public` に本文らしい `text`、`body`、`content`、`excerpt` などのフィールドを含めることはエラーにする。

公開前の確認では、メンテナが本番用manifestの監査を0 warningsに保つ。`validation/open-corpus-manifest.example.jsonl` に残る `terms-tbd` warning は、取得前の候補を示す example-only baseline として扱い、本番昇格、実取得、承認済み条件としての提示には使わない。監査がPASSしても利用条件の自動承認ではなく、最終判断はメンテナが行う。

## 2. PowerShellで取得する

作業IDを決め、ローカル領域とレポート領域を作る。

```powershell
$RunId = "2026-05-20-public-technical"
New-Item -ItemType Directory -Force ".local\open-corpus\$RunId\raw"
New-Item -ItemType Directory -Force ".local\open-corpus\$RunId\extracted"
New-Item -ItemType Directory -Force "reports\open-corpus\$RunId"
```

manifest駆動の最小取得には `scripts/fetch-open-corpus.mjs` を使う。URLはmanifestに記録済みの `sourceUrl` だけを使い、検索や候補発見はしない。

```powershell
node scripts/fetch-open-corpus.mjs `
  --manifest validation/open-corpus-manifest.example.jsonl `
  --id mdn-ja-docs `
  --out ".local/open-corpus/$RunId"
```

取得前に計画だけ確認する場合:

```powershell
node scripts/fetch-open-corpus.mjs `
  --manifest validation/open-corpus-manifest.example.jsonl `
  --dry-run `
  --out ".local/open-corpus/$RunId"
```

スクリプトは `raw/`、`extracted/`、`manifest.snapshot.jsonl`、`fetch-report.json` を作る。HTML、Markdown、プレーンテキストは、ローカル検証用の `extracted/<id>.md` へ最小抽出する。PDF、JSON、XML、CSV、YAML、GitHubリポジトリトップのように本文抽出が安全でない入力は、`fetch-report.json` に `extractReason` を残して抽出をスキップする。

外部公開資料の `termsCheckedAt` が `TBD-before-fetch` のままの場合、`--dry-run` では警告として計画確認できるが、実取得はエラーで停止する。これは利用条件の未確認状態で第三者本文を取得しないための安全側の制約である。

外部公開資料を指定した実行では、`--out` は `.local/open-corpus/` 配下だけが許可される。`validation/...`、`docs/...`、`scripts/...` など、npm package files 対象配下や配布物に入り得る場所は拒否される。第三者本文を `validation/` やnpm公開物に自動投入しないための安全側の制約である。

自作資料だけを指定した実行では、従来に近い出力先を許す。ただし `validation/` 配下への自動投入は禁止する。goldsetやfixtureへ反映する場合は、取得処理とは分けて、人間が本文の由来を確認した最小例だけを手で追加する。

手動で公開ページを取得する場合も、URLはmanifestに記録済みのものだけを使う。

```powershell
Invoke-WebRequest `
  -Uri "https://example.invalid/docs/page" `
  -OutFile ".local\open-corpus\$RunId\raw\tech-001.html"
```

HTML、Markdown、プレーンテキストのどれで取得してもよいが、`nihongo-slopless` にかける入力はMarkdownまたはテキストとして読める形に整える。自動抽出が `skipped` または `failed` になった場合は、理由を確認してから手動抽出する。図版、写真、脚注の権利が不明な引用、ナビゲーション、広告、フッターは除く。

```powershell
Set-Content `
  -LiteralPath ".local\open-corpus\$RunId\extracted\tech-001.md" `
  -Encoding UTF8 `
  -Value @"
# tech-001

ここにローカル検証用に抽出した本文を置く。
この本文はnpm同梱しない。
"@
```

上の `Set-Content` 例は手順説明用である。実運用では、第三者本文をリポジトリの配布対象に置かないことを優先する。

## 3. nihongo-sloplessを実行する

最初は `--fail-on off` にする。指摘の有無で作業を止めず、JSONを観察する。

```powershell
node bin/nihongo-slopless.mjs `
  ".local/open-corpus/$RunId/extracted/**/*.md" `
  --profile general `
  --pretty `
  --fail-on off `
  --output "reports/open-corpus/$RunId/before.general.json"
```

用途が明確な場合はprofileを合わせる。

```powershell
node bin/nihongo-slopless.mjs ".local/open-corpus/$RunId/extracted/**/*.md" --profile technical --pretty --fail-on off --output "reports/open-corpus/$RunId/before.technical.json"
node bin/nihongo-slopless.mjs ".local/open-corpus/$RunId/extracted/**/*.md" --profile public --pretty --fail-on off --output "reports/open-corpus/$RunId/before.public.json"
node bin/nihongo-slopless.mjs ".local/open-corpus/$RunId/extracted/**/*.md" --profile research --pretty --fail-on off --output "reports/open-corpus/$RunId/before.research.json"
```

複数profileを見る場合も、結果を合算してスコア化しない。profile差は、用途別の感度差とレビュー負荷として読む。

## 4. レビュー確認を行う

レビュー確認の目的は、JSON指摘を編集候補として分類し、次の1ルール改定候補を選ぶことである。公開資料を検索対象として広げたり、著者やAI利用を推定したりしない。

確認時は、manifest、抽出本文、実行結果、既存ルール説明を入力にする。

```text
目的:
- reports/open-corpus/<RunId>/before.general.json の指摘を、人間の編集判断に使える形で分類する。

前提:
- AI判定、著者推定、スコア化は禁止。
- 検出数の多さ、少なさを文章品質の点数にしない。
- 今回の改定候補は1ルールだけに絞る。

見てほしいこと:
- TP: 編集候補として有用な指摘
- FP: 文脈上は不要または過剰な指摘
- FN: 人間は気になるが検出されなかった箇所
- boundary: profile、閾値、用途で判断が分かれる箇所
- keep: 指摘は妥当だが、引用、定義、教育例などの理由で残す箇所

成果物:
- review-notes.jsonl
- 次に改定する1ルールの候補
- そのルールを改定しない場合の理由
```

`review-notes.jsonl` は次のように書く。

```jsonl
{"id":"tech-001-f001","sourceId":"tech-001","profile":"technical","ruleId":"nihongo-slopless/translationese","status":"FP","decision":"rule-change-candidate","reason":"API手順文の定型表現で、修正しても読み手の判断材料は増えない","excerptRef":"local-only"}
{"id":"tech-001-f002","sourceId":"tech-001","profile":"technical","ruleId":"nihongo-slopless/citation-needed","status":"TP","decision":"revise","reason":"効果主張に対象範囲と出典がない","excerptRef":"local-only"}
{"id":"tech-001-f003","sourceId":"tech-001","profile":"technical","ruleId":"nihongo-slopless/same-ending","status":"boundary","decision":"defer","reason":"手順書の箇条書きでは許容されるが、web profileでは読みにくい可能性がある","excerptRef":"local-only"}
```

`excerptRef` は、第三者本文をレビュー記録に複製しないための参照である。短い抜粋が必要な場合でも、公開可否とライセンス表示を確認し、必要最小限にする。

## 5. 1ルールだけ改定する

改定対象は、次の条件で1つに絞る。

| 条件 | 判断 |
|---|---|
| FPが同じ理由で複数出ている | 優先候補 |
| FNが編集上重大で、条件を説明できる | 優先候補 |
| profileだけで調整できる | ルール改定ではなく設定候補 |
| 追加文脈がないと判断できない | 保留 |
| 複数ルールの設計に関わる | 今回は1つだけ選び、残りは次回候補 |

改定では、実装、テスト、文書、goldsetの整合を保つ。

| 作業 | 対象 |
|---|---|
| 実装 | `src/rules/<rule-name>.mjs` |
| 登録やprofile調整 | `src/rules/index.mjs` など必要最小限 |
| ルール説明 | `docs/rules.md` |
| 陽性・陰性テスト | `test/cases/*.cases.mjs` または `test/run-tests.mjs` |
| 回帰seed | `validation/goldset.example.jsonl` |

第三者本文をそのままテストケースにしない。実文書で見つけた構造を、自作の短文に置き換えて陽性例、陰性例、境界例を作る。

## 6. 再評価する

改定後は、まず通常の最小ループを通す。

```powershell
npm test
node bin/nihongo-slopless.mjs examples/sloppy.md --pretty
node scripts/evaluate-corpus.mjs validation/goldset.example.jsonl --pretty
```

次に、同じローカル公開資料に対して再実行する。

```powershell
node bin/nihongo-slopless.mjs `
  ".local/open-corpus/$RunId/extracted/**/*.md" `
  --profile general `
  --pretty `
  --fail-on off `
  --output "reports/open-corpus/$RunId/after.general.json"
```

差分確認では、次だけを見る。

| 観点 | 見ること |
|---|---|
| 狙ったFP | 減ったか |
| 狙ったTP | 消えていないか |
| 新しいFP | 別ジャンルで増えていないか |
| FN | 期待した箇所が出るようになったか |
| メッセージ | 攻撃的、断定的、AI判定風になっていないか |

検出総数が増減しても、それ自体を成功や失敗にしない。成功条件は、改定対象ルールの指摘が、より説明可能で編集行動に結びつくことにある。

## 7. 残す記録

1回のループごとに、次を残す。

```text
RunId: 2026-05-20-public-technical
目的: 技術Markdownで translationese の過剰検出を確認する
入力: manifest.jsonl に記録した5件。本文は .local/open-corpus 配下のみ。
profile: technical
改定ルール: nihongo-slopless/translationese
変更概要: API手順文の定型表現を抑制
残したseed: 自作の陽性1件、陰性2件
実行:
- npm test
- node scripts/evaluate-corpus.mjs validation/goldset.example.jsonl --pretty
- node bin/nihongo-slopless.mjs ".local/open-corpus/<RunId>/extracted/**/*.md" --profile technical --fail-on off --output reports/open-corpus/<RunId>/after.technical.json
判断:
- keep: 狙ったFPが減り、既存seed評価に大きな退行なし
- discard: TPが消えた、または説明不能な例外が増えた
- defer: 追加ジャンルで確認が必要
```

この記録にも、第三者本文の長い抜粋を入れない。必要なら `sourceId`、ファイル名、行番号、短い自作再現例で代替する。

## チェックリスト

- 取得対象は人間が選ぶ。
- manifestにURL、ライセンス、確認日を記録する。
- AIエージェントを検索エンジンとして使わない。
- 第三者本文をnpm同梱対象に置かない。
- 図版、写真、外部引用など、本文と別条件の素材を除外する。
- `nihongo-slopless` の結果をAI判定、著者推定、不正認定に使わない。
- 検出数をスコア、成績、品質保証、採否基準にしない。
- 今回の改定対象を1ルールに絞る。
- 実文書の構造を、自作の短いテスト例または匿名化済みseedへ置き換える。
- `npm test` と `node scripts/evaluate-corpus.mjs validation/goldset.example.jsonl --pretty` を実行する。
- 改定前後のローカル公開資料結果を、件数ではなくTP/FP/FN/boundary/keepの判断で読む。

このループは、ルールを増やすためではなく、説明可能な編集候補を育てるための運用である。公開資料は「悪文の採集」ではなく、文書ジャンルごとの境界条件を観察する材料として扱う。
