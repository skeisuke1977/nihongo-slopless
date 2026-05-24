# 検証計画

## 目的

日本語版Sloplessの検証では、「AIが書いたかどうか」ではなく、**編集者が確認すべき弱い文章をどれだけ有用に指摘できたか**を評価する。

## フェーズ1: 種まき検証

公開可能な文書を10〜30本集める。

候補:

- 授業資料
- 研究概要
- 校務文書
- 生成AI利用ガイドライン
- 広報文
- 学生向け説明文

各文書から、指摘してほしい箇所を人間がラベルする。単位は「文」または「段落」でよい。最初は厳密な境界一致を求めず、ルール単位の有無を評価する。

実文書由来のサンプルは、goldsetへ入れる前に匿名化する。個人名、所属、学籍番号、メールアドレス、固有のプロジェクト名、未公開研究内容、校務上の機微情報は、意味構造を保つ範囲で置換または削除する。匿名化後も本人や組織が推測できる場合は、seedには入れず、アクセス制御された実検証用データとして扱う。

## フェーズ2: goldset作成

`validation/goldset.example.jsonl` と同じ形式で、検証用データを作る。
現時点の `validation/goldset.example.jsonl` は公開リポジトリ上の回帰seedである。これは自己作成または権利処理済みの短いサンプルによる回帰評価であり、一般の日本語文書全体に対する性能保証ではない。実文書由来の境界例、誤検出、見逃しの蓄積は、配布対象外の実検証用データとして継続する。npmパッケージには `validation/` を同梱しない。

seed goldsetと実検証用goldsetは分ける。`validation/goldset.example.jsonl` は公開、説明、回帰確認に使う小さなseedであり、機微情報を含めない。授業、組織、研究の実文書に由来する検証用goldsetは、公開可否、匿名化状態、利用目的、アクセス範囲を明記した別ファイルとして管理する。

```json
{"id":"doc-001","text":"近年、生成AIの利用は急速に広がっている。","expectedRules":["citation-needed"]}
```

推奨カテゴリ:

| カテゴリ | 件数目安 | 目的 |
|---|---:|---|
| 明らかな陽性例 | 50 | ルールが最低限反応するか |
| 良文の陰性例 | 50 | 過剰検出を防ぐ |
| 境界例 | 50 | 閾値調整 |
| 用途別文書 | 各20 | 研究・教育・広報・校務の差を見る |

### 公開資料検証

seed goldsetと外部公開コーパスは、役割を分ける。seed goldsetは、自作または権利処理済みの短いサンプルで、期待ルール、件数、位置、`review.status` を固定して回帰確認に使う。外部公開コーパスは、公開された第三者文書を対象に、ジャンル、Markdown構造、文体差に対する誤検出や運用負荷を観察するために使う。

公開資料は「検索エンジン」や「正解コーパス」として扱わない。大量に拾って一致数を競うのではなく、用途が分かる文書群を小さく選び、どのprofileで、どのルールが、どの文脈で有用または過剰だったかを記録する。外部公開コーパスの主目的は誤検出観察であり、自作の `sloppy` サンプルや注入サンプルは検出漏れ観察に使う。具体的な運用手順は `docs/open-corpus-loop.md`、manifestの例は `validation/open-corpus-manifest.example.jsonl` を参照する。

第三者本文は、原則としてnpm公開物やseed goldsetにそのまま同梱しない。公開条件が明確な短い抜粋を使う場合でも、本文、出典表示、ライセンス表示、改変有無を分けて管理する。本文の再配布条件が不明、第三者著作物を含む、または個別許諾が必要な資料は、本文を保存せず、取得元、取得日、対象範囲、利用目的だけをmanifestに記録する。写真、図表、コード、外部データ、引用部分は本文とは別権利の可能性があるため、テキスト評価に必要な範囲だけを扱う。

### packaged seedの公開属性ゲート

公開リポジトリ上の `validation/goldset.example.jsonl` は、公開属性をローカルで監査してから扱う。
同梱seedの `origin` は `self-authored` または `rights-cleared` のみ許可する。
`external-public` は、本文を同梱せずmanifestで管理する対象であり、`text` や `includeText=true` 相当の本文同梱がある場合は同梱seedとして不可とする。

