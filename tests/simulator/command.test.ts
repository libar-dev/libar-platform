import { convexTest } from "convex-test";
import { ConvexError, v, type Value } from "convex/values";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import annexSchema from "../../fixture/convex/annex/schema.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import {
  failIfDecidedMessage,
  faultTitles,
} from "../../fixture/convex/depot/streams.js";
import * as depotOperations from "../../fixture/convex/depot/operations.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { orderPermission } from "../../fixture/convex/orders.js";
import schema from "../../fixture/convex/schema.js";
import {
  authorize,
  establishActor,
  insertGrant,
  insertReceipt,
  runPipeline,
  type CommandDeclaration,
  type PipelineCall,
  type Retention,
} from "../../src/command/index.js";
import type { OperationRef } from "../../src/context/index.js";
const { version } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../node_modules/convex-test/package.json"),
    "utf8",
  ),
) as { version: string };
const name = (text: string) => `convex-test ${version}: ${text}`;
// The fixture composition with its two components, as the native backend deploys it.
function app() {
  const t = convexTest(
    schema,
    import.meta.glob("../../fixture/convex/**/*.ts"),
  );
  t.registerComponent(
    "annex",
    annexSchema,
    import.meta.glob("../../fixture/convex/annex/**/*.ts"),
  );
  t.registerComponent(
    "depot",
    depotSchema,
    import.meta.glob("../../fixture/convex/depot/**/*.ts"),
  );
  return t;
}
type App = ReturnType<typeof app>;
const issuer = "https://fixture-issuer.test";
const principalOf = (subject: string) => `${issuer}|${subject}`;
async function caller(
  t: App,
  subject: string,
  grant: {
    tenantId?: string;
    permission?: string;
    principalKind?: "human" | "service";
    subject?: { contextId: string; streamType: string; streamId: string };
  } = {},
) {
  await t.mutation(internal.grants.grant, {
    tenantId: grant.tenantId ?? "t-1",
    principalKind: grant.principalKind ?? "human",
    principalId: principalOf(subject),
    permission: grant.permission ?? permissions.documents,
    ...(grant.subject === undefined ? {} : { subject: grant.subject }),
    grantedBy: "operator",
  });
  return t.withIdentity({ issuer, subject });
}
type Caller = Awaited<ReturnType<typeof caller>>;
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (error: unknown) => error,
  );
}
async function errorData(promise: Promise<unknown>) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<Record<string, Value>>).data;
}
async function technicalFailure(promise: Promise<unknown>, text: string) {
  const error = await failure(promise);
  expect(error).not.toBeInstanceOf(ConvexError);
  expect(String(error)).toContain(text);
}
const receipts = (t: App) => t.run((ctx) => ctx.db.query("receipts").collect());
const report = (documentId = "doc-1", title = "Report") => ({
  tenantId: "t-1",
  input: { documentId, title },
});
const documentVersion = (
  streamId: string,
  version: number,
  tenantId = "t-1",
) => ({
  tenantId,
  contextId: "depot",
  streamType: "document",
  streamId,
  version,
});
// A command whose executor counts its runs and answers the outcome kind it is given, with no context call.
function counted(
  kind: "applied" | "businessFailure",
  retention?: Retention,
): {
  declaration: CommandDeclaration<{ n: number }, { n: number }>;
  runs: () => number;
} {
  let runs = 0;
  return {
    declaration: {
      name: "Counted",
      contractVersion: 1,
      input: v.object({ n: v.number() }),
      output: v.object({ n: v.number() }),
      permission: { permission: "probe" },
      writes: [],
      rejections: [],
      ...(retention === undefined ? {} : { retention }),
      executor: async (_ctx, { input }) => {
        runs += 1;
        return { kind, result: input, versions: [], streams: [] };
      },
    },
    runs: () => runs,
  };
}
const serviceCall: PipelineCall<{ n: number }> = {
  tenantId: "t-1",
  namespace: "worker",
  actor: { kind: "service", id: "svc-1" },
  requestKey: "k-1",
  input: { n: 1 },
};
const grantProbe = (t: App) =>
  t.run((ctx) =>
    insertGrant(ctx, {
      tenantId: "t-1",
      principalKind: "service",
      principalId: "svc-1",
      permission: "probe",
      grantedBy: "operator",
    }),
  );
