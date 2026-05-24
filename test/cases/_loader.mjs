// Shared case-file loader for `test/cases/*.cases.mjs`.
//
// Each case file is expected to default-export an array of entries:
//   [
//     { name, text, expect: true,            config?: {...} },  // 発火期待
//     { name, text, expect: false,           config?: {...} },  // 非発火期待
//     { name, text, expect: { count: N },    config?: {...} },  // 件数期待
//   ]
//
// `ruleName` はファイル名 stem (拡張子 `.cases.mjs` を除いた部分) から推定する。
// 例: `absolute-claim.cases.mjs` → `nihongo-slopless/absolute-claim`。
// 個別エントリで `entry.ruleId` (フルID) または `entry.rule` (ショートID) を
// 指定するとファイル単位の推定を上書きできる(複合ルール検出ケースに備える)。
//
// 想定外形式(named export しか持たない、`expect` ではなく `expected` を使う等)の
// ファイルでも、できるだけ既存テストを壊さないように **スキップ + 警告** を返す。

import assert from 'node:assert/strict';
import { lintText } from '../../src/index.mjs';
import { allRules } from '../../src/rules/index.mjs';

const REGISTERED_RULE_SHORT_IDS = new Set(allRules.map(r => r.id));

function fullRuleId(shortId) {
  return `nihongo-slopless/${shortId}`;
}

function resolveRuleId(entry, defaultShortId) {
  if (entry && typeof entry.ruleId === 'string' && entry.ruleId.startsWith('nihongo-slopless/')) {
    return entry.ruleId;
  }
  if (entry && typeof entry.rule === 'string' && entry.rule.length > 0) {
    return fullRuleId(entry.rule);
  }
  return fullRuleId(defaultShortId);
}

function findingsFor(text, fullId, config = {}) {
  const result = lintText(text, { filePath: '<cases>', config });
  return result.messages.filter(m => m.ruleId === fullId);
}

function describeContext({ filePath, ruleName, entryName, expected, actual }) {
  return [
    `  file:     ${filePath}`,
    `  ruleName: ${ruleName}`,
    `  name:     ${entryName}`,
    `  expect:   ${JSON.stringify(expected)}`,
    `  actual:   ${JSON.stringify(actual)}`,
  ].join('\n');
}

/**
 * Run a single case file's entries through `lintText` and assert per-entry.
 * Throws AssertionError on the first failing entry with ruleName/name/expect/actual.
 *
 * @param {{ filePath: string, defaultShortId: string, entries: any[] }} ctx
 * @returns {{ asserted: number, skipped: number }}
 */
export function runCaseFile({ filePath, defaultShortId, entries }) {
  if (!Array.isArray(entries)) {
    throw new assert.AssertionError({
      message: `case file ${filePath} must default-export an array (got ${typeof entries})`,
    });
  }

  let asserted = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object') {
      skipped += 1;
      continue;
    }
    if (typeof entry.text !== 'string' || !('expect' in entry)) {
      skipped += 1;
      continue;
    }

    const ruleFullId = resolveRuleId(entry, defaultShortId);
    const ruleShortId = ruleFullId.replace(/^nihongo-slopless\//, '');
    const entryName = entry.name ?? `#${i}`;

    if (!REGISTERED_RULE_SHORT_IDS.has(ruleShortId)) {
      // ルールが allRules に未登録なら(未統合の新ルール等)、安全のため
      // 件数ゼロ前提で expect: false のみ評価し、それ以外はスキップする。
      const findings = findingsFor(entry.text, ruleFullId, entry.config ?? {});
      if (entry.expect === false) {
        if (findings.length !== 0) {
          throw new assert.AssertionError({
            message: `unexpected findings for unregistered rule\n${describeContext({
              filePath,
              ruleName: ruleFullId,
              entryName,
              expected: false,
              actual: { count: findings.length },
            })}`,
          });
        }
        asserted += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const findings = findingsFor(entry.text, ruleFullId, entry.config ?? {});
    const expected = entry.expect;

    if (expected === true) {
      if (findings.length === 0) {
        throw new assert.AssertionError({
          message: `expected rule to fire but did not\n${describeContext({
            filePath,
            ruleName: ruleFullId,
            entryName,
            expected: true,
            actual: { count: 0 },
          })}`,
        });
      }
    } else if (expected === false) {
      if (findings.length !== 0) {
        throw new assert.AssertionError({
          message: `expected rule NOT to fire but it did\n${describeContext({
            filePath,
            ruleName: ruleFullId,
            entryName,
            expected: false,
            actual: { count: findings.length, messages: findings.map(f => f.message) },
          })}`,
        });
      }
    } else if (expected && typeof expected === 'object' && typeof expected.count === 'number') {
      if (findings.length !== expected.count) {
        throw new assert.AssertionError({
          message: `finding count mismatch\n${describeContext({
            filePath,
            ruleName: ruleFullId,
            entryName,
            expected,
            actual: { count: findings.length },
          })}`,
        });
      }
    } else {
      // 未対応の expect 形式(将来拡張)はスキップする。
      skipped += 1;
      continue;
    }

    asserted += 1;
  }

  return { asserted, skipped };
}

export function deriveShortIdFromFilename(filename) {
  // `absolute-claim.cases.mjs` → `absolute-claim`
  // 複合ハイフン名 (`unscoped-generalization` 等) も stem としてそのまま扱う。
  return filename.replace(/\.cases\.mjs$/i, '');
}
