/**
 * Public library entrypoint for the `nitrograph` npm package.
 *
 * Usage:
 *   import { Nitrograph } from 'nitrograph';
 *   const ng = new Nitrograph();
 *   const { results } = await ng.discover('lead generation');
 *
 * The CLI bin (`npx nitrograph`) lives in index.ts; the stdio MCP server
 * lives in server.ts. Neither is imported here — keep the library tree
 * free of filesystem/stdio/network side effects at import time.
 */

export {
  Nitrograph,
  createNitrograph,
  NitrographError,
  NitrographApiError,
  NitrographPaymentRequiredError,
  NitrographNetworkError,
} from './harness.js';

export type {
  NitrographOptions,
  DiscoverInput,
  DiscoverFilters,
  DiscoverResponse,
  DiscoveredService,
  ServiceDetail,
  ReportOutcomeInput,
  ReportPatternInput,
  PatternStep,
} from './harness.js';
