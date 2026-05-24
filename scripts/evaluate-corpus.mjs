#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { allRules, lintText, summarizeResults } from '../src/index.mjs';
import { loadProfileConfig } from '../src/profiles.mjs';

function parseArgs(argv) {
  const args = [...argv];
  const options = { pretty: false, profile: null, summary: false };
  const files = [];

  const readOptionValue = optionName => {
    const value = args.shift();
    if (!value || value.startsWith('--')) {
      throw new Error(`${optionName} には値を指定してください。`);
    }
    return value;
  };

  while (args.length) {
    const arg = args.shift();
    if (arg === '--pretty') options.pretty = true;
    else if (arg === '--summary') options.summary = true;
    else if (arg === '--profile') options.profile = readOptionValue('--profile');
    else files.push(arg);
  }
  return { files, options };
}

function ensureFullRuleId(rule) {
  return rule.startsWith('nihongo-slopless/') ? rule : `nihongo-slopless/${rule}`;
}

function prf(tp, fp, fn) {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function createEmptyCountStats() {
  return {
    expected: 0,
    predicted: 0,
    matched: 0,
    excess: 0,
    shortfall: 0,
    evaluatedRecords: 0,
    matchedRecords: 0,
    mismatchedRecords: 0,
    evaluatedRules: 0,
    matchedRules: 0,
    mismatchedRules: 0,
  };
}

function createEmptyFindingStats() {
  return {
    expected: 0,
    predicted: 0,
    matched: 0,
    missed: 0,
    unexpected: 0,
    evaluatedRecords: 0,
    matchedRecords: 0,
    mismatchedRecords: 0,
  };
}

function addCountTotals(target, delta) {
  target.expected += delta.expected;
  target.predicted += delta.predicted;
  target.matched += delta.matched;
  target.excess += delta.excess;
  target.shortfall += delta.shortfall;
}

function addCountSummaryStats(target, delta) {
  addCountTotals(target, delta);
  target.evaluatedRules += 1;
  if (delta.excess || delta.shortfall) target.mismatchedRules += 1;
  else target.matchedRules += 1;
}

function addRuleCountStats(target, delta) {
  addCountTotals(target, delta);
  target.evaluatedRecords += 1;
  if (delta.excess || delta.shortfall) target.mismatchedRecords += 1;
  else target.matchedRecords += 1;
}

function addFindingStats(target, delta) {
  target.expected += delta.expected;
  target.predicted += delta.predicted;
  target.matched += delta.matched;
  target.missed += delta.missed;
  target.unexpected += delta.unexpected;
}

function sortedRules(rules) {
  return [...rules].sort();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

const knownRuleIds = new Set(allRules.map(rule => ensureFullRuleId(rule.id)));
const REVIEW_STATUSES = new Set(['TP', 'FP', 'FN', 'boundary', 'defer', 'keep']);

function describeRecord(file, lineNo, record) {
  const id = record && typeof record === 'object' && hasOwn(record, 'id') ? record.id : '<missing>';
  return `${file}:${lineNo}: id=${String(id)}`;
}

function validateRuleId(rule, source, context) {
  if (typeof rule !== 'string') {
    throw new Error(`${context}: ${source} はルールID文字列の配列で指定してください。`);
  }

  const ruleId = ensureFullRuleId(rule);
  if (!knownRuleIds.has(ruleId)) {
    throw new Error(`${context}: ${source} に未知のルールID ${rule} があります。`);
  }
}

function validateRuleArray(value, source, context) {
  if (!Array.isArray(value)) {
    throw new Error(`${context}: ${source} は配列で指定してください。`);
  }
  for (const rule of value) validateRuleId(rule, source, context);
}

function validateExpectedCountsObject(counts, source, context) {
  if (counts == null || typeof counts !== 'object' || Array.isArray(counts)) {
    throw new Error(`${context}: ${source} はルールIDをキー、非負整数を値にしたオブジェクトで指定してください。`);
  }

  for (const [rule, count] of Object.entries(counts)) {
    validateRuleId(rule, source, context);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`${context}: ${source}.${rule} は非負整数で指定してください。`);
    }
  }
}