const switchOn = (
  t: App,
  commandType: string,
  name: "rateLimited" | "capacity" | "failBeforeReceipt",
  on = true,
) =>
  t.mutation(internal.switches.set, {
    tenantId: "t-1",
    commandType,
    name,
    on,
  });

describe("the public entry", () => {
  test(
    name(
      "a caller with a grant creates a document and gets the outcome, operation ID, affected ref and version, with no receipt",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      const response = await user.mutation(
        api.depotCommands.createDocument,
        report(),
      );
      expect(response).toEqual({
        kind: "applied",
        result: { documentId: "doc-1", status: "draft" },
        operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        affected: [
          { contextId: "depot", streamType: "document", streamId: "doc-1" },
        ],
        versions: [documentVersion("doc-1", 1)],
        replayed: false,
      });
      expect(await receipts(t)).toEqual([]);
    },
  );

  test(
    name(
      "a caller with no identity is unauthenticated, and one with no grant or a grant on another subject is forbidden",
    ),
    async () => {
      const t = app();
      expect(
        await errorData(t.mutation(api.depotCommands.createDocument, report())),
      ).toEqual({
        kind: "rejection",
        code: "unauthenticated",
        entry: "CreateDocument",
        message: "CreateDocument needs an authenticated caller",
      });
      const stranger = t.withIdentity({ issuer, subject: "user-2" });
      expect(
        await errorData(
          stranger.mutation(api.depotCommands.createDocument, report()),
        ),
      ).toMatchObject({
        kind: "rejection",
        code: "forbidden",
        entry: "CreateDocument",
        details: { reason: "no_grant" },
      });
      const narrow = await caller(t, "user-3", {
        subject: {
          contextId: "depot",
          streamType: "document",
          streamId: "doc-9",
        },
      });
      expect(
        await errorData(
          narrow.mutation(api.depotCommands.createDocument, report()),
        ),
      ).toMatchObject({
        code: "forbidden",
        details: { reason: "subject_mismatch" },
      });
      await narrow.mutation(api.depotCommands.createDocument, report("doc-9"));
      // A grant in one tenant authorizes nothing in another.
      expect(
        await errorData(
          narrow.mutation(api.depotCommands.createDocument, {
            ...report("doc-9"),
            tenantId: "t-2",
          }),
        ),
      ).toMatchObject({ code: "forbidden" });
    },
  );

  test(
    name(
      "a namespace or actor argument fails the public entry's argument validator, which is no ConvexError",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      for (const extra of [
        { namespace: "worker" },
        { actor: { kind: "service", id: "svc" } },
      ]) {
        const error = await failure(
          user.mutation(api.depotCommands.createDocument, {
            ...report(),
            ...extra,
          } as never),
        );
        expect(error).not.toBeInstanceOf(ConvexError);
        expect(String(error)).toContain("Unexpected field");
      }
      expect(await receipts(t)).toEqual([]);
    },
  );

  test(
    name(
      "step 1 refuses a long request key and a refined title as invalidInput, and an input over its bounds as operationTooLarge",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      const stock = await caller(t, "user-1", {
        permission: permissions.stock,
      });
      expect(
        await errorData(
          user.mutation(api.depotCommands.createDocument, {
            ...report(),
            requestKey: "k".repeat(257),
          }),
        ),
      ).toMatchObject({
        kind: "rejection",
        code: "invalidInput",
        entry: "CreateDocument",
        details: { field: "requestKey", length: 257, limit: 256 },
      });
      expect(
        await errorData(
          user.mutation(
            api.depotCommands.createDocument,
            report("doc-1", "t".repeat(201)),
          ),
        ),
      ).toMatchObject({
        code: "invalidInput",
        message: "A title has at most 200 characters",
        details: { path: "title", max: 200, length: 201 },
      });
      expect(
        await errorData(
          user.mutation(
            api.depotCommands.createDocument,
            report("doc-1", "t".repeat(5000)),
          ),
        ),
      ).toMatchObject({
        code: "operationTooLarge",
        details: { maxBytes: 4096 },
      });
      const lines = Array.from({ length: 101 }, (_, i) => ({
        productId: `p-${i}`,
        quantity: 1,
      }));
      expect(
        await errorData(
          stock.mutation(api.depotCommands.addStock, {
            tenantId: "t-1",
            input: { lines },
          }),
        ),
      ).toMatchObject({
        code: "operationTooLarge",
        entry: "AddStock",
        details: { items: 101, maxItems: 100 },
      });
      expect(
        await stock.mutation(api.depotCommands.addStock, {
          tenantId: "t-1",
          input: { lines: lines.slice(0, 100) },
        }),
      ).toMatchObject({ kind: "applied" });
    },
  );

  test(
    name(
      "a context's rejection reaches the caller with the discriminator and the entry, and commits nothing",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      await user.mutation(api.depotCommands.createDocument, report());
      expect(
        await errorData(
          user.mutation(api.depotCommands.shipDocument, {
            tenantId: "t-1",
            requestKey: "k-ship",
            input: { documentId: "doc-1" },
          }),
        ),
      ).toEqual({
        kind: "rejection",
        entry: "ShipDocument",
        code: "invalidTransition",
        message: "A document cannot ship from draft",
        details: { from: "draft", trigger: "ship" },
      });
      expect(await receipts(t)).toEqual([]);
      // The stream is still at version 1: a submit at expected version 1 applies and makes it 2.
      expect(
        await user.mutation(api.depotCommands.submitDocument, {
          tenantId: "t-1",
          input: { documentId: "doc-1", expectedVersion: 1 },
        }),
      ).toMatchObject({ versions: [documentVersion("doc-1", 2)] });
    },
  );

  test(
    name(
      "a second create of the same entity ID is entityExists, and a stale version is staleVersion, both before decide",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      await user.mutation(api.depotCommands.createDocument, report());
      expect(
        await errorData(
          user.mutation(api.depotCommands.createDocument, report()),
        ),
      ).toMatchObject({
        kind: "rejection",
        entry: "CreateDocument",
        code: "entityExists",
        details: { existing: "doc-1", current: 1 },
      });
      // FailIfDecided fails the call if its decide is reached.
      expect(
        await errorData(
          user.mutation(api.depotCommands.failIfDecided, {
            tenantId: "t-1",
            input: { documentId: "doc-1", expectedVersion: 0 },
          }),
        ),
      ).toMatchObject({ code: "entityExists", entry: "FailIfDecided" });
      expect(
        await errorData(
          user.mutation(api.depotCommands.failIfDecided, {
            tenantId: "t-1",
            input: { documentId: "doc-1", expectedVersion: 2 },
          }),
        ),
      ).toMatchObject({
        code: "staleVersion",
        details: { expected: 2, current: 1 },
      });
      await technicalFailure(
        user.mutation(api.depotCommands.failIfDecided, {
          tenantId: "t-1",
          input: { documentId: "doc-1", expectedVersion: 1 },
        }),
        failIfDecidedMessage,
      );
    },
  );

  test(
    name(
      "a caller whose only grant names another permission is forbidden, stores nothing and cannot replay another caller's receipt",
    ),
    async () => {
      const t = app();
      const writer = await caller(t, "user-1");
      const call = { ...report(), requestKey: "k-1" };
      await writer.mutation(api.depotCommands.createDocument, call);
      const before = await receipts(t);
      const stockOnly = await caller(t, "user-2", {
        permission: permissions.stock,
      });
      for (const attempt of [call, { ...report("doc-2"), requestKey: "k-2" }])
        expect(
          await errorData(
            stockOnly.mutation(api.depotCommands.createDocument, attempt),
          ),
        ).toMatchObject({ code: "forbidden", details: { reason: "no_grant" } });
      expect(await receipts(t)).toEqual(before);
    },
  );

  test(
    name(
      "the public entry makes a caller of a configured service issuer a service actor, whom a service grant authorizes, and any other caller a human",
    ),
    async () => {
      const t = app();
      await t.run((ctx) =>
        insertGrant(ctx, {
          tenantId: "t-1",
          principalKind: "service",
          principalId: principalOf("svc-1"),
          permission: permissions.documents,
          grantedBy: "operator",
        }),
      );
      const decisions = await t
        .withIdentity({ issuer, subject: "svc-1" })
        .run(async (ctx) => {
          const decide = async (serviceIssuers: Set<string>) => {
            const actor = await establishActor(ctx, serviceIssuers);
            if (actor === null) throw new Error("No actor");
            const decision = await authorize(ctx, {
              tenantId: "t-1",
              actor,
              permission: permissions.documents,
            });
            return { kind: actor.kind, allowed: decision.allowed };
          };
          return [
            await decide(new Set([issuer])),
            await decide(new Set(["https://other-issuer.test"])),
          ];
        });
      expect(decisions).toEqual([
        { kind: "service", allowed: true },
        { kind: "human", allowed: false },
      ]);
    },
  );

  test(
    name(
      "a caller who holds 500 grants is authorized, and one who holds 501 fails as a technical failure and stores no receipt",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      const more = (count: number, from: number) =>
        t.run(async (ctx) => {
          for (let index = from; index < from + count; index++)
            await insertGrant(ctx, {
              tenantId: "t-1",
              principalKind: "human",
              principalId: principalOf("user-1"),
              permission: `other-${index}`,
              grantedBy: "operator",
            });
        });
      await more(499, 0);
      expect(
        await user.mutation(api.depotCommands.createDocument, {
          ...report(),
          requestKey: "k-1",
        }),
      ).toMatchObject({ kind: "applied" });
      const before = await receipts(t);
      await more(1, 499);
      await technicalFailure(
        user.mutation(api.depotCommands.createDocument, {
          ...report("doc-2"),
          requestKey: "k-2",
        }),
        "holds more than 500 grants",
      );
      expect(await receipts(t)).toEqual(before);
    },
  );

  test(
    name("a request key of 256 characters executes and replays"),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      const call = { ...report(), requestKey: "k".repeat(256) };
      const first = await user.mutation(api.depotCommands.createDocument, call);
      expect(first.replayed).toBe(false);
      expect(
        await user.mutation(api.depotCommands.createDocument, call),
      ).toMatchObject({ replayed: true, operationId: first.operationId });
    },
  );

  test(
    name(
      "PlaceOrder makes one call to the depot, and its internal entry places an order under the caller's request key",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1", { permission: permissions.stock });
      await user.mutation(api.depotCommands.addStock, {
        tenantId: "t-1",
        input: { lines: [{ productId: "p-1", quantity: 2 }] },
      });
      await caller(t, "user-1", { permission: orderPermission });
      const handlers = Object.entries(depotOperations).map(
        ([operation, registered]) =>
          [
            operation,
            vi.spyOn(
              registered as unknown as { _handler: () => unknown },
              "_handler",
            ),
          ] as const,
      );
      const calls = () =>
        handlers.flatMap(([operation, spy]) =>
          spy.mock.calls.map(() => operation),
        );
      try {
        expect(
          await user.mutation(api.orders.placeOrder, {
            tenantId: "t-1",
            input: {
              orderId: "order-1",
              title: "Order",
              lines: [{ productId: "p-1", quantity: 1 }],
            },
          }),
        ).toMatchObject({
          kind: "applied",
          result: {
            orderId: "order-1",
            lines: [{ productId: "p-1", quantity: 1 }],
          },
        });
        expect(calls()).toEqual(["placeOrders"]);
      } finally {
        for (const [, spy] of handlers) spy.mockRestore();
      }
      const internalCall = {
        tenantId: "t-1",
        namespace: "worker" as const,
        actor: { kind: "human" as const, id: principalOf("user-1") },
        requestKey: "k-1",
        input: {
          orderId: "order-2",
          title: "Order",
          lines: [{ productId: "p-1", quantity: 1 }],
        },
      };
      const placed = await t.mutation(
        internal.orders.placeOrderInternal,
        internalCall,
      );
      expect(placed).toMatchObject({
        kind: "applied",
        replayed: false,
        versions: [
          { streamType: "document", streamId: "order-2", version: 1 },
          { streamType: "stock", streamId: "p-1", version: 3 },
        ],
      });
      expect(
        await t.mutation(internal.orders.placeOrderInternal, internalCall),
      ).toMatchObject({ replayed: true, operationId: placed.operationId });
    },
  );
});

