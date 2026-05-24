import { sarifArtifactUri } from './output-paths.mjs';

const SARIF_VERSION = '2.1.0';

function sarifLevel(severity) {
  return {
    error: 'error',
    warning: 'warning',
    info: 'note',
  }[severity] ?? 'warning';
}

function ruleDescriptor(rule) {
  const text = rule.goal || rule.description || rule.fixHint || rule.id;
  const descriptor = {
    id: rule.id,
    name: rule.shortId ?? rule.id,
    shortDescription: { text },
    properties: {
      severity: rule.severity,
    },
  };

  if (rule.category) descriptor.properties.category = rule.category;
  if (rule.fixHint) descriptor.help = { text: rule.fixHint };
  if (rule.description || rule.goal) descriptor.fullDescription = { text: rule.description || rule.goal };
  return descriptor;
}

function buildRegion({ line, column, index, length }) {
  const region = {
    startLine: line ?? 1,
    startColumn: column ?? 1,
  };
  if (Number.isFinite(index)) region.charOffset = index;
  if (Number.isFinite(length)) region.charLength = length;
  return region;
}

function physicalLocation(uri, region) {
  return {
    physicalLocation: {
      artifactLocation: { uri },
      region,
    },
  };
}

function resultForMessage(file, message, options) {
  const uri = sarifArtifactUri(file.path, options);
  const headRegion = buildRegion(message);
  const locations = [physicalLocation(uri, headRegion)];

  if (Array.isArray(message.occurrences) && message.occurrences.length > 0) {
    for (const occ of message.occurrences) {
      locations.push(physicalLocation(uri, buildRegion({
        line: message.line,
        column: occ.column,
        index: occ.index,
        length: occ.length,
      })));
    }
  }

  return {
    ruleId: message.ruleId,
    level: sarifLevel(message.severity),
    message: {
      text: message.message ?? '',
    },
    locations,
  };
}

export function createSarifLog({ tool, version, rules, files, absolutePaths = false }) {
  const options = { absolutePaths };
  return {
    version: SARIF_VERSION,
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: tool,
            version,
            rules: rules.map(ruleDescriptor),
          },
        },
        results: files.flatMap(file => file.messages.map(message => resultForMessage(file, message, options))),
      },
    ],
  };
}
