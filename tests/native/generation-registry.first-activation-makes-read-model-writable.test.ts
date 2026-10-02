import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { firstActivationMakesReadModelWritableContract as contract } from "../../generated/contracts/application.generation-registry.first-activation-makes-read-model-writable.contract.js";
import { api } from "../../example/convex/_generated/api.js";
import { orderSummary } from "../../example/convex/orderSummary.js";
import { required } from "../../harness/native.js";
import {
  activateOrderSummary,
  caught,
  line,
  orderWorld,
  receiveStock,
  tenantId,
  type OrderWorld,
} from "./order-use-case.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.generation-registry.first-activation-makes-read-model-writable",
  ),
  verifies: ref(
    "spec:application.generation-registry.first-activation-makes-read-model-writable",
  ),
});
void anchor;
// The production composition's order summary starts with no generation row. The first activation,
// run by an operator with admin access, makes generation 1 the active one; a second activation is
// refused; and PlaceOrder then writes its summary row into generation 1.
interface World {
  order?: OrderWorld;
  activated?: unknown;
}
const generations = (world: World) =>
  required(world.order, "the backend").backend.admin.readTable("generations");
bindExample(contract, (): World => ({}), {
  "a read model with {generationRows} generation rows": async (
    world,
    { generationRows },
  ) => {
    world.order = await orderWorld({ activate: false });
    expect(await generations(world)).toHaveLength(generationRows);
  },
  "an operator runs the first activation with admin access": async (world) => {
    const { backend } = required(world.order, "the backend");
    world.activated = await activateOrderSummary(backend);
  },
  "generation {generation} of the read model is {state}": async (
    world,
    { generation, state },
  ) => {
    expect(world.activated).toBe(generation);
    expect(await generations(world)).toMatchObject([
      {
        readModel: orderSummary.name,
        generation,
        projectionVersion: orderSummary.projection.version,
        state,
        startedBy: { kind: "operator", id: "native-test" },
      },
    ]);
  },
  // The refusal names the read model, its generation and its state, and the registry is unchanged.
  // The read model is writable: PlaceOrder writes the order's summary row into generation 1.
  "a second first activation is {second}": async (world, { second }) => {
    expect(second).toBe("refused");
    const order = required(world.order, "the backend");
    const registry = await generations(world);
    const error = await caught(activateOrderSummary(order.backend));
    expect(String(error)).toContain(
      "Read model orderSummary already has generation 1, which is active",
    );
    expect(await generations(world)).toEqual(registry);
    await receiveStock(order, [{ stockItemId: "sku-1", quantity: 5 }]);
    expect(
      await order.client.mutation(api.ordering.placeOrder, {
        tenantId,
        requestKey: "k-1",
        input: { orderId: "order-1", lines: [line("sku-1", 2)] },
      }),
    ).toMatchObject({ kind: "applied", replayed: false });
    expect(await order.backend.admin.readTable("orderSummaries")).toMatchObject(
      [{ tenantId, generation: 1, key: "order-1", status: "placed" }],
    );
  },
});
