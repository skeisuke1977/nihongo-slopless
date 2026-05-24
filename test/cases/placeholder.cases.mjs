// placeholder ルールの追加検証ケース。
// run-tests.mjs は変更しない方針のため、本ファイルは reports/dispatch/placeholder.check.mjs
// から読み込んで個別に検証する。
//
// expect: 'rule'  → placeholder ルールが少なくとも 1 件検出されることを期待する。
// expect: 'norule' → placeholder ルールが 1 件も検出されないことを期待する。
// origin: ケースの由来（既存テスト / 合成境界例 / 新規境界ケース）。

export const placeholderCases = [
  // --- 既存 run-tests.mjs の assertion と整合する陽性ケース ---
  {
    name: 'TODO ここに具体例を書く は引き続き検出',
    text: 'TODO: ここに具体例を書く。',
    expect: 'rule',
    origin: 'existing-test',
  },
  {
    name: 'テンプレートで始まる文中の TODO+ここに も引き続き検出',
    text: 'テンプレートではTODO: ここに具体例を書く。',
    expect: 'rule',
    origin: 'existing-test',
  },
  {
    name: '引用と説明で囲んだ「ここに氏名を書く」は非検出',
    text: 'テンプレートでは「ここに氏名を書く」と示す。',
    expect: 'norule',
    origin: 'existing-test',
  },
  {
    name: '空の角括弧 [ ] は提出フォームの未記入として検出',
    text: '回答欄は[ ]のまま提出された。',
    expect: 'rule',
    origin: 'existing-test',
  },

  // --- 合成境界例: 既存概念を指す指示詞用法は非検出 ---
  {
    name: 'ここに確認手順の偏りがある（既出概念を指す）',
    text: '審査の実務面では他の部署も関与する。ここに確認手順の偏りがある。一度登録すれば引き返すのは難しい。',
    expect: 'norule',
    origin: 'synthetic-boundary',
  },
  {
    name: 'ここに確認手順の偏りがあります（敬体）',
    text: '承認欄が未設定の部署では、一覧が閉じたままです。ここに確認手順の偏りがあります。',
    expect: 'norule',
    origin: 'synthetic-boundary',
  },
  {
    name: 'ここに、見落としやすい点がある（接続的指示詞）',
    text: '## 差し戻しが増える構造\n\nここに、この運用設計で見落としやすい点がある。',
    expect: 'norule',
    origin: 'synthetic-boundary',
  },
  {
    name: 'ここに焦点を移す必要があります（指示詞用法）',
    text: '「その記録を誰が確認したか」。ここに焦点を移す必要があります。',
    expect: 'norule',
    origin: 'synthetic-boundary',
  },
  {
    name: 'ただし、ここに別の確認点がある',
    text: '担当者の負担は減る。ただし、ここに別の確認点がある。',
    expect: 'norule',
    origin: 'synthetic-boundary',
  },
  {
    name: 'ただし、ここには分岐点がある（助詞「は」つき指示詞）',
    text: '悪くない手順に見える。ただし、ここには分岐点がある。',
    expect: 'norule',
    origin: 'synthetic-boundary',
  },
  {
    name: 'ここにかかっている（既存概念を指す存在述語）',
    text: '支援ツールを「確認装置」ではなく「手順を見直す補助」として使えるかどうかも、ここにかかっている。',
    expect: 'norule',
    origin: 'synthetic-boundary',
  },
  {
    name: 'ここに「主導権の一部」が残っていました（指示詞）',
    text: '最後の承認は担当者が決められる。ここに「確認権限の一部」が残っていました。',
    expect: 'norule',
    origin: 'synthetic-boundary',
  },
  {
    name: 'ここに、明確な認識差がある（既出概念を指す）',
    text: '担当部署は手順が軽くなると感じている。ここに、明確な認識差がある。',
    expect: 'norule',
    origin: 'synthetic-boundary',
  },

  // --- 新規境界ケース ---
  {
    name: 'ここに日付を記入（完成要求語あり → 検出）',
    text: 'ここに日付を記入してください。',
    expect: 'rule',
    origin: 'boundary',
  },
  {
    name: 'ここに値を入力（完成要求語あり → 検出）',
    text: 'ここに値を入力してください。',
    expect: 'rule',
    origin: 'boundary',
  },
  {
    name: 'ここに本文を埋めてください（完成要求語あり → 検出）',
    text: 'ここに本文を埋めてください。',
    expect: 'rule',
    origin: 'boundary',
  },
  {
    name: 'ここに記入欄を挿入する（完成要求語あり → 検出）',
    text: 'ここに挿入する氏名は提出時に決まる。',
    expect: 'rule',
    origin: 'boundary',
  },
  {
    name: 'ここに、で文が続くだけの修辞用法は非検出',
    text: 'ここに、見過ごせない事実が存在する。',
    expect: 'norule',
    origin: 'boundary',
  },
  {
    name: '他の placeholder トークンは影響を受けない (TODO)',
    text: '本文に TODO が残っている。',
    expect: 'rule',
    origin: 'regression',
  },
  {
    name: '他の placeholder トークンは影響を受けない (仮置き)',
    text: '担当者名は仮置きのままだ。',
    expect: 'rule',
    origin: 'regression',
  },
  {
    name: 'チェックボックス記号 - [ ] は非検出のまま',
    text: '- [ ] globstar修正',
    expect: 'norule',
    origin: 'regression',
  },
  {
    name: 'Markdownリンクのインラインコードラベルは空欄扱いしない',
    text: 'API操作は[`patch`](/docs/reference/#patch)と[`replace`](/docs/reference/#replace)で説明される。',
    expect: 'norule',
    origin: 'technical-doc-boundary',
  },
  {
    name: 'Markdownリンクラベル内の TODO は本文の未処理トークン扱いしない',
    text: 'リンク[`TODO`](/issue)はラベル例として使う。',
    expect: 'norule',
    origin: 'technical-doc-boundary',
  },
  {
    name: 'profile境界: 要約欄に残った TODO は検出',
    text: '要約欄にTODOだけが残っているため、公開前に担当者が内容を確認して本文へ置き換える。',
    expect: 'rule',
    origin: 'profile-boundary',
  },
  {
    name: 'profile境界: 結論欄に残った [TBD] は検出',
    text: '調査メモの結論欄が[TBD]のままなので、提出前に根拠と判断理由を本文で短く補う。',
    expect: 'rule',
    origin: 'profile-boundary',
  },
  {
    name: 'profile境界: 連絡先欄に残った [要確認] は検出',
    text: '報告書の連絡先欄に[要確認]と残っているため、担当部署名と受付時間を確定して書き直す。',
    expect: 'rule',
    origin: 'profile-boundary',
  },
  {
    name: 'profile境界: TODO と FIXME が同一行に残る場合は検出',
    text: '章立て案にはTODO: 背景を書く。FIXME: 連絡先を確認する。の二点だけが残っている。',
    expect: 'rule',
    origin: 'profile-boundary',
  },
  {
    name: 'profile境界: 引用されたここに日付を書くは非検出',
    text: 'テンプレートの説明では「ここに日付を書く」と示し、実際の提出文には日付を別欄で記す。',
    expect: 'norule',
    origin: 'profile-boundary',
  },
  {
    name: 'profile境界: ここに、で続く指示詞用法は非検出',
    text: '議論の焦点は手続きから利用者の負担へ移った。ここに、見落としやすい論点が一つ残る。',
    expect: 'norule',
    origin: 'profile-boundary',
  },
];
