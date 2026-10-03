// pack:history-view's pinned declarations against the code, through the module scripts/pinned.mjs
// emits from recipe 24. Each test is named by the Design entry it binds. Bound: the code equals the
// pin, so a changed pin fails the typecheck; a table's pair holds its indexes too. Ahead: the design
// leads the code, so the day the code catches up the assertion fails and the pair moves to bound; a
// function's ctx is erased first where the pin's and the code's differ. Not compared: the pair
// differs only in the ctx, or carries a ctx inside a type no erasing reaches; nothing is asserted.
import type { TableDefinition } from "convex/server";
import { describe, expectTypeOf, test } from "vitest";
import type * as pinned from "../../generated/pinned/history-view.js";
import type * as orderSummary from "../../example/convex/orderSummary.js";
import type schema from "../../example/convex/schema.js";
import type * as allocationHistory from "../../example/domain/orderAllocationHistory.js";
import type * as command from "../../src/command/index.js";
import type * as context from "../../src/context/index.js";
import type * as gate from "../../src/gate/index.js";
import type * as readModel from "../../src/read-model/index.js";

// Representative arguments for the generic declarations.
type Dto = { orderId: string; lineCount: number };
type Row = { orderId: string; total: number };
type Input = { orderId: string };
type Result = { allocated: boolean };
type State = { status: "open" | "closed" };
type Command = { kind: "close" };
type Event = { eventType: "closed"; eventSchemaVersion: 1; payload: null };
type Document = { _id: string; _creationTime: number; generation: number };
// A table's document and its indexes, names and fields, which comparing the table type does not reach.
type TableShape<Table> =
  Table extends TableDefinition<
    infer Document,
    infer Indexes,
    infer Search,
    infer Vector
  >
    ? { document: Document; indexes: Indexes; search: Search; vector: Vector }
    : never;
// A function without its first parameter, the ctx, for a pair whose ctx notation differs.
type WithoutCtx<F> = F extends (ctx: never, ...rest: infer Rest) => infer Return
  ? (...rest: Rest) => Return
  : never;

