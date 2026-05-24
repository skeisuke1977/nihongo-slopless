import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shortRuleId, validateConfig } from './config.mjs';

export const PROFILE_NAMES = ['minimal', 'general', 'business', 'technical', 'research', 'public', 'web', 'agent-output', 'strict'];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileDir = path.join(repoRoot, 'config', 'profiles');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function normalizeRules(rules = {}) {
  const normalized = {};
  const fullIdSeen = {};
  for (const [ruleId, value] of Object.entries(rules)) {
    const shortId = shortRuleId(ruleId);
    const isFullId = shortId !== ruleId;
    if (isFullId || !Object.prototype.hasOwnProperty.call(normalized, shortId) || !fullIdSeen[shortId]) {
      normalized[shortId] = value;
      fullIdSeen[shortId] = isFullId;
    }
  }
  return normalized;
}

function isDisabledRuleConfig(value) {
  return value === false || value === 'off';
}

function ruleConfigParts(value) {
  if (isDisabledRuleConfig(value)) return { disabled: true };
  if (typeof value === 'string') return { severity: value, options: {} };
  if (Array.isArray(value)) {
    return {
      severity: value[0],
      options: value[1] && typeof value[1] === 'object' ? value[1] : {},
    };
  }
  if (value && typeof value === 'object') {
    return {
      severity: value.severity,
      options: value.options && typeof value.options === 'object' ? value.options : {},
    };
  }
  return { options: {} };
}

function mergeRuleConfig(baseValue, overrideValue) {
  if (baseValue === undefined || isDisabledRuleConfig(overrideValue)) return overrideValue;

  const base = ruleConfigParts(baseValue);
  const override = ruleConfigParts(overrideValue);
  if (base.disabled || override.disabled) return overrideValue;

  return {
    severity: override.severity ?? base.severity,
    options: {
      ...(base.options ?? {}),
      ...(override.options ?? {}),
    },
  };
}

export function mergeConfigs(baseConfig = {}, overrideConfig = {}) {
  validateConfig(baseConfig, { source: 'base config' });
  validateConfig(overrideConfig, { source: 'override config' });

  const base = cloneJson(baseConfig);
  const override = cloneJson(overrideConfig);
  const merged = { ...base, ...override };

  const rules = normalizeRules(base.rules);
  for (const [ruleId, value] of Object.entries(normalizeRules(override.rules))) {
    rules[ruleId] = mergeRuleConfig(rules[ruleId], value);
  }
  merged.rules = rules;

  return merged;
}

export function normalizeProfileName(profileName = null) {
  if (!profileName) return null;
  if (!PROFILE_NAMES.includes(profileName)) {
    throw new Error(`未知のプロファイルです: ${profileName}`);
  }
  return profileName;
}

export async function loadProfileConfig(profileName = null) {
  const normalized = normalizeProfileName(profileName);
  if (!normalized) return {};

  const profilePath = path.join(profileDir, `${normalized}.json`);
  const body = await readFile(profilePath, 'utf8');
  const config = JSON.parse(body);
  validateConfig(config, { source: `${normalized} profile` });
  return config;
}
