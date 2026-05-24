import { rule as longSentence } from './long-sentence.mjs';
import { rule as longParagraph } from './long-paragraph.mjs';
import { rule as chatResponseLeakage } from './chat-response-leakage.mjs';
import { rule as emptyConclusion } from './empty-conclusion.mjs';
import { rule as weaselPhrases } from './weasel-phrases.mjs';
import { rule as abstractNounStack } from './abstract-noun-stack.mjs';
import { rule as nominalizationDensity } from './nominalization-density.mjs';
import { rule as citationNeeded } from './citation-needed.mjs';
import { rule as absoluteClaim } from './absolute-claim.mjs';
import { rule as excessivePoliteness } from './excessive-politeness.mjs';
import { rule as actorlessAction } from './actorless-action.mjs';
import { rule as sameEnding } from './same-ending.mjs';
import { rule as repeatedConnectors } from './repeated-connectors.mjs';
import { rule as translationese } from './translationese.mjs';
import { rule as placeholder } from './placeholder.mjs';
import { rule as buzzwordDensity } from './buzzword-density.mjs';
import { rule as thinSentence } from './thin-sentence.mjs';
import { rule as listIntroPadding } from './list-intro-padding.mjs';
import { rule as excessiveParentheses } from './excessive-parentheses.mjs';
import { rule as hiddenUnicodeControls } from './hidden-unicode-controls.mjs';
import { rule as headlineDecoration } from './headline-decoration.mjs';
import { rule as unscopedGeneralization } from './unscoped-generalization.mjs';
import { rule as noNumericsClaim } from './no-numerics-claim.mjs';
import { rule as deadlineMissing } from './deadline-missing.mjs';
import { rule as overPossibility } from './over-possibility.mjs';
import { rule as unclearDeictic } from './unclear-deictic.mjs';

export { getRuleMetadata, ruleMetadata, ruleMetadataById } from './metadata.mjs';

export const allRules = [
  hiddenUnicodeControls,
  placeholder,
  chatResponseLeakage,
  listIntroPadding,
  longSentence,
  longParagraph,
  emptyConclusion,
  weaselPhrases,
  citationNeeded,
  absoluteClaim,
  unscopedGeneralization,
  noNumericsClaim,
  abstractNounStack,
  nominalizationDensity,
  excessivePoliteness,
  actorlessAction,
  deadlineMissing,
  sameEnding,
  repeatedConnectors,
  translationese,
  buzzwordDensity,
  thinSentence,
  excessiveParentheses,
  headlineDecoration,
  overPossibility,
  unclearDeictic,
];
