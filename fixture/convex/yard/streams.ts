// The yard's journal and the registration of its one stream type, the copy of a depot document. The
// yard is the fixture's second context, so a use case over two contexts can fail in the second one:
// its fault lives in the copy stream's toDto, a part the composition supplies to the library.
import { v, type Value } from "convex/values";
import {
  createJournal,
  streamVersionValidator,
  type StreamRegistration,
} from "../../../src/context/index.js";
import {
  copyDecider,
  type CopyCommand,
  type CopyEvent,
  type CopyResult,
  type CopyState,
} from "../../domain/copy.js";
export const journal = createJournal({
  contextId: "yard",
  history: "rebuildable",
});
// A copy filed under this title makes the yard's save fail. toDto runs in step 10, after the row is
// written, so the yard has written its state and its event when it throws.
export const yardFaultTitle = "fault: after the yard's state write";
export const copyStream: StreamRegistration<
  CopyState,
  CopyCommand,
  CopyEvent,
  CopyResult
> = {
  decider: copyDecider,
  mapping: { kind: "single", budgetBytes: 4096, isDeleted: () => false },
  stateSchemaVersion: 1,
  eventValidators: {
    filed: v.object({ title: v.string(), depotVersion: v.number() }),
  },
  dto: v.object({
    documentId: v.string(),
    title: v.string(),
    depotVersion: v.number(),
    version: streamVersionValidator,
  }),
  // The error names the depot version the use case passed in, which it read from the depot's answer,
  // so a caller that sees it knows the depot's call had returned.
  toDto: (state, meta): Value => {
    if (state.title === yardFaultTitle)
      throw new Error(
        `Fault injected: ${yardFaultTitle}, filing document/${meta.streamId} at depot version ${state.depotVersion}`,
      );
    return {
      documentId: meta.streamId,
      title: state.title,
      depotVersion: state.depotVersion,
      version: {
        tenantId: meta.tenantId,
        contextId: meta.contextId,
        streamType: meta.streamType,
        streamId: meta.streamId,
        version: meta.streamVersion,
      },
    };
  },
};
