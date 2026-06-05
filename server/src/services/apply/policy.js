// Shared apply-policy summary used by both the portal (/api/assistant/apply-policy)
// and the extension bridge (/api/extension/apply-policy). Lives here to avoid a
// settings<->packet circular import (policy → packet → settings is acyclic).
import { getApplySettings } from './settings.js';
import { REDACTED_FIELDS } from './packet.js';

// Keep in sync with extension-safari/src/manifest.*.json.
export const EXTENSION_VERSION = '0.2.0';

export function applyPolicySummary(db) {
  const s = getApplySettings(db);
  return {
    canSubmit: s.autoSubmit,
    fillExisting: s.fillExisting,
    includeCustomFields: s.includeCustomFields,
    sensitiveDenylist: REDACTED_FIELDS,
    extensionVersion: EXTENSION_VERSION,
  };
}
