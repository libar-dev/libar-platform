import { ConvexError, type Value } from "convex/values";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  api,
  components,
  internal,
} from "../../example/convex/_generated/api.js";
import {
  cancelOrderPermission,
  placeOrderPermission,
} from "../../example/convex/ordering.js";
import { orderSummary } from "../../example/convex/orderSummary.js";
import { readOrdersPermission } from "../../example/convex/readModels.js";
import {
  receiveStockDeclaration,
  receiveStockPermission,
} from "../../example/convex/receiving.js";
import { authorizeQuery, runPipeline } from "../../src/command/index.js";
import { productionTest } from "./production.js";
const { version } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../node_modules/convex-test/package.json"),
    "utf8",
  ),
) as { version: string };
const name = (text: string) => `convex-test ${version}: ${text}`;
type App = ReturnType<typeof productionTest>;
const issuer = "https://fixture-issuer.test";
const operator = { kind: "operator", id: "operator-1" } as const;
// Seeds the caller's grants with admin access, as a run's setup does, and returns the caller.
async function caller(
  t: App,
  subject: string,
  permissions: readonly string[],
  tenantId = "t-1",
) {
  for (const permission of permissions)
    await t.mutation(internal.grants.grant, {
      tenantId,
      principalKind: "human",
      principalId: `${issuer}|${subject}`,
      permission,
      grantedBy: "operator",
    });
  return t.withIdentity({ issuer, subject });
}
const everything = [
  placeOrderPermission,
  cancelOrderPermission,
  receiveStockPermission,
  readOrdersPermission,
  "inventory.read",
];
const activate = (t: App) =>
  t.mutation(internal.readModels.activate, {
    readModel: "orderSummary",
    startedBy: operator,
  });
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
const line = (stockItemId: string, quantity: number, unitPrice = 100) => ({
  stockItemId,
  quantity,
  unitPrice,
});
const summaries = (t: App) =>
  t.run((ctx) => ctx.db.query("orderSummaries").collect());
const receipts = (t: App) => t.run((ctx) => ctx.db.query("receipts").collect());

