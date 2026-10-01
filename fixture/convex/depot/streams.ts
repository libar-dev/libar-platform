// The depot's journal and the registrations of its three stream types. The fixture's faults live
// here, in the parts the composition supplies to the library: a mapping, a toDto and a decider.
import { v, type Value } from "convex/values";
import {
  createJournal,
  streamVersionValidator,
  type StreamMeta,
  type StreamRegistration,
} from "../../../src/context/index.js";
import type { Decider, StreamVersion } from "../../../src/kernel/index.js";
import {
  documentDecider,
  referenceDecider,
  stockDecider,
  type DocumentCommand,
  type DocumentEvent,
  type DocumentResult,
  type DocumentState,
  type ReferenceCommand,
  type ReferenceEvent,
  type ReferenceResult,
  type ReferenceState,
  type StockCommand,
  type StockEvent,
  type StockResult,
  type StockState,
} from "../../domain/index.js";
export const journal = createJournal({
  contextId: "depot",
  history: "rebuildable",
});
// A document with one of these titles makes the save fail at the named point. The library knows
// nothing of them: they reach it as the document stream's own mapping and toDto.
export const faultTitles = {
  // mapping.isDeleted runs in step 9, after the append and before the row is written.
  afterJournalAppend: "fault: after the journal append",
  // toDto runs in step 10, after the row is written.
  afterStateWrite: "fault: after the state write",
} as const;
// How many times the copyTitles operation repeats each title in its result, so a call that writes
// little returns more than the library's bound on what a call returns.
export const titleCopies = 64;
// A command whose decide fails the call if it is reached, so a rejection from an earlier step shows
// that decide did not run, and the same command at the right version shows that it does.
export type DepotDocumentCommand =
  DocumentCommand | { commandType: "failIfDecided" };
export const failIfDecidedMessage = "The depot decided a failIfDecided command";
const depotDocumentDecider: Decider<
  DocumentState,
  DepotDocumentCommand,
  DocumentEvent,
  DocumentResult
> = {
  ...documentDecider,
  decide: (state, command, context) => {
    if (command.commandType === "failIfDecided")
      throw new Error(failIfDecidedMessage);
    return documentDecider.decide(state, command, context);
  },
};
const version = (meta: StreamMeta): StreamVersion => ({
  tenantId: meta.tenantId,
  contextId: meta.contextId,
  streamType: meta.streamType,
  streamId: meta.streamId,
  version: meta.streamVersion,
});
export const documentStatusValidator = v.union(
  v.literal("none"),
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("shipped"),
);
export const documentStream: StreamRegistration<
  DocumentState,
  DepotDocumentCommand,
  DocumentEvent,
  DocumentResult
> = {
  decider: depotDocumentDecider,
  mapping: {
    kind: "single",
    budgetBytes: 16384,
    isDeleted: (state) => {
      if (state.title === faultTitles.afterJournalAppend)
        throw new Error(`Fault injected: ${faultTitles.afterJournalAppend}`);
      return false;
    },
  },
  stateSchemaVersion: 1,
  eventValidators: {
    created: v.object({ title: v.string() }),
    submitted: v.object({}),
    shipped: v.object({}),
    amended: v.object({ title: v.string() }),
  },
  dto: v.object({
    documentId: v.string(),
    status: documentStatusValidator,
    title: v.string(),
    amendments: v.number(),
    version: streamVersionValidator,
  }),
  toDto: (state, meta): Value => {
    if (state.title === faultTitles.afterStateWrite)
      throw new Error(`Fault injected: ${faultTitles.afterStateWrite}`);
    return {
      documentId: meta.streamId,
      status: state.status,
      title: state.title,
      amendments: state.amendments,
      version: version(meta),
    };
  },
};
export const stockStream: StreamRegistration<
  StockState,
  StockCommand,
  StockEvent,
  StockResult
> = {
  decider: stockDecider,
  mapping: { kind: "single", budgetBytes: 4096, isDeleted: () => false },
  stateSchemaVersion: 1,
  eventValidators: {
    stockAdded: v.object({ quantity: v.number() }),
    claimed: v.object({ quantity: v.number() }),
  },
  dto: v.object({
    productId: v.string(),
    onHand: v.number(),
    version: streamVersionValidator,
  }),
  toDto: (state, meta) => ({
    productId: meta.streamId,
    onHand: state.onHand,
    version: version(meta),
  }),
};
export const referenceStream: StreamRegistration<
  ReferenceState,
  ReferenceCommand,
  ReferenceEvent,
  ReferenceResult
> = {
  decider: referenceDecider,
  mapping: { kind: "single", budgetBytes: 4096, isDeleted: () => false },
  stateSchemaVersion: 1,
  eventValidators: { referenceClaimed: v.object({ holder: v.string() }) },
  dto: v.object({
    reference: v.string(),
    holder: v.union(v.string(), v.null()),
    version: streamVersionValidator,
  }),
  toDto: (state, meta) => ({
    reference: meta.streamId,
    holder: state.holder,
    version: version(meta),
  }),
};