function validateExpectedFinding(finding, source, context) {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new Error(`${context}: ${source} はオブジェクトの配列で指定してください。`);
  }

  const rule = finding.ruleId ?? finding.rule;
  validateRuleId(rule, `${source}.ruleId`, context);

  for (const key of ['line', 'column']) {
    if (hasOwn(finding, key) && (!Number.isInteger(finding[key]) || finding[key] <= 0)) {
      throw new Error(`${context}: ${source}.${key} は1以上の整数で指定してください。`);
    }
  }

  for (const key of ['excerpt', 'messageIncludes']) {
    if (hasOwn(finding, key) && (typeof finding[key] !== 'string' || finding[key].length === 0)) {
      throw new Error(`${context}: ${source}.${key} は空でない文字列で指定してください。`);
    }
  }

  if (!hasOwn(finding, 'excerpt') && !hasOwn(finding, 'messageIncludes')) {
    throw new Error(`${context}: ${source} は excerpt または messageIncludes を指定してください。line と column は補助条件です。`);
  }
}

function validateExpectedFindingArray(value, source, context) {
  if (!Array.isArray(value)) {
    throw new Error(`${context}: ${source} は配列で指定してください。`);
  }
  value.forEach((finding, index) => validateExpectedFinding(finding, `${source}[${index}]`, context));
}

function validateGoldsetRecord(record, file, lineNo) {
  const context = describeRecord(file, lineNo, record);
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`${context}: JSONL行はオブジェクトで指定してください。`);
  }

  if (typeof record.text !== 'string') {
    throw new Error(`${context}: text は必須の文字列です。`);
  }

  for (const source of ['expectedRules', 'expected']) {
    if (hasOwn(record, source)) validateRuleArray(record[source], source, context);
  }

  if (hasOwn(record, 'expectedByProfile')) {
    if (
      !record.expectedByProfile ||
      typeof record.expectedByProfile !== 'object' ||
      Array.isArray(record.expectedByProfile)
    ) {
      throw new Error(`${context}: expectedByProfile はprofile名をキー、ルールID配列を値にしたオブジェクトで指定してください。`);
    }
    for (const [profile, rules] of Object.entries(record.expectedByProfile)) {
      validateRuleArray(rules, `expectedByProfile.${profile}`, context);
    }
  }

  if (hasOwn(record, 'expectedCounts')) {
    validateExpectedCountsObject(record.expectedCounts, 'expectedCounts', context);
  }

  if (hasOwn(record, 'expectedCountsByProfile')) {
    if (
      !record.expectedCountsByProfile ||
      typeof record.expectedCountsByProfile !== 'object' ||
      Array.isArray(record.expectedCountsByProfile)
    ) {
      throw new Error(`${context}: expectedCountsByProfile はprofile名をキー、件数オブジェクトを値にして指定してください。`);
    }
    for (const [profile, counts] of Object.entries(record.expectedCountsByProfile)) {
      validateExpectedCountsObject(counts, `expectedCountsByProfile.${profile}`, context);
    }
  }

  if (hasOwn(record, 'expectedFindings')) {
    validateExpectedFindingArray(record.expectedFindings, 'expectedFindings', context);
  }

  if (hasOwn(record, 'expectedFindingsByProfile')) {
    if (
      !record.expectedFindingsByProfile ||
      typeof record.expectedFindingsByProfile !== 'object' ||
      Array.isArray(record.expectedFindingsByProfile)
    ) {
      throw new Error(`${context}: expectedFindingsByProfile はprofile名をキー、expectedFindings配列を値にして指定してください。`);
    }
    for (const [profile, findings] of Object.entries(record.expectedFindingsByProfile)) {
      validateExpectedFindingArray(findings, `expectedFindingsByProfile.${profile}`, context);
    }
  }

  if (hasOwn(record, 'review')) {
    if (!record.review || typeof record.review !== 'object' || Array.isArray(record.review)) {
      throw new Error(`${context}: review は判断記録オブジェクトで指定してください。`);
    }
    if (!REVIEW_STATUSES.has(record.review.status)) {
      throw new Error(`${context}: review.status は ${[...REVIEW_STATUSES].join('|')} のいずれかを指定してください。`);
    }
    for (const key of ['decision', 'reason']) {
      if (hasOwn(record.review, key) && typeof record.review[key] !== 'string') {
        throw new Error(`${context}: review.${key} は文字列で指定してください。`);
      }
    }
  }
}

