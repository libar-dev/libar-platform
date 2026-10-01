// The fixture's reference stream: a unique value, keyed by the value itself, that one subject claims.
// A creating operation claims it at expected version 0 before it creates its subject.
import type {
  DecideResult,
  Decider,
  DecisionContext,
  DomainEvent,
} from "../../src/kernel/index.js";
// holder is the stream ID of the subject that claimed the reference, or null before the claim.
export type ReferenceState = { holder: string | null };
export type ReferenceCommand = { commandType: "claim"; holder: string };
export type ReferenceEvent = DomainEvent<
  "referenceClaimed",
  { holder: string }
>;
export type ReferenceResult = { holder: string };
export const referenceRejectionCodes = {
  // claim of a reference another subject already holds.
  referenceTaken: "referenceTaken",
  // claim for a holder that is empty or only whitespace.
  holderRequired: "holderRequired",
} as const;
const eventSchemaVersion = 1;
function decide(
  state: ReferenceState,
  command: ReferenceCommand,
  context: DecisionContext,
): DecideResult<ReferenceEvent, ReferenceResult> {
  if (command.holder.trim() === "")
    return {
      kind: "rejection",
      rejection: {
        code: referenceRejectionCodes.holderRequired,
        message: "A reference is claimed for a subject",
      },
    };
  if (state.holder !== null)
    return {
      kind: "rejection",
      rejection: {
        code: referenceRejectionCodes.referenceTaken,
        message: `The reference is held by ${state.holder}`,
        details: { holder: state.holder },
      },
    };
  return {
    kind: "applied",
    events: [
      {
        eventType: "referenceClaimed",
        eventSchemaVersion,
        payload: { holder: command.holder },
        occurredAt: context.now,
      },
    ],
    result: { holder: command.holder },
  };
}
function evolve(_state: ReferenceState, event: ReferenceEvent): ReferenceState {
  return { holder: event.payload.holder };
}
export const referenceDecider: Decider<
  ReferenceState,
  ReferenceCommand,
  ReferenceEvent,
  ReferenceResult
> = {
  streamType: "reference",
  initial: () => ({ holder: null }),
  decide,
  evolve,
  invariants: [
    {
      name: "aHolderIsNamed",
      holds: (state) => state.holder === null || state.holder.trim() !== "",
    },
  ],
};
