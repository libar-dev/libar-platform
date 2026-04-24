export {
  uuidv7,
  generateId,
  parseId,
  generateCorrelationId,
  generateCommandId,
  generateEventId,
  generateIntegrationEventId,
  generateApprovalId,
  generateDecisionId,
  generateAgentSubscriptionId,
  generateLifecycleDecisionId,
} from "./generator.js";

// Branded types for compile-time ID safety
export type {
  CommandId,
  CorrelationId,
  CausationId,
  EventId,
  StreamId,
  ApprovalId,
  DecisionId,
  AgentSubscriptionId,
  LifecycleDecisionId,
} from "./branded.js";

export {
  toCommandId,
  toCorrelationId,
  toCausationId,
  toEventId,
  toStreamId,
  toApprovalId,
  toDecisionId,
  toAgentSubscriptionId,
  toLifecycleDecisionId,
  isValidIdString,
} from "./branded.js";