describe("receipts", () => {
  test(
    name(
      "a receipted call stores a thin receipt, and the same key and input is replayed with result null and no second execution",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      const call = { ...report(), requestKey: "k-1", correlationId: "c-1" };
      const first = await user.mutation(api.depotCommands.createDocument, call);
      expect(first.replayed).toBe(false);
      const [stored] = await receipts(t);
      expect(stored).toMatchObject({
        tenantId: "t-1",
        namespace: "public",
        commandType: "CreateDocument",
        requestKey: "k-1",
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        contractVersion: 1,
        outcome: "applied",
        operationId: first.operationId,
        affected: first.affected,
        versions: first.versions,
        actorId: principalOf("user-1"),
        tombstone: false,
      });
      expect((stored?.expiresAt ?? 0) - (stored?.recordedAt ?? 0)).toBe(
        7 * 24 * 60 * 60 * 1000,
      );
      const again = await user.mutation(api.depotCommands.createDocument, {
        ...call,
        correlationId: "c-2",
      });
      expect(again).toEqual({
        kind: "applied",
        result: null,
        operationId: first.operationId,
        affected: first.affected,
        versions: first.versions,
        replayed: true,
      });
      expect(await receipts(t)).toEqual([stored]);
      // No second execution: the stream is still at version 1.
      expect(
        await user.mutation(api.depotCommands.submitDocument, {
          tenantId: "t-1",
          input: { documentId: "doc-1", expectedVersion: 1 },
        }),
      ).toMatchObject({ versions: [documentVersion("doc-1", 2)] });
    },
  );

  test(
    name(
      "the same key with other input is idempotencyConflict disclosing no stored receipt, and changes nothing",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      await user.mutation(api.depotCommands.createDocument, {
        ...report(),
        requestKey: "k-1",
      });
      const before = await receipts(t);
      expect(
        await errorData(
          user.mutation(api.depotCommands.createDocument, {
            ...report("doc-1", "Other"),
            requestKey: "k-1",
          }),
        ),
      ).toEqual({
        kind: "rejection",
        code: "idempotencyConflict",
        entry: "CreateDocument",
        message: "This request key was used with other input",
      });
      expect(await receipts(t)).toEqual(before);
    },
  );

  test(
    name(
      "a receipt recorded under another contract version is unsupportedContractVersion, before the fingerprint is compared",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      await user.mutation(api.depotCommands.createDocument, {
        ...report(),
        requestKey: "k-1",
      });
      const [stored] = await receipts(t);
      if (stored === undefined) throw new Error("No receipt");
      await t.run((ctx) =>
        ctx.db.patch(stored._id, { contractVersion: 0, fingerprint: "old" }),
      );
      expect(
        await errorData(
          user.mutation(api.depotCommands.createDocument, {
            ...report(),
            requestKey: "k-1",
          }),
        ),
      ).toEqual({
        kind: "rejection",
        entry: "CreateDocument",
        code: "unsupportedContractVersion",
        message: "This request key was used under another contract version",
      });
    },
  );

  test(
    name(
      "a receipt at its expiry is absent: it is deleted in the same mutation and the call runs as new intent",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      await user.mutation(api.depotCommands.createDocument, report());
      const amend = {
        tenantId: "t-1",
        requestKey: "k-1",
        input: { documentId: "doc-1", title: "Amended" },
      };
      const first = await user.mutation(api.depotCommands.amendDocument, amend);
      const [stored] = await receipts(t);
      if (stored === undefined) throw new Error("No receipt");
      await t.run((ctx) => ctx.db.patch(stored._id, { expiresAt: Date.now() }));
      const again = await user.mutation(api.depotCommands.amendDocument, amend);
      expect(again).toMatchObject({
        replayed: false,
        versions: [documentVersion("doc-1", 3)],
      });
      expect(again.operationId).not.toBe(first.operationId);
      expect(await receipts(t)).toEqual([
        expect.objectContaining({
          requestKey: "k-1",
          operationId: again.operationId,
        }),
      ]);
    },
  );

  test(
    name(
      "two tenants with the same request key and entity ID do not collide, and neither sees the other's outcome",
    ),
    async () => {
      const t = app();
      const a = await caller(t, "user-a", { tenantId: "t-a" });
      const b = await caller(t, "user-b", { tenantId: "t-b" });
      const send = (who: Caller, tenantId: string) =>
        who.mutation(api.depotCommands.createDocument, {
          tenantId,
          requestKey: "k-1",
          input: { documentId: "order-1", title: "Report" },
        });
      const first = await send(a, "t-a");
      const second = await send(b, "t-b");
      expect(second.replayed).toBe(false);
      expect(second.operationId).not.toBe(first.operationId);
      expect(second.versions).toEqual([documentVersion("order-1", 1, "t-b")]);
      expect((await receipts(t)).map((row) => row.tenantId).sort()).toEqual([
        "t-a",
        "t-b",
      ]);
    },
  );

  test(
    name(
      "a caller whose grant was revoked after a successful run is forbidden on retry and learns nothing of the receipt",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "svc-1");
      const call = { ...report(), requestKey: "k-1" };
      await user.mutation(api.depotCommands.createDocument, call);
      const before = await receipts(t);
      expect(
        await t.mutation(internal.grants.revoke, {
          tenantId: "t-1",
          principalKind: "human",
          principalId: principalOf("svc-1"),
          permission: permissions.documents,
        }),
      ).toBe(1);
      const data = await errorData(
        user.mutation(api.depotCommands.createDocument, call),
      );
      expect(data).toEqual({
        kind: "rejection",
        code: "forbidden",
        entry: "CreateDocument",
        message: "The caller may not run CreateDocument in this tenant",
        details: { reason: "no_grant" },
      });
      expect(await receipts(t)).toEqual(before);
    },
  );

  test(
    name(
      "a committed business failure is answered businessFailure, stored so on its receipt and replayed as businessFailure with no second execution",
    ),
    async () => {
      const t = app();
      await grantProbe(t);
      const { declaration, runs } = counted("businessFailure");
      const first = await t.run((ctx) =>
        runPipeline(ctx, declaration, serviceCall),
      );
      expect(first).toMatchObject({
        kind: "businessFailure",
        result: { n: 1 },
        replayed: false,
      });
      expect(await receipts(t)).toMatchObject([
        { outcome: "businessFailure", operationId: first.operationId },
      ]);
      expect(
        await t.run((ctx) => runPipeline(ctx, declaration, serviceCall)),
      ).toEqual({
        kind: "businessFailure",
        result: null,
        operationId: first.operationId,
        affected: [],
        versions: [],
        replayed: true,
      });
      expect(runs()).toBe(1);
    },
  );

  test(
    name(
      "a declaration's own retention window sets the receipt's expiry: the key replays until then and runs as new intent from then",
    ),
    async () => {
      const t = app();
      await grantProbe(t);
      const { declaration, runs } = counted("applied", {
        window: 60000,
        afterExpiry: "delete",
      });
      const first = await t.run((ctx) =>
        runPipeline(ctx, declaration, serviceCall),
      );
      const [stored] = await receipts(t);
      if (stored === undefined) throw new Error("No receipt");
      expect(stored.expiresAt - stored.recordedAt).toBe(60000);
      const at = (now: number) => {
        const clock = vi.spyOn(Date, "now").mockReturnValue(now);
        return t
          .run((ctx) => runPipeline(ctx, declaration, serviceCall))
          .finally(() => clock.mockRestore());
      };
      expect(await at(stored.expiresAt - 1)).toMatchObject({
        replayed: true,
        operationId: first.operationId,
      });
      const fresh = await at(stored.expiresAt);
      expect(fresh.replayed).toBe(false);
      expect(fresh.operationId).not.toBe(first.operationId);
      expect(runs()).toBe(2);
    },
  );

  test(
    name(
      "a receipt holds at most 1,000 affected refs and 1,000 versions, each counted on its own, and the error names both counts",
    ),
    async () => {
      const t = app();
      const ref = { contextId: "depot", streamType: "document", streamId: "d" };
      const version = { ...ref, tenantId: "t-1", version: 1 };
      const insert = (requestKey: string, affected: number, versions: number) =>
        t.run((ctx) =>
          insertReceipt(ctx, {
            tenantId: "t-1",
            namespace: "public",
            commandType: "Probe",
            requestKey,
            fingerprint: "f",
            contractVersion: 1,
            outcome: "applied",
            operationId: `op-${requestKey}`,
            affected: Array.from({ length: affected }, () => ref),
            versions: Array.from({ length: versions }, () => version),
            actorId: "a",
          }),
        );
      await insert("k-a", 1000, 0);
      await insert("k-v", 0, 1000);
      await technicalFailure(
        insert("k-a2", 1001, 0),
        "not 1001 affected refs and 0 versions",
      );
      await technicalFailure(
        insert("k-v2", 0, 1001),
        "not 0 affected refs and 1001 versions",
      );
      expect((await receipts(t)).map((row) => row.requestKey).sort()).toEqual([
        "k-a",
        "k-v",
      ]);
    },
  );

  test(
    name(
      "revocation deletes the named permission on the named subject only, or on every subject when none is named",
    ),
    async () => {
      const t = app();
      const doc = (streamId: string) => ({
        contextId: "depot",
        streamType: "document",
        streamId,
      });
      for (const grant of [
        { permission: permissions.documents, subject: doc("doc-1") },
        { permission: permissions.documents, subject: doc("doc-2") },
        { permission: permissions.documents },
        { permission: permissions.stock, subject: doc("doc-1") },
        { permission: permissions.stock },
      ])
        await caller(t, "user-1", grant);
      const remaining = async () =>
        (await t.run((ctx) => ctx.db.query("grants").collect()))
          .map((row) => `${row.permission} ${row.subject?.streamId ?? "any"}`)
          .sort();
      const revoke = (permission: string, subject?: string) =>
        t.mutation(internal.grants.revoke, {
          tenantId: "t-1",
          principalKind: "human",
          principalId: principalOf("user-1"),
          permission,
          ...(subject === undefined ? {} : { subject: doc(subject) }),
        });
      expect(await revoke(permissions.documents, "doc-1")).toBe(1);
      expect(await remaining()).toEqual([
        "depot.documents any",
        "depot.documents doc-2",
        "depot.stock any",
        "depot.stock doc-1",
      ]);
      expect(await revoke(permissions.stock)).toBe(2);
      expect(await remaining()).toEqual([
        "depot.documents any",
        "depot.documents doc-2",
      ]);
    },
  );

  test(
    name(
      "revocation reduces a principal that holds more than 500 grants, after which a new grant authorizes again",
    ),
    async () => {
      const t = app();
      const user = t.withIdentity({ issuer, subject: "user-1" });
      await t.run(async (ctx) => {
        for (let index = 0; index < 501; index++)
          await insertGrant(ctx, {
            tenantId: "t-1",
            principalKind: "human",
            principalId: principalOf("user-1"),
            permission: permissions.documents,
            grantedBy: "operator",
          });
      });
      await technicalFailure(
        user.mutation(api.depotCommands.createDocument, report()),
        "holds more than 500 grants",
      );
      expect(
        await t.mutation(internal.grants.revoke, {
          tenantId: "t-1",
          principalKind: "human",
          principalId: principalOf("user-1"),
          permission: permissions.documents,
        }),
      ).toBe(501);
      await caller(t, "user-1");
      expect(
        await user.mutation(api.depotCommands.createDocument, report()),
      ).toMatchObject({ kind: "applied" });
    },
  );
});

