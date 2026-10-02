import { getFunctionName, type PaginationResult } from "convex/server";
import { ConvexError, convexToJson, type Value } from "convex/values";
import { expect, onTestFinished, test } from "vitest";
import { api, internal } from "../../example/convex/_generated/api.js";
import { placeOrderPermission } from "../../example/convex/ordering.js";
import { readOrdersPermission } from "../../example/convex/readModels.js";
import { receiveStockPermission } from "../../example/convex/receiving.js";
import type { Backend } from "../../harness/backend.js";
import {
  ordinaryClient,
  ordinarySocketClient,
  watchQuery,
} from "../../harness/clients.js";
import { measure, productionBackend, required } from "../../harness/native.js";
import { classifyThrown } from "../../src/command/index.js";
// The production composition on its own backend, reached by ordinary clients whose tokens the
// fixture issuer signs: grants and the order summary's first activation with admin access as setup,
// stock through ReceiveStock, then PlaceOrder over Orders and Inventory.
const operator = { kind: "operator", id: "native-test" } as const;
const readInventoryPermission = "inventory.read";
const everything = [
  placeOrderPermission,
  receiveStockPermission,
  readOrdersPermission,
  readInventoryPermission,
];
async function grant(
  backend: Backend,
  subject: string,
  permissions: readonly string[],
  tenantId = "t-1",
) {
  for (const permission of permissions)
    await backend.admin.run(getFunctionName(internal.grants.grant), {
      tenantId,
      principalKind: "human",
      principalId: `${backend.issuer.issuer}|${subject}`,
      permission,
      grantedBy: "native-test",
    });
}
const activate = (backend: Backend) =>
  backend.admin.run(getFunctionName(internal.readModels.activate), {
    readModel: "orderSummary",
    startedBy: operator,
  });
// Grants, the first activation and a client for a granted user.
async function setUp(backend: Backend) {
  await grant(backend, "user-1", everything);
  await activate(backend);
  const token = await backend.issuer.token("user-1");
  return { token, client: ordinaryClient(backend.url, { token }) };
}
const caught = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (error: unknown) => error,
  );
async function stored(backend: Backend) {
  return {
    receipts: await backend.admin.readTable("receipts"),
    orderStreams: await backend.admin.readTable("streams", {
      component: "orders",
    }),
    orderEvents: await backend.admin.readTable("events", {
      component: "orders",
    }),
    stockStreams: await backend.admin.readTable("streams", {
      component: "inventory",
    }),
    stockEvents: await backend.admin.readTable("events", {
      component: "inventory",
    }),
    summaries: await backend.admin.readTable("orderSummaries"),
  };
}
const line = (stockItemId: string, quantity: number, unitPrice = 100) => ({
  stockItemId,
  quantity,
  unitPrice,
});
const placeOrderIdentifier = "ordering:placeOrder";

