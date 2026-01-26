/**
 * Correlation module for request tracing.
 *
 * Provides CorrelationChain for tracking causal relationships between
 * commands and events in the system, and CorrelationService for tracking
 * command-event correlations.
 */

// Types
export type {
  CorrelationChain,
  CreateCorrelationChainOptions,
  DeriveCorrelationChainOptions,
  CausationSource,
  CorrelationEnrichedMetadata,
} from "./types.js";

// Correlation Chain Functions
export {
  createCorrelationChain,
  deriveCorrelationChain,
  toEventMetadata,
  isCorrelated,
  isCausedBy,
} from "./chain.js";

// Correlation Service for command-event tracking
export type {
  CommandEventCorrelation,
  RecordCorrelationOptions,
  CorrelationQueryOptions,
  CorrelationCommandBusClient,
} from "./CorrelationService.js";

export { CorrelationService, createCorrelationService } from "./CorrelationService.js";
