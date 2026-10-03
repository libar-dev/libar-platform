import { installOrderSummary } from "./rebuild-install.js";
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
// fixture issuer signs: grants and the order summary's first rebuild with admin access as setup,
// stock through ReceiveStock, then PlaceOrder over Orders and Inventory.
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
const install = (backend: Backend) => installOrderSummary(backend);
// Grants, the first rebuild and a client for a granted user.
async function setUp(backend: Backend) {
  await grant(backend, "user-1", everything);
  await install(backend);
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