後方互換のため、通常モードでは `origin` 欠落だけではfailしない。
ただし、`sourceFile` / `note` / `notes` に `private_corpus`、`公開属性未確認`、`抜粋` など公開属性確認が必要な語があるrecordは error とする。
`origin:"self-authored"` で `sourceFile` が `private_corpus/` を指すrecordは、第三者本文混入とは別のローカル下書き由来断片として通常モードでは warning にする。
配布前にこの由来をfailさせたい場合は `--strict-local-source` を使う。
同梱前のゲートでは `--strict-origin` を使い、全recordに `origin` があることを確認する。

PowerShell例:

```powershell
node scripts/audit-packaged-goldset.mjs
node scripts/audit-packaged-goldset.mjs --strict-origin
node scripts/audit-packaged-goldset.mjs --strict-local-source
node scripts/audit-packaged-goldset.mjs `
  --strict-origin `
  --output reports/dispatch/packaged-goldset-audit.report.md
```

この監査は権利可否を自動判定しない。公開属性の不足や本文同梱リスクを見つけ、人間が確認するためのゲートである。

### Goldset の分離

goldsetは次の2系統に分ける。

- `validation/goldset.example.jsonl`: 公開リポジトリ用の回帰seed。ローカル下書き由来本文とローカル原稿名を含めない。
- 配布対象外の実検証用goldset: ローカル下書きや匿名化済み実文書の境界例を保持し、`package.json` の `files` には含めない。

公開前の確認では、`node scripts/audit-packaged-goldset.mjs --strict-local-source` が公開同梱用goldsetに対してPASSすることを確認する。ローカル回帰では、公開同梱用とローカル用を個別に評価し、seed評価値を混同しない。

実検証用goldsetから公開同梱seedへ再投入する場合は、匿名化、権利、由来、同梱可否を確認し、ローカル下書き由来であることを公開前ゲートが検出できる状態にしておく。

外部公開コーパスには、最低限次を記録する。

```json
{"id":"open-001","origin":"external-public","sourceName":"example-docs","sourceUrl":"https://example.invalid/docs/page","license":"example only; verify real source terms before use","termsCheckedAt":"2026-05-20","purpose":"technical false-positive observation","validationRole":"false-positive-observation","storagePolicy":"manifest-only; fetch into .local/open-corpus when needed","includeText":false,"repositoryIncluded":false,"packageIncluded":false,"profile":"technical","genre":"technical","reviewFocus":["markdown-boundary","false-positive"],"notes":"本文は同梱せず取得元だけを記録する"}
```

`profile` は実行可能なprofile名として扱い、文書ジャンルは `genre` に分ける。本文を保存する場合も、第三者本文は `.local/open-corpus/` など配布対象外のローカル領域に置き、`validation/` へ自動投入しない。

公開資料検証のレビュー結果では、`review.status` を次のように使う。

- `FP`: 公開資料で最も重視する。良文、規約文、技術文書、教材、官庁文などで、文脈上は修正不要な指摘を記録する。
- `TP`: 公開資料でも、編集候補として妥当な指摘だけに付ける。公開済み本文であることを理由に、自動的に陰性扱いしない。
- `boundary`: 文書ジャンル、引用、定義文、profile設定によって判断が分かれる指摘に使う。
- `keep`: 指摘は妥当だが、引用、仕様用語、教育上の例示、組織で合意済みの表現として残す判断に使う。
- `FN`: 主に自作sloppy、注入サンプル、匿名化済み実文書の人手ラベルで使う。公開資料では、明確な編集候補を人間がラベルした場合に限る。

profile別評価は、公開資料検証でも記録する。同じ公開資料を `minimal`, `general`, `technical`, `business`, `public`, `research`, `web`, `agent-output` などで比較する場合は、感度差と運用負荷の観察として扱う。profileは著者や生成元の推定ラベルではなく、文書用途に応じた設定である。合否ゲートに使う場合は、profileごとの期待ラベルまたは `expectedByProfile` / `expectedCountsByProfile` を用意し、単一の期待ラベルを全profileに無批判に適用しない。

