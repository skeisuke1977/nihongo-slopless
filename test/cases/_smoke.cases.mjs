// Smoke fixture for the cases loader pipeline.
// Underscore prefix → 自動走査の対象外。`run-tests.mjs` から明示 import される。
//
// 目的:
//   1. loader が default export を読み、`expect: true|false|{count}` を分岐できること
//   2. ファイル名 stem 推定をエントリ側 `rule` で上書きできること

export default [
  {
    name: 'smoke positive: TODO は placeholder が発火',
    text: 'TODO: ここに具体例を書く。',
    rule: 'placeholder',
    expect: true,
  },
  {
    name: 'smoke negative: ただの本文では placeholder は発火しない',
    text: '本文は通常の散文で構成されている。',
    rule: 'placeholder',
    expect: false,
  },
  {
    name: 'smoke count: 単一テキスト内で placeholder が 1 件',
    text: '担当者欄は[ ]のままです。',
    rule: 'placeholder',
    expect: { count: 1 },
  },
];
