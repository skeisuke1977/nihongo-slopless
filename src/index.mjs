import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { prepareMarkdown } from './markdown.mjs';
import { allRules, getRuleMetadata } from './rules/index.mjs';
import { isDisabledAt } from './ignore.mjs';
import { offsetToLocation, excerptAt, normalizeSeverity } from './utils.mjs';
import { loadProfileConfig, mergeConfigs } from './profiles.mjs';
import { validateAllowTerms, validateConfig } from './config.mjs';
import { normalizeIgnorePatterns } from './ignore-patterns.mjs';

export { allRules } from './rules/index.mjs';

export function listRuleMetadata() {
  return allRules.map(rule => ({
    ...(getRuleMetadata(rule.id) ?? {}),
    id: `nihongo-slopless/${rule.id}`,
    shortId: rule.id,
    severity: rule.defaultSeverity ?? 'warning',
    description: rule.description ?? '',
    options: rule.defaultOptions ?? {},
  }));
}

function parseRuleConfig(rule, config = {}) {
  const fullId = `nihongo-slopless/${rule.id}`;
  const rules = config.rules ?? {};
  const raw = Object.prototype.hasOwnProperty.call(rules, fullId) ? rules[fullId] : rules[rule.id];

  if (raw === false || raw === 'off') return { enabled: false };

  let severity = rule.defaultSeverity ?? 'warning';
  let options = { ...(rule.defaultOptions ?? {}) };

  if (typeof raw === 'string') {
    severity = normalizeSeverity(raw, severity);
  } else if (Array.isArray(raw)) {
    severity = normalizeSeverity(raw[0], severity);
    if (raw[1] && typeof raw[1] === 'object') options = { ...options, ...raw[1] };
  } else if (raw && typeof raw === 'object') {
    if (raw.severity) severity = normalizeSeverity(raw.severity, severity);
    if (raw.options && typeof raw.options === 'object') options = { ...options, ...raw.options };
  }

  return { enabled: true, severity, options };
}

function findLiteralOccurrences(text, term) {
  const ranges = [];
  let fromIndex = 0;
  while (fromIndex <= text.length) {
    const index = text.indexOf(term, fromIndex);
    if (index === -1) break;
    ranges.push({ start: index, end: index + term.length });
    fromIndex = index + Math.max(term.length, 1);
  }
  return ranges;
}

function isAllowedFinding({ doc, ruleId, index, length, allowTerms }) {
  if (allowTerms.length === 0) return false;
  const findingStart = index;
  const findingEnd = index + Math.max(1, length);

  return allowTerms.some(item => {
    if (!item.rules.includes(ruleId)) return false;
    return findLiteralOccurrences(doc.maskedText, item.term).some(range => (
      findingStart >= range.start && findingEnd <= range.end
    ));
  });
}

const SEVERITY_RANK = { info: 1, warning: 2, error: 3 };
const DEFAULT_OCCURRENCE_MERGE_DISTANCE = 60;
const COLLAPSE_KEY_SEPARATOR = '\u001f';

function maxSeverity(a, b) {
  return (SEVERITY_RANK[b] ?? 0) > (SEVERITY_RANK[a] ?? 0) ? b : a;
}

function collapseMessages(messages, { mergeDistance }) {
  if (!Array.isArray(messages) || messages.length <= 1) return messages;
  // 入力は既に (index, ruleId) で昇順ソート済みである前提。
  const collapsed = [];
  // key (ruleId|line) → collapsed[] のインデックス
  const groupIndex = new Map();

  for (const message of messages) {
    const key = `${message.ruleId}${COLLAPSE_KEY_SEPARATOR}${message.line}`;
    const existingIdx = groupIndex.get(key);
    if (existingIdx === undefined) {
      const head = { ...message, occurrences: [] };
      collapsed.push(head);
      groupIndex.set(key, collapsed.length - 1);
      continue;
    }

    const head = collapsed[existingIdx];
    const lastColumn = head.occurrences.length > 0
      ? head.occurrences[head.occurrences.length - 1].column
      : head.column;
    if (Math.abs(message.column - lastColumn) > mergeDistance) {
      // しきい値を超えたら別グループとして扱う。
      // 同じ line でも別エントリとして保持し、key は上書きしない (以降の比較も新エントリと行う)。
      const newHead = { ...message, occurrences: [] };
      collapsed.push(newHead);
      groupIndex.set(key, collapsed.length - 1);
      continue;
    }

    head.occurrences.push({
      column: message.column,
      index: message.index,
      length: message.length,
      excerpt: message.excerpt,
    });
    head.severity = maxSeverity(head.severity, message.severity);
  }

  return collapsed;
}

