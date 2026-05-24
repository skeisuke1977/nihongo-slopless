#!/usr/bin/env node
// Local fixture for the future textlint preset package-name contract.

'use strict';

const assert = require('node:assert/strict');
const adapter = require('./index.js');
const packageJson = require('./package.json');

const FUTURE_PRESET_PACKAGE = 'textlint-rule-preset-nihongo-slopless';
const SUPPORTED_PRESET_KEYS = Object.freeze([
  'preset-nihongo-slopless',
  'textlint-rule-preset-nihongo-slopless',
]);
const UNSUPPORTED_PRESET_KEYS = Object.freeze([
  '@nihongo-slopless/textlint-adapter-experimental',
]);
const EXPECTED_RULE_IDS = Object.freeze([
  'nihongo-slopless/long-sentence',
  'nihongo-slopless/same-ending',
  'nihongo-slopless/chat-response-leakage',
  'nihongo-slopless/placeholder',
  'nihongo-slopless/hidden-unicode-controls',
  'nihongo-slopless/headline-decoration',
  'nihongo-slopless/excessive-parentheses',
  'nihongo-slopless/empty-conclusion',
  'nihongo-slopless/citation-needed',
  'nihongo-slopless/actorless-action',
  'nihongo-slopless/buzzword-density',
  'nihongo-slopless/list-intro-padding',
]);

function packageNameForPresetKey(ruleKey) {
  if (ruleKey.startsWith('textlint-rule-preset-')) return ruleKey;
  if (ruleKey.startsWith('preset-')) return `textlint-rule-${ruleKey}`;
  return null;
}

function enabledPresetKeysFromRulesConfig(rulesConfig) {
  return Object.entries(rulesConfig)
    .filter(([, value]) => value !== false && value !== 'off')
    .map(([ruleKey]) => ruleKey)
    .filter(ruleKey => packageNameForPresetKey(ruleKey) === FUTURE_PRESET_PACKAGE);
}

function testSupportedPresetKeys() {
  for (const ruleKey of SUPPORTED_PRESET_KEYS) {
    assert.equal(
      packageNameForPresetKey(ruleKey),
      FUTURE_PRESET_PACKAGE,
      `${ruleKey} should resolve to the future preset package name`,
    );
  }

  const rulesConfig = Object.fromEntries(SUPPORTED_PRESET_KEYS.map(ruleKey => [ruleKey, true]));
  assert.deepEqual(
    enabledPresetKeysFromRulesConfig(rulesConfig),
    SUPPORTED_PRESET_KEYS,
    'supported preset-style rule keys should both be accepted by the fixture',
  );
}

function testCurrentExperimentalPackageKeyIsNotClaimed() {
  assert.equal(
    packageJson.name,
    '@nihongo-slopless/textlint-adapter-experimental',
    'current package name should remain the private experimental adapter package',
  );
  assert.equal(packageJson.private, true, 'current adapter package should stay private');

  for (const ruleKey of UNSUPPORTED_PRESET_KEYS) {
    assert.equal(
      packageNameForPresetKey(ruleKey),
      null,
      `${ruleKey} should not be treated as a supported future preset-style key`,
    );
  }
}

function testAdapterEntryExportsExpectedRuleIds() {
  assert.deepEqual(
    Object.values(adapter.fullRuleIds),
    EXPECTED_RULE_IDS,
    'future preset package should expose the 12 current nihongo-slopless rule IDs through the adapter entry',
  );

  for (const ruleName of Object.keys(adapter.rules)) {
    assert.equal(typeof adapter.rules[ruleName], 'function', `${ruleName} should be exported as a callable rule`);
  }
}

const tests = [
  ['supported-preset-keys', testSupportedPresetKeys],
  ['current-experimental-package-key-is-not-claimed', testCurrentExperimentalPackageKeyIsNotClaimed],
  ['adapter-entry-rule-ids', testAdapterEntryExportsExpectedRuleIds],
];

for (const [, test] of tests) test();

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: 'local-textlint-preset-resolution-fixture',
      futurePresetPackage: FUTURE_PRESET_PACKAGE,
      supportedPresetKeys: SUPPORTED_PRESET_KEYS,
      unsupportedPresetKeys: UNSUPPORTED_PRESET_KEYS,
      ruleIds: EXPECTED_RULE_IDS,
      tests: tests.map(([name]) => name),
    },
    null,
    2,
  ),
);
