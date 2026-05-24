import { allRules } from './rules/index.mjs';
import { normalizeIgnorePatterns } from './ignore-patterns.mjs';

const TOP_LEVEL_KEYS = new Set([
  '$schema',
  'rules',
  'ignoreFiles',
  'ignorePatterns',
  'allowTerms',
  'collapseOccurrences',
  'occurrenceMergeDistance',
]);

export const fullRuleIds = Object.freeze(allRules.map(rule => `nihongo-slopless/${rule.id}`));
export const shortRuleIds = Object.freeze(allRules.map(rule => rule.id));
export const configRuleIds = Object.freeze([...fullRuleIds, ...shortRuleIds]);

const configRuleIdSet = new Set(configRuleIds);
const severities = new Set(['info', 'warning', 'error']);
const allowTermRuleIds = new Set([
  'nihongo-slopless/absolute-claim',
  'nihongo-slopless/citation-needed',
  'nihongo-slopless/placeholder',
  'nihongo-slopless/chat-response-leakage',
  'nihongo-slopless/list-intro-padding',
  'nihongo-slopless/empty-conclusion',
]);

export function shortRuleId(ruleId) {
  return ruleId.startsWith('nihongo-slopless/')
    ? ruleId.slice('nihongo-slopless/'.length)
    : ruleId;
}

function isOptionsObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function validateRuleSeverity(value, { source, path }) {
  if (typeof value !== 'string' || !severities.has(value)) {
    throw new Error(`${source}.rules.${path} のseverityは info, warning, error のいずれかで指定してください: ${value}`);
  }
}

function validateRuleConfigValue(ruleId, value, { source }) {
  const path = JSON.stringify(ruleId);
  if (value === false || value === 'off') return;
  if (typeof value === 'string') {
    validateRuleSeverity(value, { source, path });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length < 1 || value.length > 2) {
      throw new Error(`${source}.rules.${path} は [severity, options] 形式では1件または2件の配列で指定してください。`);
    }
    validateRuleSeverity(value[0], { source, path: `${path}[0]` });
    if (value.length === 2 && !isOptionsObject(value[1])) {
      throw new Error(`${source}.rules.${path}[1] はoptionsオブジェクトで指定してください。`);
    }
    return;
  }
  if (isOptionsObject(value)) {
    for (const key of Object.keys(value)) {
      if (!['severity', 'options'].includes(key)) {
        throw new Error(`${source}.rules.${path} に未知の項目 ${key} があります。`);
      }
    }
    if (!Object.prototype.hasOwnProperty.call(value, 'severity') && !Object.prototype.hasOwnProperty.call(value, 'options')) {
      throw new Error(`${source}.rules.${path} は severity または options を指定してください。`);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'severity')) {
      validateRuleSeverity(value.severity, { source, path: `${path}.severity` });
    }
    if (Object.prototype.hasOwnProperty.call(value, 'options') && !isOptionsObject(value.options)) {
      throw new Error(`${source}.rules.${path}.options はoptionsオブジェクトで指定してください。`);
    }
    return;
  }

  throw new Error(`${source}.rules.${path} は false, "off", severity文字列, [severity, options], {severity, options} のいずれかで指定してください。`);
}

export function validateAllowTerms(allowTerms) {
  if (allowTerms === undefined) return [];
  if (!Array.isArray(allowTerms)) {
    throw new Error('allowTerms は配列で指定してください。');
  }

  return allowTerms.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`allowTerms[${index}] はオブジェクトで指定してください。`);
    }

    for (const key of Object.keys(item)) {
      if (!['term', 'rules', 'reason'].includes(key)) {
        throw new Error(`allowTerms[${index}] に未知の項目 ${key} があります。`);
      }
    }

    if (typeof item.term !== 'string' || item.term.trim().length < 2) {
      throw new Error(`allowTerms[${index}].term は2文字以上の文字列で指定してください。`);
    }
    if (item.term !== item.term.trim()) {
      throw new Error(`allowTerms[${index}].term の前後に空白を含めないでください。`);
    }
    if (!Array.isArray(item.rules) || item.rules.length === 0) {
      throw new Error(`allowTerms[${index}].rules は1件以上のルールID配列で指定してください。`);
    }
    if (typeof item.reason !== 'string' || item.reason.trim().length < 6) {
      throw new Error(`allowTerms[${index}].reason は6文字以上の理由で指定してください。`);
    }

    const rules = item.rules.map(ruleId => {
      if (typeof ruleId !== 'string' || !allowTermRuleIds.has(ruleId)) {
        throw new Error(`allowTerms[${index}].rules には許可対象の完全なルールIDを指定してください: ${ruleId}`);
      }
      return ruleId;
    });

    return {
      term: item.term,
      rules,
      reason: item.reason,
    };
  });
}

export function validateConfig(config = {}, { source = 'config' } = {}) {
  if (config === undefined || config === null) return {};
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`${source} はJSONオブジェクトで指定してください。`);
  }

  for (const key of Object.keys(config)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`${source} に未知の設定項目 ${key} があります。`);
    }
  }

  if (config.rules !== undefined) {
    if (!config.rules || typeof config.rules !== 'object' || Array.isArray(config.rules)) {
      throw new Error(`${source}.rules はルールIDをキーにしたオブジェクトで指定してください。`);
    }

    for (const ruleId of Object.keys(config.rules)) {
      if (!configRuleIdSet.has(ruleId)) {
        throw new Error(`${source}.rules に未知のルールIDがあります: ${ruleId}`);
      }
      validateRuleConfigValue(ruleId, config.rules[ruleId], { source });
    }
  }

  if (config.ignoreFiles !== undefined) {
    if (!Array.isArray(config.ignoreFiles)) {
      throw new Error(`${source}.ignoreFiles は文字列配列で指定してください。`);
    }
    for (const [index, pattern] of config.ignoreFiles.entries()) {
      if (typeof pattern !== 'string' || pattern.length === 0) {
        throw new Error(`${source}.ignoreFiles[${index}] は1文字以上の文字列で指定してください。`);
      }
    }
  }

  normalizeIgnorePatterns(config.ignorePatterns, { source });
  validateAllowTerms(config.allowTerms);

  if (config.collapseOccurrences !== undefined && typeof config.collapseOccurrences !== 'boolean') {
    throw new Error(`${source}.collapseOccurrences は boolean で指定してください。`);
  }

  if (config.occurrenceMergeDistance !== undefined) {
    const distance = config.occurrenceMergeDistance;
    if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0 || !Number.isInteger(distance)) {
      throw new Error(`${source}.occurrenceMergeDistance は0以上の整数で指定してください。`);
    }
  }

  return config;
}
