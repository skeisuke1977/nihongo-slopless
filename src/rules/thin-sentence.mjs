import { hasEvidenceMarker, literalAlternationRegex, stringList, visibleLength } from '../utils.mjs';

const vaguePredicates = [
  '重要である',
  '必要である',
  '有効である',
  '有用である',
  '期待される',
  '考えられる',
  '求められる',
  '不可欠である',
  '意義がある',
  '価値がある',
  '課題である',
  '可能性がある',
];

// 「主体宣言」型の箇条書き先頭。
// 例: `- **日本の関連産業**：…` や `**第二段階**：…` のように主体・小見出しが冒頭で示された文。
// 抑止語ではなく対象を明確化しているため、抽象締めではなく要点提示として扱う。
const bulletLeadPattern = /^\s*(?:[-+*]\s+)?\*\*[^*]+?\*\*\s*[：:]/u;

// 譲歩接続: vague述語の直後で「が、」「ものの、」「とはいえ、」「けれども、」などが続く場合。
// 編集不能感が薄れ、別の主張に繋ぐ役割になっているケース。
const concessionConnectors = ['が、', 'ものの、', 'とはいえ、', 'けれども、', 'けれど、', 'けど、'];

// 条件節と具体的な役割名が同居する短い予測文。
// 例: `この仕組みが定着すると、記者や編集者に問われることが変わる可能性がある。`
// 対象と条件が見えている場合は、抽象的な締めではなく慎重な予測として扱う。
const conditionalPattern = /(?:と|場合|なら|とき|時|際)[、，]/u;
const roleNounPatterns = [
  '記者', '編集者', '読者', '利用者', '顧客', '担当者', '研究者', '教員', '学生',
  '市民', '住民', '患者', '株主', '投資家', '債券投資家', '被害者', '被疑者',
  '当事者', '警察', '企業', '自治体', '学校', '部署',
];
const specificConditionalPredicates = ['可能性がある'];

// ドメイン語・具体名詞の手掛かり。実体名（機関、産業、技術）を含む可能性が高い語。
// これらが2つ以上見つかる、または長い漢字熟語・カタカナ語と合わさったときに「具体性あり」と判断する。
const concreteNounPatterns = [
  // 法務・行政・制度
  '訴訟', '判決', '法案', '法律', '法解釈', '制度', '条例', '規制', '規則', '通達', '布告',
  '裁判', '判例', '判断材料', '判定基準',
  // 経済・金融
  '投資', '資金', '資本', '資産', '借入', '借金', '債券', '株主', '株式', '配当',
  '上場', '増資', '社債', '債務', '財務', '与信', '保証', '担保', '為替', '通貨',
  '決済', '利率', '金利', '預金', '貸付', '銀行',
  // 機関・主体
  '機構', '機関', '委員会', '協議会', '省庁', '省', '庁', '当局', '政府', '内閣',
  '大学', '高専', '研究所', '株式会社', '監査', '監督', '監視',
  // 産業・機器・素材
  '装置', '材料', '素材', '機器', '設備', '部品', '製品', '製造', '生産',
  '送電', '配電', '系統', '原発', '風力', '太陽光', '電池', '蓄電', '電力',
  '産業', '業界', '部門', '部署',
  // ICT・データ
  'インフラ', 'システム', 'プラットフォーム', 'ネットワーク', 'アルゴリズム',
  'データ', 'モデル', 'アプリ', 'クラウド', 'サーバ', 'ストア', 'ログ', 'ツール',
  'アプリストア', 'プログラミング', 'モバイル', 'ユーザー',
  // 取引・主体
  '顧客', '利用者', '担当者', '当事者', '市場', '業界',
  '契約', '契約書', '取引', '配信', '配布',
  // 政策・分析語
  '波及', '波及効果', '相殺措置', '大規模化', '早期発見', '抑止',
  '論点', '争点', '見解', '原則', '基準',
  // 観測対象
  '合意', '証拠', '被害', '警察', '被疑者', '逃亡犯',
  '衛星', '宇宙', '大気圏', '周波数', '軌道', '高度', '衝突', '連鎖', '汚染',
];

function countMatches(text, words) {
  let count = 0;
  for (const word of words) {
    if (!word) continue;
    let idx = 0;
    while ((idx = text.indexOf(word, idx)) !== -1) {
      count += 1;
      idx += word.length;
    }
  }
  return count;
}

function countQuotePairs(text) {
  return [...text.matchAll(/[「『“][^「『“」』”]+[」』”]/gu)].length;
}

function hasVagueInsideQuote(text, vaguePredicates) {
  for (const v of vaguePredicates) {
    const pattern = new RegExp(`[「『“][^「『“」』”]*?${v}[^「『“」』”]*?[」』”]`, 'u');
    if (pattern.test(text)) return true;
  }
  return false;
}