test("native: ReceiveStock then PlaceOrder is one top-level commit, and a subscribed order summary list shows the summary row with the command's versions", async () => {
  const backend = await productionBackend();
  const { token, client } = await setUp(backend);
  await client.mutation(api.receiving.receiveStock, {
    tenantId: "t-1",
    input: {
      items: [
        { stockItemId: "sku-1", quantity: 5 },
        { stockItemId: "sku-2", quantity: 3 },
      ],
    },
  });
  const socket = ordinarySocketClient(backend.url, { token });
  onTestFinished(() => socket.close());
  const summaries = watchQuery(socket, api.readModels.listOrderSummaries, {
    tenantId: "t-1",
    status: "placed",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  await summaries.until((page) => page.page.length === 0, "an empty list");
  const mark = await backend.admin.logMark();
  const response = await client.mutation(api.ordering.placeOrder, {
    tenantId: "t-1",
    requestKey: "k-1",
    input: {
      orderId: "order-1",
      lines: [line("sku-1", 2, 250), line("sku-2", 3, 40), line("sku-1", 1, 5)],
    },
  });
  expect(response).toMatchObject({
    kind: "applied",
    replayed: false,
    result: { orderId: "order-1", lineCount: 3, total: 625 },
  });
  const [orderVersion] = response.versions;
  expect(response.versions).toEqual([
    {
      tenantId: "t-1",
      contextId: "orders",
      streamType: "order",
      streamId: "order-1",
      version: 1,
    },
    {
      tenantId: "t-1",
      contextId: "inventory",
      streamType: "stockItem",
      streamId: "sku-1",
      version: 2,
    },
    {
      tenantId: "t-1",
      contextId: "inventory",
      streamType: "stockItem",
      streamId: "sku-2",
      version: 2,
    },
  ]);
  const page = await summaries.until(
    (value) => value.page.length === 1,
    "the summary row",
  );
  expect(page.page).toEqual([
    {
      tenantId: "t-1",
      key: "order-1",
      projectionVersion: 1,
      sourceVersions: [orderVersion],
      orderId: "order-1",
      status: "placed",
      lineCount: 3,
      total: 625,
      placedAt: expect.any(Number),
    },
  ]);
  // The request left one completion record: the command's own top-level mutation, and nothing ran
  // for it beside.
  const records = await backend.admin.completionsSince(mark, (entries) =>
    entries.some(
      (entry) =>
        entry.identifier === placeOrderIdentifier &&
        entry.componentPath === null,
    ),
  );
  const own = required(
    records.find(
      (entry) =>
        entry.identifier === placeOrderIdentifier &&
        entry.componentPath === null,
    ),
    "the command's completion record",
  );
  const request = records.filter((entry) => entry.requestId === own.requestId);
  measure("placeOrder", {
    records: request.map(({ identifier, udfType, componentPath }) => ({
      identifier,
      udfType,
      componentPath,
    })),
    usageStats: own.usageStats,
  });
  expect(request).toHaveLength(1);
  expect(own).toMatchObject({ udfType: "Mutation", error: null });
  // The receipt, the order's row and event, two stock item rows and events, and the summary row.
  expect(own.usageStats["databaseWriteDocuments"]).toBe(8);
  const order = await client.query(api.orderQueries.getOrder, {
    tenantId: "t-1",
    orderId: "order-1",
  });
  expect(order).toEqual({
    orderId: "order-1",
    status: "placed",
    lines: [line("sku-1", 2, 250), line("sku-2", 3, 40), line("sku-1", 1, 5)],
    total: 625,
    placedAt: page.page[0]?.placedAt,
    version: orderVersion,
  });
  const after = await stored(backend);
  expect(after.receipts).toMatchObject([
    { requestKey: "k-1", operationId: response.operationId },
  ]);
  expect(
    after.stockStreams.map(({ streamId, state }) => ({ streamId, state })),
  ).toEqual([
    { streamId: "sku-1", state: { onHand: 5, allocated: 3 } },
    { streamId: "sku-2", state: { onHand: 3, allocated: 3 } },
  ]);
  expect(
    after.stockEvents
      .filter((event) => event.operationId === response.operationId)
      .map(({ streamId, eventType, payload }) => ({
        streamId,
        eventType,
        payload,
      })),
  ).toEqual([
    {
      streamId: "sku-1",
      eventType: "StockAllocated",
      payload: { orderId: "order-1", quantity: 3 },
    },
    {
      streamId: "sku-2",
      eventType: "StockAllocated",
      payload: { orderId: "order-1", quantity: 3 },
    },
  ]);
  // The Inventory context's queries, which no parent query relays, read with admin access.
  const stockItem = (streamId: string) =>
    backend.admin.run(
      "queries/stockItem:get",
      { tenantId: "t-1", streamId },
      { component: "inventory" },
    );
  expect(await stockItem("sku-1")).toEqual({
    stockItemId: "sku-1",
    onHand: 5,
    allocated: 3,
    version: response.versions[1],
  });
  expect(await stockItem("sku-9")).toBeNull();
  const stockPage = (await backend.admin.run(
    "queries/stockItem:list",
    { tenantId: "t-1", paginationOpts: { cursor: null, numItems: 10 } },
    { component: "inventory" },
  )) as unknown as PaginationResult<{ stockItemId: string; allocated: number }>;
  expect(
    stockPage.page.map(({ stockItemId, allocated }) => ({
      stockItemId,
      allocated,
    })),
  ).toEqual([
    { stockItemId: "sku-1", allocated: 3 },
    { stockItemId: "sku-2", allocated: 3 },
  ]);
});

test("native: an order for stock that is not there is rejected insufficientStock, and neither context, the receipts nor the summary keep anything of it", async () => {
  const backend = await productionBackend();
  const { client } = await setUp(backend);
  await client.mutation(api.receiving.receiveStock, {
    tenantId: "t-1",
    input: { items: [{ stockItemId: "sku-1", quantity: 2 }] },
  });
  const before = await stored(backend);
  const call = {
    tenantId: "t-1",
    requestKey: "k-1",
    input: {
      orderId: "order-1",
      lines: [line("sku-1", 2), line("sku-3", 1)],
    },
  };
  const error = await caught(client.mutation(api.ordering.placeOrder, call));
  measure("rejection", convexToJson((error as ConvexError<Value>).data));
  expect(error).toBeInstanceOf(ConvexError);
  expect(classifyThrown(error).kind).toBe("rejection");
  // sku-1 was allocated in the Inventory call before sku-3, which has no stream, was refused.
  expect((error as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    code: "insufficientStock",
    commandType: "PlaceOrder",
    message: "Cannot allocate 1 when 0 are available",
    details: { requested: 1, available: 0 },
  });
  expect(await stored(backend)).toEqual(before);
  expect(before).toMatchObject({
    receipts: [],
    orderStreams: [],
    orderEvents: [],
    summaries: [],
  });
  // The missing stock arrives, and the same command and key are applied.
  await client.mutation(api.receiving.receiveStock, {
    tenantId: "t-1",
    input: { items: [{ stockItemId: "sku-3", quantity: 1 }] },
  });
  expect(await client.mutation(api.ordering.placeOrder, call)).toMatchObject({
    kind: "applied",
    replayed: false,
  });
});

test("native: a parent query refuses a caller with no identity and one with no grant, writes nothing, and answers a granted caller", async () => {
  const backend = await productionBackend();
  const { client } = await setUp(backend);
  await client.mutation(api.receiving.receiveStock, {
    tenantId: "t-1",
    input: { items: [{ stockItemId: "sku-1", quantity: 1 }] },
  });
  await client.mutation(api.ordering.placeOrder, {
    tenantId: "t-1",
    input: { orderId: "order-1", lines: [line("sku-1", 1)] },
  });
  const args = { tenantId: "t-1", orderId: "order-1" };
  const anonymous = await caught(
    ordinaryClient(backend.url).query(api.orderQueries.getOrder, args),
  );
  const stranger = ordinaryClient(backend.url, {
    token: await backend.issuer.token("user-2"),
  });
  const refused = await caught(stranger.query(api.orderQueries.getOrder, args));
  for (const error of [anonymous, refused]) {
    expect(error).toBeInstanceOf(ConvexError);
    expect(classifyThrown(error).kind).toBe("rejection");
  }
  expect((anonymous as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    code: "unauthenticated",
    commandType: "getOrder",
    message: "getOrder needs an authenticated caller",
  });
  expect((refused as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    code: "forbidden",
    commandType: "getOrder",
    message: "The caller may not read getOrder in this tenant",
    details: { reason: "no_grant" },
  });
  // Both commands were sent with no request key, and a read writes nothing: no receipt exists.
  expect(await backend.admin.readTable("receipts")).toEqual([]);
  await grant(backend, "user-2", [readOrdersPermission]);
  expect(await stranger.query(api.orderQueries.getOrder, args)).toMatchObject({
    orderId: "order-1",
    status: "placed",
  });
});

test("native: the order list pages by the cursor pair, each page read once and then subscribed to its end cursor, with every order of the tenant once, none of another tenant's and no page split", async () => {
  const backend = await productionBackend();
  const { token, client } = await setUp(backend);
  await grant(backend, "user-1", everything, "t-2");
  for (const tenantId of ["t-1", "t-2"])
    await client.mutation(api.receiving.receiveStock, {
      tenantId,
      input: { items: [{ stockItemId: "sku-1", quantity: 100 }] },
    });
  const pad = (n: number) => String(n).padStart(2, "0");
  const ids = Array.from({ length: 25 }, (_, i) => `order-${pad(i)}`);
  // Placed out of order, so the list's order is the order ID's and not the placing's.
  for (const orderId of [...ids].reverse())
    await client.mutation(api.ordering.placeOrder, {
      tenantId: "t-1",
      input: { orderId, lines: [line("sku-1", 1)] },
    });
  for (const orderId of ["order-00", "order-30", "order-31"])
    await client.mutation(api.ordering.placeOrder, {
      tenantId: "t-2",
      input: { orderId, lines: [line("sku-1", 1)] },
    });
  type Page = PaginationResult<{
    orderId: string;
    version: { tenantId: string };
  }>;
  type Opts = { cursor: string | null; numItems: number; endCursor?: string };
  const args = (paginationOpts: Opts) => ({ tenantId: "t-1", paginationOpts });
  const socket = ordinarySocketClient(backend.url, { token });
  onTestFinished(() => socket.close());
  const idsOf = (page: Page) => page.page.map((order) => order.orderId);
  const pages: Page[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const first: Page = await client.query(
      api.orderQueries.listOrders,
      args({ cursor, numItems: 10 }),
    );
    const opts: Opts = first.isDone
      ? { cursor, numItems: 10 }
      : { cursor, numItems: 10, endCursor: first.continueCursor };
    const pinned = watchQuery(socket, api.orderQueries.listOrders, args(opts));
    pages.push(
      (await pinned.until(
        (page) => idsOf(page as Page).join() === idsOf(first).join(),
        `page ${i} pinned`,
      )) as Page,
    );
    if (first.isDone) break;
    cursor = first.continueCursor;
  }
  measure("orderPages", {
    sizes: pages.map((page) => page.page.length),
    pageStatus: pages.map((page) => page.pageStatus ?? null),
  });
  // Three full pages and an empty last one: a full page does not know it is the last.
  expect(pages.map((page) => page.page.length).filter((n) => n > 0)).toEqual([
    10, 10, 5,
  ]);
  expect(pages.flatMap(idsOf)).toEqual(ids);
  expect(
    pages.flatMap((page) => page.page.map((order) => order.version.tenantId)),
  ).toEqual(ids.map(() => "t-1"));
  expect(pages.some((page) => page.pageStatus === "SplitRequired")).toBe(false);
});