describe("admission and failures", () => {
  test(
    name(
      "a refusing admission policy is a transient refusal that stores nothing; the retry is admitted, and a replay never consults it",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      const call = { ...report(), requestKey: "k-1" };
      await switchOn(t, "CreateDocument", "rateLimited");
      expect(
        await errorData(user.mutation(api.depotCommands.createDocument, call)),
      ).toEqual({
        kind: "transient",
        code: "rateLimited",
        message: "CreateDocument is not admitted now",
        retryAfterMs: 1000,
      });
      expect(await receipts(t)).toEqual([]);
      await switchOn(t, "CreateDocument", "rateLimited", false);
      await switchOn(t, "CreateDocument", "capacity");
      expect(
        await errorData(user.mutation(api.depotCommands.createDocument, call)),
      ).toEqual({
        kind: "transient",
        code: "capacity",
        message: "CreateDocument is not admitted now",
      });
      await switchOn(t, "CreateDocument", "capacity", false);
      const applied = await user.mutation(
        api.depotCommands.createDocument,
        call,
      );
      expect(applied.replayed).toBe(false);
      await switchOn(t, "CreateDocument", "rateLimited");
      expect(
        await user.mutation(api.depotCommands.createDocument, call),
      ).toMatchObject({ replayed: true, operationId: applied.operationId });
    },
  );

  test(
    name(
      "a fault after the journal append, after the state write or before the receipt insert is a technical failure that leaves nothing",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      await user.mutation(api.depotCommands.createDocument, report());
      const amend = (title: string, requestKey: string) =>
        user.mutation(api.depotCommands.amendDocument, {
          tenantId: "t-1",
          requestKey,
          input: { documentId: "doc-1", title, expectedVersion: 1 },
        });
      await technicalFailure(
        amend(faultTitles.afterJournalAppend, "k-a"),
        "Fault injected",
      );
      await technicalFailure(
        amend(faultTitles.afterStateWrite, "k-b"),
        "Fault injected",
      );
      await switchOn(t, "AmendDocument", "failBeforeReceipt");
      await technicalFailure(
        amend("Amended", "k-c"),
        "Fault injected: AmendDocument failed after its context call returned",
      );
      expect(await receipts(t)).toEqual([]);
      await switchOn(t, "AmendDocument", "failBeforeReceipt", false);
      // The stream is still at version 1, and the same key runs as new intent.
      expect(await amend("Amended", "k-c")).toMatchObject({
        replayed: false,
        versions: [documentVersion("doc-1", 2)],
      });
    },
  );
});