function hasConcessionAfterVague(text, vaguePredicates, connectors) {
  for (const v of vaguePredicates) {
    const vagueIdx = text.indexOf(v);
    if (vagueIdx === -1) continue;
    const tail = text.slice(vagueIdx + v.length);
    for (const c of connectors) {
      if (!c) continue;
      const cIdx = tail.indexOf(c);
      if (cIdx === -1) continue;
      // 譲歩接続の後にも本文が一定量残っているかを確認。
      const after = tail.slice(cIdx + c.length).trim();
      if (visibleLength(after) >= 6) return true;
    }
  }
  return false;
}

function shapeScore(text) {
  // 4字以上の漢字熟語、3字以上のカタカナ語、2字以上の英大文字は具体性の弱い手掛かりに留める。
  // `学習支援` や `環境整備` のような抽象的な熟語だけで抑制しないため、形だけの加点は最大2点。
  const longKanji = [...text.matchAll(/[一-龯々]{4,}/gu)].length;
  const longKatakana = [...text.matchAll(/[ァ-ヶ][ァ-ヶー]{2,}/gu)].length;
  const upper = [...text.matchAll(/[A-Z][A-Z]+/gu)].length;
  return Math.min((longKanji + longKatakana + upper) * 2, 2);
}

function hasSpecificConditionalFrame(text, roleNouns, predicates) {
  if (!conditionalPattern.test(text)) return false;
  if (!predicates.some(predicate => text.includes(predicate))) return false;
  return countMatches(text, roleNouns) >= 1;
}

export const rule = {
  id: 'thin-sentence',
  defaultSeverity: 'warning',
  description: '長さはあるのに、具体的な対象・数値・根拠が乏しい文を検出します。',
  defaultOptions: {
    vaguePredicates,
    minChars: 35,
    bulletLeadExclusion: true,
    concessionConnectorExclusion: true,
    concessionConnectors,
    concreteNounPatterns,
    roleNounPatterns,
    specificConditionalPredicates,
    concreteScoreThreshold: 3,
    specificConditionalExclusion: true,
  },
  suggestion: '誰が、何を、どの条件で、どう変えるのかを足してください。',
  run({ doc, options }) {
    const regex = literalAlternationRegex(options.vaguePredicates);
    if (!regex) return [];
    const vagueList = stringList(options.vaguePredicates);
    const concreteNouns = stringList(options.concreteNounPatterns);
    const roleNouns = stringList(options.roleNounPatterns);
    const conditionalPredicates = stringList(options.specificConditionalPredicates);
    const concessionList = stringList(options.concessionConnectors);
    const threshold = Number.isFinite(options.concreteScoreThreshold)
      ? options.concreteScoreThreshold
      : 3;

    const findings = [];
    for (const sentence of doc.sentences) {
      const text = sentence.text;
      const len = visibleLength(text);
      if (len < options.minChars) continue;

      const hits = [...text.matchAll(regex)];
      if (hits.length < 1) continue;

      const hasNumber = /[0-9０-９]/u.test(text);
      if (hasNumber) continue;
      if (hasEvidenceMarker(text)) continue;

      const hasNameLike = /[A-ZＡ-Ｚ]{2,}|[一-龠]{2,}(?:大学|高専|省|庁|機構|研究所|委員会|株式会社|社)/u.test(text);
      if (hasNameLike) continue;

      // 主体宣言型の箇条書き先頭は除外する。
      if (options.bulletLeadExclusion && bulletLeadPattern.test(text)) continue;

      // vague述語が引用符内にある場合は、表現自体を分析対象としているため除外する。
      if (hasVagueInsideQuote(text, vagueList)) continue;

      // 譲歩接続辞付きで次の主張に繋がる場合は除外する。
      if (options.concessionConnectorExclusion
        && hasConcessionAfterVague(text, vagueList, concessionList)) continue;

      // 条件と具体的な役割名が同居する文は、短くても対象・条件が見える予測として除外する。
      if (options.specificConditionalExclusion
        && hasSpecificConditionalFrame(text, roleNouns, conditionalPredicates)) continue;

      // 引用句が複数あれば、編集者が特定の語句を取り上げているとみなして除外する。
      const quotePairs = countQuotePairs(text);
      if (quotePairs >= 2) continue;

      // 具体名詞のドメイン語と「形の手掛かり（長い漢字熟語・カタカナ語・英大文字）」で具体性スコアを算出。
      // 1個の引用語句があれば +1 する（特定の語を取り上げている兆候）。
      const score = shapeScore(text) + countMatches(text, concreteNouns) + quotePairs;
      if (score >= threshold) continue;

      findings.push({
        index: sentence.start + hits[0].index,
        length: hits[0][0].length,
        message: '具体情報が不足している可能性があります。具体例、対象、数値、根拠、次の行動を足せるか確認してください。',
      });
    }
    return findings;
  },
};
