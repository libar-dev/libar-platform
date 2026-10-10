import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { getFunctionAddress } from "convex/server";
import { expect, test } from "vitest";
import {
  cancelOrderDeclaration,
  placeOrderDeclaration,
} from "../../example/convex/ordering.js";
import { receiveStockDeclaration } from "../../example/convex/receiving.js";
import type { MutationCtx } from "../../src/command/index.js";
import type { OperationRef, StreamDto } from "../../src/context/index.js";
import type { StreamVersion } from "../../src/kernel/index.js";
// Binds PlaceOrder, CancelOrder and ReceiveStock, the production composition's use cases, to their Spec.
const anchor = codeAnchor({
  id: codeAnchorId("impl:application.parent-use-cases"),
  label:
    "PlaceOrder and CancelOrder over Orders and then Inventory, and ReceiveStock",
  satisfies: ref("spec:application.parent-use-cases"),
});
void anchor;
type Call = { reference: string; args: Record<string, unknown> };
const version = (
  contextId: string,
  streamType: string,
  streamId: string,
): StreamVersion => ({
  tenantId: "t-1",
  contextId,
  streamType,
  streamId,
  version: 1,
});
const entry = (streamVersion: StreamVersion): StreamDto => ({
  dto: { id: streamVersion.streamId },
  version: streamVersion,
  appended: 1,
  created: true,
  events: [],
});
// A ctx whose runMutation records each call by its function reference and answers a canned outcome.
function countingCtx(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  const ctx = {
    runMutation: (fn: unknown, args: Record<string, unknown>) => {
      const address = getFunctionAddress(fn as never) as { reference: string };
      calls.push({ reference: address.reference, args });
      const answer = answers[address.reference];
      if (answer === undefined)
        throw new Error(`No answer for ${address.reference}`);
      return Promise.resolve(answer);
    },
  } as unknown as MutationCtx;
  return { ctx, calls };
}
const place = "_reference/childComponent/orders/operations/place";
const allocate = "_reference/childComponent/inventory/operations/allocate";
const receive = "_reference/childComponent/inventory/operations/receive";
const cancel = "_reference/childComponent/orders/operations/cancel";
const release = "_reference/childComponent/inventory/operations/release";
const actor = { kind: "human", id: "issuer|user-1" } as const;
const operation: OperationRef = {
  operationId: "op-1",
  causedBy: { kind: "command", commandType: "PlaceOrder" },
};
const orderVersion = version("orders", "order", "order-1");
const stockVersions = Array.from({ length: 3 }, (_, i) =>
  version("inventory", "stockItem", `sku-${i}`),
);
function placeOrderAnswers(
  kinds: { orders?: string; inventory?: string } = {},
) {
  return {
    [place]: {
      kind: kinds.orders ?? "applied",
      result: { orders: [{ orderId: "order-1", lineCount: 4, total: 40 }] },
      versions: [orderVersion],
      streams: [entry(orderVersion)],
    },
    [allocate]: {
      kind: kinds.inventory ?? "applied",
      result: { lines: [] },
      versions: stockVersions,
      streams: stockVersions.map(entry),
    },
  };
}
// Four lines over three stock items, the first named twice.
const lines = [0, 1, 2, 0].map((i) => ({
  stockItemId: `sku-${i}`,
  quantity: i + 1,
  unitPrice: 10,
}));
const run = (ctx: MutationCtx) =>
  placeOrderDeclaration.executor(ctx, {
    tenantId: "t-1",
    actor,
    operation,
    input: { orderId: "order-1", lines },
  });

test("pure: PlaceOrder's executor calls Orders once and then Inventory once, and returns both calls' versions and streams in that order", async () => {
  const { ctx, calls } = countingCtx(placeOrderAnswers());
  const executed = await run(ctx);
  expect(calls.map((call) => call.reference)).toEqual([place, allocate]);
  expect(calls[0]?.args).toEqual({
    tenantId: "t-1",
    actor,
    operation,
    input: { orders: [{ orderId: "order-1", lines }] },
  });
  // Inventory is given the stock item and quantity of each line, without its price.
  expect(calls[1]?.args).toEqual({
    tenantId: "t-1",
    actor,
    operation,
    input: {
      orderId: "order-1",
      lines: lines.map(({ stockItemId, quantity }) => ({
        stockItemId,
        quantity,
      })),
    },
  });
  expect(executed).toEqual({
    kind: "applied",
    result: { orderId: "order-1", lineCount: 4, total: 40 },
    versions: [orderVersion, ...stockVersions],
    streams: [entry(orderVersion), ...stockVersions.map(entry)],
  });
});