function selectExpectedRules(record, profile) {
  if (
    profile &&
    record.expectedByProfile &&
    typeof record.expectedByProfile === 'object' &&
    !Array.isArray(record.expectedByProfile) &&
    hasOwn(record.expectedByProfile, profile)
  ) {
    return {
      rules: record.expectedByProfile[profile] ?? [],
      source: `expectedByProfile.${profile}`,
    };
  }

  if (hasOwn(record, 'expectedRules')) {
    return { rules: record.expectedRules ?? [], source: 'expectedRules' };
  }

  if (hasOwn(record, 'expected')) {
    return { rules: record.expected ?? [], source: 'expected' };
  }

  return { rules: [], source: 'none' };
}

function normalizeExpectedCounts(counts, source) {
  if (counts == null) return {};
  if (typeof counts !== 'object' || Array.isArray(counts)) {
    throw new Error(`${source} はルールIDをキー、非負整数を値にしたオブジェクトで指定してください。`);
  }

  const normalized = {};
  for (const [rule, count] of Object.entries(counts)) {
    const ruleId = ensureFullRuleId(rule);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`${source}.${rule} は非負整数で指定してください。`);
    }
    if (hasOwn(normalized, ruleId)) {
      throw new Error(`${source} で ${ruleId} が重複しています。短縮IDと完全IDの併用を避けてください。`);
    }
    normalized[ruleId] = count;
  }
  return normalized;
}

function selectExpectedCounts(record, profile) {
  if (
    profile &&
    record.expectedCountsByProfile &&
    typeof record.expectedCountsByProfile === 'object' &&
    !Array.isArray(record.expectedCountsByProfile) &&
    hasOwn(record.expectedCountsByProfile, profile)
  ) {
    return {
      counts: normalizeExpectedCounts(
        record.expectedCountsByProfile[profile],
        `expectedCountsByProfile.${profile}`,
      ),
      source: `expectedCountsByProfile.${profile}`,
    };
  }

  if (hasOwn(record, 'expectedCounts')) {
    return { counts: normalizeExpectedCounts(record.expectedCounts, 'expectedCounts'), source: 'expectedCounts' };
  }

  return { counts: {}, source: 'none' };
}

function normalizeExpectedFinding(finding) {
  const normalized = {
    ruleId: ensureFullRuleId(finding.ruleId ?? finding.rule),
  };

  for (const key of ['line', 'column', 'excerpt', 'messageIncludes']) {
    if (finding[key] !== undefined) normalized[key] = finding[key];
  }
  return normalized;
}

function normalizeExpectedFindings(findings) {
  return (findings ?? []).map(normalizeExpectedFinding);
}

function selectExpectedFindings(record, profile) {
  if (
    profile &&
    record.expectedFindingsByProfile &&
    typeof record.expectedFindingsByProfile === 'object' &&
    !Array.isArray(record.expectedFindingsByProfile) &&
    hasOwn(record.expectedFindingsByProfile, profile)
  ) {
    return {
      findings: normalizeExpectedFindings(record.expectedFindingsByProfile[profile]),
      source: `expectedFindingsByProfile.${profile}`,
    };
  }

  if (hasOwn(record, 'expectedFindings')) {
    return { findings: normalizeExpectedFindings(record.expectedFindings), source: 'expectedFindings' };
  }

  return { findings: [], source: 'none' };
}

function countMessagesByRule(messages) {
  const counts = {};
  for (const message of messages) {
    counts[message.ruleId] = (counts[message.ruleId] ?? 0) + 1;
  }
  return counts;
}

