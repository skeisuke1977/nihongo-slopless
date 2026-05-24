// Test cases for the long-paragraph rule.
//
// Run via: node reports/dispatch/long-paragraph.check.mjs
//
// Defaults: maxChars: 420, maxSentences: 5. The rule is strict-greater for both
// thresholds, so a paragraph with exactly 5 countable sentences and 420 visible
// chars does NOT fire.
//
// "Countable" sentences exclude:
//   (a) Markdown-link anchor-only sentences such as `[Source](https://...)`
//       which strip to an empty fragment via stripInlineUrls.
//   (b) Unterminated lead-in sentences such as `なので今後は、〜だけでなく、`
//       that end without a Japanese sentence terminator (。！？!?).
//
// Visible length is measured AFTER stripInlineUrls so that long citation URLs
// do not inflate the paragraph weight either.
//
// Cases are grouped into positives (true long prose), negatives (paragraphs
// whose apparent weight is created by URLs or list-continuation artefacts),
// and boundaries (right around the 420-char / 5-sentence thresholds).

// Build prose of an exact visible length so we can probe the thresholds.
const proseFiller = '日本語の文章においては、主語と述語の距離が長くなりすぎると意味が見えにくくなるため、句読点で適切に区切ることが大切である、';
function buildProseOfLength(n) {
  let body = '';
  while (body.length < n - 1) body += proseFiller;
  body = body.slice(0, n - 1);
  return body + '。';
}

export const positives = [
  {
    name: 'P1: synthetic operations paragraph - 8 fully-terminated sentences, no list connector',
    text:
      '4月の説明会では、担当教員が制度の目的と今年度の変更点を説明した。\n'
      + '続いて、事務担当者が申込方法、提出期限、問い合わせ窓口を順番に案内した。\n'
      + '学生は配布された質問票に不明点を書き、終了後に受付へ提出した。\n'
      + '担当者は質問を手続き、費用、授業日程、個別配慮の四分類に分けた。\n'
      + '次回までに回答一覧を作成し、授業支援システムと掲示板の両方で共有する。\n'
      + '欠席者には同じ内容をメールで送り、必要な添付資料もまとめて案内する。\n'
      + '資料の更新履歴は版番号で管理し、古いPDFへのリンクは週末までに差し替える。\n'
      + 'この記録では、説明会の流れ、残った質問、次回までの対応を整理する。',
    expect: true,
  },
  {
    name: 'P2: 6 completed sentences in one paragraph (legitimately heavy)',
    text:
      'ここまでの整理だけでも十分に大きいのですが、この件がさらに重いのは、学内の複数部署にまたがるからです。\n'
      + '教務側は履修登録との整合を重視し、学生支援側は相談窓口の混雑を避けたいという前提で動きます。\n'
      + '情報システム側は申請フォームの保守を担当し、広報側は公開ページの表現と更新時刻を管理します。\n'
      + 'ここで一度、確認手順が曖昧なまま固定されると、その影響は今年度の説明会だけにとどまりません。\n'
      + '次に出てくる別の制度変更にも同じ作業の詰まりが繰り返される可能性があるからです。\n'
      + 'だからこの整理は、どの部署がどの時点で何を確認するのかを決める準備になっています。',
    expect: true,
  },
  {
    name: 'P3: long prose well over 420 visible chars (single dense paragraph)',
    text: buildProseOfLength(500),
    expect: true,
  },
  {
    name: 'P4: 6 short sentences, character count under 420 — still fires on sentence count',
    text: '一文目です。二文目です。三文目です。四文目です。五文目です。六文目です。',
    expect: true,
    config: { rules: { 'nihongo-slopless/long-paragraph': ['warning', { maxChars: 420, maxSentences: 5 }] } },
  },
  {
    name: 'P5: 7 mid-length completed sentences without any link or list connector',
    text:
      '法案は3月に審議入りした。\n国会では与野党が修正案を提出した。\n5月の本会議で採決が予定されている。\n世論調査は賛否が割れていることを示した。\n地方議会も意見書を相次いで提出している。\n施行は2027年度を目処に検討されている。\n附帯決議の扱いはまだ調整中である。',
    expect: true,
  },
];