describe("bound: the code equals the pin", () => {
  test("spec:application.generation-registry#design.typeRegistryReader", () => {
    expectTypeOf<readModel.RegistryReader>().toEqualTypeOf<pinned.RegistryReader>();
    expectTypeOf<
      readModel.RegistryReader<readModel.ReadModelDataModel>
    >().toEqualTypeOf<pinned.RegistryReader<readModel.ReadModelDataModel>>();
  });
  test("spec:application.generation-registry#design.fnGenerationsToWrite", () => {
    expectTypeOf<typeof readModel.generationsToWrite>().toEqualTypeOf<
      typeof pinned.generationsToWrite
    >();
  });
  test("spec:application.generation-registry#design.fnActiveGeneration", () => {
    expectTypeOf<typeof readModel.activeGeneration>().toEqualTypeOf<
      typeof pinned.activeGeneration
    >();
  });
  test("spec:application.generation-registry#design.validatorGenerationState", () => {
    expectTypeOf<typeof readModel.generationStateValidator>().toEqualTypeOf<
      typeof pinned.generationStateValidator
    >();
  });
  test("spec:application.generation-registry#design.validatorProgressPass", () => {
    expectTypeOf<typeof readModel.progressPassValidator>().toEqualTypeOf<
      typeof pinned.progressPassValidator
    >();
  });
  test("spec:application.generation-registry#design.tableGenerations", () => {
    expectTypeOf<
      TableShape<(typeof readModel.readModelTables)["generations"]>
    >().toEqualTypeOf<TableShape<(typeof pinned.tables)["generations"]>>();
  });
  test("spec:application.generation-registry#design.tableProjectionMarkers", () => {
    expectTypeOf<
      TableShape<(typeof readModel.readModelTables)["projectionMarkers"]>
    >().toEqualTypeOf<
      TableShape<(typeof pinned.tables)["projectionMarkers"]>
    >();
  });
  test("spec:application.history-projection#design.typeHistoryEvent", () => {
    expectTypeOf<allocationHistory.HistoryEvent>().toEqualTypeOf<pinned.HistoryEvent>();
  });
  test("spec:application.history-projection#design.typeOrderAllocation", () => {
    expectTypeOf<allocationHistory.OrderAllocation>().toEqualTypeOf<pinned.OrderAllocation>();
  });
  test("spec:application.history-projection#design.typeOrderAllocationHistoryFields", () => {
    expectTypeOf<allocationHistory.OrderAllocationHistoryFields>().toEqualTypeOf<pinned.OrderAllocationHistoryFields>();
  });
  test("spec:application.history-projection#design.fnOrderAllocationHistoryKeyOf", () => {
    expectTypeOf<
      typeof allocationHistory.orderAllocationHistoryKeyOf
    >().toEqualTypeOf<typeof pinned.orderAllocationHistoryKeyOf>();
  });
  test("spec:application.history-projection#design.fnProjectOrderAllocationHistory", () => {
    expectTypeOf<
      typeof allocationHistory.projectOrderAllocationHistory
    >().toEqualTypeOf<typeof pinned.projectOrderAllocationHistory>();
  });
  test("spec:application.projection-contract#design.typeProjection", () => {
    expectTypeOf<readModel.Projection<Dto, Row>>().toEqualTypeOf<
      pinned.Projection<Dto, Row>
    >();
  });
  test("spec:application.projection-contract#design.typeReadModel", () => {
    expectTypeOf<readModel.ReadModel<Dto, Row>>().toEqualTypeOf<
      pinned.ReadModel<Dto, Row>
    >();
  });
  test("spec:application.projection-contract#design.fnProjectionOf", () => {
    expectTypeOf<typeof readModel.projectionOf>().toEqualTypeOf<
      typeof pinned.projectionOf
    >();
  });
  test("spec:application.projection-contract#design.typeWritableGeneration", () => {
    expectTypeOf<readModel.WritableGeneration>().toEqualTypeOf<pinned.WritableGeneration>();
  });
  test("spec:application.projection-contract#design.typeRowWriter", () => {
    expectTypeOf<readModel.RowWriter>().toEqualTypeOf<pinned.RowWriter>();
    expectTypeOf<
      readModel.RowWriter<readModel.ReadModelDataModel>
    >().toEqualTypeOf<pinned.RowWriter<readModel.ReadModelDataModel>>();
  });
  test("spec:application.projection-contract#design.typeApplyMode", () => {
    expectTypeOf<readModel.ApplyMode>().toEqualTypeOf<pinned.ApplyMode>();
  });
  test("spec:application.projection-contract#design.typeApplyResult", () => {
    expectTypeOf<readModel.ApplyResult>().toEqualTypeOf<pinned.ApplyResult>();
  });
  test("spec:application.projection-contract#design.fnApplyProjection", () => {
    expectTypeOf<typeof readModel.applyProjection>().toEqualTypeOf<
      typeof pinned.applyProjection
    >();
  });
  test("spec:application.projection-contract#design.validatorRowConventions", () => {
    expectTypeOf<typeof readModel.rowConventions>().toEqualTypeOf<
      typeof pinned.rowConventions
    >();
  });
  test("spec:application.projection-contract#design.validatorOrderSummaryFields", () => {
    expectTypeOf<typeof orderSummary.orderSummaryFields>().toEqualTypeOf<
      typeof pinned.orderSummaryFields
    >();
  });
  test("spec:application.projection-contract#design.tableOrderSummaries", () => {
    expectTypeOf<
      TableShape<(typeof schema)["tables"]["orderSummaries"]>
    >().toEqualTypeOf<TableShape<(typeof pinned.tables)["orderSummaries"]>>();
  });
  test("spec:application.read-models#design.fnPageInGeneration", () => {
    expectTypeOf<typeof readModel.pageInGeneration>().toEqualTypeOf<
      typeof pinned.pageInGeneration
    >();
  });
  test("spec:application.read-models#design.fnReadModelView", () => {
    expectTypeOf<typeof readModel.readModelView<Document>>().toEqualTypeOf<
      typeof pinned.readModelView<Document>
    >();
  });
  test("spec:application.rebuild#design.typeRebuildTarget", () => {
    expectTypeOf<readModel.RebuildTarget<Dto>>().toEqualTypeOf<
      pinned.RebuildTarget<Dto>
    >();
  });
  test("spec:application.rebuild#design.tableTenantFill", () => {
    expectTypeOf<
      TableShape<(typeof readModel.readModelTables)["tenantFill"]>
    >().toEqualTypeOf<TableShape<(typeof pinned.tables)["tenantFill"]>>();
  });
  test("spec:application.write-pause#design.typeScopeKey", () => {
    expectTypeOf<gate.ScopeKey>().toEqualTypeOf<pinned.ScopeKey>();
  });
  test("spec:application.write-pause#design.fnGateAllows", () => {
    expectTypeOf<typeof gate.gateAllows>().toEqualTypeOf<
      typeof pinned.gateAllows
    >();
  });
  test("spec:application.write-pause#design.fnAssertWritable", () => {
    expectTypeOf<typeof gate.assertWritable>().toEqualTypeOf<
      typeof pinned.assertWritable
    >();
  });
  test("spec:application.write-pause#design.fnScopesOfUseCase", () => {
    expectTypeOf<typeof gate.scopesOfUseCase>().toEqualTypeOf<
      typeof pinned.scopesOfUseCase
    >();
  });
  test("spec:application.write-pause#design.validatorClosedEntry", () => {
    expectTypeOf<typeof gate.closedEntryValidator>().toEqualTypeOf<
      typeof pinned.closedEntryValidator
    >();
  });
  test("spec:application.write-pause#design.tableMaintenanceGates", () => {
    expectTypeOf<
      TableShape<(typeof gate.gateTables)["maintenanceGates"]>
    >().toEqualTypeOf<TableShape<(typeof pinned.tables)["maintenanceGates"]>>();
  });
  test("spec:command.command-declaration#design.typeSourceRef", () => {
    expectTypeOf<readModel.SourceRef>().toEqualTypeOf<pinned.SourceRef>();
  });
  test("spec:command.command-declaration#design.typePermissionPolicy", () => {
    expectTypeOf<command.PermissionPolicy<Input>>().toEqualTypeOf<
      pinned.PermissionPolicy<Input>
    >();
  });
  test("spec:command.command-declaration#design.typeExecutorResult", () => {
    expectTypeOf<command.ExecutorResult<Result>>().toEqualTypeOf<
      pinned.ExecutorResult<Result>
    >();
  });
  test("spec:command.command-declaration#design.typeBounds", () => {
    expectTypeOf<command.Bounds>().toEqualTypeOf<pinned.Bounds>();
  });
  test("spec:command.command-pipeline#design.typePipelineCall", () => {
    expectTypeOf<command.PipelineCall<Input>>().toEqualTypeOf<
      pinned.PipelineCall<Input>
    >();
  });
  test("spec:command.command-pipeline#design.typeCommandResponse", () => {
    expectTypeOf<command.CommandResponse<Result>>().toEqualTypeOf<
      pinned.CommandResponse<Result>
    >();
  });
  test("spec:command.command-pipeline#design.validatorCommandResponse", () => {
    expectTypeOf<typeof command.commandResponseValidator>().toEqualTypeOf<
      typeof pinned.commandResponseValidator
    >();
  });
  test("spec:context.event-envelope#design.typeCausedBy", () => {
    expectTypeOf<context.CausedBy>().toEqualTypeOf<pinned.CausedBy>();
  });
  test("spec:context.event-envelope#design.validatorCausedBy", () => {
    expectTypeOf<typeof context.causedByValidator>().toEqualTypeOf<
      typeof pinned.causedByValidator
    >();
  });
  test("spec:context.event-envelope#design.typeOperationRef", () => {
    expectTypeOf<context.OperationRef>().toEqualTypeOf<pinned.OperationRef>();
  });
  test("spec:context.event-envelope#design.validatorOperationRef", () => {
    expectTypeOf<typeof context.operationRefValidator>().toEqualTypeOf<
      typeof pinned.operationRefValidator
    >();
  });
  test("spec:context.event-envelope#design.typeEventEnvelope", () => {
    expectTypeOf<context.EventEnvelope>().toEqualTypeOf<pinned.EventEnvelope>();
    expectTypeOf<context.EventEnvelope<Dto>>().toEqualTypeOf<
      pinned.EventEnvelope<Dto>
    >();
  });
  test("spec:context.event-envelope#design.validatorEventEnvelope", () => {
    expectTypeOf<typeof context.eventEnvelopeValidator>().toEqualTypeOf<
      typeof pinned.eventEnvelopeValidator
    >();
  });
  test("spec:context.event-envelope#design.typeEnvelopeInput", () => {
    expectTypeOf<context.EnvelopeInput>().toEqualTypeOf<pinned.EnvelopeInput>();
  });
  test("spec:context.journal#design.fnCreateJournal", () => {
    expectTypeOf<typeof context.createJournal>().toEqualTypeOf<
      typeof pinned.createJournal
    >();
  });
  test("spec:context.journal#design.typeJournal", () => {
    expectTypeOf<context.Journal>().toEqualTypeOf<pinned.Journal>();
  });
  test("spec:context.journal#design.typeStreamMeta", () => {
    expectTypeOf<context.StreamMeta>().toEqualTypeOf<pinned.StreamMeta>();
  });
  test("spec:context.queries#design.typeQueryArgs", () => {
    expectTypeOf<context.GetArgs>().toEqualTypeOf<pinned.GetArgs>();
  });
  test("spec:context.queries#design.typePageLimit", () => {
    expectTypeOf<context.PageLimit>().toEqualTypeOf<pinned.PageLimit>();
  });
  test("spec:context.queries#design.fnBoundedPage", () => {
    expectTypeOf<typeof context.boundedPage>().toEqualTypeOf<
      typeof pinned.boundedPage
    >();
  });
});

