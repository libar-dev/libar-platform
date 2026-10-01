// Layer 1's command library: what runs in the parent deployment.
export {
  actorKindValidator,
  actorValidator,
  authorityValidator,
  callerNamespaceValidator,
  subjectRefValidator,
  tenantScopeValidator,
} from "./actor-and-scope.js";
export type {
  Actor,
  ActorKind,
  ActorRef,
  Authority,
  AuthorityMode,
  AuthorizeInput,
  CallerNamespace,
  SubjectRef,
  TenantScope,
} from "./actor-and-scope.js";
export {
  authorize,
  establishActor,
  insertGrant,
  limitGrantsRead,
  revokeGrant,
} from "./authority.js";
export type { AuthorizeDecision, GrantInput } from "./authority.js";
export { internalCommand, publicCommand } from "./declaration.js";
export type {
  AdmissionPolicy,
  Bounds,
  CommandDeclaration,
  Executor,
  ExecutorResult,
  InternalCommandArgs,
  PermissionPolicy,
  PublicCommandArgs,
} from "./declaration.js";
export {
  classifyThrown,
  errorDataValidator,
  normalizeThrown,
  refuseTransient,
  reject,
} from "./outcome-boundary.js";
export type {
  PlatformRejectionCode,
  RejectionCode,
  RejectionData,
  TransientCode,
  TransientData,
} from "./outcome-boundary.js";
export {
  commandResponseValidator,
  outcomeKindValidator,
  runPipeline,
} from "./pipeline.js";
export type { CommandResponse, PipelineCall } from "./pipeline.js";
export {
  canonicalJson,
  classifyReceipt,
  defaultRetention,
  fingerprintOf,
  insertReceipt,
  limitAffectedRefs,
  limitRequestKey,
  lookupReceipt,
} from "./receipts.js";
export type {
  ReceiptClass,
  ReceiptInsert,
  ReceiptKey,
  Retention,
} from "./receipts.js";
export { commandTables } from "./tables.js";
export type {
  CommandDataModel,
  Grant,
  GrantId,
  MutationCtx,
  QueryCtx,
  Receipt,
} from "./tables.js";
