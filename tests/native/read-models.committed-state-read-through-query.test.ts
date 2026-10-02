import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { FunctionReturnType } from "convex/server";
import { expect } from "vitest";
import { committedStateReadThroughQueryContract as contract } from "../../generated/contracts/application.read-models.committed-state-read-through-query.contract.js";
import { api } from "../../example/convex/_generated/api.js";
import type { LogMark } from "../../harness/admin.js";
import { required } from "../../harness/native.js";
import { scheduledRows } from "./scheduled-rows.js";
import {
  line,
  orderWorld,
  receiveStock,
  tenantId,
  type OrderWorld,
} from "./order-use-case.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.read-models.committed-state-read-through-query",
  ),
  verifies: ref(
    "spec:application.read-models.committed-state-read-through-query",
  ),
});
void anchor;
// PlaceOrder commits in its own mutation, and the parent query getOrder, which relays the Orders
// context's get, answers the committed order as soon as the command has returned. The function log
// identifies both client calls. Admin reads of the scheduled-function tables check that no job exists.
type Response = FunctionReturnType<typeof api.ordering.placeOrder>;
interface World {
  order?: OrderWorld;
  mark?: LogMark;
  response?: Response;
}
const orderId = "order-1";
const lines = [line("sku-1", 2, 250), line("sku-2", 1, 40)];
const placeOrderIdentifier = "ordering:placeOrder";
const getOrderIdentifier = "orderQueries:getOrder";
bindExample(contract, (): World => ({}), {
  "a read model maintained by the {useCase} use case": async (
    world,
    { useCase },
  ) => {
    if (useCase !== "PlaceOrder")
      throw new Error(`This test binds the PlaceOrder use case`);
    const order = await orderWorld();
    world.order = order;
    expect(await order.backend.admin.readTable("generations")).toMatchObject([
      { readModel: "orderSummary", generation: 1, state: "active" },
    ]);
    await receiveStock(order, [
      { stockItemId: "sku-1", quantity: 5 },
      { stockItemId: "sku-2", quantity: 5 },
    ]);
  },
  "{action}": async (world, { action }) => {
    if (action !== "the use case commits one successful command")
      throw new Error(`This test binds one successful command`);
    const { backend, client } = required(world.order, "the backend");
    world.mark = await backend.admin.logMark();
    world.response = await client.mutation(api.ordering.placeOrder, {
      tenantId,
      requestKey: "k-1",
      input: { orderId, lines },
    });
    expect(world.response).toMatchObject({
      kind: "applied",
      replayed: false,
      result: { orderId, lineCount: 2, total: 540 },
    });
  },
  // The DTO's version is the command's returned version of the order's stream.
  "a read of the parent query over the context's get shows the committed state with stream version {versionMatch}":
    async (world, { versionMatch }) => {
      expect(versionMatch).toBe("equal to the command's returned versions");
      const { versions } = required(world.response, "the command's response");
      const orderVersions = versions.filter(
        ({ contextId, streamId }) =>
          contextId === "orders" && streamId === orderId,
      );
      expect(orderVersions).toHaveLength(1);
      const { client } = required(world.order, "the backend");
      expect(
        await client.query(api.orderQueries.getOrder, { tenantId, orderId }),
      ).toEqual({
        orderId,
        status: "placed",
        lines,
        total: 540,
        placedAt: expect.any(Number),
        version: orderVersions[0],
      });
    },
  // The log identifies the two client calls; the tables include delayed scheduled functions.
  "the number of workers, jobs or queues that ran is {workers}": async (
    world,
    { workers },
  ) => {
    const { backend } = required(world.order, "the backend");
    const records = await backend.admin.completionsSince(
      required(world.mark, "the log mark"),
      (entries) =>
        entries.some((entry) => entry.identifier === placeOrderIdentifier) &&
        entries.some((entry) => entry.identifier === getOrderIdentifier),
    );
    expect(await scheduledRows(backend)).toHaveLength(workers);
    expect(
      records.find((entry) => entry.identifier === placeOrderIdentifier),
    ).toMatchObject({ udfType: "Mutation", caller: "HttpApi", error: null });
    expect(
      records.find((entry) => entry.identifier === getOrderIdentifier),
    ).toMatchObject({ udfType: "Query", caller: "HttpApi", error: null });
  },
});
