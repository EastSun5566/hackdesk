const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

const BLOCKED_PROTOCOL_REASONS = new Map([
  ['javascript:', 'Blocked JavaScript URLs.'],
  ['data:', 'Blocked data URLs.'],
  ['blob:', 'Blocked blob URLs.'],
  ['file:', 'Blocked local file URLs.'],
]);

export type ExternalUrlClassification =
  | { type: 'safe-external'; url: string }
  | { type: 'blocked'; reason: string };

export function classifyExternalUrl(url: string): ExternalUrlClassification {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { type: 'blocked', reason: 'Blocked malformed URL.' };
  }

  const blockedReason = BLOCKED_PROTOCOL_REASONS.get(parsed.protocol);
  if (blockedReason) {
    return { type: 'blocked', reason: blockedReason };
  }

  if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return { type: 'blocked', reason: `Blocked unsupported URL scheme: ${parsed.protocol}` };
  }

  return { type: 'safe-external', url: parsed.toString() };
}