test(
  name(
    "ReceiveStock then PlaceOrder: the order, its allocation and its summary row commit together, and the parent reads them",
  ),
  async () => {
    const t = productionTest();
    await activate(t);
    const user = await caller(t, "user-1", everything);
    const received = await user.mutation(api.receiving.receiveStock, {
      tenantId: "t-1",
      input: {
        items: [
          { stockItemId: "sku-1", quantity: 5 },
          { stockItemId: "sku-2", quantity: 1 },
          { stockItemId: "sku-1", quantity: 2 },
        ],
      },
    });
    expect(received).toMatchObject({
      kind: "applied",
      result: {
        items: [
          { stockItemId: "sku-1", quantity: 7 },
          { stockItemId: "sku-2", quantity: 1 },
        ],
      },
    });
    const placed = await user.mutation(api.ordering.placeOrder, {
      tenantId: "t-1",
      requestKey: "k-1",
      input: {
        orderId: "order-1",
        lines: [line("sku-1", 3, 250), line("sku-2", 1, 999)],
      },
    });
    expect(placed).toMatchObject({
      kind: "applied",
      replayed: false,
      result: { orderId: "order-1", lineCount: 2, total: 1749 },
    });
    const orderVersion = {
      tenantId: "t-1",
      contextId: "orders",
      streamType: "order",
      streamId: "order-1",
      version: 1,
    };
    expect(placed.versions).toEqual([
      orderVersion,
      {
        ...orderVersion,
        contextId: "inventory",
        streamType: "stockItem",
        streamId: "sku-1",
        version: 2,
      },
      {
        ...orderVersion,
        contextId: "inventory",
        streamType: "stockItem",
        streamId: "sku-2",
        version: 2,
      },
    ]);
    const order = await user.query(api.orderQueries.getOrder, {
      tenantId: "t-1",
      orderId: "order-1",
    });
    expect(order).toMatchObject({
      orderId: "order-1",
      status: "placed",
      total: 1749,
      version: orderVersion,
    });
    expect(await summaries(t)).toMatchObject([
      {
        tenantId: "t-1",
        generation: 1,
        key: "order-1",
        projectionVersion: 1,
        sourceVersions: [orderVersion],
        orderId: "order-1",
        status: "placed",
        lineCount: 2,
        total: 1749,
        placedAt: order?.placedAt,
      },
    ]);
    const page = await user.query(api.readModels.listOrderSummaries, {
      tenantId: "t-1",
      status: "placed",
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(page.page).toEqual([
      {
        tenantId: "t-1",
        key: "order-1",
        projectionVersion: 1,
        sourceVersions: [orderVersion],
        orderId: "order-1",
        status: "placed",
        lineCount: 2,
        total: 1749,
        placedAt: order?.placedAt,
      },
    ]);
    const orders = await user.query(api.orderQueries.listOrders, {
      tenantId: "t-1",
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(orders.page).toEqual([order]);
  },
);

test(
  name(
    "an order for stock that is not there is rejected insufficientStock by Inventory after Orders wrote, and nothing of it is stored",
  ),
  async () => {
    const t = productionTest();
    await activate(t);
    const user = await caller(t, "user-1", everything);
    await user.mutation(api.receiving.receiveStock, {
      tenantId: "t-1",
      input: { items: [{ stockItemId: "sku-1", quantity: 2 }] },
    });
    const send = () =>
      user.mutation(api.ordering.placeOrder, {
        tenantId: "t-1",
        requestKey: "k-1",
        // Two lines on one stock item: Inventory allocates their sum.
        input: {
          orderId: "order-1",
          lines: [line("sku-1", 2), line("sku-1", 1)],
        },
      });
    expect(await errorData(send())).toEqual({
      kind: "rejection",
      code: "insufficientStock",
      commandType: "PlaceOrder",
      message: "Cannot allocate 3 when 2 are available",
      details: { requested: 3, available: 2 },
    });
    expect(
      await user.query(api.orderQueries.getOrder, {
        tenantId: "t-1",
        orderId: "order-1",
      }),
    ).toBeNull();
    expect(await summaries(t)).toEqual([]);
    // ReceiveStock was sent with no request key, and the rejected command left no receipt.
    expect(await receipts(t)).toEqual([]);
    // The missing unit arrives, and the same command and key are applied.
    await user.mutation(api.receiving.receiveStock, {
      tenantId: "t-1",
      input: { items: [{ stockItemId: "sku-1", quantity: 1 }] },
    });
    expect(await send()).toMatchObject({ kind: "applied", replayed: false });
    // A second submit of the same order with a new key is answered entityExists by Orders, before
    // Inventory, which now has no stock left, decides.
    expect(
      await errorData(
        user.mutation(api.ordering.placeOrder, {
          tenantId: "t-1",
          requestKey: "k-2",
          input: { orderId: "order-1", lines: [line("sku-1", 3)] },
        }),
      ),
    ).toMatchObject({ code: "entityExists", commandType: "PlaceOrder" });
  },
);

test(
  name(
    "PlaceOrder before the order summary's first activation is a technical failure that names the read model, and an order with no line is invalid input",
  ),
  async () => {
    const t = productionTest();
    const user = await caller(t, "user-1", everything);
    await user.mutation(api.receiving.receiveStock, {
      tenantId: "t-1",
      input: { items: [{ stockItemId: "sku-1", quantity: 2 }] },
    });
    const send = (lines: ReturnType<typeof line>[]) =>
      user.mutation(api.ordering.placeOrder, {
        tenantId: "t-1",
        requestKey: "k-1",
        input: { orderId: "order-1", lines },
      });
    const error = await failure(send([line("sku-1", 1)]));
    expect(error).not.toBeInstanceOf(ConvexError);
    expect(String(error)).toContain(
      "PlaceOrder writes the read model orderSummary, which has no generation to write",
    );
    expect(await receipts(t)).toEqual([]);
    expect(
      await user.query(api.orderQueries.getOrder, {
        tenantId: "t-1",
        orderId: "order-1",
      }),
    ).toBeNull();
    expect(await errorData(send([]))).toMatchObject({
      code: "invalidInput",
      commandType: "PlaceOrder",
      message: "An order needs at least one line",
    });
    expect(await activate(t)).toBe(1);
    expect(await send([line("sku-1", 1)])).toMatchObject({ kind: "applied" });
  },
);

test(
  name(
    "the parent queries refuse a caller with no identity and one with no grant before they read, and the order summary list fails with no active generation",
  ),
  async () => {
    const t = productionTest();
    const args = { tenantId: "t-1", orderId: "order-1" };
    expect(await errorData(t.query(api.orderQueries.getOrder, args))).toEqual({
      kind: "rejection",
      code: "unauthenticated",
      commandType: "getOrder",
      message: "getOrder needs an authenticated caller",
    });
    const stranger = t.withIdentity({ issuer, subject: "user-2" });
    expect(
      await errorData(
        stranger.query(api.orderQueries.listOrders, {
          tenantId: "t-1",
          paginationOpts: { cursor: null, numItems: 10 },
        }),
      ),
    ).toEqual({
      kind: "rejection",
      code: "forbidden",
      commandType: "listOrders",
      message: "The caller may not read listOrders in this tenant",
      details: { reason: "no_grant" },
    });
    // A grant in another tenant does not reach this one.
    const reader = await caller(t, "user-3", [readOrdersPermission], "t-2");
    expect(
      await errorData(reader.query(api.orderQueries.getOrder, args)),
    ).toMatchObject({ code: "forbidden", commandType: "getOrder" });
    const summaryArgs = {
      tenantId: "t-1",
      status: "placed" as const,
      paginationOpts: { cursor: null, numItems: 10 },
    };
    // The order summary list refuses before it reads the registry, which holds no generation.
    expect(
      await errorData(
        stranger.query(api.readModels.listOrderSummaries, summaryArgs),
      ),
    ).toMatchObject({ code: "forbidden", commandType: "listOrderSummaries" });
    const granted = await caller(t, "user-3", [readOrdersPermission]);
    expect(await granted.query(api.orderQueries.getOrder, args)).toBeNull();
    const list = failure(
      granted.query(api.readModels.listOrderSummaries, summaryArgs),
    );
    expect(String(await list)).toContain(
      "The read model orderSummary has no active generation",
    );
    expect(await receipts(t)).toEqual([]);
  },
);

test(
  name(
    "ReceiveStock refuses an invalid quantity, and the activation names a read model the composition does not declare",
  ),
  async () => {
    const t = productionTest();
    const user = await caller(t, "user-1", everything);
    expect(
      await errorData(
        user.mutation(api.receiving.receiveStock, {
          tenantId: "t-1",
          input: {
            items: [
              { stockItemId: "sku-1", quantity: 1 },
              { stockItemId: "sku-2", quantity: 0 },
            ],
          },
        }),
      ),
    ).toEqual({
      kind: "rejection",
      code: "invalidQuantity",
      commandType: "ReceiveStock",
      message: "A quantity must be a positive whole number, not 0",
      details: { quantity: 0 },
    });
    expect(
      String(
        await failure(
          t.mutation(internal.readModels.activate, {
            readModel: "orderTotals",
            startedBy: operator,
          }),
        ),
      ),
    ).toContain("This deployment declares no read model orderTotals");
  },
);

test(
  name(
    "authorizeQuery hands the policy's subject to authorize: a grant for one order authorizes a read of that order and refuses a read of another",
  ),
  async () => {
    const t = productionTest();
    const order = { contextId: "orders", streamType: "order", streamId: "one" };
    await t.mutation(internal.grants.grant, {
      tenantId: "t-1",
      principalKind: "human",
      principalId: `${issuer}|reader`,
      permission: readOrdersPermission,
      subject: order,
      grantedBy: "operator",
    });
    const reader = t.withIdentity({ issuer, subject: "reader" });
    const policy = {
      name: "getOrder",
      tenantId: "t-1",
      permission: readOrdersPermission,
      subject: order,
    };
    expect(
      await reader.run((ctx) => authorizeQuery(ctx, policy)),
    ).toMatchObject({ kind: "human", id: `${issuer}|reader` });
    expect(
      await errorData(
        reader.run((ctx) =>
          authorizeQuery(ctx, {
            ...policy,
            subject: { ...order, streamId: "two" },
          }),
        ),
      ),
    ).toMatchObject({
      code: "forbidden",
      commandType: "getOrder",
      details: { reason: "subject_mismatch" },
    });
  },
);

test(
  name(
    "a command that declares a read model with no generation fails and keeps nothing, even when none of its entries matches that read model's source",
  ),
  async () => {
    const t = productionTest();
    const actor = { kind: "human", id: `${issuer}|user-1`, issuer } as const;
    await caller(t, "user-1", [receiveStockPermission]);
    // ReceiveStock's real executor returns one stock item entry, which the order summary's source
    // does not match.
    const declaration = {
      ...receiveStockDeclaration,
      readModels: [
        {
          readModel: orderSummary,
          source: { contextId: "orders", streamType: "order" },
        },
      ],
    };
    expect(
      String(
        await failure(
          t.run((ctx) =>
            runPipeline(ctx, declaration, {
              tenantId: "t-1",
              namespace: "public",
              actor,
              requestKey: "k-1",
              input: { items: [{ stockItemId: "sku-1", quantity: 1 }] },
            }),
          ),
        ),
      ),
    ).toContain(
      "ReceiveStock writes the read model orderSummary, which has no generation to write",
    );
    expect(
      await t.query(components.inventory.queries.stockItem.get, {
        tenantId: "t-1",
        streamId: "sku-1",
      }),
    ).toBeNull();
    expect(await receipts(t)).toEqual([]);
  },
);

// Stock of 5 on sku-1, and order-1 placed for 3 of them over two lines, by a caller with every grant.
async function placedOrder(t: App) {
  await activate(t);
  const user = await caller(t, "user-1", everything);
  await user.mutation(api.receiving.receiveStock, {
    tenantId: "t-1",
    input: { items: [{ stockItemId: "sku-1", quantity: 5 }] },
  });
  await user.mutation(api.ordering.placeOrder, {
    tenantId: "t-1",
    requestKey: "k-place",
    input: {
      orderId: "order-1",
      lines: [line("sku-1", 2, 250), line("sku-1", 1, 999)],
    },
  });
  return user;
}
const stockItem = (t: App) =>
  t.query(components.inventory.queries.stockItem.get, {
    tenantId: "t-1",
    streamId: "sku-1",
  });
const cancelCall = (requestKey: string, orderId = "order-1") => ({
  tenantId: "t-1",
  requestKey,
  input: { orderId },
});

test(
  name(
    "PlaceOrder then CancelOrder: the order is cancelled, its stock item's totals are back to what they were, and its summary row says cancelled, in one commit",
  ),
  async () => {
    const t = productionTest();
    const user = await placedOrder(t);
    expect(await stockItem(t)).toMatchObject({ onHand: 5, allocated: 3 });
    const before = await user.query(api.orderQueries.getOrder, {
      tenantId: "t-1",
      orderId: "order-1",
    });
    const placedAt = before?.placedAt;
    expect(placedAt).toEqual(expect.any(Number));
    const response = await user.mutation(
      api.ordering.cancelOrder,
      cancelCall("k-1"),
    );
    const orderVersion = {
      tenantId: "t-1",
      contextId: "orders",
      streamType: "order",
      streamId: "order-1",
      version: 2,
    };
    expect(response).toMatchObject({
      kind: "applied",
      replayed: false,
      result: {
        orderId: "order-1",
        released: [{ stockItemId: "sku-1", quantity: 3 }],
      },
      versions: [
        orderVersion,
        {
          ...orderVersion,
          contextId: "inventory",
          streamType: "stockItem",
          streamId: "sku-1",
          version: 3,
        },
      ],
    });
    expect(await stockItem(t)).toMatchObject({
      onHand: 5,
      allocated: 0,
      version: { version: 3 },
    });
    const order = await user.query(api.orderQueries.getOrder, {
      tenantId: "t-1",
      orderId: "order-1",
    });
    expect(order).toMatchObject({
      orderId: "order-1",
      status: "cancelled",
      lines: [line("sku-1", 2, 250), line("sku-1", 1, 999)],
      total: 1499,
      placedAt,
      version: orderVersion,
    });
    expect(await summaries(t)).toMatchObject([
      {
        key: "order-1",
        generation: 1,
        sourceVersions: [orderVersion],
        status: "cancelled",
        lineCount: 2,
        total: 1499,
        placedAt,
      },
    ]);
    const list = (status: "placed" | "cancelled") =>
      user.query(api.readModels.listOrderSummaries, {
        tenantId: "t-1",
        status,
        paginationOpts: { cursor: null, numItems: 10 },
      });
    expect((await list("cancelled")).page).toMatchObject([
      { orderId: "order-1", status: "cancelled" },
    ]);
    expect((await list("placed")).page).toEqual([]);
    expect(
      (await receipts(t)).filter((row) => row.requestKey === "k-1"),
    ).toMatchObject([{ operationId: response.operationId }]);
  },
);

test(
  name(
    "a second CancelOrder under a new key is rejected orderAlreadyCancelled, the same key is answered from its receipt, and an order never placed is rejected orderNotFound, and none of them stores anything",
  ),
  async () => {
    const t = productionTest();
    const user = await placedOrder(t);
    const first = await user.mutation(
      api.ordering.cancelOrder,
      cancelCall("k-1"),
    );
    const before = {
      stock: await stockItem(t),
      summaries: await summaries(t),
      receipts: await receipts(t),
    };
    const after = async () => ({
      stock: await stockItem(t),
      summaries: await summaries(t),
      receipts: await receipts(t),
    });
    expect(
      await errorData(
        user.mutation(api.ordering.cancelOrder, cancelCall("k-2")),
      ),
    ).toEqual({
      kind: "rejection",
      code: "orderAlreadyCancelled",
      commandType: "CancelOrder",
      message: "The order is already cancelled",
    });
    expect(await after()).toEqual(before);
    expect(
      await user.mutation(api.ordering.cancelOrder, cancelCall("k-1")),
    ).toEqual({
      kind: "applied",
      result: null,
      operationId: first.operationId,
      affected: first.affected,
      versions: first.versions,
      replayed: true,
    });
    expect(await after()).toEqual(before);
    expect(
      await errorData(
        user.mutation(api.ordering.cancelOrder, cancelCall("k-3", "order-2")),
      ),
    ).toEqual({
      kind: "rejection",
      code: "orderNotFound",
      commandType: "CancelOrder",
      message: "The order does not exist",
    });
    expect(
      await user.query(api.orderQueries.getOrder, {
        tenantId: "t-1",
        orderId: "order-2",
      }),
    ).toBeNull();
    expect(await after()).toEqual(before);
  },
);

test(
  name(
    "CancelOrder after Inventory released the order's units alone is rejected insufficientAllocation after Orders cancelled, and nothing of it is stored",
  ),
  async () => {
    const t = productionTest();
    const user = await placedOrder(t);
    // No command releases stock without cancelling its order: the setup calls the context's own
    // operation, so the stock item's state stays the fold of its events.
    await t.mutation(components.inventory.operations.release, {
      tenantId: "t-1",
      actor: operator,
      operation: {
        operationId: "setup-release",
        causedBy: { kind: "command", commandType: "Setup" },
      },
      input: {
        orderId: "order-1",
        lines: [{ stockItemId: "sku-1", quantity: 3 }],
      },
    });
    const stock = await stockItem(t);
    expect(stock).toMatchObject({ allocated: 0, version: { version: 3 } });
    expect(
      await errorData(
        user.mutation(api.ordering.cancelOrder, cancelCall("k-1")),
      ),
    ).toEqual({
      kind: "rejection",
      code: "insufficientAllocation",
      commandType: "CancelOrder",
      message: "Cannot release 3 when 0 are allocated",
      details: { requested: 3, allocated: 0 },
    });
    expect(
      await user.query(api.orderQueries.getOrder, {
        tenantId: "t-1",
        orderId: "order-1",
      }),
    ).toMatchObject({ status: "placed", version: { version: 1 } });
    expect(await stockItem(t)).toEqual(stock);
    expect(await summaries(t)).toMatchObject([{ status: "placed" }]);
    expect(
      (await receipts(t)).filter((row) => row.requestKey === "k-1"),
    ).toEqual([]);
  },
);

test(
  name(
    "CancelOrder refuses a caller who holds every other grant but orders.cancel, before it reads, and stores nothing",
  ),
  async () => {
    const t = productionTest();
    await placedOrder(t);
    const other = await caller(
      t,
      "user-2",
      everything.filter((permission) => permission !== cancelOrderPermission),
    );
    expect(
      await errorData(
        other.mutation(api.ordering.cancelOrder, cancelCall("k-1")),
      ),
    ).toEqual({
      kind: "rejection",
      code: "forbidden",
      commandType: "CancelOrder",
      message: "The caller may not run CancelOrder in this tenant",
      details: { reason: "no_grant" },
    });
    // An order never placed is refused the same way: the check comes before Orders decides.
    expect(
      await errorData(
        other.mutation(api.ordering.cancelOrder, cancelCall("k-2", "order-2")),
      ),
    ).toMatchObject({ code: "forbidden", commandType: "CancelOrder" });
    expect(await stockItem(t)).toMatchObject({ allocated: 3 });
    expect(await summaries(t)).toMatchObject([{ status: "placed" }]);
    expect(
      (await receipts(t)).filter((row) => row.requestKey === "k-1"),
    ).toEqual([]);
  },
);

// Stock on sku-1 and sku-2 in one tenant, and order-1 placed over both, by a caller with every grant
// there; the lines name sku-2 first.
async function placedOverTwoItems(t: App, tenantId: string) {
  const user = await caller(t, "user-1", everything, tenantId);
  await user.mutation(api.receiving.receiveStock, {
    tenantId,
    input: {
      items: [
        { stockItemId: "sku-1", quantity: 5 },
        { stockItemId: "sku-2", quantity: 7 },
      ],
    },
  });
  await user.mutation(api.ordering.placeOrder, {
    tenantId,
    requestKey: "k-place",
    input: {
      orderId: "order-1",
      lines: [line("sku-2", 3, 200), line("sku-1", 2, 400)],
    },
  });
  return user;
}
const stockItems = (t: App, tenantId: string) =>
  Promise.all(
    ["sku-1", "sku-2"].map((streamId) =>
      t.query(components.inventory.queries.stockItem.get, {
        tenantId,
        streamId,
      }),
    ),
  );

test(
  name(
    "CancelOrder of an order over two stock items releases each one's allocation in the same commit",
  ),
  async () => {
    const t = productionTest();
    await activate(t);
    const user = await placedOverTwoItems(t, "t-1");
    expect(await stockItems(t, "t-1")).toMatchObject([
      { onHand: 5, allocated: 2, version: { version: 2 } },
      { onHand: 7, allocated: 3, version: { version: 2 } },
    ]);
    const response = await user.mutation(
      api.ordering.cancelOrder,
      cancelCall("k-1"),
    );
    expect(response).toMatchObject({
      kind: "applied",
      result: {
        orderId: "order-1",
        released: [
          { stockItemId: "sku-2", quantity: 3 },
          { stockItemId: "sku-1", quantity: 2 },
        ],
      },
    });
    expect(await stockItems(t, "t-1")).toMatchObject([
      { onHand: 5, allocated: 0, version: { version: 3 } },
      { onHand: 7, allocated: 0, version: { version: 3 } },
    ]);
  },
);

test(
  name(
    "CancelOrder in t-2 releases t-2's allocation and leaves the stock items of the same IDs in t-1 as they were",
  ),
  async () => {
    const t = productionTest();
    await activate(t);
    await placedOverTwoItems(t, "t-1");
    const user = await placedOverTwoItems(t, "t-2");
    const untouched = await stockItems(t, "t-1");
    expect(untouched).toMatchObject([{ allocated: 2 }, { allocated: 3 }]);
    const response = await user.mutation(api.ordering.cancelOrder, {
      ...cancelCall("k-1"),
      tenantId: "t-2",
    });
    expect(response.kind).toBe("applied");
    // The order and both stock items it released, every one in t-2.
    expect(
      response.versions.map(
        ({ tenantId, streamId }: { tenantId: string; streamId: string }) => [
          tenantId,
          streamId,
        ],
      ),
    ).toEqual([
      ["t-2", "order-1"],
      ["t-2", "sku-2"],
      ["t-2", "sku-1"],
    ]);
    expect(await stockItems(t, "t-2")).toMatchObject([
      { allocated: 0, version: { version: 3 } },
      { allocated: 0, version: { version: 3 } },
    ]);
    expect(await stockItems(t, "t-1")).toEqual(untouched);
    expect(
      await user.query(api.orderQueries.getOrder, {
        tenantId: "t-1",
        orderId: "order-1",
      }),
    ).toMatchObject({ status: "placed" });
  },
);

test(
  name(
    "the Orders context's cancel operation over two orders answers both, each with its own lines, in the order asked",
  ),
  async () => {
    const t = productionTest();
    const user = await placedOrder(t);
    await user.mutation(api.ordering.placeOrder, {
      tenantId: "t-1",
      requestKey: "k-place-2",
      input: { orderId: "order-2", lines: [line("sku-1", 1, 300)] },
    });
    // The context's own operation, which CancelOrder calls with one order, called here with two.
    const cancelled = await t.mutation(components.orders.operations.cancel, {
      tenantId: "t-1",
      actor: operator,
      operation: {
        operationId: "cancel-two",
        causedBy: { kind: "command", commandType: "Setup" },
      },
      input: { orders: [{ orderId: "order-2" }, { orderId: "order-1" }] },
    });
    expect(cancelled.result).toEqual({
      orders: [
        { orderId: "order-2", lines: [line("sku-1", 1, 300)] },
        {
          orderId: "order-1",
          lines: [line("sku-1", 2, 250), line("sku-1", 1, 999)],
        },
      ],
    });
  },
);
