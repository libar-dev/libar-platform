// Layer 0, the pure domain kernel. Its one Convex import is the type Value, which the compiler erases.
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
