# プロファイル監査マトリクス

`config/profiles/*.json` に並ぶ 9 個のプロファイルが、`src/rules/index.mjs` に列挙された 26 ルールに対して、どの severity と options を割り当てているかを観察用に一覧化したものです。

本ファイルは `scripts/profile-matrix.mjs` から生成されます。表現は観察語に寄せています。

_最終生成: 2026-05-20T06:20:00.273Z_

## 記号

| 記号 | 意味 |
| --- | --- |
| `e` | error |
| `w` | warning |
| `i` | info |
| `−` | 無効化(`false` / `"off"`) |
| `?` | 未指定(`config/profiles/<name>.json` に記載なし、メタデータの既定 severity が使われる) |

`?` は profile 側で何も書かれていない状態を示します。`src/profiles.mjs` の `mergeConfigs` ではプロファイル側で値を書かないとプロジェクト設定や `validateConfig` の規定は通りますが、`run` 時にはルールメタデータの既定 severity が使われます。

## マトリクス

| rule | minimal | general | business | technical | research | public | web | agent-output | strict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `nihongo-slopless/hidden-unicode-controls` [既定 e] | e | e | e | e | e | e | e | e | e |
| `nihongo-slopless/placeholder` [既定 e] | e | e | e | e | e | e | e | e | e |
| `nihongo-slopless/chat-response-leakage` [既定 w] | w | w | w | w | w | w | w | w | w |
| `nihongo-slopless/list-intro-padding` [既定 i] | − | i | i | i | − | i | w | w | w |
| `nihongo-slopless/long-sentence` [既定 w] | w | w | w | w | w | w | w | w | w |
| `nihongo-slopless/long-paragraph` [既定 w] | i | w | w | w | w | w | w | w | w |
| `nihongo-slopless/empty-conclusion` [既定 w] | − | w | w | − | w | w | w | w | w |
| `nihongo-slopless/weasel-phrases` [既定 w] | − | w | w | − | w | w | w | w | w |
| `nihongo-slopless/citation-needed` [既定 w] | − | w | w | w | w | w | w | i | w |
| `nihongo-slopless/absolute-claim` [既定 w] | − | w | w | w | w | w | w | w | w |
| `nihongo-slopless/unscoped-generalization` [既定 w] | − | w | w | w | e | w | w | w | e |
| `nihongo-slopless/no-numerics-claim` [既定 w] | − | i | w | w | e | w | w | w | e |
| `nihongo-slopless/abstract-noun-stack` [既定 w] | − | w | w | w | w | w | w | w | w |
| `nihongo-slopless/nominalization-density` [既定 w] | − | w | w | w | w | w | w | w | w |
| `nihongo-slopless/excessive-politeness` [既定 w] | − | w | w | − | − | w | i | w | w |
| `nihongo-slopless/actorless-action` [既定 w] | − | w | w | i | i | w | i | w | w |
| `nihongo-slopless/deadline-missing` [既定 w] | − | w | w | w | w | w | w | w | e |
| `nihongo-slopless/same-ending` [既定 i] | − | i | − | − | − | i | w | w | w |
| `nihongo-slopless/repeated-connectors` [既定 i] | − | i | i | − | i | i | w | w | w |
| `nihongo-slopless/translationese` [既定 i] | − | i | i | i | i | w | i | i | w |
| `nihongo-slopless/buzzword-density` [既定 i] | − | i | w | − | w | w | w | w | w |
| `nihongo-slopless/thin-sentence` [既定 w] | − | w | w | − | w | w | w | w | w |
| `nihongo-slopless/excessive-parentheses` [既定 i] | − | i | i | i | i | i | i | i | w |
| `nihongo-slopless/headline-decoration` [既定 i] | − | i | − | − | − | i | w | i | w |
| `nihongo-slopless/over-possibility` [既定 i] | − | i | w | w | w | w | w | w | e |
| `nihongo-slopless/unclear-deictic` [既定 i] | − | − | w | w | − | w | w | w | e |

## ルール別 重み付けの差

