// Layer 1's context library: what runs inside a context component.
export {
  causedByValidator,
  eventEnvelopeValidator,
  operationRefValidator,
} from "./envelope.js";
export type {
  CausedBy,
  EnvelopeInput,
  EventEnvelope,
  OperationRef,
} from "./envelope.js";
export {
  affectedRefValidator,
  committedOutcomeValidator,
  operationOutcomeValidator,
  rejectionValidator,
  streamVersionValidator,
} from "./outcome.js";
export { contextTables } from "./tables.js";
export type { ContextDataModel, MutationCtx, QueryCtx } from "./tables.js";
export {
  append,
  createJournal,
  limitPayloadBytes,
  load,
  metaOf,
} from "./journal.js";
export type {
  AppendResult,
  Journal,
  LoadedStream,
  StateDocumentMapping,
  StreamMeta,
  StreamRegistration,
} from "./journal.js";
export {
  execute,
  limitBytesWrittenPerCall,
  limitDocumentsWrittenPerCall,
  limitReturnBytesPerCall,
  limitStreamBytesPerCall,
  limitStreamsPerCall,
  planned,
  runOperation,
} from "./adapter.js";
export type {
  AnyStreamRegistration,
  ExecuteRequest,
  OperationArgs,
  OperationDeclaration,
  OperationOutcome,
  PlannedCommand,
  StreamCommand,
  StreamDto,
  StreamResult,
} from "./adapter.js";
export { defineOperation, operationArgsValidators } from "./operation.js";
export {
  boundedPage,
  defineGet,
  defineList,
  limitListBytes,
  limitListPage,
} from "./queries.js";
export type { GetArgs, ListArgs, PageLimit } from "./queries.js";
