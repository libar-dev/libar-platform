// The read-model library: what the parent uses to declare, activate, write and read a read model.
export {
  activateFirstGeneration,
  activeGeneration,
  generationsToWrite,
} from "./generations.js";
export {
  applyProjection,
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
