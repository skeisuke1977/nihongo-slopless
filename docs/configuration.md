# 設定ファイル

`nihongo-slopless` は、`.nihongo-slopless.json` または `nihongo-slopless.config.json` を作業ディレクトリから読み込みます。`--config <path>` を指定した場合は、そのJSONを読み込みます。

`--config <path>` で明示したファイルが存在しない場合は、設定なしとして続行せず実行エラーにします。自動読み込み対象の `.nihongo-slopless.json` と `nihongo-slopless.config.json` は、どちらも存在しなければ空設定として扱います。

設定は、著者や生成元を推定するためのものではありません。目的は、文書用途に合わせて決定論的なルールの強さ、閾値、検査対象を調整することです。

## JSON Schema

設定ファイル用のJSON Schemaは `config/schema.json` です。エディタ補完を使う場合は、設定ファイルの先頭に `$schema` を置けます。

```json
{
  "$schema": "./config/schema.json",
  "rules": {
    "nihongo-slopless/long-sentence": ["warning", { "maxChars": 120 }],
    "nihongo-slopless/chat-response-leakage": "error",
    "nihongo-slopless/buzzword-density": false
  }
}
```

このスキーマは、現在実行される設定項目だけを対象にします。

## 現在の設定形式

トップレベルで使える実装済み項目は `rules`, `ignoreFiles`, `ignorePatterns`, `allowTerms`, `collapseOccurrences`, `occurrenceMergeDistance` です。

`rules` はルールIDをキーにしたオブジェクトです。キーには完全なルールIDと短いルールIDのどちらも使えます。

```json
{
  "rules": {
    "nihongo-slopless/long-sentence": "warning",
    "empty-conclusion": "off"
  }
}
```

存在しないルールIDは設定ミスとして扱い、CLIは実行エラー（終了コード2）で停止します。たとえば `nihongo-slopless/long-sentnce` のような誤字は黙って無視されません。JSON Schema でも `rules` のキーは既知の完全IDまたは短縮IDに制限しています。

同じルールに完全なIDと短いIDを同時に書くと、完全なIDの指定が優先されます。混乱を避けるため、通常は完全なIDに統一してください。

## ルール値

各ルールの値には、次の形式を使えます。

| 形式 | 例 | 意味 |
|---|---|---|
| `false` | `"buzzword-density": false` | ルールを無効化する |
| `"off"` | `"empty-conclusion": "off"` | ルールを無効化する |
| 重要度文字列 | `"citation-needed": "error"` | 重要度だけを上書きする |
| 配列形式 | `"long-sentence": ["warning", { "maxChars": 120 }]` | 重要度とオプションを上書きする |
| オブジェクト形式 | `"long-paragraph": { "severity": "warning", "options": { "maxChars": 500 } }` | 重要度とオプションを明示して上書きする |

重要度は `info`, `warning`, `error` の3種類です。重要度は出力や終了コードの扱いに使う分類であり、文章の品質スコアではありません。

## ファイル除外

`ignoreFiles` は、CLIがファイル入力、ディレクトリ入力、glob入力を展開した後に、検査対象から外すファイルパターンです。パターンは作業ディレクトリからの相対パスとして解釈し、簡易globとして `*`, `?`, `**` を使えます。`**/` は0個以上のディレクトリに一致するため、`docs/**/*.md` は `docs/a.md` と `docs/sub/a.md` の両方に一致します。brace展開や文字クラスはサポート対象外です。`docs/*.{md,markdown}` や `docs/[ac]*.md` は使わず、対象を分けて指定してください。

```json
{
  "ignoreFiles": [
    "dist/**",
    "vendor/**",
    "docs/generated/**"
  ]
}
```

`-` で読み込む標準入力は、出力上のパスが `<stdin>` であっても `ignoreFiles` の対象にはなりません。

想定する用途:

- 生成物、外部由来ファイル、検査済みの固定文書を除外する。
- 文書本文ではないログ、スナップショット、ビルド成果物を除外する。