test.each([1, 10, 100])(
  "pure: for an order of %s lines PlaceOrder's executor makes one call per context",
  async (size) => {
    const { ctx, calls } = countingCtx(placeOrderAnswers());
    await placeOrderDeclaration.executor(ctx, {
      tenantId: "t-1",
      actor,
      operation,
      input: {
        orderId: "order-1",
        lines: Array.from({ length: size }, (_, i) => ({
          stockItemId: `sku-${i}`,
          quantity: 1,
          unitPrice: 1,
        })),
      },
    });
    expect(calls.filter((call) => call.reference === place)).toHaveLength(1);
    expect(calls.filter((call) => call.reference === allocate)).toHaveLength(1);
    expect(calls).toHaveLength(2);
  },
);

test("pure: PlaceOrder's executor fails when either context answers a business failure, which PlaceOrder does not declare", async () => {
  for (const kinds of [
    { orders: "businessFailure" },
    { inventory: "businessFailure" },
  ])
    await expect(
      run(countingCtx(placeOrderAnswers(kinds)).ctx),
    ).rejects.toThrow(
      `PlaceOrder received a ${kinds.orders ?? "applied"} from Orders and a ${kinds.inventory ?? "applied"} from Inventory`,
    );
});

test("pure: PlaceOrder's executor fails when Orders answers other than one order", async () => {
  const answers = placeOrderAnswers();
  const orders = answers[place] as { result: { orders: unknown[] } };
  orders.result.orders = [];
  await expect(run(countingCtx(answers).ctx)).rejects.toThrow(
    "Orders answered 0 orders for one",
  );
});

test("pure: ReceiveStock's executor makes one call, to Inventory's receive, and returns its outcome", async () => {
  const outcome = {
    kind: "applied",
    result: { items: [{ stockItemId: "sku-0", quantity: 5 }] },
    versions: stockVersions,
    streams: stockVersions.map(entry),
  };
  const { ctx, calls } = countingCtx({ [receive]: outcome });
  const input = { items: [{ stockItemId: "sku-0", quantity: 5 }] };
  expect(
    await receiveStockDeclaration.executor(ctx, {
      tenantId: "t-1",
      actor,
      operation,
      input,
    }),
  ).toEqual(outcome);
  expect(calls).toEqual([
    {
      reference: receive,
      args: { tenantId: "t-1", actor, operation, input },
    },
  ]);
});

test("pure: PlaceOrder and ReceiveStock declare what they write, the order summary, their codes and their bounds", () => {
  expect(placeOrderDeclaration).toMatchObject({
    name: "PlaceOrder",
    permission: { permission: "orders.place" },
    writes: [
      { contextId: "orders", streamType: "order" },
      { contextId: "inventory", streamType: "stockItem" },
    ],
    readModels: [
      {
        readModel: { name: "orderSummary" },
        source: { contextId: "orders", streamType: "order" },
      },
    ],
    rejections: ["insufficientStock", "invalidQuantity"],
    bounds: { maxItems: 100 },
  });
  expect(placeOrderDeclaration.refine?.({ orderId: "o", lines: [] })).toEqual({
    message: "An order needs at least one line",
  });
  expect(placeOrderDeclaration.refine?.({ orderId: "o", lines })).toBeNull();
  expect(receiveStockDeclaration).toMatchObject({
    name: "ReceiveStock",
    permission: { permission: "inventory.receive" },
    writes: [{ contextId: "inventory", streamType: "stockItem" }],
    rejections: ["invalidQuantity", "stockLimitExceeded"],
    bounds: { maxItems: 100 },
  });
  expect(receiveStockDeclaration.readModels).toBeUndefined();
});