describe("ahead: the design leads the code", () => {
  test("spec:application.generation-registry#design.validatorBatchCursor: the history view's build adds sourceIndex", () => {
    expectTypeOf<typeof readModel.batchCursorValidator>().not.toEqualTypeOf<
      typeof pinned.batchCursorValidator
    >();
  });
  test("spec:application.generation-registry#design.tableGenerationProgress: its cursor, through validatorBatchCursor", () => {
    expectTypeOf<
      TableShape<(typeof readModel.readModelTables)["generationProgress"]>
    >().not.toEqualTypeOf<
      TableShape<(typeof pinned.tables)["generationProgress"]>
    >();
  });
  test("spec:application.rebuild#design.typeRebuildConfig: the history view's build adds history targets", () => {
    expectTypeOf<readModel.RebuildConfig>().not.toEqualTypeOf<pinned.RebuildConfig>();
  });
  test("spec:application.rebuild#design.fnBatchSizeFor: the history view's build takes a history projection", () => {
    expectTypeOf<typeof readModel.batchSizeFor>().not.toEqualTypeOf<
      typeof pinned.batchSizeFor
    >();
  });
  test("spec:application.rebuild#design.fnResumeChain: through typeRebuildConfig, its ctx erased", () => {
    expectTypeOf<WithoutCtx<typeof readModel.resumeChain>>().not.toEqualTypeOf<
      WithoutCtx<typeof pinned.resumeChain>
    >();
  });
  test("spec:command.command-declaration#design.typeReadModelBinding: the history view's build binds history and aggregate projections", () => {
    expectTypeOf<readModel.ReadModelBinding>().not.toEqualTypeOf<pinned.ReadModelBinding>();
  });
  test("spec:command.command-pipeline#design.fnWriteReadModels: through typeReadModelBinding", () => {
    expectTypeOf<typeof readModel.writeReadModels>().not.toEqualTypeOf<
      typeof pinned.writeReadModels
    >();
  });
  test("spec:command.command-declaration#design.typeRetention: a receipt's tombstone expiry", () => {
    expectTypeOf<command.Retention>().not.toEqualTypeOf<pinned.Retention>();
  });
  test("spec:context.journal#design.typeStreamRegistration: baselines and migration, and the deferred streamParts for the derived mapping", () => {
    expectTypeOf<
      context.StreamRegistration<State, Command, Event, Result>
    >().not.toEqualTypeOf<
      pinned.StreamRegistration<State, Command, Event, Result>
    >();
  });
  test("spec:context.journal#design.typeLoadedStream: the deferred streamParts", () => {
    expectTypeOf<context.LoadedStream<State>>().not.toEqualTypeOf<
      pinned.LoadedStream<State>
    >();
  });
  test("spec:context.journal#design.fnLoad: through typeStreamRegistration and typeLoadedStream, its ctx erased", () => {
    expectTypeOf<
      WithoutCtx<typeof context.load<State, Command, Event, Result>>
    >().not.toEqualTypeOf<
      WithoutCtx<typeof pinned.load<State, Command, Event, Result>>
    >();
  });
  test("spec:context.journal#design.fnAppend: through typeLoadedStream, its ctx erased", () => {
    expectTypeOf<
      WithoutCtx<typeof context.append<State, Event>>
    >().not.toEqualTypeOf<WithoutCtx<typeof pinned.append<State, Event>>>();
  });
  test("spec:context.queries#design.fnDefineGet: through typeStreamRegistration", () => {
    expectTypeOf<typeof context.defineGet>().not.toEqualTypeOf<
      typeof pinned.defineGet
    >();
  });
  test("spec:context.queries#design.fnDefineList: through typeStreamRegistration", () => {
    expectTypeOf<typeof context.defineList>().not.toEqualTypeOf<
      typeof pinned.defineList
    >();
  });
});

describe("not compared: the pin takes Convex's generic MutationCtx, the code a composition's own ctx", () => {
  test.skip(
    "spec:command.command-declaration#design.typeExecutor: differs only in ctx",
  );
  test.skip(
    "spec:command.command-declaration#design.typeAdmissionPolicy: differs only in ctx",
  );
  test.skip(
    "spec:application.write-pause#design.fnCloseScope: differs only in ctx",
  );
  test.skip(
    "spec:application.write-pause#design.fnResumeScope: differs only in ctx",
  );
  test.skip(
    "spec:command.command-declaration#design.typeCommandDeclaration: leads the code and differs in ctx, in its executor and admission",
  );
  test.skip(
    "spec:command.command-declaration#design.fnPublicCommand: leads the code and differs in ctx, through typeCommandDeclaration",
  );
  test.skip(
    "spec:command.command-declaration#design.fnInternalCommand: leads the code and differs in ctx, through typeCommandDeclaration",
  );
  test.skip(
    "spec:command.command-pipeline#design.fnRunPipeline: leads the code and differs in ctx, through typeCommandDeclaration",
  );
  test.skip(
    "spec:command.command-pipeline#design.fnRelayFailure: leads the code and differs in ctx, through typeCommandDeclaration",
  );
});
