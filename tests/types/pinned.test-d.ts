// The history view's pinned declarations against the code that realizes them, through the module
// scripts/pinned.mjs emits from recipe 24. Each test is named by the Spec and the Design entry it
// binds, and its assertion fails the typecheck when the pin and the code part. A pin the code does
// not export, or one the code differs from, has no test here.
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

describe("spec:application.generation-registry", () => {
  test("compiled: typeRegistryReader", () => {
    expectTypeOf<readModel.RegistryReader>().toEqualTypeOf<pinned.RegistryReader>();
    expectTypeOf<
      readModel.RegistryReader<readModel.ReadModelDataModel>
    >().toEqualTypeOf<pinned.RegistryReader<readModel.ReadModelDataModel>>();
  });
  test("compiled: typeWritableGeneration", () => {
    expectTypeOf<readModel.WritableGeneration>().toEqualTypeOf<pinned.WritableGeneration>();
  });
  test("compiled: fnGenerationsToWrite", () => {
    expectTypeOf<typeof readModel.generationsToWrite>().toEqualTypeOf<
      typeof pinned.generationsToWrite
    >();
  });
  test("compiled: fnActiveGeneration", () => {
    expectTypeOf<typeof readModel.activeGeneration>().toEqualTypeOf<
      typeof pinned.activeGeneration
    >();
  });
  test("compiled: validatorGenerationState", () => {
    expectTypeOf<typeof readModel.generationStateValidator>().toEqualTypeOf<
      typeof pinned.generationStateValidator
    >();
  });
  test("compiled: validatorProgressPass", () => {
    expectTypeOf<typeof readModel.progressPassValidator>().toEqualTypeOf<
      typeof pinned.progressPassValidator
    >();
  });
  test("compiled: tableGenerations", () => {
    expectTypeOf<
      (typeof readModel.readModelTables)["generations"]["validator"]
    >().toEqualTypeOf<(typeof pinned.tables)["generations"]["validator"]>();
  });
  test("compiled: tableProjectionMarkers", () => {
    expectTypeOf<
      (typeof readModel.readModelTables)["projectionMarkers"]["validator"]
    >().toEqualTypeOf<
      (typeof pinned.tables)["projectionMarkers"]["validator"]
    >();
  });
});

describe("spec:application.projection-contract", () => {
  test("compiled: typeProjection", () => {
    expectTypeOf<readModel.Projection<Dto, Row>>().toEqualTypeOf<
      pinned.Projection<Dto, Row>
    >();
  });
  test("compiled: typeReadModel", () => {
    expectTypeOf<readModel.ReadModel<Dto, Row>>().toEqualTypeOf<
      pinned.ReadModel<Dto, Row>
    >();
  });
  test("compiled: fnProjectionOf", () => {
    expectTypeOf<typeof readModel.projectionOf>().toEqualTypeOf<
      typeof pinned.projectionOf
    >();
  });
  test("compiled: typeWritableGeneration", () => {
    expectTypeOf<readModel.WritableGeneration>().toEqualTypeOf<pinned.WritableGeneration>();
  });
  test("compiled: typeRowWriter", () => {
    expectTypeOf<readModel.RowWriter>().toEqualTypeOf<pinned.RowWriter>();
    expectTypeOf<
      readModel.RowWriter<readModel.ReadModelDataModel>
    >().toEqualTypeOf<pinned.RowWriter<readModel.ReadModelDataModel>>();
  });
  test("compiled: typeApplyMode", () => {
    expectTypeOf<readModel.ApplyMode>().toEqualTypeOf<pinned.ApplyMode>();
  });
  test("compiled: typeApplyResult", () => {
    expectTypeOf<readModel.ApplyResult>().toEqualTypeOf<pinned.ApplyResult>();
  });
  test("compiled: fnApplyProjection", () => {
    expectTypeOf<typeof readModel.applyProjection>().toEqualTypeOf<
      typeof pinned.applyProjection
    >();
  });
  test("compiled: typeOrderAllocationHistoryFields", () => {
    expectTypeOf<allocationHistory.OrderAllocationHistoryFields>().toEqualTypeOf<pinned.OrderAllocationHistoryFields>();
  });
  test("compiled: fnOrderAllocationHistoryKeyOf", () => {
    expectTypeOf<
      typeof allocationHistory.orderAllocationHistoryKeyOf
    >().toEqualTypeOf<typeof pinned.orderAllocationHistoryKeyOf>();
  });
  test("compiled: fnProjectOrderAllocationHistory", () => {
    expectTypeOf<
      typeof allocationHistory.projectOrderAllocationHistory
    >().toEqualTypeOf<typeof pinned.projectOrderAllocationHistory>();
  });
  test("compiled: validatorRowConventions", () => {
    expectTypeOf<typeof readModel.rowConventions>().toEqualTypeOf<
      typeof pinned.rowConventions
    >();
  });
  test("compiled: validatorOrderSummaryFields", () => {
    expectTypeOf<typeof orderSummary.orderSummaryFields>().toEqualTypeOf<
      typeof pinned.orderSummaryFields
    >();
  });
  test("compiled: tableOrderSummaries", () => {
    expectTypeOf<(typeof schema)["tables"]["orderSummaries"]>().toEqualTypeOf<
      (typeof pinned.tables)["orderSummaries"]
    >();
  });
});

