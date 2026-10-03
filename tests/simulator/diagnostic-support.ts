import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { vi } from "vitest";
import schema from "../../fixture/convex/schema.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import { components } from "../../fixture/convex/_generated/api.js";
import {
  publicCommand,
  internalCommand,
  insertGrant,
  type Actor,
  type CommandDeclaration,
  type InternalCommandArgs,
  type PublicCommandArgs,
  type CommandResponse,
} from "../../src/command/index.js";
import type { OperationRef, StreamDto } from "../../src/context/index.js";
import type { DiagnosticRecord } from "../../src/operations/index.js";

export const actor = {
  kind: "service",
  id: "service-actor",
  issuer: "service-issuer",
} as const;
export const cause = {
  kind: "event",
  tenantId: "cause-tenant",
  contextId: "cause-context",
  eventId: "cause-event",
} as const;
export const input = { documentId: "document", title: "Title" };
export const call: InternalCommandArgs<typeof input> = {
  tenantId: "call-tenant",
  namespace: "worker",
  actor,
  requestKey: "call-key",
  correlationId: "call-correlation",
  causedBy: cause,
  input,
};
export const issuer = "https://diagnostic.test";
export const human = { kind: "human", id: `${issuer}|human` } as const;
export const internalRef = makeFunctionReference<
  "mutation",
  InternalCommandArgs<typeof input>,
  CommandResponse<null>
>("diagnostic:internal");
export const publicRef = makeFunctionReference<
  "mutation",
  PublicCommandArgs<typeof input>,
  CommandResponse<null>
>("diagnostic:public");
// A `streams` entry an executor returns, for a stream that stood at version 100 before the command.
export function streamsEntry(appended = 1, streamId = "document"): StreamDto {
  const version = {
    tenantId: call.tenantId,
    contextId: "depot",
    streamType: "document",
    streamId,
    version: 100 + appended,
  };
  return {
    version,
    appended,
    created: false,
    events: [],
    dto: {
      documentId: streamId,
      title: "Title",
      status: "draft",
      amendments: 100,
      version,
    },
  };
}
export function diagnosticApp(
  change: Partial<CommandDeclaration<typeof input, null>> = {},
) {
  const lines: string[] = [];
  const operations: OperationRef[] = [];
  const decl: CommandDeclaration<typeof input, null> = {
    name: "DiagnosticCommand",
    contractVersion: 1,
    input: v.object({ documentId: v.string(), title: v.string() }),
    output: v.null(),
    permission: { permission: "documents" },
    writes: [{ contextId: "depot", streamType: "document" }],
    audit: { kind: "security" },
    rejections: ["titleRequired"],
    diagnosticSink: (line: string) => {
      lines.push(line);
    },
    executor: async (ctx, { tenantId, actor, operation, input }) => {
      operations.push(operation);
      const result = await ctx.runMutation(
        components.depot.operations.createDocuments,
        { tenantId, actor, operation, input: { documents: [input] } },
      );
      return { ...result, result: null };
    },
    ...change,
  };
  const execute = vi.fn(decl.executor);
  decl.executor = execute;
  // Two modules these tests add under their function paths, neither a file on disk: the parent's
  // diagnostic module with the declaration's two entries, and the depot component's diagnosticContext
  // module, which tests/simulator/diagnostic-context.ts holds.
  const t = convexTest(schema, {
    ...import.meta.glob("../../fixture/convex/**/*.ts"),
    "../../fixture/convex/diagnostic.ts": async () => ({
      public: publicCommand(decl),
      internal: internalCommand(decl),
    }),
  });
  t.registerComponent("depot", depotSchema, {
    ...import.meta.glob("../../fixture/convex/depot/**/*.ts"),
    "../../fixture/convex/depot/diagnosticContext.ts": () =>
      import("./diagnostic-context.js"),
  });
  const grant = async (principal: Actor = actor) =>
    t.run((ctx) =>
      insertGrant(ctx, {
        tenantId: call.tenantId,
        principalKind: principal.kind,
        principalId: principal.id,
        permission: "documents",
        grantedBy: "operator",
      }),
    );
  const stored = () =>
    t.run(async (ctx) => ({
      receipts: await ctx.db.query("receipts").collect(),
      audits: await ctx.db.query("auditRecords").collect(),
      rows: await ctx.db.query("documentSummaries").collect(),
    }));
  const records = (): DiagnosticRecord[] =>
    lines.map((line) => {
      if (!line.startsWith("diagnostic "))
        throw new Error(`Unexpected diagnostic: ${line}`);
      return JSON.parse(line.slice("diagnostic ".length)) as DiagnosticRecord;
    });
  return { t, grant, stored, records, lines, operations, decl, execute };
}
