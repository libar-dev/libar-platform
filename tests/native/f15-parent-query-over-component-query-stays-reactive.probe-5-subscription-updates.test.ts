import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe5SubscriptionUpdatesContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-subscription-updates.contract.js";
import { onTestFinished } from "vitest";
import { setTimeout as sleep } from "node:timers/promises";
import { api } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";
import {
  ordinaryClient,
  ordinarySocketClient,
  watchQuery,
} from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { seedList } from "./list-pages.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-subscription-updates",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-subscription-updates",
  ),
});
void anchor;
type Watch = ReturnType<typeof watchQuery<typeof api.list.first>>;
interface World {
  backend?: Backend;
  watch?: Watch;
  before?: number;
  id?: string;
  values?: { label: string }[];
}
bindExample(contract, (): World => ({}), {
  "a client subscribed to a parent query that reads no table of its own and returns what a component query reads":
    async (world) => {
      const backend = await fixtureBackend();
      await seedList(ordinaryClient(backend.url), 1);
      const socket = ordinarySocketClient(backend.url);
      onTestFinished(() => socket.close());
      const watch = watchQuery(socket, api.list.first, {});
      const initial = await watch.until(
        (row) => row?.label === "row 0",
        "the initial component row",
        5000,
      );
      expect(initial).not.toBeNull();
      Object.assign(world, {
        backend,
        watch,
        id: required(initial ?? undefined, "the initial row")._id,
        before: watch.values.length,
      });
    },
  "a mutation changes the document inside the component": async (world) => {
    await ordinaryClient(required(world.backend, "the backend").url).mutation(
      api.list.relabel,
      { id: required(world.id, "the component row id"), label: "changed" },
    );
  },
  "the subscription delivers {updates} changed value without the client asking again":
    async (world, { updates }) => {
      const watch = required(world.watch, "the subscription");
      let failure: unknown;
      try {
        await watch.until(
          (row) => row?.label === "changed",
          "the subscription update",
          5000,
        );
      } catch (error) {
        failure = error;
      }
      await sleep(100);
      const values = watch.values.slice(
        required(world.before, "the initial delivery count"),
      );
      measure("subscriptionUpdates", {
        waitMs: 5000,
        observationAfterDeliveryMs: 100,
        values: values.map((row) =>
          row === null ? null : { id: row._id, label: row.label },
        ),
        error: failure === undefined ? null : String(failure),
      });
      expect(failure, String(failure)).toBeUndefined();
      expect(values, `Observed ${values.length} changed values`).toHaveLength(
        updates,
      );
      for (const row of values) {
        expect(row?._id).toBe(world.id);
        expect(row?.label).toBe("changed");
      }
    },
});
