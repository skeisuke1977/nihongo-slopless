// test/cases/no-numerics-claim.cases.mjs
//
// no-numerics-claim ルールの陽性 / 陰性ケース集。
//
// loader 規約 (test/cases/_loader.mjs):
//   - default export は配列。
//   - 各ケースは { name, text, expect: true | false | { count } }。
//   - ファイル名 stem が rule short id とみなされる
//     → このファイルは `nihongo-slopless/no-numerics-claim` に紐付く。
//
// 統合状態:
//   F統合 (`src/rules/index.mjs` への登録) は別作業。loader 側で未登録ルールは
//   `expect: false` のみ検証され、`expect: true` は自動スキップされる。
//   そのため `npm test` は登録前でも壊れない。
//
// 直接実行は reports/dispatch/no-numerics-claim.check.mjs から行う。
// そちらは rule.run({doc, options}) を直接呼ぶため、ルール未登録でも陽性を検証できる。

const RULE_SHORT = 'no-numerics-claim';

export const cases = [
  // ─────────────────────────────────────────────────────────────
  // 陽性 11 件 — 強度語 + 効果語 のペアで定量・対比・出典が無い
  // ─────────────────────────────────────────────────────────────
  {
    name: 'positive/01-売上は大幅に向上',
    text: '新サービスにより、売上は大幅に向上した。',
    rule: RULE_SHORT,
    expect: true,
    note: '強度語「大幅に」+効果語「向上」、数値・期間・対比なし。',
  },
  {
    name: 'positive/02-利用者数は劇的に改善',
    text: '本施策で利用者数は劇的に改善した。',
    rule: RULE_SHORT,
    expect: true,
    note: '「劇的に改善」、根拠なし。',
  },
  {
    name: 'positive/03-研究分野が飛躍的に発展',
    text: '研究分野が飛躍的に発展している。',
    rule: RULE_SHORT,
    expect: true,
    note: '「飛躍的に発展」、定量情報なし。',
  },
  {
    name: 'positive/04-利用件数は著しく増加',
    text: '提案制度の利用件数は著しく増加した。',
    rule: RULE_SHORT,
    expect: true,
    note: '「著しく増加」、件数の具体値なし。',
  },
  {
    name: 'positive/05-業務は圧倒的に効率化',
    text: '新体制で業務は圧倒的に効率化が進んだ印象がある。',
    rule: RULE_SHORT,
    expect: true,
    note: '「圧倒的に効率化」、定量情報なし。',
  },
  {
    name: 'positive/06-画期的な成果',
    text: '今回の改修により、画期的な成果が得られた。',
    rule: RULE_SHORT,
    expect: true,
    note: '「画期的な成果」、定量情報なし。',
  },
  {
    name: 'positive/07-大きく前進',
    text: '今期の取り組みは大きく前進した。',
    rule: RULE_SHORT,
    expect: true,
    note: '「大きく前進」、評価指標なし。',
  },
  {
    name: 'positive/08-爆発的な普及',
    text: '生成AIの活用は爆発的な普及を見せている。',
    rule: RULE_SHORT,
    expect: true,
    note: '「爆発的な普及」、数値なし。',
  },
  {
    name: 'positive/09-急速な発展',
    text: '人材育成プログラムは急速な発展を遂げた。',
    rule: RULE_SHORT,
    expect: true,
    note: '「急速な発展」、対比・期間なし。',
  },
  {
    name: 'positive/10-急激に低下',
    text: '採用面接の通過率は急激に低下した。',
    rule: RULE_SHORT,
    expect: true,
    note: '「急激に低下」、比較対象・期間なし。',
  },
  {
    name: 'positive/11-大幅なコスト削減',
    text: '新しい運用により、大幅なコスト削減が実現した。',
    rule: RULE_SHORT,
    expect: true,
    note: '強度語「大幅な」+効果語「削減」、数値・期間・対比なし。',
  },

  // ─────────────────────────────────────────────────────────────
  // 陰性 14 件 — 定量・対比・期間・出典が伴う、または主張ではないため除外されるべき
  // ─────────────────────────────────────────────────────────────
  {
    name: 'negative/01-前年比あり',
    text: '新サービスにより、売上は前年比で大幅に向上した。',
    rule: RULE_SHORT,
    expect: false,
    note: '「前年比」という対比語が文中にある。',
  },
  {
    name: 'negative/02-数値あり',
    text: '本施策で利用者数は20%劇的に改善した。',
    rule: RULE_SHORT,
    expect: false,
    note: '「20%」という数値が文中にある。',
  },
  {
    name: 'negative/03-期間あり',
    text: '研究分野は10年で飛躍的に発展した。',
    rule: RULE_SHORT,
    expect: false,
    note: '「10年」という期間が文中にある。',
  },
  {
    name: 'negative/04-件数あり',
    text: '提案制度の利用件数は350件まで著しく増加した。',
    rule: RULE_SHORT,
    expect: false,
    note: '「350件」という数値がある。',
  },
  {
    name: 'negative/05-当社比あり',
    text: '当社比で業務は圧倒的に効果が高い水準にある。',
    rule: RULE_SHORT,
    expect: false,
    note: '「当社比」という対比語がある。',
  },
  {
    name: 'negative/06-出典URLあり',
    text: '今回の改修により、画期的な成果(参考: https://example.com/report)が得られた。',
    rule: RULE_SHORT,
    expect: false,
    note: 'URL出典が文末に添えられている。',
  },
  {
    name: 'negative/07-過去最高あり',
    text: '今期の取り組みは過去最高の水準まで大きく前進した。',
    rule: RULE_SHORT,
    expect: false,
    note: '「過去最高」という対比語がある。',
  },
  {
    name: 'negative/08-引用内',
    text: '記事では「大幅に向上した」と書かれていた。',
    rule: RULE_SHORT,
    expect: false,
    note: '引用内のため除外される。',
  },
  {
    name: 'negative/09-昨年比あり',
    text: '昨年比で来場者は急激に増加した。',
    rule: RULE_SHORT,
    expect: false,
    note: '「昨年比」という対比語がある。',
  },
  {
    name: 'negative/10-期間3か月あり',
    text: '新人研修は3か月で急速な成長を見せた。',
    rule: RULE_SHORT,
    expect: false,
    note: '「3か月」という期間がある。',
  },
  {
    name: 'negative/11-強度語と効果語のペアなし',
    text: '彼の物語は静かだが確かな歩みを描いている。',
    rule: RULE_SHORT,
    expect: false,
    note: '強度語+効果語のペアが存在しない (誤検出回避)。',
  },
  {
    name: 'negative/12-goldset-大きな意味から発展へ飛ばない',
    text: 'この施策は地域の課題解決に大きな意味を持ち、今後の発展が期待される。',
    rule: RULE_SHORT,
    expect: false,
    note: '「大きな」は「意味」を修飾しており、読点後の「発展」へ飛ばない。',
  },
  {
    name: 'negative/13-比較導入の違い',
    text: '大きな違いは改善の有無ではなく、利用者が判断できる材料を残す点にある。',
    rule: RULE_SHORT,
    expect: false,
    note: '比較導入の「大きな違い」であり、「改善」を効果主張として扱わない。',
  },
  {
    name: 'negative/14-改善するかどうか',
    text: 'この章では、大幅に改善するかどうかを比較する前に、評価指標を確認する。',
    rule: RULE_SHORT,
    expect: false,
    note: '改善の有無を比較対象として導入しており、効果主張ではない。',
  },
];

export default cases;
