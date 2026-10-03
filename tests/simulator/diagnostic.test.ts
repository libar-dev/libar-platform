import { componentsGeneric, type FunctionReference } from "convex/server";
import type {
  OperationRef,
  OperationOutcome,
} from "../../src/context/index.js";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { components } from "../../fixture/convex/_generated/api.js";
import { documentSummary } from "../../fixture/convex/summaries.js";
import { classifyThrown, runPipeline } from "../../src/command/index.js";
import {
  diagnosticApp,
  actor,
  cause,
  call,
  human,
  issuer,
  internalRef,
  publicRef,
  entry,
} from "./diagnostic-support.js";
import { caught } from "./gate-support.js";

beforeEach(() => vi.stubEnv("MAINTENANCE_MODE", undefined));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const fields = {
  tenantId: call.tenantId,
  namespace: call.namespace,
  commandType: "DiagnosticCommand",
  requestKey: call.requestKey,
  correlationId: call.correlationId,
  actorKind: actor.kind,
  actorId: actor.id,
  causedBy: cause,
};
const noWork = {
  replayed: false,
  eventsAppended: 0,
  readModelRows: 0,
  versions: [],
};
for (const kind of ["applied", "businessFailure"] as const) {
  test(`convex-test: ${kind} emits once from the call, operation and outcome, audits once, and duplicate uses the new call and old receipt`, async () => {
    let refuseNew = false;
    const a = diagnosticApp({
      admission: async () =>
        refuseNew ? { admitted: false, code: "capacity" } : { admitted: true },
    });
    const execute = a.decl.executor;
    a.decl.executor = async (ctx, args) => ({
      ...(await execute(ctx, args)),
      kind,
    });
    await a.grant();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const first = await a.t.mutation(internalRef, call);
    expect(a.operations).toHaveLength(1);
    expect.soft(a.records()).toEqual([
      {
        ...fields,
        kind,
        replayed: false,
        operationId: first.operationId,
        eventsAppended: 1,
        readModelRows: 0,
        versions: first.versions,
      },
    ]);
    expect(a.operations[0]).toEqual({
      operationId: first.operationId,
      causedBy: cause,
      correlationId: call.correlationId,
    });
    const before = await a.stored();
    expect(before.audits).toEqual([
      expect.objectContaining({
        tenantId: call.tenantId,
        actor,
        operationId: first.operationId,
        requestKey: call.requestKey,
        commandType: "DiagnosticCommand",
        kind: "security",
        decision: kind,
        causedBy: cause,
        subject: {
          contextId: "depot",
          streamType: "document",
          streamId: "document",
        },
      }),
    ]);
    const secondActor = {
      kind: "agent",
      id: "second-actor",
      issuer: "second-issuer",
    } as const;
    await a.grant(secondActor);
    const secondCause = {
      kind: "command",
      commandType: "DifferentCause",
    } as const;
    a.lines.length = 0;
    refuseNew = true;
    const duplicate = await a.t.mutation(internalRef, {
      ...call,
      actor: secondActor,
      correlationId: "second-correlation",
      causedBy: secondCause,
    });
    expect(duplicate).toMatchObject({
      kind,
      replayed: true,
      operationId: first.operationId,
      versions: first.versions,
      result: null,
    });
    expect.soft(a.records()).toEqual([
      {
        ...fields,
        actorKind: secondActor.kind,
        actorId: secondActor.id,
        correlationId: "second-correlation",
        causedBy: secondCause,
        kind,
        replayed: true,
        operationId: first.operationId,
        eventsAppended: 0,
        readModelRows: 0,
        versions: first.versions,
      },
    ]);
    expect(a.execute).toHaveBeenCalledTimes(1);
    expect(await a.stored()).toEqual(before);
    a.lines.length = 0;
    const without = { ...call };
    delete without.causedBy;
    delete without.correlationId;
    await a.t.mutation(internalRef, without);
    const plainFields = {
      tenantId: call.tenantId,
      namespace: call.namespace,
      commandType: "DiagnosticCommand",
      requestKey: call.requestKey,
      actorKind: actor.kind,
      actorId: actor.id,
    };
    expect.soft(a.records()).toEqual([
      {
        ...plainFields,
        kind,
        replayed: true,
        operationId: first.operationId,
        eventsAppended: 0,
        readModelRows: 0,
        versions: first.versions,
      },
    ]);
    expect(await a.stored()).toEqual(before);
    expect(errorLog).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
}
test("convex-test: public success defaults the namespace, actor and command cause, omits absent call fields, and uses consoleSink", async () => {
  const a = diagnosticApp();
  delete a.decl.diagnosticSink;
  await a.grant(human);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await a.t
    .withIdentity({ issuer, subject: "human" })
    .mutation(publicRef, { tenantId: call.tenantId, input: call.input });
  expect(log).toHaveBeenCalledTimes(1);
  expect(log.mock.calls[0]).toHaveLength(1);
  expect(
    JSON.parse(String(log.mock.calls[0]![0]).slice("diagnostic ".length)),
  ).toEqual({
    tenantId: call.tenantId,
    namespace: "public",
    commandType: "DiagnosticCommand",
    kind: "applied",
    replayed: false,
    operationId: response.operationId,
    actorKind: "human",
    actorId: human.id,
    causedBy: { kind: "command", commandType: "DiagnosticCommand" },
    eventsAppended: 1,
    readModelRows: 0,
    versions: response.versions,
  });
  expect((await a.stored()).audits).toHaveLength(1);
  expect(error).not.toHaveBeenCalled();
});
for (const ending of [
  "rejection",
  "transient",
  "technical",
  "undeclared rejection",
] as const) {
  test(`convex-test: internal ${ending} emits one normalized failure with call fields, no operation or audit`, async () => {
    const a = diagnosticApp();
    await a.grant();
    const error = new Error("executor broke");
    if (ending === "transient")
      a.decl.admission = async () => ({
        admitted: false,
        code: "rateLimited",
        retryAfterMs: 17,
      });
    else
      a.decl.executor = async (ctx, args) => {
        // A failure after real context writes must still report zero committed work.
        await ctx.runMutation(components.depot.operations.createDocuments, {
          tenantId: args.tenantId,
          actor: args.actor,
          operation: args.operation,
          input: { documents: [args.input] },
        });
        if (ending === "technical") throw error;
        throw new ConvexError({
          code: ending === "rejection" ? "titleRequired" : "unknownCode",
          message: "refused",
        });
      };
    const gap = vi.spyOn(console, "error").mockImplementation(() => {});
    const thrown = await caught(a.t.mutation(internalRef, call));
    const kind = ending === "undeclared rejection" ? "technical" : ending;
    expect(classifyThrown(thrown).kind).toBe(kind);
    if (ending === "technical") expect(thrown).toBe(error);
    if (kind === "technical") expect(thrown).not.toBeInstanceOf(ConvexError);
    else
      expect(thrown).toMatchObject({
        data: {
          kind,
          code: kind === "rejection" ? "titleRequired" : "rateLimited",
        },
      });
    expect.soft(a.records()).toEqual([
      {
        ...fields,
        ...noWork,
        kind,
        ...(kind === "technical"
          ? {}
          : { code: kind === "rejection" ? "titleRequired" : "rateLimited" }),
      },
    ]);
    expect(await a.stored()).toEqual({ receipts: [], audits: [], rows: [] });
    expect(
      await a.t.run((ctx) =>
        ctx.runQuery(components.depot.queries.document.get, {
          tenantId: call.tenantId,
          streamId: "document",
        }),
      ),
    ).toBeNull();
    expect(gap).not.toHaveBeenCalled();
  });
}
for (const authenticated of [false, true]) {
  test(`convex-test: public refusal ${authenticated ? "after" : "before"} authentication includes only the established actor`, async () => {
    const a = diagnosticApp();
    const t = authenticated
      ? a.t.withIdentity({ issuer, subject: "human" })
      : a.t;
    const thrown = await caught(
      t.mutation(publicRef, {
        tenantId: call.tenantId,
        requestKey: "public-key",
        correlationId: "public-correlation",
        input: call.input,
      }),
    );
    const code = authenticated ? "forbidden" : "unauthenticated";
    expect(thrown).toMatchObject({ data: { kind: "rejection", code } });
    expect.soft(a.records()).toEqual([
      {
        tenantId: call.tenantId,
        commandType: "DiagnosticCommand",
        namespace: "public",
        kind: "rejection",
        code,
        requestKey: "public-key",
        correlationId: "public-correlation",
        ...noWork,
        ...(authenticated ? { actorKind: "human", actorId: human.id } : {}),
      },
    ]);
    expect(a.execute).not.toHaveBeenCalled();
    expect(await a.stored()).toEqual({ receipts: [], audits: [], rows: [] });
  });
}
for (const ref of [publicRef, internalRef]) {
  test(`convex-test: validators refuse ${ref === publicRef ? "public" : "internal"} arguments without a diagnostic`, async () => {
    const a = diagnosticApp();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const gap = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      a.t.mutation(ref, { ...call, tenantId: 5 } as never),
    ).rejects.toThrow();
    expect.soft(a.records()).toEqual([]);
    expect(a.execute).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(gap).not.toHaveBeenCalled();
    expect(await a.stored()).toEqual({ receipts: [], audits: [], rows: [] });
  });
}
for (const failGap of [false, true]) {
  test(`convex-test: a broken sink with ${failGap ? "broken" : "working"} gap logging preserves success and failure`, async () => {
    const sink = vi.fn(() => {
      throw null;
    });
    let refuseNew = false;
    const a = diagnosticApp({
      diagnosticSink: sink,
      admission: async () =>
        refuseNew ? { admitted: false, code: "capacity" } : { admitted: true },
    });
    await a.grant();
    const gap = vi.spyOn(console, "error").mockImplementation(() => {
      if (failGap) throw new Error("gap broke");
    });
    const result = await a.t.mutation(internalRef, call);
    expect(result).toMatchObject({ kind: "applied", replayed: false });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(gap).toHaveBeenCalledExactlyOnceWith(
      `diagnostic gap ${JSON.stringify({ tenantId: call.tenantId, commandType: "DiagnosticCommand", kind: "applied", operationId: result.operationId })}`,
    );
    const before = await a.stored();
    expect(before.audits).toHaveLength(1);
    expect(before.receipts).toHaveLength(1);
    sink.mockClear();
    gap.mockClear();
    refuseNew = true;
    await expect(
      a.t.mutation(internalRef, { ...call, requestKey: "refused-key" }),
    ).rejects.toMatchObject({ data: { kind: "transient", code: "capacity" } });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(gap).toHaveBeenCalledExactlyOnceWith(
      `diagnostic gap ${JSON.stringify({ tenantId: call.tenantId, commandType: "DiagnosticCommand", kind: "transient" })}`,
    );
    expect(await a.stored()).toEqual(before);
  });
}
for (const appended of [1, 2]) {
  for (const rows of [0, 1, 2]) {
    test(`convex-test: ${appended} appended at version 100 and ${rows} generation rows count actual work`, async () => {
      const stream = entry(appended);
      const a = diagnosticApp({
        executor: async () => ({
          kind: "applied",
          result: null,
          versions: [stream.version],
          streams: [stream],
        }),
        ...(rows === 0
          ? {}
          : {
              readModels: [
                {
                  readModel: documentSummary,
                  source: { contextId: "depot", streamType: "document" },
                },
              ],
            }),
      });
      await a.grant();
      if (rows > 0)
        await a.t.run(async (ctx) => {
          for (let generation = 1; generation <= rows; generation++) {
            await ctx.db.insert("generations", {
              readModel: "documentSummary",
              generation,
              projectionVersion: 1,
              state: generation === 1 ? "active" : "building",
              pauseRequired: false,
              fence: 0,
              startedAt: 0,
              startedBy: "operator",
              changedAt: 0,
              changedBy: "operator",
            });
            // A live update writes an existing building row as well as the active row.
            await ctx.db.insert("documentSummaries", {
              tenantId: call.tenantId,
              generation,
              key: "document",
              projectionVersion: 1,
              sourceVersions: [{ ...stream.version, version: 100 }],
              documentId: "document",
              status: "draft",
              title: "Before",
            });
          }
        });
      const response = await a.t.mutation(internalRef, call);
      expect.soft(a.records()).toEqual([
        {
          ...fields,
          kind: "applied",
          replayed: false,
          operationId: response.operationId,
          eventsAppended: appended,
          readModelRows: rows,
          versions: [stream.version],
        },
      ]);
      const stored = await a.stored();
      expect(stored.rows).toHaveLength(rows);
      for (const row of stored.rows)
        expect(row).toMatchObject({
          title: "Title",
          sourceVersions: [stream.version],
        });
    });
  }
}
test("convex-test: eventsAppended sums all streams rather than counting streams or final versions", async () => {
  const streams = [entry(1, "first"), entry(2, "second")];
  const a = diagnosticApp({
    executor: async () => ({
      kind: "businessFailure",
      result: null,
      streams,
      versions: streams.map((stream) => stream.version),
    }),
  });
  await a.grant();
  const response = await a.t.mutation(internalRef, call);
  expect.soft(a.records()).toEqual([
    {
      ...fields,
      kind: "businessFailure",
      replayed: false,
      operationId: response.operationId,
      eventsAppended: 3,
      readModelRows: 0,
      versions: response.versions,
    },
  ]);
  expect((await a.stored()).audits).toHaveLength(1);
});

for (const appended of [1, 2]) {
  test(`convex-test: the journal appends ${appended} events to a stream already at version 100`, async () => {
    const context = componentsGeneric().depot!.diagnosticContext!;
    const add = context.add as FunctionReference<
      "mutation",
      "public",
      {
        tenantId: string;
        actor: typeof actor;
        operation: OperationRef;
        input: { amounts: number[] };
      },
      OperationOutcome<null>
    >;
    const stored = context.stored as FunctionReference<
      "query",
      "internal",
      Record<string, never>,
      {
        streams: { streamVersion: number }[];
        events: { operationId: string }[];
      }
    >;
    const a = diagnosticApp({
      writes: [{ contextId: "depot", streamType: "counter" }],
      executor: async (ctx, args) =>
        ctx.runMutation(add, {
          tenantId: args.tenantId,
          actor,
          operation: args.operation,
          input: { amounts: Array.from({ length: appended }, () => 1) },
        }),
    });
    await a.grant();
    await a.t.run((ctx) =>
      ctx.runMutation(add, {
        tenantId: call.tenantId,
        actor,
        operation: {
          operationId: "seed",
          causedBy: { kind: "command", commandType: "Seed" },
        },
        input: { amounts: Array.from({ length: 100 }, () => 1) },
      }),
    );
    const before = await a.t.run((ctx) => ctx.runQuery(stored, {}));
    expect(before.streams).toMatchObject([{ streamVersion: 100 }]);
    expect(before.events).toHaveLength(100);
    expect.soft(a.records()).toEqual([]);
    const response = await a.t.mutation(internalRef, call);
    const after = await a.t.run((ctx) => ctx.runQuery(stored, {}));
    expect(after.streams).toMatchObject([{ streamVersion: 100 + appended }]);
    expect(after.events).toHaveLength(100 + appended);
    expect(
      after.events.filter(
        (event) => event.operationId === response.operationId,
      ),
    ).toHaveLength(appended);
    expect.soft(a.records()).toEqual([
      {
        ...fields,
        kind: "applied",
        replayed: false,
        operationId: response.operationId,
        eventsAppended: appended,
        readModelRows: 0,
        versions: response.versions,
      },
    ]);
  });
}

// Step 10's order is observable even though either wrong order could roll back cleanly.
test("convex-test: the receipt insert finishes before audit, and both finish before the diagnostic sink", async () => {
  const writes: string[] = [];
  const a = diagnosticApp({
    diagnosticSink: () => {
      writes.push("diagnostic");
    },
  });
  await a.grant();
  await a.t.run((ctx) =>
    runPipeline(
      {
        ...ctx,
        db: new Proxy(ctx.db, {
          get(target, property, receiver) {
            if (property === "insert")
              return async (...args: unknown[]) => {
                const result: unknown = await Reflect.apply(
                  target.insert,
                  target,
                  args,
                );
                writes.push(String(args[0]));
                return result;
              };
            return Reflect.get(target, property, receiver);
          },
        }),
      },
      a.decl,
      call,
    ),
  );
  expect(
    writes.filter((table) =>
      ["receipts", "auditRecords", "diagnostic"].includes(table),
    ),
  ).toEqual(["receipts", "auditRecords", "diagnostic"]);
  expect((await a.stored()).audits).toHaveLength(1);
});
