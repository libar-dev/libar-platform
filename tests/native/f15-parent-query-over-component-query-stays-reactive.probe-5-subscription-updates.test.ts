import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { recordMeasurement } from "../../harness/evidence.js";
import { client } from "./world.js";

import { onTestFinished } from "vitest";
import { waitUntil } from "../../harness/wait.js";
import { setup, seed, loaded } from "./probe5-support.js";
import type { Probe5World } from "./probe5-support.js";

import { probe5SubscriptionUpdatesContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-subscription-updates.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-subscription-updates",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-subscription-updates",
  ),
});
void anchor;
type ProbeWorld = Probe5World;
async function measure(name: string, value: unknown) {
  await recordMeasurement(contract.title, `probe5.${name}`, value);
}

bindExample(contract, (): ProbeWorld => ({}), {
  "a client subscribed to a parent query that returns what a component query reads":
    async (w) => {
      await setup(w);
      await seed(w, 1);
      w.first = { stop: () => {} };
      w.first.stop = w.ws!.onUpdate(
        api.probe5.first,
        {},
        (value) => {
          w.first!.value = value;
        },
        (error) => {
          w.first!.error = error;
        },
      );
      onTestFinished(() => w.first!.stop());
      await loaded(w.first, "initial component row");
      await measure("subscription.initial", w.first.value);
    },
  "a mutation changes the document inside the component": async (w) => {
    await client(w).mutation(api.probe5.change, {
      id: w.first!.value!._id,
      value: "changed",
    });
  },
  "the subscription delivers the changed value without the client asking again {updated}":
    async (w, { updated }) => {
      await waitUntil(
        "component change on existing parent subscription",
        () => {
          if (w.first!.error) throw w.first!.error;
          return w.first!.value?.value === "changed";
        },
        5000,
      );
      await measure("subscription.updated", w.first!.value);
      expect(w.first!.value?.value === "changed").toBe(updated);
    },
});