export const negatives = [
  {
    name: 'N1: short prose + long inline citation link (anchor-only sentence) does NOT fire',
    text: '委員会側はこの案に追加説明が必要だと指摘している。\n[Source](https://example.invalid/reports/very-long-reference-path-for-anchor-only-sentence)',
    expect: false,
  },
  {
    name: 'N2: lead-in sentence ending with comma (unterminated) before a list — anchor stripped',
    text:
      'なので今後は、接続の議論がスピードだけでなく、\n本当に建つ需要を優先する仕組みと撤退しやすい予約を抑える仕組みの話へ、必ず寄っていきます。',
    expect: false,
  },
  {
    name: 'N3: three short sentences each followed by a citation link — countable=3, prose<420',
    text:
      '一段目は資料Aの説明です。[資料A](https://example.invalid/a/very-long-tracking-url-segment-here-and-here)\n'
      + '二段目は資料Bの説明です。[資料B](https://example.invalid/b/another-very-long-tracking-segment)\n'
      + '三段目は資料Cの説明です。[資料C](https://example.invalid/c/extra-long-reference-segment)',
    expect: false,
  },
  {
    name: 'N4: list of bullet items (each item its own block) does NOT roll up into a paragraph',
    text: '- 受付で資料を配る。\n- 教員が目的を説明する。\n- 学生が質問を書く。\n- 担当者が回答を共有する。',
    expect: false,
    config: { rules: { 'nihongo-slopless/long-paragraph': ['warning', { maxChars: 999, maxSentences: 2 }] } },
  },
  {
    name: 'N5: five sentences with an anchor-only tail — countable=5 (≤ default 5), prose<420',
    text:
      '次は柔軟性です。\n要するに、必要な時に手順を止められるか見直せるかである。\nこの条件は運用設計に直結します。\n検討メモには、差し戻し可能な申請と追加確認が必要な申請を分ける方向性が明記されています。\nさらに、初回回答の期限として5営業日も検討対象に挙げています。\n[Source](https://example.invalid/policies/long-reference-path-for-anchor-only-tail)',
    expect: false,
  },
  {
    name: 'N6: paragraph with image link (alt text long) but real prose is one short sentence',
    text: '本文の図は次のとおり示されている。\n![alt描画テキストでありとても長い説明](https://example.com/very/long/image/path/that/should/not/be/counted.png)',
    expect: false,
  },
  {
    name: 'N7: bullet items each ending with comma (lead-in style) — still split per block, not concatenated',
    text:
      '次の3条件で読むと整理しやすくなります。\n- 偏り：データセンターが一部地域に集中しているか\n- 柔軟性：需要を一時的に下げられるか\n- 見える化：コスト原因が追跡できるか',
    expect: false,
  },
];

export const boundaries = [
  {
    // Exactly 5 sentences and prose under 420 → must NOT fire (rule is strict >).
    name: 'B1: exactly 5 short sentences, prose <420 → no detection',
    text: '一文目です。二文目です。三文目です。四文目です。五文目です。',
    expect: false,
  },
  {
    // Exactly 420 visible chars → must NOT fire (rule is strict >).
    name: 'B2: exactly 420 prose chars, 1 sentence → no detection',
    text: buildProseOfLength(420),
    expect: false,
  },
  {
    // 421 visible chars → just over → must fire.
    name: 'B3: 421 prose chars → detection',
    text: buildProseOfLength(421),
    expect: true,
  },
  {
    // Six sentences with last one being anchor-only → countable=5 → no detection.
    name: 'B4: 5 terminated sentences + 1 anchor-only tail → countable=5 → no detection',
    text:
      '結論はこうである。\n背景はこうである。\n根拠はこうである。\n反論はこうである。\n含意はこうである。\n[Source](https://example.com/long-source-path-here)',
    expect: false,
  },
  {
    // Six sentences with last one being an unterminated lead-in → countable=5 → no detection.
    name: 'B5: 5 terminated sentences + 1 unterminated comma-ending → countable=5 → no detection',
    text:
      '結論はこうである。\n背景はこうである。\n根拠はこうである。\n反論はこうである。\n含意はこうである。\nだから次に検討するのは、',
    expect: false,
  },
  {
    // Seven sentences, last is anchor-only → countable=6 → fires.
    name: 'B6: 6 terminated sentences + 1 anchor-only tail → countable=6 → detection',
    text:
      '結論はこうである。\n背景はこうである。\n根拠はこうである。\n反論はこうである。\n含意はこうである。\n補足はこうである。\n[Source](https://example.com/path)',
    expect: true,
  },
  {
    // High threshold relaxation — should silence on a 7-sentence prose paragraph.
    name: 'B7: relaxed config maxSentences=10 silences a true 7-sentence paragraph',
    text:
      '法案は3月に審議入りした。\n国会では与野党が修正案を提出した。\n5月の本会議で採決が予定されている。\n世論調査は賛否が割れていることを示した。\n地方議会も意見書を相次いで提出している。\n施行は2027年度を目処に検討されている。\n附帯決議の扱いはまだ調整中である。',
    expect: false,
    config: { rules: { 'nihongo-slopless/long-paragraph': ['warning', { maxChars: 999, maxSentences: 10 }] } },
  },
];

export const cases = [
  ...positives.map(c => ({ ...c, group: 'positive' })),
  ...negatives.map(c => ({ ...c, group: 'negative' })),
  ...boundaries.map(c => ({ ...c, group: 'boundary' })),
];

export default cases;