function sortCountMap(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeInlineText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function messageMatchesExpectedFinding(message, expectedFinding) {
  if (message.ruleId !== expectedFinding.ruleId) return false;
  if (expectedFinding.line !== undefined && message.line !== expectedFinding.line) return false;
  if (expectedFinding.column !== undefined && message.column !== expectedFinding.column) return false;
  if (
    expectedFinding.excerpt !== undefined &&
    !normalizeInlineText(message.excerpt).includes(normalizeInlineText(expectedFinding.excerpt))
  ) {
    return false;
  }
  if (
    expectedFinding.messageIncludes !== undefined &&
    !String(message.message ?? '').includes(expectedFinding.messageIncludes)
  ) {
    return false;
  }
  return true;
}

function summarizeMessageFinding(message) {
  return {
    ruleId: message.ruleId,
    severity: message.severity,
    line: message.line,
    column: message.column,
    excerpt: message.excerpt,
    message: message.message,
  };
}

function evaluateExpectedFindings(messages, expectedFindings) {
  if (expectedFindings.length === 0) {
    return {
      expectedFindings: [],
      predictedFindings: [],
      matchedFindings: [],
      missedFindings: [],
      unexpectedFindings: [],
    };
  }

  const expectedRuleIds = new Set(expectedFindings.map(finding => finding.ruleId));
  const predictedEntries = messages
    .map((message, index) => ({ message, index }))
    .filter(entry => expectedRuleIds.has(entry.message.ruleId));
  const usedMessageIndexes = new Set();
  const matchedFindings = [];
  const missedFindings = [];

  for (const expectedFinding of expectedFindings) {
    const matchedEntry = predictedEntries.find(entry => (
      !usedMessageIndexes.has(entry.index) &&
      messageMatchesExpectedFinding(entry.message, expectedFinding)
    ));

    if (matchedEntry) {
      usedMessageIndexes.add(matchedEntry.index);
      matchedFindings.push({
        expected: expectedFinding,
        actual: summarizeMessageFinding(matchedEntry.message),
      });
    } else {
      missedFindings.push(expectedFinding);
    }
  }

  const unexpectedFindings = predictedEntries
    .filter(entry => !usedMessageIndexes.has(entry.index))
    .map(entry => summarizeMessageFinding(entry.message));

  return {
    expectedFindings,
    predictedFindings: predictedEntries.map(entry => summarizeMessageFinding(entry.message)),
    matchedFindings,
    missedFindings,
    unexpectedFindings,
  };
}

function summarizeCountCase(record, profile, rule, messages, expectedCount, predictedCount) {
  const item = summarizeRecordCase(record, profile, rule, messages);
  item.expectedCount = expectedCount;
  item.predictedCount = predictedCount;
  const diff = predictedCount - expectedCount;
  if (diff > 0) item.excess = diff;
  if (diff < 0) item.shortfall = Math.abs(diff);
  return item;
}

function summarizeRuleMessages(rule, messages) {
  return messages
    .filter(message => message.ruleId === rule)
    .map(message => ({
      severity: message.severity,
      line: message.line,
      column: message.column,
      message: message.message,
      excerpt: message.excerpt,
    }));
}

function summarizeRecordCase(record, profile, rule, messages) {
  const item = {
    id: record.id ?? '<goldset>',
    profile,
  };

  for (const key of ['domain', 'category', 'note']) {
    if (record[key] !== undefined) item[key] = record[key];
  }
  if (record.review !== undefined) item.review = record.review;

  const ruleMessages = summarizeRuleMessages(rule, messages);
  if (ruleMessages.length) item.messages = ruleMessages;
  return item;
}

function summarizeFindingCase(record, profile, payload) {
  const item = {
    id: record.id ?? '<goldset>',
    profile,
    ...payload,
  };

  for (const key of ['domain', 'category', 'note']) {
    if (record[key] !== undefined) item[key] = record[key];
  }
  if (record.review !== undefined) item.review = record.review;
  return item;
}

function createReviewSummary() {
  return {
    records: 0,
    byStatus: {},
    byDecision: {},
  };
}

function addReviewSummary(summary, review) {
  if (!review) return;
  summary.records += 1;
  summary.byStatus[review.status] = (summary.byStatus[review.status] ?? 0) + 1;
  if (review.decision) {
    summary.byDecision[review.decision] = (summary.byDecision[review.decision] ?? 0) + 1;
  }
}

async function main() {
  const { files, options } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.error('Usage: node scripts/evaluate-corpus.mjs <goldset.jsonl> [--pretty] [--summary] [--profile <name>]');
    process.exitCode = 2;
    return;
  }

  const records = [];
  for (const file of files) {
    const body = await readFile(file, 'utf8');
    for (const [lineNo, line] of body.split(/\n/u).entries()) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        validateGoldsetRecord(record, file, lineNo + 1);
        records.push(record);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`${file}:${lineNo + 1}: JSONL parse error: ${error.message}`);
        }
        throw error;
      }
    }
  }

  const perRule = new Map();
  const perRuleMismatches = new Map();
  const countsByRule = new Map();
  const countMismatchesByRule = new Map();
  const findingsByRule = new Map();
  const findingMismatchesByRule = new Map();
  const perProfile = new Map();
  const countProfilesByProfile = new Map();
  const findingProfilesByProfile = new Map();
  const profileConfigCache = new Map();
  const filesOut = [];
  const countSummary = createEmptyCountStats();
  const findingSummary = createEmptyFindingStats();
  const reviewSummary = createReviewSummary();

  for (const record of records) {
    const profile = options.profile ?? record.profile ?? null;
    const profileKey = profile ?? '<default>';
    if (!profileConfigCache.has(profile)) {
      profileConfigCache.set(profile, await loadProfileConfig(profile));
    }

    const result = lintText(record.text, {
      filePath: record.id ?? '<goldset>',
      config: profileConfigCache.get(profile),
    });
    const predicted = new Set(result.messages.map(m => m.ruleId));
    const predictedCounts = countMessagesByRule(result.messages);
    const expectedSpec = selectExpectedRules(record, profile);
    const expectedCountSpec = selectExpectedCounts(record, profile);
    const expectedFindingSpec = selectExpectedFindings(record, profile);
    const expected = new Set([
      ...expectedSpec.rules.map(ensureFullRuleId),
      ...expectedFindingSpec.findings.map(finding => finding.ruleId),
    ]);
    const universe = new Set([...predicted, ...expected]);
    const truePositives = new Set();
    const falsePositives = new Set();
    const falseNegatives = new Set();
    const countMatches = new Set();
    const countExcesses = [];
    const countShortfalls = [];
    const countRules = Object.keys(expectedCountSpec.counts).sort();
    const findingEvaluation = evaluateExpectedFindings(result.messages, expectedFindingSpec.findings);
    addReviewSummary(reviewSummary, record.review);

    for (const rule of universe) {
      const s = perRule.get(rule) ?? { tp: 0, fp: 0, fn: 0 };
      if (predicted.has(rule) && expected.has(rule)) {
        s.tp += 1;
        truePositives.add(rule);
      } else if (predicted.has(rule) && !expected.has(rule)) {
        s.fp += 1;
        falsePositives.add(rule);
        const mismatches = perRuleMismatches.get(rule) ?? { falsePositiveRecords: [], missedRecords: [] };
        mismatches.falsePositiveRecords.push(summarizeRecordCase(record, profile, rule, result.messages));
        perRuleMismatches.set(rule, mismatches);
      } else if (!predicted.has(rule) && expected.has(rule)) {
        s.fn += 1;
        falseNegatives.add(rule);
        const mismatches = perRuleMismatches.get(rule) ?? { falsePositiveRecords: [], missedRecords: [] };
        mismatches.missedRecords.push(summarizeRecordCase(record, profile, rule, result.messages));
        perRuleMismatches.set(rule, mismatches);
      }
      perRule.set(rule, s);
    }

    let countProfile = null;
    if (countRules.length) {
      countSummary.evaluatedRecords += 1;
      countProfile = countProfilesByProfile.get(profileKey) ?? createEmptyCountStats();
      countProfile.evaluatedRecords += 1;
    }
    let recordHasCountMismatch = false;
    for (const rule of countRules) {
      const expectedCount = expectedCountSpec.counts[rule];
      const predictedCount = predictedCounts[rule] ?? 0;
      const matched = Math.min(expectedCount, predictedCount);
      const excess = Math.max(predictedCount - expectedCount, 0);
      const shortfall = Math.max(expectedCount - predictedCount, 0);
      const delta = { expected: expectedCount, predicted: predictedCount, matched, excess, shortfall };
      const ruleCounts = countsByRule.get(rule) ?? {
        expected: 0,
        predicted: 0,
        matched: 0,
        excess: 0,
        shortfall: 0,
        evaluatedRecords: 0,
        matchedRecords: 0,
        mismatchedRecords: 0,
      };

      addRuleCountStats(ruleCounts, delta);
      addCountSummaryStats(countSummary, delta);
      if (countProfile) addCountSummaryStats(countProfile, delta);
      countsByRule.set(rule, ruleCounts);

      if (excess || shortfall) {
        recordHasCountMismatch = true;
        const mismatch = summarizeCountCase(record, profile, rule, result.messages, expectedCount, predictedCount);
        const mismatches = countMismatchesByRule.get(rule) ?? { excessRecords: [], shortfallRecords: [] };
        if (excess) {
          countExcesses.push({ ruleId: rule, expectedCount, predictedCount, excess });
          mismatches.excessRecords.push(mismatch);
        }
        if (shortfall) {
          countShortfalls.push({ ruleId: rule, expectedCount, predictedCount, shortfall });
          mismatches.shortfallRecords.push(mismatch);
        }
        countMismatchesByRule.set(rule, mismatches);
      } else {
        countMatches.add(rule);
      }
    }
    if (countRules.length) {
      if (recordHasCountMismatch) {
        countSummary.mismatchedRecords += 1;
        countProfile.mismatchedRecords += 1;
      } else {
        countSummary.matchedRecords += 1;
        countProfile.matchedRecords += 1;
      }
      countProfilesByProfile.set(profileKey, countProfile);
    }

    if (expectedFindingSpec.findings.length) {
      const findingDelta = {
        expected: findingEvaluation.expectedFindings.length,
        predicted: findingEvaluation.predictedFindings.length,
        matched: findingEvaluation.matchedFindings.length,
        missed: findingEvaluation.missedFindings.length,
        unexpected: findingEvaluation.unexpectedFindings.length,
      };
      const findingMismatch = findingDelta.missed > 0 || findingDelta.unexpected > 0;

      findingSummary.evaluatedRecords += 1;
      addFindingStats(findingSummary, findingDelta);
      if (findingMismatch) findingSummary.mismatchedRecords += 1;
      else findingSummary.matchedRecords += 1;

      const findingProfile = findingProfilesByProfile.get(profileKey) ?? createEmptyFindingStats();
      findingProfile.evaluatedRecords += 1;
      addFindingStats(findingProfile, findingDelta);
      if (findingMismatch) findingProfile.mismatchedRecords += 1;
      else findingProfile.matchedRecords += 1;
      findingProfilesByProfile.set(profileKey, findingProfile);

      const findingRuleIds = new Set([
        ...findingEvaluation.expectedFindings.map(finding => finding.ruleId),
        ...findingEvaluation.predictedFindings.map(finding => finding.ruleId),
      ]);
      for (const ruleId of findingRuleIds) {
        const ruleStats = findingsByRule.get(ruleId) ?? createEmptyFindingStats();
        const ruleDelta = {
          expected: findingEvaluation.expectedFindings.filter(finding => finding.ruleId === ruleId).length,
          predicted: findingEvaluation.predictedFindings.filter(finding => finding.ruleId === ruleId).length,
          matched: findingEvaluation.matchedFindings.filter(finding => finding.expected.ruleId === ruleId).length,
          missed: findingEvaluation.missedFindings.filter(finding => finding.ruleId === ruleId).length,
          unexpected: findingEvaluation.unexpectedFindings.filter(finding => finding.ruleId === ruleId).length,
        };
        ruleStats.evaluatedRecords += 1;
        addFindingStats(ruleStats, ruleDelta);
        if (ruleDelta.missed > 0 || ruleDelta.unexpected > 0) ruleStats.mismatchedRecords += 1;
        else ruleStats.matchedRecords += 1;
        findingsByRule.set(ruleId, ruleStats);
      }

      for (const missedFinding of findingEvaluation.missedFindings) {
        const mismatches = findingMismatchesByRule.get(missedFinding.ruleId) ?? { missedRecords: [], unexpectedRecords: [] };
        mismatches.missedRecords.push(summarizeFindingCase(record, profile, { expected: missedFinding }));
        findingMismatchesByRule.set(missedFinding.ruleId, mismatches);
      }
      for (const unexpectedFinding of findingEvaluation.unexpectedFindings) {
        const mismatches = findingMismatchesByRule.get(unexpectedFinding.ruleId) ?? { missedRecords: [], unexpectedRecords: [] };
        mismatches.unexpectedRecords.push(summarizeFindingCase(record, profile, { actual: unexpectedFinding }));
        findingMismatchesByRule.set(unexpectedFinding.ruleId, mismatches);
      }
    }

    const profileCounts = perProfile.get(profileKey) ?? { tp: 0, fp: 0, fn: 0, records: 0 };
    profileCounts.tp += truePositives.size;
    profileCounts.fp += falsePositives.size;
    profileCounts.fn += falseNegatives.size;
    profileCounts.records += 1;
    perProfile.set(profileKey, profileCounts);

    filesOut.push({
      id: record.id,
      profile,
      expectedSource: expectedSpec.source,
      expectedCountSource: expectedCountSpec.source,
      expectedFindingSource: expectedFindingSpec.source,
      expected: sortedRules(expected),
      predicted: sortedRules(predicted),
      expectedCounts: sortCountMap(expectedCountSpec.counts),
      predictedCounts: sortCountMap(predictedCounts),
      expectedFindings: findingEvaluation.expectedFindings,
      predictedFindings: findingEvaluation.predictedFindings,
      matchedFindings: findingEvaluation.matchedFindings,
      missedFindings: findingEvaluation.missedFindings,
      unexpectedFindings: findingEvaluation.unexpectedFindings,
      review: record.review,
      truePositives: sortedRules(truePositives),
      falsePositives: sortedRules(falsePositives),
      falseNegatives: sortedRules(falseNegatives),
      countMatches: sortedRules(countMatches),
      countExcesses,
      countShortfalls,
      messages: result.messages,
    });
  }

  const rules = {};
  const ruleSummary = [];
  let micro = { tp: 0, fp: 0, fn: 0 };
  for (const [rule, counts] of [...perRule.entries()].sort()) {
    const metrics = { ...counts, ...prf(counts.tp, counts.fp, counts.fn) };
    rules[rule] = metrics;
    ruleSummary.push({ ruleId: rule, ...metrics });
    micro.tp += counts.tp;
    micro.fp += counts.fp;
    micro.fn += counts.fn;
  }

  const ruleMismatches = {};
  for (const [rule, mismatches] of [...perRuleMismatches.entries()].sort()) {
    ruleMismatches[rule] = mismatches;
  }

  const countsByRuleOut = {};
  for (const [rule, counts] of [...countsByRule.entries()].sort()) {
    countsByRuleOut[rule] = { ...counts, ...prf(counts.matched, counts.excess, counts.shortfall) };
  }

  const countProfiles = {};
  for (const [profile, counts] of [...countProfilesByProfile.entries()].sort()) {
    countProfiles[profile] = { ...counts, ...prf(counts.matched, counts.excess, counts.shortfall) };
  }

  const findingProfiles = {};
  for (const [profile, counts] of [...findingProfilesByProfile.entries()].sort()) {
    findingProfiles[profile] = { ...counts, ...prf(counts.matched, counts.unexpected, counts.missed) };
  }

  const findingsByRuleOut = {};
  for (const [rule, counts] of [...findingsByRule.entries()].sort()) {
    findingsByRuleOut[rule] = { ...counts, ...prf(counts.matched, counts.unexpected, counts.missed) };
  }

  const countMismatches = {};
  for (const [rule, mismatches] of [...countMismatchesByRule.entries()].sort()) {
    countMismatches[rule] = mismatches;
  }

  const findingMismatches = {};
  for (const [rule, mismatches] of [...findingMismatchesByRule.entries()].sort()) {
    findingMismatches[rule] = mismatches;
  }

  const profiles = {};
  for (const [profile, counts] of [...perProfile.entries()].sort()) {
    profiles[profile] = { ...counts, ...prf(counts.tp, counts.fp, counts.fn) };
  }

  const payload = {
    tool: 'nihongo-slopless-evaluate',
    records: records.length,
    profile: options.profile,
    micro: { ...micro, ...prf(micro.tp, micro.fp, micro.fn) },
    rules,
    ruleSummary,
    ruleMismatches,
    countSummary: { ...countSummary, ...prf(countSummary.matched, countSummary.excess, countSummary.shortfall) },
    findingSummary: { ...findingSummary, ...prf(findingSummary.matched, findingSummary.unexpected, findingSummary.missed) },
    reviewSummary,
    countProfiles,
    findingProfiles,
    countsByRule: countsByRuleOut,
    countMismatches,
    findingsByRule: findingsByRuleOut,
    findingMismatches,
    profiles,
    lintSummary: summarizeResults(filesOut.map(f => ({ path: f.id, messages: f.messages }))),
    files: filesOut,
  };

  const outputPayload = options.summary ? { ...payload } : payload;
  if (options.summary) delete outputPayload.files;

  console.log(JSON.stringify(outputPayload, null, options.pretty ? 2 : 0));
  process.exitCode = payload.micro.fp ||
    payload.micro.fn ||
    payload.countSummary.excess ||
    payload.countSummary.shortfall ||
    payload.findingSummary.missed ||
    payload.findingSummary.unexpected
    ? 1
    : 0;
}

await main().catch(error => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 2;
});
