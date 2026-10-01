import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { recordMeasurement } from "../../harness/evidence.js";
import { backend, fixture } from "./world.js";
import type { World } from "./world.js";

import { ConvexClient } from "convex/browser";
import { onTestFinished } from "vitest";

import { setTimeout as delay } from "node:timers/promises";
import { waitUntil } from "../../harness/wait.js";
import { controlledTransport } from "./probe1-transport.js";

import { probe1ClientClosedWithPendingMutationContract as contract } from "../../generated/contracts/facts.f05-react-client-retries-until-confirmed.probe-1-client-closed-with-pending-mutation.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f05-react-client-retries-until-confirmed.probe-1-client-closed-with-pending-mutation",
  ),
  verifies: ref(
    "spec:facts.f05-react-client-retries-until-confirmed.probe-1-client-closed-with-pending-mutation",
  ),
});
void anchor;
interface ProbeWorld extends World {
  trials?: {
    key: string;
    count: number;
    resolved: boolean;
    existedBeforeReplay?: boolean;
    gapMs: number;
  }[];
}
async function measure(name: string, value: unknown) {
  await recordMeasurement(contract.title, `probe1.${name}`, value);
}
async function count(w: ProbeWorld, key: string) {
  return (await backend(w).readTable("markers")).filter(
    (row) => (row as { trial: string }).trial === key,
  ).length;
}
async function connected(ws: ConvexClient) {
  await waitUntil(
    "WebSocket connected before marker send",
    () => ws.connectionState().isWebSocketConnected,
    5000,
  );
}

bindExample(contract, (): ProbeWorld => ({}), {
  "a WebSocket client that sends a mutation which inserts one marker row":
    async (w) => {
      await fixture(w);
    },
  "the client is closed before the mutation's result arrives, in each of {trials} trials":
    async (w, { trials }) => {
      w.trials = [];
      for (let i = 0; i < trials; i++) {
        const transport = controlledTransport();
        const ws = new ConvexClient(backend(w).url, {
          webSocketConstructor: transport.constructor,
        });
        onTestFinished(() => ws.close());
        await connected(ws);
        if (i === 0)
          await measure("closed.transportTiming", {
            responsesHeld: true,
            settleWindowMs: 100,
            gapsMs: [0, 1, 2, 3, 4, 5],
          });
        const key = `closed-${i}`;
        transport.holdResponses();
        let resolved = false;
        void ws.mutation(api.probe1.marker, { trial: key }).then(
          () => {
            resolved = true;
          },
          () => {},
        );
        const gapMs = i % 6;
        if (gapMs > 0) await delay(gapMs);
        expect(
          resolved,
          "mutation must still be pending when client closes",
        ).toBe(false);
        await ws.close();
        // With no client left to confirm an uncommitted send, absence has no event.
        // Observe for a bounded 100 ms settle window, then take the admin snapshot.
        await delay(100);
        const rows = await count(w, key);
        const observation = { key, count: rows, resolved, gapMs };
        w.trials.push(observation);
        await measure("closed.trial", observation);
      }
      await measure(
        "closed.trialsWithNoRow",
        w.trials.filter((t) => t.count === 0).length,
      );
      await measure(
        "closed.trialsWithOneRow",
        w.trials.filter((t) => t.count === 1).length,
      );
      await measure(
        "closed.distribution",
        w.trials.map((t) => t.count),
      );
    },
  "no trial leaves more than {mostMarkerRows} marker row": (
    w,
    { mostMarkerRows },
  ) => {
    for (const trial of w.trials!)
      expect(trial.count, JSON.stringify(trial)).toBeLessThanOrEqual(
        mostMarkerRows,
      );
  },
});
