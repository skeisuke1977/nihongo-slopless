// test/cases/long-sentence.cases.mjs
//
// long-sentence ルールに「URL/インライン引用リンク/bare URL/MediaWiki残渣 を
// 文字長計測から除外する」改修を入れたことに伴う追加ケース集。
//
// loader 規約 (test/cases/_loader.mjs):
//   - default export は配列。
//   - 各ケースは { name, text, expect: true | false | { count } }。
//   - ファイル名 stem が rule short id (`long-sentence`) として扱われる。
//
// `expect: true` は 1 件以上検出、`expect: false` は 0 件、`expect: { count }`
// は厳密な件数を期待する。loader は重大度までは見ないため、severity 区別
// (warning vs error) は `reports/dispatch/long-sentence.check.mjs` 側で検証する。
//
// 直接実行: `node reports/dispatch/long-sentence.check.mjs`。

const RULE_SHORT = 'long-sentence';

// 110/170 ちょうどの境界ケースを作るための擬似プロセ生成ヘルパ。
const proseFiller = 'これはとても長い文章のテスト用ダミーであり、句読点を含めて適切な長さに調整した模擬データを並べた一文として扱う、';
function buildProseOfLength(n) {
  let body = '';
  while (body.length < n - 1) body += proseFiller;
  body = body.slice(0, n - 1);
  return body + '。';
}

