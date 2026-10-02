// The fixture's copy stream, which the yard context holds: a copy of a depot document, filed once,
// with the title and the depot version a use case read from the depot's answer in the same mutation.
import type {
  DecideResult,
  Decider,
  DecisionContext,
  DomainEvent,
} from "../../src/kernel/index.js";
export type CopyState = {
  filed: boolean;
  title: string;
  depotVersion: number;
};
export type CopyCommand = {
  commandType: "file";
  title: string;
  depotVersion: number;
};
export type CopyEvent = DomainEvent<
  "filed",
  { title: string; depotVersion: number }
>;
export type CopyResult = { depotVersion: number };
export const copyRejectionCodes = {
  // file of a copy that is already filed.
  alreadyFiled: "alreadyFiled",
} as const;
const eventSchemaVersion = 1;
function decide(
  state: CopyState,
  command: CopyCommand,
  context: DecisionContext,
): DecideResult<CopyEvent, CopyResult> {
  if (state.filed)
    return {
      kind: "rejection",
      rejection: {
        code: copyRejectionCodes.alreadyFiled,
        message: `The copy is already filed at depot version ${state.depotVersion}`,
        details: { depotVersion: state.depotVersion },
      },
    };
  return {
    kind: "applied",
    events: [
      {
        eventType: "filed",
        eventSchemaVersion,
        payload: { title: command.title, depotVersion: command.depotVersion },
        occurredAt: context.now,
      },
    ],
    result: { depotVersion: command.depotVersion },
  };
}
function evolve(_state: CopyState, event: CopyEvent): CopyState {
  return {
    filed: true,
    title: event.payload.title,
    depotVersion: event.payload.depotVersion,
  };
}
export const copyDecider: Decider<
  CopyState,
  CopyCommand,
  CopyEvent,
  CopyResult
> = {
  streamType: "copy",
  initial: () => ({ filed: false, title: "", depotVersion: 0 }),
  decide,
  evolve,
  invariants: [
    {
      name: "aFiledCopyNamesADepotVersion",
      holds: (state) => !state.filed || state.depotVersion >= 1,
    },
  ],
};
