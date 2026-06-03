// Isolated Stagehand client for CDP-backed browser automation (Phase 2.4).
// Connects to the user's active Chrome tab via remote debugging — not wired to
// Express routes yet; import from apply services when trigger-apply lands.
import { Stagehand } from '@browserbasehq/stagehand';

const DEFAULT_CDP_URL = 'http://localhost:9222';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

/** @returns {string} Stagehand model id (provider/model). */
function resolveStagehandModelName() {
  const raw = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  return raw.includes('/') ? raw : `anthropic/${raw}`;
}

/** @returns {string} Chrome DevTools Protocol endpoint for the local browser. */
export function getChromeCdpUrl() {
  return process.env.CHROME_CDP_URL || DEFAULT_CDP_URL;
}

/** @returns {boolean} True when Anthropic credentials are present for Stagehand LLM calls. */
export function isStagehandConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Build Stagehand constructor options for LOCAL + CDP attach mode.
 * @returns {import('@browserbasehq/stagehand').V3Options}
 */
export function buildStagehandOptions() {
  const cdpUrl = getChromeCdpUrl();
  const connectTimeoutMs = Number(process.env.CHROME_CDP_CONNECT_TIMEOUT_MS) || 30_000;
  const verboseRaw = process.env.STAGEHAND_VERBOSE;
  /** @type {0 | 1 | 2} */
  const verbose = verboseRaw === '2' ? 2 : verboseRaw === '1' ? 1 : 0;

  /** @type {import('@browserbasehq/stagehand').V3Options} */
  const options = {
    env: 'LOCAL',
    selfHeal: true,
    localBrowserLaunchOptions: {
      cdpUrl,
      connectTimeoutMs,
    },
    verbose,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    options.model = {
      modelName: resolveStagehandModelName(),
      apiKey,
    };
  }

  return options;
}

/** Pre-configured Stagehand instance (call {@link initStagehandClient} before use). */
export const stagehand = new Stagehand(buildStagehandOptions());

let initialized = false;

/**
 * Initialize the CDP connection to Chrome. Safe to call multiple times.
 * @returns {Promise<typeof stagehand>}
 */
export async function initStagehandClient() {
  if (!initialized) {
    await stagehand.init();
    initialized = true;
  }
  return stagehand;
}

/** @returns {boolean} Whether {@link initStagehandClient} has completed successfully. */
export function isStagehandInitialized() {
  return initialized;
}

/**
 * Close the Stagehand session and release browser resources.
 * @param {{ force?: boolean }} [opts]
 */
export async function closeStagehandClient(opts) {
  if (!initialized) return;
  await stagehand.close(opts);
  initialized = false;
}
