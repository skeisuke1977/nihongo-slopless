// @nihongo-slopless/textlint-adapter-experimental
// Preset-style entry point for local textlint runtime experiments.

'use strict';

const longSentence = require('./long-sentence.js');
const sameEnding = require('./same-ending.js');
const chatResponseLeakage = require('./chat-response-leakage.js');
const placeholder = require('./placeholder.js');
const hiddenUnicodeControls = require('./hidden-unicode-controls.js');
const headlineDecoration = require('./headline-decoration.js');
const excessiveParentheses = require('./excessive-parentheses.js');
const emptyConclusion = require('./empty-conclusion.js');
const citationNeeded = require('./citation-needed.js');
const actorlessAction = require('./actorless-action.js');
const buzzwordDensity = require('./buzzword-density.js');
const listIntroPadding = require('./list-intro-padding.js');

const rules = Object.freeze({
  'long-sentence': longSentence,
  'same-ending': sameEnding,
  'chat-response-leakage': chatResponseLeakage,
  placeholder,
  'hidden-unicode-controls': hiddenUnicodeControls,
  'headline-decoration': headlineDecoration,
  'excessive-parentheses': excessiveParentheses,
  'empty-conclusion': emptyConclusion,
  'citation-needed': citationNeeded,
  'actorless-action': actorlessAction,
  'buzzword-density': buzzwordDensity,
  'list-intro-padding': listIntroPadding,
});

const rulesConfig = Object.freeze({
  'long-sentence': longSentence.meta.defaultOptions,
  'same-ending': sameEnding.meta.defaultOptions,
  'chat-response-leakage': true,
  placeholder: true,
  'hidden-unicode-controls': true,
  'headline-decoration': true,
  'excessive-parentheses': excessiveParentheses.meta.defaultOptions,
  'empty-conclusion': emptyConclusion.meta.defaultOptions,
  'citation-needed': citationNeeded.meta.defaultOptions,
  'actorless-action': actorlessAction.meta.defaultOptions,
  'buzzword-density': buzzwordDensity.meta.defaultOptions,
  'list-intro-padding': listIntroPadding.meta.defaultOptions,
});

const fullRuleIds = Object.freeze({
  'long-sentence': 'nihongo-slopless/long-sentence',
  'same-ending': 'nihongo-slopless/same-ending',
  'chat-response-leakage': 'nihongo-slopless/chat-response-leakage',
  placeholder: 'nihongo-slopless/placeholder',
  'hidden-unicode-controls': 'nihongo-slopless/hidden-unicode-controls',
  'headline-decoration': 'nihongo-slopless/headline-decoration',
  'excessive-parentheses': 'nihongo-slopless/excessive-parentheses',
  'empty-conclusion': 'nihongo-slopless/empty-conclusion',
  'citation-needed': 'nihongo-slopless/citation-needed',
  'actorless-action': 'nihongo-slopless/actorless-action',
  'buzzword-density': 'nihongo-slopless/buzzword-density',
  'list-intro-padding': 'nihongo-slopless/list-intro-padding',
});

module.exports = {
  rules,
  rulesConfig,
  fullRuleIds,
};