- `nihongo-slopless/hidden-unicode-controls`: 全プロファイルで重み付けが同等(error相当)。
- `nihongo-slopless/placeholder`: 全プロファイルで重み付けが同等(error相当)。
- `nihongo-slopless/chat-response-leakage`: 全プロファイルで重み付けが同等(warning相当)。
- `nihongo-slopless/list-intro-padding`: 重い側 = `web`, `agent-output`, `strict`、軽い側 = `minimal`, `research`。 例えば `general` は info、`strict` は warning、`minimal` は off。
- `nihongo-slopless/long-sentence`: 全プロファイルで重み付けが同等(warning相当)。
- `nihongo-slopless/long-paragraph`: 重い側 = 8 profile (`general`, `business`, `technical` ほか)、軽い側 = `minimal`。 例えば `general` は warning、`strict` は warning、`minimal` は info。
- `nihongo-slopless/empty-conclusion`: 重い側 = 7 profile (`general`, `business`, `research` ほか)、軽い側 = `minimal`, `technical`。 例えば `general` は warning、`strict` は warning、`minimal` は off。
- `nihongo-slopless/weasel-phrases`: 重い側 = 7 profile (`general`, `business`, `research` ほか)、軽い側 = `minimal`, `technical`。 例えば `general` は warning、`strict` は warning、`minimal` は off。
- `nihongo-slopless/citation-needed`: 重い側 = 7 profile (`general`, `business`, `technical` ほか)、軽い側 = `minimal`。 例えば `general` は warning、`strict` は warning、`minimal` は off。
- `nihongo-slopless/absolute-claim`: 重い側 = 8 profile (`general`, `business`, `technical` ほか)、軽い側 = `minimal`。 例えば `general` は warning、`strict` は warning、`minimal` は off。
- `nihongo-slopless/unscoped-generalization`: 重い側 = `research`, `strict`、軽い側 = `minimal`。 例えば `general` は warning、`strict` は error、`minimal` は off。
- `nihongo-slopless/no-numerics-claim`: 重い側 = `research`, `strict`、軽い側 = `minimal`。 例えば `general` は info、`strict` は error、`minimal` は off。
- `nihongo-slopless/abstract-noun-stack`: 重い側 = 8 profile (`general`, `business`, `technical` ほか)、軽い側 = `minimal`。 例えば `general` は warning、`strict` は warning、`minimal` は off。
- `nihongo-slopless/nominalization-density`: 重い側 = 8 profile (`general`, `business`, `technical` ほか)、軽い側 = `minimal`。 例えば `general` は warning、`strict` は warning、`minimal` は off。
- `nihongo-slopless/excessive-politeness`: 重い側 = 5 profile (`general`, `business`, `public` ほか)、軽い側 = `minimal`, `technical`, `research`。 例えば `general` は warning、`strict` は warning、`minimal` は off。
- `nihongo-slopless/actorless-action`: 重い側 = 5 profile (`general`, `business`, `public` ほか)、軽い側 = `minimal`。 例えば `general` は warning、`strict` は warning、`minimal` は off。
- `nihongo-slopless/deadline-missing`: 重い側 = `strict`、軽い側 = `minimal`。 例えば `general` は warning、`strict` は error、`minimal` は off。
- `nihongo-slopless/same-ending`: 重い側 = `web`, `agent-output`, `strict`、軽い側 = `minimal`, `business`, `technical`, `research`。 例えば `general` は info、`strict` は warning、`minimal` は off。
- `nihongo-slopless/repeated-connectors`: 重い側 = `web`, `agent-output`, `strict`、軽い側 = `minimal`, `technical`。 例えば `general` は info、`strict` は warning、`minimal` は off。
- `nihongo-slopless/translationese`: 重い側 = `public`, `strict`、軽い側 = `minimal`。 例えば `general` は info、`strict` は warning、`minimal` は off。
- `nihongo-slopless/buzzword-density`: 重い側 = 6 profile (`business`, `research`, `public` ほか)、軽い側 = `minimal`, `technical`。 例えば `general` は info、`strict` は warning、`minimal` は off。
- `nihongo-slopless/thin-sentence`: 重い側 = 7 profile (`general`, `business`, `research` ほか)、軽い側 = `minimal`, `technical`。 例えば `general` は warning、`strict` は warning、`minimal` は off。
- `nihongo-slopless/excessive-parentheses`: 重い側 = `strict`、軽い側 = `minimal`。 例えば `general` は info、`strict` は warning、`minimal` は off。
- `nihongo-slopless/headline-decoration`: 重い側 = `web`, `strict`、軽い側 = `minimal`, `business`, `technical`, `research`。 例えば `general` は info、`strict` は warning、`minimal` は off。
- `nihongo-slopless/over-possibility`: 重い側 = `strict`、軽い側 = `minimal`。 例えば `general` は info、`strict` は error、`minimal` は off。
- `nihongo-slopless/unclear-deictic`: 重い側 = `strict`、軽い側 = `minimal`, `general`, `research`。 例えば `general` は off、`strict` は error、`minimal` は off。

## オプション差分

severity 以外で `options` を取るルールについて、プロファイル間の値差を一覧します。`·` は当該プロファイルが値を指定していない(=ルールの内部既定が使われる)ことを示します。

#### `nihongo-slopless/long-sentence`

| option | minimal | general | business | technical | research | public | web | agent-output | strict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `errorChars` | `220` | `170` | `170` | `160` | `220` | `160` | `170` | `170` | `140` |
| `maxChars` | `140` | `110` | `110` | `100` | `130` | `100` | `110` | `110` | `90` |

#### `nihongo-slopless/long-paragraph`

| option | minimal | general | business | technical | research | public | web | agent-output | strict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `maxChars` | `650` | `420` | `380` | `360` | `520` | `360` | `420` | `420` | `320` |
| `maxSentences` | `8` | `5` | `5` | `5` | `7` | `5` | `5` | `5` | `4` |

