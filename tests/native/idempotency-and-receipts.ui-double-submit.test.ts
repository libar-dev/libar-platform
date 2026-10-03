import type { ConvexClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { failIfDecidedMessage } from "../../fixture/convex/depot/streams.js";
import { orderPermission } from "../../fixture/convex/orders.js";
import { uiDoubleSubmitContract as contract } from "../../generated/contracts/command.idempotency-and-receipts.ui-double-submit.contract.js";
import type { Backend } from "../../harness/backend.js";
import { ordinarySocketClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import {
  describe,
  responseOf,
  storedNow,
  type Answer,
  type Stored,
} from "./receipted-calls.js";
const anchor = specTest({
  id: testAnchorId("test:command.idempotency-and-receipts.ui-double-submit"),
  verifies: ref("spec:command.idempotency-and-receipts.ui-double-submit"),
});
void anchor;
// The UI is a Convex client on a socket, the transport the React client uses, with a fixture-issuer
// token and the grants an operator gave it with admin access. It sends no request key.
interface World {
  backend?: Backend;
  tenantId?: string;
  client?: ConvexClient;
  entityId?: string;
  // The operations of setup calls, which the example's effects leave out.
  setup: Set<string>;
  answers?: Answer[];
  afterFirst?: Stored;
}
async function answerOf(call: Promise<unknown>): Promise<Answer> {
  try {
    return { response: (await call) as ReturnType<typeof responseOf> };
  } catch (error) {
    return { error };
  }
}
const placeOrder = (world: World, orderId: string, productId: string) =>
  answerOf(
    required(world.client, "the client").mutation(api.orders.placeOrder, {
      tenantId: required(world.tenantId, "the tenant"),
      input: {
        orderId,
        title: `Order ${orderId}`,
        lines: [{ productId, quantity: 1 }],
      },
    }),
  );
async function addStock(world: World, productId: string, quantity: number) {
  const response = await required(world.client, "the client").mutation(
    api.depotCommands.addStock,
    {
      tenantId: required(world.tenantId, "the tenant"),
      input: { lines: [{ productId, quantity }] },
    },
  );
  world.setup.add(response.operationId);
}
const rejectionData = (answer: Answer | undefined) =>
  answer !== undefined &&
  "error" in answer &&
  answer.error instanceof ConvexError
    ? (answer.error.data as Record<string, unknown>)
    : undefined;
function streamRow(stored: Stored, streamType: string, streamId: string) {
  const rows = stored.streams.filter(
    (row) => row.streamType === streamType && row.streamId === streamId,
  );
  expect(rows.length).toBeLessThanOrEqual(1);
  return rows[0];
}
bindExample(
  contract,
  (): World => ({ setup: new Set() }),
  {
    "a tenant {tenantId} and a caller in namespace {namespace}": async (
      world,
      { tenantId, namespace },
    ) => {
      // The public entry hard-codes its namespace; a UI caller has no other.
      expect(namespace).toBe("public");
      const backend = await fixtureBackend();
      for (const permission of [
        orderPermission,
        permissions.documents,
        permissions.stock,
      ])
        await backend.admin.run(getFunctionName(internal.grants.grant), {
          tenantId,
          principalKind: "human",
          principalId: `${backend.issuer.issuer}|user-1`,
          permission,
          grantedBy: "native-test",
        });
      Object.assign(world, {
        backend,
        tenantId,
        client: ordinarySocketClient(backend.url, {
          token: await backend.issuer.token("user-1"),
        }),
      });
    },
    "a create command from the UI with client-generated entity ID {entityId}":
      async (world, { entityId }) => {
        world.entityId = entityId;
        // Stock for ten orders, so the first submit leaves units the second could claim.
        await addStock(world, "p-1", 10);
      },
    "the admission policy {admission}": async (world, { admission }) => {
      expect(admission).toBe("admits every call");
      const backend = required(world.backend, "the backend");
      expect(await backend.admin.readTable("switches")).toEqual([]);
    },
    "the caller sends the command {sends}": async (world, { sends }) => {
      expect(sends).toBe("twice from the UI");
      const backend = required(world.backend, "the backend");
      const entityId = required(world.entityId, "the entity ID");
      const first = await placeOrder(world, entityId, "p-1");
      world.afterFirst = await storedNow(backend);
      world.answers = [first, await placeOrder(world, entityId, "p-1")];
      measure(
        "answers",
        world.answers.map((answer) => describe(answer)),
      );
    },
    "the first answer is {first}": (world, { first }) => {
      const [answer] = required(world.answers, "the answers");
      expect(describe(answer)).toBe(first);
      expect(responseOf(answer)).toMatchObject({
        replayed: false,
        result: {
          orderId: world.entityId,
          lines: [{ productId: "p-1", quantity: 1 }],
        },
      });
    },
    "the second answer is {second}": async (world, { second }) => {
      const backend = required(world.backend, "the backend");
      const client = required(world.client, "the client");
      const tenantId = required(world.tenantId, "the tenant");
      const entityId = required(world.entityId, "the entity ID");
      const answers = required(world.answers, "the answers");
      expect(answers).toHaveLength(2);
      expect(describe(answers[1])).toBe(second);
      // entityExists from the adapter's identity read, not the invalidTransition decide answers for
      // a create of an existing document.
      expect(rejectionData(answers[1])).toMatchObject({
        kind: "rejection",
        code: "entityExists",
        entry: "PlaceOrder",
        details: { existing: entityId, current: 1 },
      });
      // FailIfDecided's decide fails the call if it is reached. At expected version 0 for the same
      // document the identity read answers first; at the current version 1 decide runs.
      const before = await storedNow(backend);
      const atZero = await answerOf(
        client.mutation(api.depotCommands.failIfDecided, {
          tenantId,
          input: { documentId: entityId, expectedVersion: 0 },
        }),
      );
      expect(rejectionData(atZero)).toMatchObject({
        kind: "rejection",
        code: "entityExists",
        entry: "FailIfDecided",
        details: { existing: entityId, current: 1 },
      });
      const atCurrent = await answerOf(
        client.mutation(api.depotCommands.failIfDecided, {
          tenantId,
          input: { documentId: entityId, expectedVersion: 1 },
        }),
      );
      expect(describe(atCurrent)).toMatch(/^technical failure/);
      expect(describe(atCurrent)).toContain(failIfDecidedMessage);
      expect(await storedNow(backend)).toEqual(before);
    },
    "the business effects committed number {effects}": async (
      world,
      { effects },
    ) => {
      const stored = await storedNow(required(world.backend, "the backend"));
      const operations = new Set(
        stored.events
          .map((event) => event.operationId)
          .filter((operationId) => !world.setup.has(String(operationId))),
      );
      expect(operations.size).toBe(effects);
      // One order document under the entity ID in the tenant, and its units claimed once.
      expect(
        stored.streams.filter(
          (row) =>
            row.tenantId === world.tenantId && row.streamId === world.entityId,
        ),
      ).toHaveLength(effects);
      expect(streamRow(stored, "stock", "p-1")?.state).toEqual({
        onHand: 10 - effects,
      });
    },
    "the receipts stored for the key number {receipts}": async (
      world,
      { receipts },
    ) => {
      const backend = required(world.backend, "the backend");
      expect(await backend.admin.readTable("receipts")).toHaveLength(receipts);
    },
    "the original outcome and state are unchanged {unchanged}": async (
      world,
      { unchanged },
    ) => {
      const backend = required(world.backend, "the backend");
      const now = await storedNow(backend);
      const [first] = required(world.answers, "the answers");
      const operationId = responseOf(first).operationId;
      const order = streamRow(
        now,
        "document",
        required(world.entityId, "the entity ID"),
      );
      const checks = {
        orderFromTheFirstSubmit:
          order?.lastOperationId === operationId && order.streamVersion === 1,
        sameAsAfterTheFirstSubmit:
          JSON.stringify(now) ===
          JSON.stringify(required(world.afterFirst, "the store")),
      };
      measure("unchangedChecks", checks);
      expect(Object.values(checks).every(Boolean), JSON.stringify(checks)).toBe(
        unchanged,
      );
      // The double submit again, with stock for one order only: the first submit takes the last unit,
      // and the second is still entityExists, because PlaceOrder's depot call creates before it claims.
      await addStock(world, "p-2", 1);
      const lastUnit = [
        await placeOrder(world, "order-7f3b", "p-2"),
        await placeOrder(world, "order-7f3b", "p-2"),
      ];
      expect(lastUnit.map((answer) => describe(answer))).toEqual([
        "applied",
        "entity exists",
      ]);
      // The unit is gone: another order for it is refused insufficientStock.
      const another = await placeOrder(world, "order-7f3c", "p-2");
      expect(rejectionData(another)).toMatchObject({
        kind: "rejection",
        code: "insufficientStock",
        entry: "PlaceOrder",
      });
      const after = await storedNow(backend);
      expect(streamRow(after, "stock", "p-2")?.state).toEqual({ onHand: 0 });
      expect(streamRow(after, "document", "order-7f3c")).toBeUndefined();
      expect(after.receipts).toEqual([]);
    },
  },
  async (world) => {
    await world.client?.close();
  },
);
