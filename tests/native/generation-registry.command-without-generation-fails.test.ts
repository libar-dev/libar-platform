import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { ConvexError } from "convex/values";
import { expect } from "vitest";
import { commandWithoutGenerationFailsContract as contract } from "../../generated/contracts/application.generation-registry.command-without-generation-fails.contract.js";
import { api } from "../../example/convex/_generated/api.js";
import type { LogMark } from "../../harness/admin.js";
import { required } from "../../harness/native.js";
import { classifyThrown } from "../../src/command/index.js";
import {
  installOrderSummary,
  caught,
  changedDocuments,
  line,
  orderWorld,
  receiveStock,
  stored,
  tenantId,
  type OrderWorld,
  type Stored,
} from "./order-use-case.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.generation-registry.command-without-generation-fails",
  ),
  verifies: ref(
    "spec:application.generation-registry.command-without-generation-fails",
  ),
});
void anchor;
// PlaceOrder declares the order summary. Sent before the order summary's first activation, it finds
// no generation to write at step 9 and fails as a technical failure, so nothing of it commits.
interface World {
  order?: OrderWorld;
  before?: Stored;
  mark?: LogMark;
  error?: unknown;
}
const placeOrderIdentifier = "ordering:placeOrder";
const orderId = "order-1";
const call = {
  tenantId,
  requestKey: "k-1",
  input: { orderId, lines: [line("sku-1", 2)] },
};
bindExample(contract, (): World => ({}), {
  // ReceiveStock declares no read model, so it is applied with no generation in the registry.
  "a read model with {generationRows} generation rows": async (
    world,
    { generationRows },
  ) => {
    const order = await orderWorld({ install: false });
    world.order = order;
    expect(await order.backend.admin.readTable("generations")).toHaveLength(
      generationRows,
    );
    await receiveStock(order, [{ stockItemId: "sku-1", quantity: 5 }]);
    world.before = await stored(order);
  },
  "a command that declares the read model runs": async (world) => {
    const { backend, client } = required(world.order, "the backend");
    world.mark = await backend.admin.logMark();
    world.error = await caught(client.mutation(api.ordering.placeOrder, call));
  },
  // The caller's error carries no rejection data, and the function log's record of the failed
  // mutation names the order summary.
  "the caller sees {outcome}": async (world, { outcome }) => {
    expect(outcome).toBe("a technical failure");
    expect(world.error).not.toBeInstanceOf(ConvexError);
    expect(classifyThrown(world.error).kind).toBe("technical");
    const { backend } = required(world.order, "the backend");
    const own = (entry: { identifier: string; componentPath: string | null }) =>
      entry.identifier === placeOrderIdentifier && entry.componentPath === null;
    const records = await backend.admin.completionsSince(
      required(world.mark, "the log mark"),
      (entries) => entries.some(own),
    );
    expect(
      required(records.find(own), "the command's completion record").error,
    ).toContain(
      "PlaceOrder writes the read model orderSummary, which has no generation to write",
    );
  },
  // No receipt, no order stream, no order event and no change to the stock. After the first
  // activation the same command and key are applied.
  "the number of stored receipts, events and state changes is {stored}": async (
    world,
    { stored: count },
  ) => {
    const order = required(world.order, "the backend");
    const after = await stored(order);
    expect(
      changedDocuments(required(world.before, "the stored documents"), after),
    ).toBe(count);
    expect(after).toMatchObject({
      receipts: [],
      "orders.streams": [],
      "orders.events": [],
      orderSummaries: [],
    });
    await installOrderSummary(order.backend);
    expect(
      await order.client.mutation(api.ordering.placeOrder, call),
    ).toMatchObject({ kind: "applied", replayed: false });
  },
});