// The lines Orders answers for the cancelled order: four lines over three stock items, with prices.
const cancelledLines = [0, 1, 2, 0].map((i) => ({
  stockItemId: `sku-${i}`,
  quantity: 2 * i + 1,
  unitPrice: 25,
}));
const released = [
  { stockItemId: "sku-0", quantity: 2 },
  { stockItemId: "sku-1", quantity: 3 },
  { stockItemId: "sku-2", quantity: 5 },
];
function cancelOrderAnswers(
  kinds: { orders?: string; inventory?: string } = {},
) {
  return {
    [cancel]: {
      kind: kinds.orders ?? "applied",
      result: { orders: [{ orderId: "order-1", lines: cancelledLines }] },
      versions: [orderVersion],
      streams: [entry(orderVersion)],
    },
    [release]: {
      kind: kinds.inventory ?? "applied",
      result: { lines: released },
      versions: stockVersions,
      streams: stockVersions.map(entry),
    },
  };
}
const runCancel = (ctx: MutationCtx) =>
  cancelOrderDeclaration.executor(ctx, {
    tenantId: "t-1",
    actor,
    operation,
    input: { orderId: "order-1" },
  });

test("pure: CancelOrder's executor calls Orders' cancel once and then Inventory's release once with the lines Orders returned, and returns both calls' versions and streams in that order", async () => {
  const { ctx, calls } = countingCtx(cancelOrderAnswers());
  const executed = await runCancel(ctx);
  expect(calls.map((call) => call.reference)).toEqual([cancel, release]);
  expect(calls[0]?.args).toEqual({
    tenantId: "t-1",
    actor,
    operation,
    input: { orders: [{ orderId: "order-1" }] },
  });
  // Inventory is given the stock item and quantity of each line Orders returned, without its price:
  // the quantities come from the cancelled order, not from the caller.
  expect(calls[1]?.args).toEqual({
    tenantId: "t-1",
    actor,
    operation,
    input: {
      orderId: "order-1",
      lines: cancelledLines.map(({ stockItemId, quantity }) => ({
        stockItemId,
        quantity,
      })),
    },
  });
  expect(executed).toEqual({
    kind: "applied",
    result: { orderId: "order-1", released },
    versions: [orderVersion, ...stockVersions],
    streams: [entry(orderVersion), ...stockVersions.map(entry)],
  });
});

test("pure: CancelOrder's executor fails when either context answers a business failure, which CancelOrder does not declare", async () => {
  for (const kinds of [
    { orders: "businessFailure" },
    { inventory: "businessFailure" },
  ])
    await expect(
      runCancel(countingCtx(cancelOrderAnswers(kinds)).ctx),
    ).rejects.toThrow(
      `CancelOrder received a ${kinds.orders ?? "applied"} from Orders and a ${kinds.inventory ?? "applied"} from Inventory`,
    );
});

test("pure: CancelOrder's executor fails when Orders answers other than one order, before it calls Inventory", async () => {
  for (const orders of [
    [],
    [
      { orderId: "order-1", lines: cancelledLines },
      { orderId: "order-2", lines: cancelledLines },
    ],
  ]) {
    const answers = cancelOrderAnswers();
    (answers[cancel] as { result: { orders: unknown[] } }).result.orders =
      orders;
    const { ctx, calls } = countingCtx(answers);
    await expect(runCancel(ctx)).rejects.toThrow(
      `Orders answered ${orders.length} orders for one`,
    );
    expect(calls.map((call) => call.reference)).toEqual([cancel]);
  }
});

test("pure: CancelOrder declares its permission, what it writes, the order summary, its three codes and no bounds", () => {
  expect(cancelOrderDeclaration).toMatchObject({
    name: "CancelOrder",
    contractVersion: 1,
    permission: { permission: "orders.cancel" },
    writes: [
      { contextId: "orders", streamType: "order" },
      { contextId: "inventory", streamType: "stockItem" },
    ],
    readModels: [
      {
        readModel: { name: "orderSummary" },
        source: { contextId: "orders", streamType: "order" },
      },
    ],
    rejections: [
      "orderNotFound",
      "orderAlreadyCancelled",
      "insufficientAllocation",
    ],
  });
  expect(cancelOrderDeclaration.bounds).toBeUndefined();
  expect(cancelOrderDeclaration.refine).toBeUndefined();
});