#### `nihongo-slopless/weasel-phrases`

| option | minimal | general | business | technical | research | public | web | agent-output | strict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `maxPerParagraph` | − | `3` | `2` | − | `3` | `2` | `3` | `3` | `1` |

#### `nihongo-slopless/abstract-noun-stack`

| option | minimal | general | business | technical | research | public | web | agent-output | strict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `minHits` | − | `4` | `4` | `4` | `4` | `4` | `4` | `3` | `3` |

#### `nihongo-slopless/nominalization-density`

| option | minimal | general | business | technical | research | public | web | agent-output | strict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `minChars` | − | `60` | `60` | `60` | `70` | `60` | `60` | `60` | `50` |
| `minHits` | − | `6` | `6` | `6` | `7` | `6` | `6` | `5` | `5` |

#### `nihongo-slopless/excessive-politeness`

| option | minimal | general | business | technical | research | public | web | agent-output | strict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `maxSasetePerParagraph` | − | `2` | `2` | − | − | `2` | · | `2` | `1` |

#### `nihongo-slopless/translationese`

| option | minimal | general | business | technical | research | public | web | agent-output | strict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `maxPerParagraph` | − | · | · | · | · | · | · | · | `3` |

#### `nihongo-slopless/buzzword-density`

| option | minimal | general | business | technical | research | public | web | agent-output | strict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `maxPerParagraph` | − | · | `3` | − | `3` | `3` | `3` | `3` | `2` |

## 矛盾候補

> 以下は **観察** であり、誤りではありません。設計意図上で意図的に差を付けている場合もあります。

### 再確認候補

#### `nihongo-slopless/citation-needed`

- (agent-weaker-than-general) citation-needed は agent-output(info) が general(warning) より軽い。agent-output は「強めに見る」運用想定との差。

#### `nihongo-slopless/unclear-deictic`

- (strict-warn-general-off) unclear-deictic は strict で error だが general で無効化されている
- (agent-on-general-off) unclear-deictic は agent-output で warning だが general で無効化されている

### 設計と整合する観察(参考)

`minimal` プロファイルは「誤検出を極力抑える」設計のため、`general` で warning のルールが `minimal` で off になる差分は意図的なものです。下記は参考として残します。

#### `nihongo-slopless/empty-conclusion`

- (general-warn-minimal-off) empty-conclusion は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/weasel-phrases`

- (general-warn-minimal-off) weasel-phrases は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/citation-needed`

- (general-warn-minimal-off) citation-needed は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/absolute-claim`

- (general-warn-minimal-off) absolute-claim は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/unscoped-generalization`

- (general-warn-minimal-off) unscoped-generalization は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/abstract-noun-stack`

- (general-warn-minimal-off) abstract-noun-stack は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/nominalization-density`

- (general-warn-minimal-off) nominalization-density は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/excessive-politeness`

- (general-warn-minimal-off) excessive-politeness は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/actorless-action`

- (general-warn-minimal-off) actorless-action は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/deadline-missing`

- (general-warn-minimal-off) deadline-missing は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

#### `nihongo-slopless/thin-sentence`

- (general-warn-minimal-off) thin-sentence は general で warning だが minimal で off。minimal は最小導入として割り切りがあると見るか、移行段差が大きい可能性。

## 改善提案(再確認候補)

- `nihongo-slopless/citation-needed` は `agent-output`(info)が `general`(warning)より軽い。`agent-output` は応答残骸や薄い文体を「強めに見る」前提があるため、設計と運用の整合を再確認したい。
- `nihongo-slopless/citation-needed` は evidence-responsibility 分類だが `agent-output` で info。応答残骸を主用途とする agent-output では根拠系を warning 以上に置く設計が自然か観察したい。

## 観察方法のメモ

- `cellLetter()` は `false`/`"off"` を `−` に、未指定を `?` に、severity を頭文字 1 文字 (`e`/`w`/`i`) に変換しています。
- 矛盾候補の `kind` には次が含まれます: `minimal-on-strict-off`、`strict-warn-general-off`、`agent-on-general-off`、`default-warn-general-off`、`over-strict`、`metadata-vs-profile-off`、`metadata-missing-profile`、`agent-weaker-than-general`、`minimal-set-strict-off`、`general-warn-minimal-off`、`option-tighter-than-strict`。
- `metadata-*` 系は `src/rules/metadata.mjs` の `profiles` フィールドと `config/profiles/*.json` の実際の値の対応関係を観察したものです。`profiles` フィールドは「設計意図として対象に含めたい profile」を示しているため、ここでのずれは「思想と設定の同期が取れていない可能性」を示します。
- `option-tighter-than-strict` は、ある profile のオプション値が `strict` より厳しい(`max*` が小さい / `min*` が小さい)場合に観察として残します。`strict` が一律に最も厳しい設計でないケースを照らします。