export const cases = [
  // ─────────────────────────────────────────────────────────────
  // 陽性 5 件 — 本文のみで 110字 超
  // ─────────────────────────────────────────────────────────────
  {
    name: 'positive/01-既存陽性ケース (本研究では...)',
    text: '本研究では、学生が生成AIを用いて作成した初稿を対象として、主張の明確さ、根拠の具体性、図表説明の妥当性、誤情報の訂正過程、教員コメントへの応答、最終稿における改善の持続性を総合的に評価し、AI利用そのものではなく、改稿過程における判断の質を明らかにする。',
    rule: RULE_SHORT,
    expect: true,
    note: 'URL を含まないが本文だけで 110字 超 (約 128字)。',
  },
  {
    name: 'positive/02-略語括弧多めの合成長文',
    text: '2026年4月15日、学内調整室（ABC）の担当者が情報管理委員会（IMC）宛に説明資料を送り、手順規程のSection 12に基づいて、年度更新（Annual Review）の申請受付、確認、差し戻し、承認記録を一つの台帳で扱うよう方向づけました。',
    rule: RULE_SHORT,
    expect: true,
    note: '括弧補足が多くても本文が 148字 で真陽性。',
  },
  {
    name: 'positive/03-見通しと数値を含む合成長文',
    text: 'また委員会は、（運用支援部門OSCの見通しとして）2030年度までに相談件数が21.5%増えて年間840件に達することや、少なくとも20部署が申請受付と記録保存の手順を承認または審査中であること、さらに問い合わせ窓口の整理と回答期限の明確化が必要であることも資料に盛り込んでいます。',
    rule: RULE_SHORT,
    expect: true,
    note: '本文 132字、URL 無しの真陽性。',
  },
  {
    name: 'positive/04-error severity を超える 170字超',
    text: '本稿では、第一に研究目的の明確化、第二に対象母集団の選定、第三にデータ収集方法の設計、第四に倫理的配慮の確認、第五に統計処理の妥当性、第六に結果の解釈の限界、第七に再現可能性の担保、第八に共著者間の合意形成、第九に投稿先の選定、第十に校正と査読対応までを、段階を区切りつつも全体として一連の編集工程として位置づけ、各段階で生じうる判断ミスを事前に洗い出した。',
    rule: RULE_SHORT,
    expect: true,
    note: '170字 超で severity=error 期待 (severity は check.mjs 側で確認)。',
  },
  {
    name: 'positive/05-長文+引用リンクでも検出が残る',
    text: '委員会側は「確認責任が一部部署に偏る」と警戒し、申請者への説明責任、記録の保存期間、差し戻し基準、問い合わせ窓口の一本化を運用管理室に求める決議を11月11日に採択し、加えて手順規程12条を根拠に各部署の確認範囲を明記するよう主張しました。[Source](https://example.invalid/reports/synthetic-reference)',
    rule: RULE_SHORT,
    expect: true,
    note: '本文だけで 134字 あるため、URL を除去しても検出は維持される。',
  },

  // ─────────────────────────────────────────────────────────────
  // 陰性 5 件 — 本文だけなら ≦ 110字、URL を含めると 110 超
  // ─────────────────────────────────────────────────────────────
  {
    name: 'negative/01-短い本文+長いPDFリンク',
    text: '委員会側は、この案には追加説明が必要だと指摘している。[Source](https://example.invalid/reports/very-long-reference-path-for-length-test)',
    rule: RULE_SHORT,
    expect: false,
    note: '本文 37字、URL/ラベル除去前なら 100字 超。改修後は非発火。',
  },
  {
    name: 'negative/02-中程度の本文+長いPDFリンク',
    text: '運用管理室は、委員会に2026年4月30日までの最終確認を求めています。[Source](https://example.invalid/files/2026-04/synthetic-procedure-letter.pdf)',
    rule: RULE_SHORT,
    expect: false,
    note: '本文 38字。URL は読み手の負荷ではないため非発火が正しい。',
  },
  {
    name: 'negative/03-bare URL末尾',
    text: '委員会は Case No. AB26-4-000 として手続を立ち上げ、コメント募集を開始しました。 https://example.invalid/news-events/synthetic-comment-period-notice-with-long-path',
    rule: RULE_SHORT,
    expect: false,
    note: 'bare URL は文字長から除外される。',
  },
  {
    name: 'negative/04-Markdownオートリンク <url>',
    text: '運用委員会は決議を採択しました。詳細は外部資料を参照してください。<https://example.invalid/publication/synthetic-extra-long-tracking-segment>',
    rule: RULE_SHORT,
    expect: false,
    note: '<https://...> 形式のオートリンクも除外。',
  },
  {
    name: 'negative/05-引用リンク跨ぎ行の合算で誤検出していたパターン',
    text: '本文の結論部分はここで終わります。[Source](https://example.invalid/files/synthetic-reference-letter.pdf)\nこの資料が踏み込んでいるのは責任範囲の点です。',
    rule: RULE_SHORT,
    expect: false,
    note: '前行末尾の [label](url) が次の文に巻き込まれて 165字 等の誤検出を生んでいたパターン。',
  },

  // ─────────────────────────────────────────────────────────────
  // 境界 14 件 — 110/170 閾値ぴったり、URL、画像、MediaWiki 残渣ほか
  // ─────────────────────────────────────────────────────────────
  {
    name: 'boundary/01-本文 110字 ちょうどは非発火',
    text: buildProseOfLength(110),
    rule: RULE_SHORT,
    expect: false,
    note: 'rule は visibleLength > maxChars (110) で発火。境界値の 110 では非発火。',
  },
  {
    name: 'boundary/02-本文 111字 で warning 発火',
    text: buildProseOfLength(111),
    rule: RULE_SHORT,
    expect: true,
    note: '+1 字で発火。severity=warning。',
  },
  {
    name: 'boundary/03-本文 170字 で warning のみ',
    text: buildProseOfLength(170),
    rule: RULE_SHORT,
    expect: true,
    note: '170 以下は error にならない (check.mjs 側で severity 検証)。',
  },
  {
    name: 'boundary/04-本文 171字 で error',
    text: buildProseOfLength(171),
    rule: RULE_SHORT,
    expect: true,
    note: '171 以上で severity=error (check.mjs 側で確認)。',
  },
  {
    name: 'boundary/05-短い本文+長い引用リンクは非発火',
    text: '担当者は申請受付ではなく承認記録の確認を委員会の範囲に入れる、という見解を明示した。[Source](https://example.invalid/files/synthetic-reference-letter.pdf)',
    rule: RULE_SHORT,
    expect: false,
    note: '本文 46字。URL 除去後は十分に短い。',
  },
  {
    name: 'boundary/06-本文+画像リンクは非発火',
    text: '本文の図は次のとおり示されている。![alt描画テキストでありとても長い説明](https://example.com/very/long/image/path/that/should/not/be/counted.png)',
    rule: RULE_SHORT,
    expect: false,
    note: 'Markdown 画像 ![alt](url) は除外対象。本文 17字 で非発火。',
  },
  {
    name: 'boundary/07-連続する引用リンク付き短文の段落',
    text: '一段目は資料Aの説明です。[資料A](https://example.invalid/a/very-long-tracking-url-segment-here)\n二段目は資料Bの説明です。[資料B](https://example.invalid/b/another-very-long-tracking-segment)\n三段目は資料Cの説明です。[資料C](https://example.invalid/c/extra-long-reference-segment)',
    rule: RULE_SHORT,
    expect: false,
    note: '各文が短く、改行で分けても URL 除去が効く。',
  },
  {
    name: 'boundary/08-本文短い+bare URL',
    text: '委員会決議は確認範囲の維持を運用管理室に要請している。 https://example.invalid/publication/synthetic-long-tracking-segment',
    rule: RULE_SHORT,
    expect: false,
    note: 'bare URL 除去後は本文 34字 で非発火。',
  },
  {
    name: 'boundary/09-URL除去後も文末 。 が保持される',
    text: '報告書は11月14日に提出された。[Report](https://example.com/report.pdf)',
    rule: RULE_SHORT,
    expect: false,
    note: 'URL 除去でも文末句点が消えないことを確認する。詳細は check.mjs 側で。',
  },
  {
    name: 'boundary/10-本文 109字+複数引用リンクは非発火',
    text: '本研究は、学生が生成AIを用いて作成した初稿を対象として、主張の明確さ、根拠の具体性、図表説明の妥当性、誤情報の訂正過程、教員コメントへの応答、改善の持続性を評価する。[A](https://example.com/a-very-long-path) [B](https://example.com/b-very-long-path)',
    rule: RULE_SHORT,
    expect: false,
    note: '本文 109 字。URL 込みでは 110 を超えるが、改修後は非発火。',
  },
  {
    name: 'boundary/11-短い本文+MediaWiki wt JSON残渣は非発火',
    text: '山の概要は資料の末尾で確認する。 }}"},"所在地":{"wt":"{{JPN}}{{flatlist|class=hlist-comma|\\n;[[静岡県]]\\n:[[富士市]]\\n:[[富士宮市]]\\n}}"},"種類":{"wt":"[[成層火山]]（{{Cite web|和書|title=火山活動度の資料|url=https://example.com/report.pdf}}）・[[活火山#常時観測対象の火山|常時観測火山]]"},"i":0}}]}">',
    rule: RULE_SHORT,
    expect: false,
    note: 'MediaWiki 抽出由来の {"wt":"..."} 断片と内部リンクは本文長文化ではない。',
  },
  {
    name: 'boundary/12-MediaWiki magic word は文字長に数えない',
    text: '概要だけを案内する __TOC__ __NOTOC__ __FORCETOC__ __NOEDITSECTION__ __NEWSECTIONLINK__ __NONEWSECTIONLINK__ __HIDDENCAT__ __INDEX__ __NOINDEX__ という制御語が残っている。',
    rule: RULE_SHORT,
    expect: false,
    note: 'Magic word の連続で 110字を超えても、実本文は短いため非発火。',
  },
  {
    name: 'boundary/13-本文が長ければMediaWiki断片を除いても発火',
    text: `${buildProseOfLength(116).slice(0, -1)}[[用語集|用語]]{{Rp|12}}。`,
    rule: RULE_SHORT,
    expect: true,
    note: 'MediaWiki 内部リンクと {{Rp}} を除いても本文が 110字を超えるため検出を維持する。',
  },
  {
    name: 'boundary/14-短い本文+入れ子テンプレートは非発火',
    text: '地図の表示位置を確認する {{Infobox mapframe|zoom=09|marker=mountain|coord={{coord|35|21|38.26|N|138|43|38.52|E}}|frame-width=300|caption=説明用の長い設定値}}。',
    rule: RULE_SHORT,
    expect: false,
    note: '入れ子の {{coord}} を含むテンプレート設定は長さ計測から除外する。',
  },

  // ─────────────────────────────────────────────────────────────
  // 2026-05-20 P6 Agent H 境界補強 — 生 HTML タグを長さ計測から除外
  //
  // Markdown 内に残った `<a id="..." class="...">` のような属性付き HTML タグは、
  // 読み手の負荷ではない(レンダリング時に消える)ため長さ計測から外す。
  // 内側の可視テキストは保持し、タグ部分だけを除く。
  // ─────────────────────────────────────────────────────────────
  {
    name: 'boundary/15-本文短+長属性付きHTMLアンカーは非発火',
    text: 'Vue について詳しく知りたい方のために、サンプル動画を<a id="modal-player" class="vuemastery-trigger" data-target="intro-video" data-analytics-event="vue-intro-modal-open" href="#modal-player">こちら</a>に用意した。',
    rule: RULE_SHORT,
    expect: false,
    note: '本文は短いが HTML 属性で 110字を超える典型ケース(tech-vue 由来)。タグ除去後の可視テキスト長で判定する。',
  },
  {
    name: 'boundary/16-HTMLタグを除いても本文が長ければ発火',
    text: `${buildProseOfLength(116).slice(0, -1)}と<a id="x" class="y">補足</a>を含む。`,
    rule: RULE_SHORT,
    expect: true,
    note: 'HTML タグを除いても本文が 110字を超える場合は検出を維持する。',
  },
];

export default cases;