export function lintText(text, { filePath = '<text>', config = {} } = {}) {
  validateConfig(config, { source: 'config' });
  const ignorePatterns = normalizeIgnorePatterns(config.ignorePatterns);
  const doc = prepareMarkdown(text, { filePath, ignorePatterns });
  const allowTerms = validateAllowTerms(config.allowTerms);
  const safeExcerptText = doc.redactedText ?? doc.maskedText;
  const messages = [];

  for (const rule of allRules) {
    const ruleId = `nihongo-slopless/${rule.id}`;
    const ruleConfig = parseRuleConfig(rule, config);
    if (!ruleConfig.enabled) continue;

    const rawFindings = rule.run({
      text,
      doc,
      ruleId,
      options: ruleConfig.options,
      config,
    }) ?? [];

    for (const finding of rawFindings) {
      const index = Math.max(0, Number(finding.index ?? 0));
      if (isDisabledAt(doc.disableRanges, ruleId, index)) continue;
      if (isAllowedFinding({
        doc,
        ruleId,
        index,
        length: finding.length ?? 1,
        allowTerms,
      })) continue;
      const { line, column } = offsetToLocation(doc.lineStarts, index);
      messages.push({
        ruleId,
        severity: finding.severity ?? ruleConfig.severity,
        line,
        column,
        index,
        length: finding.length ?? 1,
        message: finding.message,
        // Excerpts are exportable output. Generate them only from redacted text
        // so disabled, ignored, code, front matter, and comment bodies cannot leak.
        excerpt: excerptAt(safeExcerptText, index, finding.length ?? 20),
        suggestion: finding.suggestion ?? rule.suggestion ?? undefined,
      });
    }
  }

  messages.sort((a, b) => (a.index - b.index) || a.ruleId.localeCompare(b.ruleId));

  if (config.collapseOccurrences === true) {
    const distanceConfig = config.occurrenceMergeDistance;
    const mergeDistance = (
      typeof distanceConfig === 'number'
      && Number.isFinite(distanceConfig)
      && distanceConfig >= 0
    )
      ? distanceConfig
      : DEFAULT_OCCURRENCE_MERGE_DISTANCE;
    const collapsed = collapseMessages(messages, { mergeDistance });
    return { path: filePath, messages: collapsed };
  }

  return { path: filePath, messages };
}

export function summarizeResults(results) {
  const byRule = {};
  const bySeverity = {};
  let findings = 0;

  for (const file of results) {
    for (const message of file.messages) {
      findings += 1;
      byRule[message.ruleId] = (byRule[message.ruleId] ?? 0) + 1;
      bySeverity[message.severity] = (bySeverity[message.severity] ?? 0) + 1;
    }
  }

  return {
    files: results.length,
    findings,
    byRule,
    bySeverity,
  };
}

export async function loadConfigFile(configPath = null, { profile = null } = {}) {
  const profileConfig = await loadProfileConfig(profile);
  let fileConfig = {};
  const candidates = configPath
    ? [configPath]
    : ['.nihongo-slopless.json', 'nihongo-slopless.config.json'];

  for (const candidate of candidates) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (configPath && !existsSync(resolved)) {
      throw new Error(`Config file not found: ${resolved}`);
    }
    if (existsSync(resolved)) {
      const body = await readFile(resolved, 'utf8');
      fileConfig = JSON.parse(body);
      validateConfig(fileConfig, { source: resolved });
      break;
    }
  }
  return mergeConfigs(profileConfig, fileConfig);
}