### 判断記録の形式

実検証では、検出結果を単なる成功・失敗にせず、編集判断を残す。

```json
{"id":"review-001","source":"anonymized-real-doc","profile":"research","text":"近年、この手法の重要性が高まっている。","expectedRules":["citation-needed"],"review":{"status":"TP","decision":"revise","reason":"根拠文献か対象範囲を補う必要がある"}}
```

`review.status` の推奨値:

| 値 | 意味 |
|---|---|
| `TP` | 期待した指摘で、編集候補として有用 |
| `FP` | 誤検出。文脈上は修正不要または指摘が不適切 |
| `FN` | 見逃し。人間は修正候補と見たが検出されなかった |
| `boundary` | 閾値、文脈、profileによって判断が分かれる |
| `defer` | 判断保留。追加の文脈や専門家確認が必要 |
| `keep` | 指摘は妥当だが、引用、用語、教育例などの理由で残す |

`review.decision` は `revise`, `keep`, `ignore`, `defer`, `rule-change-candidate` など、次の行動が分かる値にする。`keep` や `ignore` では理由を書き、指摘を消すこと自体を目的にしない。

## フェーズ3: 指標

`node scripts/evaluate-corpus.mjs validation/goldset.example.jsonl --pretty` で次を出す。

- ルール別精度
- ルール別再現率
- ルール別F1
- 全体のmicro平均
- レコードごとのTP/FP/FN差分
- profile別のTP/FP/FN差分
- profile別の件数評価差分（`countProfiles`）
- `review.status` / `review.decision` の件数集計（`reviewSummary`）

ただし、数値だけで採否を決めない。教育現場では、誤検出でも議論のきっかけとして有用な場合がある。

profileを指定して評価する場合:

```bash
node scripts/evaluate-corpus.mjs validation/goldset.example.jsonl --profile minimal --pretty
node scripts/evaluate-corpus.mjs validation/goldset.example.jsonl --profile agent-output --pretty
```

goldsetの各レコードに `profile` を入れると、そのレコードだけ指定profileで評価する。コマンド行で `--profile` を指定した場合は、全レコードをそのprofileで評価する。`profile` は著者や生成元のラベルではなく、文書用途に応じたルール設定の選択として扱う。

同じ期待ラベルを別profileに一括適用すると、profile差分によるFP/FNが出ることがある。これは感度比較には使えるが、合否ゲートにする場合は、そのprofile用の期待ラベルを持つgoldsetを用意する。

profileごとに期待ラベルを変える場合は、任意フィールド `expectedByProfile` を使える。`--profile` が指定された場合はそのprofile、指定がない場合はレコードの `profile` 用の期待ラベルを優先し、該当がなければ従来の `expectedRules` または `expected` を使う。

```json
{"id":"profile-001","profile":"minimal","text":"近年、生成AIの利用は急速に広がっている。","expectedRules":["citation-needed"],"expectedByProfile":{"minimal":[],"general":["citation-needed"]}}
```

profile別期待ラベルの不足を探す場合は、評価の合否とは別に次を使う。

```bash
node scripts/profile-goldset-coverage.mjs validation/goldset.example.jsonl --markdown
```

この補助スクリプトは `expectedByProfile` / `expectedCountsByProfile` / `expectedFindingsByProfile` のprofileキー有無、fallbackのみのレコード、自record profileキー不足を集計する。文章品質の点数化や著者推定には使わない。

### 同一ルールの件数評価

既存の `expectedRules` と `expected` は、「そのルールが出るかどうか」を見る評価である。同じルールが1回出ても3回出ても、ルール単位の有無として扱うため、重複指摘の過不足は見ない。

同一ルールの指摘件数まで確認したい場合は、任意フィールド `expectedCounts` を使う。キーには `citation-needed` のような短縮IDと、`nihongo-slopless/citation-needed` のようなフルIDの両方を使える。

```json
{"id":"count-001","text":"近年、生成AIの利用は急速に広がっている。さらに、教育現場でも重要性が高まっている。","expectedRules":["citation-needed"],"expectedCounts":{"citation-needed":2}}
```

