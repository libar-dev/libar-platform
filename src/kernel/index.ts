// Layer 0, the pure domain kernel. Its one Convex import is the type Value, which the compiler erases.
/**
 * @sdpAnchor component:platform.kernel
 * @sdpLabel the pure domain kernel: the decider contract and the outcome types
 * @sdpReferences spec:kernel.domain-kernel
 * @sdpLayer domain
 * @sdpContext platform
 */
export type {
  AffectedRef,
  CommittedOutcome,
  Outcome,
  Rejection,
  StreamVersion,
} from "./outcome.js";
export type {
  DecideResult,
  Decider,
  DecisionActor,
  DecisionContext,
  DomainEvent,
  Invariant,
  Transitions,
} from "./decider.js";
export { checkInvariants, fold, rebuild, transition } from "./decider.js";
