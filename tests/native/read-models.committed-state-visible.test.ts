import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { FunctionReturnType } from "convex/server";
import { expect, onTestFinished } from "vitest";
import { committedStateVisibleContract as contract } from "../../generated/contracts/application.read-models.committed-state-visible.contract.js";
import { api } from "../../example/convex/_generated/api.js";
import type { LogMark } from "../../harness/admin.js";
import {
  ordinarySocketClient,
  watchQuery,
  type QueryWatch,
} from "../../harness/clients.js";
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
  id: testAnchorId("test:application.read-models.committed-state-visible"),
  verifies: ref("spec:application.read-models.committed-state-visible"),
});
void anchor;
// The order summary is written by PlaceOrder's own mutation, in step 9 of the pipeline. A client
// subscribed to the summary list sees the row the moment the command commits, and the function log
// shows that nothing but the command and the subscription's query ran in between.
type Summaries = FunctionReturnType<typeof api.readModels.listOrderSummaries>;
type Response = FunctionReturnType<typeof api.ordering.placeOrder>;
interface World {
  order?: OrderWorld;
  summaries?: QueryWatch<Summaries>;
  mark?: LogMark;
  response?: Response;
}
const orderId = "order-1";
const lines = [line("sku-1", 2, 250), line("sku-2", 1, 40)];
// A record a client caused: a call over HTTP, or a query or mutation over the socket. A scheduled
// function, a cron or an action is a worker.
const clientCallers = new Set(["HttpApi", "SyncWorker"]);
bindExample(contract, (): World => ({}), {
  "a read model maintained by the {useCase} use case": async (
    world,
    { useCase },
  ) => {
    if (useCase !== "PlaceOrder")
      throw new Error(`This test binds the PlaceOrder use case`);
    const order = await orderWorld();
    world.order = order;
    // The order summary's first generation is the active one.
    expect(await order.backend.admin.readTable("generations")).toMatchObject([
      { readModel: "orderSummary", generation: 1, state: "active" },
    ]);
    await receiveStock(order, [
      { stockItemId: "sku-1", quantity: 5 },
      { stockItemId: "sku-2", quantity: 5 },
    ]);
  },
  "a client subscribed to the first page of the read model's list for the tenant":
    async (world) => {
      const { backend, token } = required(world.order, "the backend");
      const socket = ordinarySocketClient(backend.url, { token });
      onTestFinished(() => socket.close());
      world.summaries = watchQuery(socket, api.readModels.listOrderSummaries, {
        tenantId,
        status: "placed",
        paginationOpts: { cursor: null, numItems: 10 },
      });
      await world.summaries.until(
        (page) => page.page.length === 0,
        "an empty first page",
      );
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
  // The summary is projected from the order's stream alone, so its source versions are the
  // command's returned version of that stream, and of no stock item's.
  "the subscription shows the committed state with source versions {versionMatch}":
    async (world, { versionMatch }) => {
      expect(versionMatch).toBe("equal to the command's returned versions");
      const { versions } = required(world.response, "the command's response");
      const orderVersions = versions.filter(
        ({ contextId, streamId }) =>
          contextId === "orders" && streamId === orderId,
      );
      expect(orderVersions).toHaveLength(1);
      const page = await required(world.summaries, "the subscription").until(
        (value) => value.page.length === 1,
        "the order's summary",
      );
      expect(page.page).toEqual([
        {
          tenantId,
          key: orderId,
          projectionVersion: 1,
          sourceVersions: orderVersions,
          orderId,
          status: "placed",
          lineCount: 2,
          total: 540,
          placedAt: expect.any(Number),
        },
      ]);
    },
  // Every record in the function log from the command to the subscription's update: the command's
  // own mutation and the subscription's query, both caused by the client.
  "the number of workers, jobs or queues that ran is {workers}": async (
    world,
    { workers },
  ) => {
    const { backend } = required(world.order, "the backend");
    const records = await backend.admin.completionsSince(
      required(world.mark, "the log mark"),
      (entries) =>
        entries.some((entry) => entry.identifier === "ordering:placeOrder") &&
        entries.some(
          (entry) => entry.identifier === "readModels:listOrderSummaries",
        ),
    );
    expect(
      records.filter(
        (entry) =>
          entry.udfType === "Action" ||
          entry.udfType === "HttpAction" ||
          !clientCallers.has(entry.caller),
      ),
    ).toHaveLength(workers);
    // The scheduled-function tables of the parent and both contexts also hold a job scheduled with
    // a delay past the window.
    expect(await scheduledRows(backend)).toHaveLength(workers);
    expect(
      records.find((entry) => entry.identifier === "ordering:placeOrder"),
    ).toMatchObject({ udfType: "Mutation", caller: "HttpApi", error: null });
    expect(
      records.find(
        (entry) => entry.identifier === "readModels:listOrderSummaries",
      ),
    ).toMatchObject({ udfType: "Query", caller: "SyncWorker", error: null });
  },
});
