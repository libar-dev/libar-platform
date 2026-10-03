// The read-model library: what the parent uses to declare, rebuild, write and read a read model.
export { activeGeneration, generationsToWrite } from "./generations.js";
export {
  applyProjection,
  projectionOf,
  defaultRowBudgetBytes,
  limitRowBudgetBytes,
} from "./projection.js";
export type {
  AnyReadModel,
  ApplyInput,
  ApplyMode,
  ApplyResult,
  Projection,
  ReadModel,
  WritableGeneration,
} from "./projection.js";
export { limitReadModelList, readModelView } from "./queries.js";
export {
  batchCursorValidator,
  generationStateValidator,
  progressPassValidator,
  readModelTables,
  rowConventions,
} from "./tables.js";
export type {
  Generation,
  ReadModelDataModel,
  RegistryReader,
  RegistryWriter,
  RowDataModel,
  RowWriter,
} from "./tables.js";
export {
  fromSource,
  limitReadModelWritesPerCommand,
  writeReadModels,
} from "./write.js";
export type { ReadModelBinding, SourceRef } from "./write.js";
export {
  startGeneration,
  interruptGeneration,
  resumeGeneration,
  switchGeneration,
  rollbackGeneration,
  abortGeneration,
  purgeGeneration,
  fillTenants,
  backfillBatch,
  verifyBatch,
  purgeBatch,
  fillTenantsBatch,
  getGenerations,
  batchSizeFor,
  rebuildBatchCeiling,
  limitPurgeBatch,
  resumeChain,
  limitTenantFillBatch,
  limitGenerationsListed,
} from "./rebuild.js";
export type {
  RebuildConfig,
  RebuildTarget,
  BatchRef,
  FillBatchRef,
} from "./rebuild.js";