describe("spec:application.rebuild", () => {
  test("compiled: typeRebuildTarget", () => {
    expectTypeOf<readModel.RebuildTarget<Dto>>().toEqualTypeOf<
      pinned.RebuildTarget<Dto>
    >();
  });
  test("compiled: tableTenantFill", () => {
    expectTypeOf<
      (typeof readModel.readModelTables)["tenantFill"]
    >().toEqualTypeOf<(typeof pinned.tables)["tenantFill"]>();
  });
});

describe("spec:application.write-pause", () => {
  test("compiled: validatorClosedEntry", () => {
    expectTypeOf<typeof gate.closedEntryValidator>().toEqualTypeOf<
      typeof pinned.closedEntryValidator
    >();
  });
  test("compiled: tableMaintenanceGates", () => {
    expectTypeOf<(typeof gate.gateTables)["maintenanceGates"]>().toEqualTypeOf<
      (typeof pinned.tables)["maintenanceGates"]
    >();
  });
});

describe("spec:command.command-declaration", () => {
  test("compiled: typeSourceRef", () => {
    expectTypeOf<readModel.SourceRef>().toEqualTypeOf<pinned.SourceRef>();
  });
  test("compiled: typePermissionPolicy", () => {
    expectTypeOf<command.PermissionPolicy<Input>>().toEqualTypeOf<
      pinned.PermissionPolicy<Input>
    >();
  });
  test("compiled: typeExecutorResult", () => {
    expectTypeOf<command.ExecutorResult<Result>>().toEqualTypeOf<
      pinned.ExecutorResult<Result>
    >();
  });
  test("compiled: typeBounds", () => {
    expectTypeOf<command.Bounds>().toEqualTypeOf<pinned.Bounds>();
  });
});

describe("spec:command.command-pipeline", () => {
  test("compiled: typePipelineCall", () => {
    expectTypeOf<command.PipelineCall<Input>>().toEqualTypeOf<
      pinned.PipelineCall<Input>
    >();
  });
  test("compiled: typeCommandResponse", () => {
    expectTypeOf<command.CommandResponse<Result>>().toEqualTypeOf<
      pinned.CommandResponse<Result>
    >();
  });
  test("compiled: validatorCommandResponse", () => {
    expectTypeOf<typeof command.commandResponseValidator>().toEqualTypeOf<
      typeof pinned.commandResponseValidator
    >();
  });
});

describe("spec:context.event-envelope", () => {
  test("compiled: typeCausedBy", () => {
    expectTypeOf<context.CausedBy>().toEqualTypeOf<pinned.CausedBy>();
  });
  test("compiled: validatorCausedBy", () => {
    expectTypeOf<typeof context.causedByValidator>().toEqualTypeOf<
      typeof pinned.causedByValidator
    >();
  });
  test("compiled: typeOperationRef", () => {
    expectTypeOf<context.OperationRef>().toEqualTypeOf<pinned.OperationRef>();
  });
  test("compiled: validatorOperationRef", () => {
    expectTypeOf<typeof context.operationRefValidator>().toEqualTypeOf<
      typeof pinned.operationRefValidator
    >();
  });
  test("compiled: typeEventEnvelope", () => {
    expectTypeOf<context.EventEnvelope>().toEqualTypeOf<pinned.EventEnvelope>();
    expectTypeOf<context.EventEnvelope<Dto>>().toEqualTypeOf<
      pinned.EventEnvelope<Dto>
    >();
  });
  test("compiled: validatorEventEnvelope", () => {
    expectTypeOf<typeof context.eventEnvelopeValidator>().toEqualTypeOf<
      typeof pinned.eventEnvelopeValidator
    >();
  });
  test("compiled: typeEnvelopeInput", () => {
    expectTypeOf<context.EnvelopeInput>().toEqualTypeOf<pinned.EnvelopeInput>();
  });
});

describe("spec:context.journal", () => {
  test("compiled: fnCreateJournal", () => {
    expectTypeOf<typeof context.createJournal>().toEqualTypeOf<
      typeof pinned.createJournal
    >();
  });
  test("compiled: typeJournal", () => {
    expectTypeOf<context.Journal>().toEqualTypeOf<pinned.Journal>();
  });
  test("compiled: typeStreamMeta", () => {
    expectTypeOf<context.StreamMeta>().toEqualTypeOf<pinned.StreamMeta>();
  });
});

describe("spec:context.queries", () => {
  test("compiled: typeQueryArgs", () => {
    expectTypeOf<context.GetArgs>().toEqualTypeOf<pinned.GetArgs>();
  });
  test("compiled: typePageLimit", () => {
    expectTypeOf<context.PageLimit>().toEqualTypeOf<pinned.PageLimit>();
  });
  test("compiled: fnBoundedPage", () => {
    expectTypeOf<typeof context.boundedPage>().toEqualTypeOf<
      typeof pinned.boundedPage
    >();
  });
});