profileごとに件数期待を変える場合は、任意フィールド `expectedCountsByProfile` を使う。`--profile` が指定された場合はそのprofile、指定がない場合はレコードの `profile` 用の件数期待を優先し、該当がなければ `expectedCounts` を使う。

```json
{"id":"count-profile-001","profile":"minimal","text":"近年、生成AIの利用は急速に広がっている。さらに、教育現場でも重要性が高まっている。","expectedCountsByProfile":{"minimal":{},"general":{"nihongo-slopless/citation-needed":2}}}
```

件数評価は、同一ルールの重複指摘が編集行動を増やしすぎていないかを見るための補助指標である。検出数の多寡を文章品質の点数として扱わない。
`countProfiles` は `countSummary` と同じ集計をprofile別に分けた出力で、`expectedCounts` または選択された `expectedCountsByProfile` に対象ルールがあるレコードだけを `evaluatedRecords` に数える。Set評価用の `profiles` とは別指標として扱う。

### 指摘位置と抜粋の評価

`expectedRules` はルール単位の有無を評価し、`expectedCounts` は同じルールの件数を評価する。さらに、同一ルールの指摘が期待した箇所に出ているかまで確認したい場合は、任意フィールド `expectedFindings` を使う。

`expectedFindings` の各要素には、`ruleId` または `rule` と、安定した照合手がかりとして `excerpt` または `messageIncludes` を指定する。`line` と `column` は補助条件として使えるが、単独では指定できない。ルールIDは `placeholder` のような短縮IDでも、`nihongo-slopless/placeholder` のような完全IDでもよい。
`expectedFindings` に書いたルールは、ルール単位の期待集合にも含めて評価する。つまり、位置だけを書いたつもりのルールが集合評価で誤検出扱いになることはない。

```json
{"id":"finding-001","text":"TODO: 概要を書く。\nFIXME: 連絡先を書く。","expectedRules":["placeholder"],"expectedFindings":[{"ruleId":"placeholder","line":1,"excerpt":"TODO"},{"ruleId":"placeholder","line":2,"excerpt":"FIXME"}]}
```

profileごとに期待位置を変える場合は、任意フィールド `expectedFindingsByProfile` を使う。`--profile` が指定された場合はそのprofile、指定がない場合はレコードの `profile` 用の期待位置を優先し、該当がなければ `expectedFindings` を使う。

`expectedFindings` があるレコードでは、期待したルールの実指摘だけを位置評価の対象にする。期待ルール内で余分な指摘位置があれば `unexpectedFindings`、期待位置と照合できる指摘がなければ `missedFindings` に入る。集計結果は `findingSummary`, `findingProfiles`, `findingsByRule`, `findingMismatches` に出力される。

位置評価は、同じルールの指摘が編集者の見たい箇所に出ているかを確認するための補助指標である。指摘位置の数を、文章品質の点数や著者推定に使わない。

## フェーズ4: 人間評価

教員・学生・研究者など、立場の違う評価者に次を聞く。

1. この指摘は修正行動につながるか。
2. 指摘メッセージは納得できるか。
3. このルールは授業で使えるか。
4. 無効化したい文書タイプはあるか。

5段階評価に加えて、自由記述を集める。

## フェーズ5: 授業・研究への展開

授業で使う場合は、検出数を点数にしない。学生には次を求める。

- 指摘された箇所を修正するか、残すかを判断する
- 残す場合は理由を書く
- 修正する場合は、何を具体化したかを書く

これにより、リンターは採点器ではなく、思考を促す鏡になる。

## 注意点

- AI生成判定への転用は禁止する。
- 学生の不正判定には使わない。
- 検出数の少なさは文章品質の保証ではない。
- 検出数の多さだけで文章の悪さを即断しない。
- 実文書由来サンプルは、匿名化とアクセス範囲を確認してから評価データに入れる。
- seed goldsetの評価値を、実運用での品質保証として扱わない。

運用上の禁止事項とprofileの扱いは、`docs/ethical-use.md` も参照する。
