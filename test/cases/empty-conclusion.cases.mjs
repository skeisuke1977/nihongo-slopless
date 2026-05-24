// empty-conclusion ルールの profile 境界ケース。
// expect: true は empty-conclusion が発火すべき、false は発火してはならない。
// profileIntent はテストローダでは使わず、境界意図を読むためのメモとして残す。

const enabledProfileConfig = {
  rules: { 'nihongo-slopless/empty-conclusion': 'warning' },
};

const disabledProfileConfig = {
  rules: { 'nihongo-slopless/empty-conclusion': false },
};

export default [
  // ---------------- 陽性ケース (発火すべき) ----------------
  {
    name: '結論節が一助となるだけで終わる',
    text: '結論として、この提案は窓口対応の改善に一助となる。',
    expect: true,
    profileIntent: 'agent-output/general/business/research/public/web/strict で発火',
  },
  {
    name: '示唆を与えるだけのコピペ風総括',
    text: 'この報告は相談記録の整理に示唆を与える。',
    expect: true,
    profileIntent: 'agent-output/general/business/research/public/web/strict で発火',
  },

  // ---------------- 陰性ケース (発火してはならない) ----------------
  {
    name: '成果と次の確認事項が具体的',
    text: '調査では5月の問い合わせ20件のうち12件が申請期限の確認だったため、次回は締切表示を6月10日までに改稿する。',
    expect: false,
    profileIntent: '全profileで empty-conclusion 非該当',
  },
  {
    name: '対象と条件が明示された結論',
    text: '試行期間中の3部署では入力漏れが4件から1件に減ったため、次回は対象部署を増やして同じ記録票で確認する。',
    expect: false,
    profileIntent: '全profileで empty-conclusion 非該当',
  },

  // ---------------- profile 境界ケース ----------------
  {
    name: 'profile境界: agent-output では抽象的な締めとして検出',
    text: '今回の修正は安定運用に大きな意味を持つ。',
    expect: true,
    config: enabledProfileConfig,
    profileIntent: 'agent-output',
  },
  {
    name: 'profile境界: technical では同じ本文を抑制',
    text: '今回の修正は安定運用に大きな意味を持つ。',
    expect: false,
    config: disabledProfileConfig,
    profileIntent: 'technical',
  },
  {
    name: 'profile境界: minimal では同じ本文を抑制',
    text: '今回の修正は安定運用に大きな意味を持つ。',
    expect: false,
    config: disabledProfileConfig,
    profileIntent: 'minimal',
  },
  {
    name: 'profile境界: agent-output では一助となる総括を検出',
    text: 'この記録は共有手順の確認に一助となる。',
    expect: true,
    config: enabledProfileConfig,
    profileIntent: 'agent-output',
  },
  {
    name: 'profile境界: minimal では一助となる総括を抑制',
    text: 'この記録は共有手順の確認に一助となる。',
    expect: false,
    config: disabledProfileConfig,
    profileIntent: 'minimal',
  },
];