describe("the internal entry", () => {
  test(
    name(
      "a non-UI caller reaches the internal entry through a fixture action, under its own namespace, and its receipt names it",
    ),
    async () => {
      const t = app();
      const worker = await caller(t, "worker-1", { principalKind: "service" });
      const send = () =>
        worker.action(api.nonUiCaller.send, {
          command: "createDocument",
          tenantId: "t-1",
          namespace: "worker",
          actorKind: "service",
          requestKey: "k-1",
          causedBy: {
            kind: "event",
            tenantId: "t-1",
            contextId: "depot",
            eventId: "e-1",
          },
          input: { documentId: "doc-1", title: "Report" },
        });
      const first = await send();
      expect(first).toMatchObject({ kind: "applied", replayed: false });
      expect(await send()).toMatchObject({
        replayed: true,
        result: null,
        operationId: (first as { operationId: string }).operationId,
      });
      expect(await receipts(t)).toMatchObject([
        { namespace: "worker", actorId: principalOf("worker-1") },
      ]);
      // A rejection crosses the action to its caller with its data.
      expect(
        await errorData(
          worker.action(api.nonUiCaller.send, {
            command: "createDocument",
            tenantId: "t-1",
            namespace: "worker",
            actorKind: "human",
            requestKey: "k-2",
            input: { documentId: "doc-2", title: "Report" },
          }),
        ),
      ).toMatchObject({ code: "forbidden", entry: "CreateDocument" });
    },
  );

  test(
    name(
      "the internal entry requires a request key, and records its namespace",
    ),
    async () => {
      const t = app();
      await caller(t, "worker-1", { principalKind: "service" });
      const actor = { kind: "service", id: principalOf("worker-1") } as const;
      const call = {
        tenantId: "t-1",
        namespace: "agent",
        actor,
        input: { documentId: "doc-1", title: "Report" },
      } as const;
      const error = await failure(
        t.mutation(
          internal.depotCommands.createDocumentInternal,
          call as never,
        ),
      );
      expect(error).not.toBeInstanceOf(ConvexError);
      expect(String(error)).toContain("requestKey");
      expect(
        await t.mutation(internal.depotCommands.createDocumentInternal, {
          ...call,
          requestKey: "k-1",
        }),
      ).toMatchObject({ kind: "applied", replayed: false });
      expect(await receipts(t)).toMatchObject([{ namespace: "agent" }]);
    },
  );

  test(
    name(
      "step 7 mints one operation per call, passes it to the executor, and takes its cause from the call or the command's name",
    ),
    async () => {
      const t = app();
      const seen: OperationRef[] = [];
      const declaration: CommandDeclaration<{ n: number }, null> = {
        name: "Probe",
        contractVersion: 1,
        input: v.object({ n: v.number() }),
        output: v.null(),
        permission: { permission: "probe" },
        writes: [],
        rejections: [],
        executor: async (_ctx, { operation }) => {
          seen.push(operation);
          return { kind: "applied", result: null, versions: [], streams: [] };
        },
      };
      const actor = { kind: "service", id: "svc-1" } as const;
      const causedBy = {
        kind: "event",
        tenantId: "t-1",
        contextId: "depot",
        eventId: "e-1",
      } as const;
      const responses = await t.run(async (ctx) => {
        await insertGrant(ctx, {
          tenantId: "t-1",
          principalKind: "service",
          principalId: "svc-1",
          permission: "probe",
          grantedBy: "operator",
        });
        const base = {
          tenantId: "t-1",
          namespace: "worker",
          actor,
          input: { n: 1 },
        } as const;
        return [
          await runPipeline(ctx, declaration, base),
          await runPipeline(ctx, declaration, {
            ...base,
            correlationId: "c-1",
            causedBy,
          }),
        ];
      });
      expect(seen).toEqual([
        {
          operationId: responses[0]?.operationId,
          causedBy: { kind: "command", commandType: "Probe" },
        },
        {
          operationId: responses[1]?.operationId,
          correlationId: "c-1",
          causedBy,
        },
      ]);
      expect(responses[0]?.operationId).not.toBe(responses[1]?.operationId);
    },
  );
});
