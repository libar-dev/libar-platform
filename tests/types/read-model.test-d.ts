import type { GenericQueryCtx } from "convex/server";
import { v } from "convex/values";
import { expectTypeOf, test } from "vitest";
import type { DataModel } from "../../fixture/convex/_generated/dataModel.js";
import { documentSummary } from "../../fixture/convex/summaries.js";
import {
  authorizeQuery,
  type CommandDataModel,
  type CommandDeclaration,
} from "../../src/command/index.js";
import {
  activeGeneration,
  generationsToWrite,
  type ReadModelDataModel,
} from "../../src/read-model/index.js";
const declaration = {
  name: "Probe",
  contractVersion: 1,
  input: v.object({ n: v.number() }),
  output: v.null(),
  permission: { permission: "probe" },
  rejections: [],
  executor: async () => ({
    kind: "applied" as const,
    result: null,
    versions: [],
    streams: [],
  }),
};
test("compiled: a declaration states writes, and readModels may be left out", () => {
  // @ts-expect-error A declaration with no writes does not compile.
  const missing: CommandDeclaration<{ n: number }, null> = declaration;
  const none: CommandDeclaration<{ n: number }, null> = {
    ...declaration,
    writes: [],
  };
  const bound: CommandDeclaration<{ n: number }, null> = {
    ...declaration,
    writes: [{ contextId: "depot", streamType: "document" }],
    readModels: [
      {
        readModel: documentSummary,
        source: { contextId: "depot", streamType: "document" },
      },
    ],
  };
  void [missing, none, bound];
});
test("compiled: the query helpers take a composition's own ctx, and refuse one whose data model lacks their tables", () => {
  const ctx = {} as GenericQueryCtx<DataModel>;
  expectTypeOf(
    authorizeQuery(ctx, { name: "q", tenantId: "t-1", permission: "p" }),
  ).resolves.toExtend<{ kind: string; id: string }>();
  expectTypeOf(activeGeneration(ctx, "documentSummary")).resolves.toEqualTypeOf<
    number | undefined
  >();
  void generationsToWrite(ctx, "documentSummary");
  const registryOnly = {} as GenericQueryCtx<ReadModelDataModel>;
  const commandOnly = {} as GenericQueryCtx<CommandDataModel>;
  // @ts-expect-error authorizeQuery reads the grants table, which this data model lacks.
  void authorizeQuery(registryOnly, {
    name: "q",
    tenantId: "t-1",
    permission: "p",
  });
  // @ts-expect-error activeGeneration reads the generations table, which this data model lacks.
  void activeGeneration(commandOnly, "documentSummary");
});
