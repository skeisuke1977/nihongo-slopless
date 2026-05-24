// 同一行近接 findings の occurrences[] 折りたたみテスト。
//
// 既定 (collapseOccurrences 未指定) では複数件のままなのに対し、
// `config.collapseOccurrences: true` で同一 (ruleId, line) の近接列を
// 1 件に集約することを確認する。
//
// loader 仕様: 各 entry の `rule` でショートIDを上書きする。
//   - placeholder: 同一行に複数の placeholder トークン (TODO/TBD/XXX/○○ 等)
//   - repeated-connectors: 同一行で同じ接続詞が複数回 (近接距離が広いケース)
// しきい値検証は `occurrenceMergeDistance` を変えて行う。

export default [
  // ---------------------------------------------------------------
  // 1. 既定動作: collapseOccurrences 未指定 → 各 finding は独立
  // ---------------------------------------------------------------
  {
    name: 'baseline: 単一行に placeholder 4 件 (未指定なら 4 件のまま)',
    text: 'メモ: TODO TBD XXX ○○ あとで埋める。',
    rule: 'placeholder',
    expect: { count: 4 },
  },

  // ---------------------------------------------------------------
  // 2. collapseOccurrences: true で同一行近接が 1 件に集約
  // ---------------------------------------------------------------
  {
    name: 'collapse: 単一行に placeholder 4 件 → 1 件に集約',
    text: 'メモ: TODO TBD XXX ○○ あとで埋める。',
    rule: 'placeholder',
    config: { collapseOccurrences: true },
    expect: { count: 1 },
  },

  // ---------------------------------------------------------------
  // 3. 別行に分散していれば代表 finding は 2 件残る
  // ---------------------------------------------------------------
  {
    name: 'collapse: 異なる行は別 finding として残る',
    text: '1 行目: TODO TBD\n2 行目: XXX ○○',
    rule: 'placeholder',
    config: { collapseOccurrences: true },
    expect: { count: 2 },
  },

  // ---------------------------------------------------------------
  // 4. 距離が広いと別グループとして残る (既定 60)
  //    placeholder 2 件を 60 字超の距離で配置する。
  // ---------------------------------------------------------------
  {
    name: 'collapse: 同一行でも距離が広ければ別 finding',
    text: 'TODO ' + 'あ'.repeat(80) + ' TBD',
    rule: 'placeholder',
    config: { collapseOccurrences: true },
    expect: { count: 2 },
  },

  // ---------------------------------------------------------------
  // 5. occurrenceMergeDistance を大きくすると遠いものも 1 件に
  // ---------------------------------------------------------------
  {
    name: 'collapse: occurrenceMergeDistance を 200 にすれば遠隔も集約',
    text: 'TODO ' + 'あ'.repeat(80) + ' TBD',
    rule: 'placeholder',
    config: { collapseOccurrences: true, occurrenceMergeDistance: 200 },
    expect: { count: 1 },
  },

  // ---------------------------------------------------------------
  // 6. occurrenceMergeDistance: 0 では完全一致のみ集約 (ほぼ無効化)
  //    同一列が起き得ないため、collapse 有効でも独立件数のまま。
  // ---------------------------------------------------------------
  {
    name: 'collapse: occurrenceMergeDistance: 0 ではほぼ集約されない',
    text: 'メモ: TODO TBD XXX ○○ 未完。',
    rule: 'placeholder',
    config: { collapseOccurrences: true, occurrenceMergeDistance: 0 },
    expect: { count: 4 },
  },

  // ---------------------------------------------------------------
  // 7. 単一 finding はそのまま (occurrences 集約しても 1 件)
  // ---------------------------------------------------------------
  {
    name: 'collapse: 1 件しかない finding は集約後も 1 件',
    text: '本文に TODO だけが残っている。',
    rule: 'placeholder',
    config: { collapseOccurrences: true },
    expect: { count: 1 },
  },

  // ---------------------------------------------------------------
  // 8. 異なるルールは同一行でもまとまらない
  //    placeholder 視点では 1 行に 2 件 → 集約で 1 件、
  //    かつ他ルールは同じテキストに無関係。
  // ---------------------------------------------------------------
  {
    name: 'collapse: 同一ルール 2 件が 1 件に',
    text: '同じ行で TODO と XXX を並べる。',
    rule: 'placeholder',
    config: { collapseOccurrences: true },
    expect: { count: 1 },
  },

  // ---------------------------------------------------------------
  // 9. collapseOccurrences: false を明示しても通常動作
  // ---------------------------------------------------------------
  {
    name: 'baseline: collapseOccurrences: false の明示でも通常動作',
    text: 'メモ: TODO TBD XXX ○○ 未完。',
    rule: 'placeholder',
    config: { collapseOccurrences: false },
    expect: { count: 4 },
  },
];