設計上の注意:

- 除外理由をコメントとしてJSON内に書けないため、必要なら別文書やレビュー記録に残す。
- 除外は検査負荷と誤検出を下げるための機能であり、都合の悪い指摘を隠すためのスコア調整にしない。

## 許可語

`allowTerms` は、特定の語句に起因する一部ルールの指摘を、理由付きで抑制する設定です。語句は正規表現ではなくリテラル文字列として扱います。対象ルールは完全なルールIDで明示し、省略や `*` 指定はできません。

```json
{
  "allowTerms": [
    {
      "term": "世界初",
      "rules": ["nihongo-slopless/citation-needed"],
      "reason": "プレスリリース本文で出典付きの表現として使用する"
    }
  ]
}
```

想定する用途:

- 組織名、制度名、専門用語、引用内の定型表現を許可する。
- 文脈上必要な強い表現を、理由付きで残す。

設計上の注意:

- `reason` は必須です。許可の根拠を人間が確認できるようにします。
- 許可語は全ルールを横断して無効化するのではなく、対象ルールを限定します。
- 抑制は、指摘範囲が許可語句の出現範囲に完全に含まれる場合だけです。たとえば `期待される` を許可しても、文全体を指摘する `empty-conclusion` は自動では消えません。
- `allowTerms` は編集上の例外記録であり、著者推定、AI利用推定、文章の信頼度スコアには使いません。

## 本文除外

`ignorePatterns` は、本文中の特定行を検査対象から外す設定です。現時点で実装している範囲は `scope: "line"` だけです。`pattern` は行末改行を除いた1行に対してJavaScript正規表現として評価し、一致した物理行全体をルール実行前にマスクします。

```json
{
  "ignorePatterns": [
    {
      "pattern": "^> ",
      "scope": "line",
      "reason": "引用ブロックは原文保持を優先する"
    }
  ]
}
```

想定する用途:

- 引用、逐語記録、テンプレート断片など、編集できない行を限定的に除外する。
- ファイル全体を外すほどではないが、本文中に原文保持すべき短い範囲が混じる場合に使う。

設計上の注意:

- `reason` は必須です。除外の根拠を人間が確認できるようにします。
- 行単位除外は、引用やビルド・テンプレートから生成済みで本文編集対象外の断片など、原文を直接直せない短い範囲に限って使ってください。
- 正規表現は範囲を狭く保ち、`^> ` や `^\\s*出典:` のように行頭などで限定してください。
- 空文字に一致するパターンは実行時に拒否します。広すぎるパターンは見逃しを増やすため、`ignoreFiles` や理由付き無視コメントで足りる場合はそちらを優先します。
- `ignoreFiles` はファイル単位の除外、`ignorePatterns` は本文行単位の除外、`allowTerms` は特定語句に起因する一部ルールの抑制です。用途を混ぜないでください。
- 標準入力で読んだ本文にも `ignorePatterns` は適用されます。これは `<stdin>` を除外しない `ignoreFiles` とは異なります。

## プロファイルとの併用

`--profile` と設定ファイルを併用した場合、プロファイル設定を先に読み、設定ファイルが上書きします。

```bash
node bin/nihongo-slopless.mjs docs --profile research --config .nihongo-slopless.json --pretty
```

配列形式またはオブジェクト形式でオプションを指定した場合、プロファイル側のオプションと設定ファイル側のオプションはマージされます。設定ファイル側に同じキーがあれば、設定ファイル側が優先されます。

## 入れない項目

次の項目は設定仕様に入れません。

- AI生成確率、AIらしさ、著者推定、盗用や不正の判定に関わる項目。
- 指摘数を単一の品質スコアに変換する項目。
- 個人、授業、組織の評価や処分を自動化するための項目。

`nihongo-slopless` の設定は、編集候補を調整するためのものです。判定、認定、採点のための設定面は持たせません。
