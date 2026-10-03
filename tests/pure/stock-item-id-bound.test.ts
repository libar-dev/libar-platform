import { ConvexError, getConvexSize, type Value } from "convex/values";
import { expect, test } from "vitest";
import {
  maxOrderLines,
  placeOrderDeclaration,
} from "../../example/convex/ordering.js";
import {
  maxStockItemIdBytes,
  receiveStockDeclaration,
} from "../../example/convex/receiving.js";
import { orderDecider, type OrderLine } from "../../example/domain/index.js";
import { runPipeline, type MutationCtx } from "../../src/command/index.js";
import { limitPayloadBytes } from "../../src/context/index.js";
const linesAt = (bytes: number): OrderLine[] =>
  Array.from({ length: maxOrderLines }, (_, i) => ({
    stockItemId: String(i).padStart(3, "0").padEnd(bytes, "x"),
    quantity: 1,
    unitPrice: 0,
  }));
function payloadOf(lines: OrderLine[]) {
  const decision = orderDecider.decide(
    orderDecider.initial(),
    { commandType: "place", lines },
    { now: 0, actor: { kind: "human", id: "user" }, facts: {} },
  );
  if (decision.kind !== "applied")
    throw new Error(`Expected applied, got ${decision.kind}`);
  expect(decision.events).toHaveLength(1);
  const event = decision.events[0];
  if (event?.eventType !== "OrderPlaced")
    throw new Error("Expected OrderPlaced");
  return event.payload;
}

test.each([
  [64, 11725, true],
  [128, 18125, false],
  [256, 30925, false],
] as const)(
  "pure: OrderPlaced with 100 stock item IDs of %s bytes measures %s bytes",
  (bytes, expected, fits) => {
    const size = getConvexSize(payloadOf(linesAt(bytes)));
    expect(size).toBe(expected);
    expect(size).toBe(25 + 100 * (53 + bytes));
    expect(size <= limitPayloadBytes).toBe(fits);
  },
);

test("pure: the smallest and largest safe quantities and unit prices do not change the payload size", () => {
  const smallest = linesAt(64);
  const largestQuantity = smallest.map((line) => ({
    ...line,
    quantity: Number.MAX_SAFE_INTEGER,
  }));
  const largestPrice = smallest.map((line, i) => ({
    ...line,
    unitPrice: i === 0 ? Number.MAX_SAFE_INTEGER : 0,
  }));
  for (const lines of [smallest, largestQuantity, largestPrice])
    expect(getConvexSize(payloadOf(lines))).toBe(11725);
});

test("pure: 64 is the largest power of two whose maximum order fits the payload bound", () => {
  expect(maxStockItemIdBytes).toBe(64);
  expect(maxOrderLines).toBe(100);
  expect(limitPayloadBytes).toBe(16384);
  let largest = 0;
  for (let bytes = 1; bytes <= 256; bytes *= 2)
    if (getConvexSize(payloadOf(linesAt(bytes))) <= limitPayloadBytes)
      largest = bytes;
  expect(maxStockItemIdBytes).toBe(largest);
});
const refine = (ids: string[]) => {
  const input = {
    orderId: "order",
    lines: ids.map((stockItemId) => ({
      stockItemId,
      quantity: 1,
      unitPrice: 0,
    })),
  };
  if (placeOrderDeclaration.refine === undefined)
    throw new Error("PlaceOrder needs its refinement");
  return placeOrderDeclaration.refine(input);
};
const refusal = (line: number, length: number) => ({
  message: `Line ${line} needs a stock item ID of at most 64 bytes of UTF-8, not ${length}`,
  details: { line, length, limit: 64 },
});

test("pure: a stock item ID at 64 bytes passes refinement", () => {
  expect(refine(["a".repeat(64)])).toBeNull();
  expect(refine(["é".repeat(32)])).toBeNull();
});

test("pure: a stock item ID at 65 bytes is refused with its message and details", () => {
  expect(refine(["a".repeat(65)])).toEqual(refusal(0, 65));
});

test("pure: refinement counts multi-byte stock item IDs in UTF-8 bytes", () => {
  const id = "a" + "é".repeat(32);
  expect(id.length).toBe(33);
  expect(refine([id])).toEqual(refusal(0, 65));
});

test("pure: refinement names the first offending line from zero", () => {
  expect(refine(["a".repeat(64), "é".repeat(33), "a".repeat(65)])).toEqual(
    refusal(1, 66),
  );
});

test("pure: an empty order keeps its own refusal", () => {
  expect(refine([])).toEqual({ message: "An order needs at least one line" });
});

test("pure: the pipeline refuses a long ID before any read and checks the line count first", async () => {
  const touched: string[] = [];
  const ctx = new Proxy({} as MutationCtx, {
    get: (_target, property) => {
      touched.push(String(property));
      throw new Error("The refused command reached its context");
    },
  });
  for (const count of [100, 101]) {
    const lines = linesAt(64);
    lines[0] = { stockItemId: "a" + "é".repeat(32), quantity: 1, unitPrice: 0 };
    if (count === 101)
      lines.push({ stockItemId: "extra", quantity: 1, unitPrice: 0 });
    const error: unknown = await runPipeline(ctx, placeOrderDeclaration, {
      tenantId: "tenant",
      namespace: "public",
      actor: { kind: "human", id: "user" },
      requestKey: "request",
      input: { orderId: "order", lines },
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<Value>).data).toEqual(
      count === 100
        ? {
            ...refusal(0, 65),
            kind: "rejection",
            code: "invalidInput",
            entry: "PlaceOrder",
          }
        : {
            kind: "rejection",
            code: "operationTooLarge",
            entry: "PlaceOrder",
            message: "PlaceOrder takes at most 100 items, not 101",
            details: { items: 101, maxItems: 100 },
          },
    );
  }
  expect(touched).toEqual([]);
});

test("pure: ReceiveStock refuses the first stock item ID past the same bound", () => {
  const refineReceive = receiveStockDeclaration.refine;
  if (refineReceive === undefined)
    throw new Error("ReceiveStock needs its refinement");
  const items = (ids: string[]) => ({
    items: ids.map((stockItemId) => ({ stockItemId, quantity: 1 })),
  });
  expect(refineReceive(items(["a".repeat(64), "é".repeat(32)]))).toBeNull();
  expect(
    refineReceive(
      items(["a".repeat(64), "a" + "é".repeat(32), "b".repeat(70)]),
    ),
  ).toEqual(refusal(1, 65));
});

test("pure: both commands bound the supplied bytes, so a decomposed ID of 96 bytes is refused although its composed form has 64", () => {
  const decomposed = "é".repeat(32);
  expect(new TextEncoder().encode(decomposed)).toHaveLength(96);
  expect(new TextEncoder().encode(decomposed.normalize("NFC"))).toHaveLength(
    64,
  );
  const refineReceive = receiveStockDeclaration.refine;
  if (refineReceive === undefined)
    throw new Error("ReceiveStock needs its refinement");
  expect(refine([decomposed])).toEqual(refusal(0, 96));
  expect(
    refineReceive({ items: [{ stockItemId: decomposed, quantity: 1 }] }),
  ).toEqual(refusal(0, 96));
});
