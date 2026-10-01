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
import { randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { waitUntil, within } from "../../harness/wait.js";
import { controlledTransport } from "./probe1-transport.js";

import { probe1BackendRestartWithPendingMutationContract as contract } from "../../generated/contracts/facts.f05-react-client-retries-until-confirmed.probe-1-backend-restart-with-pending-mutation.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f05-react-client-retries-until-confirmed.probe-1-backend-restart-with-pending-mutation",
  ),
  verifies: ref(
    "spec:facts.f05-react-client-retries-until-confirmed.probe-1-backend-restart-with-pending-mutation",
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
    error?: string;
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
  "the backend process is killed and restarted on the same storage while the client stays open, in each of {trials} trials":
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
          await measure("restart.transportTiming", {
            responsesHeld: true,
            reconnectionsPausedUntilAdminSnapshot: true,
            promiseTimeoutMs: 5000,
          });
        transport.holdResponses();
        transport.pauseReconnections();
        const key = `restart-${i}`;
        let resolved = false;
        const pending = ws
          .mutation(api.probe1.marker, { trial: key })
          .then(() => {
            resolved = true;
          });
        void pending.catch(() => {});
        const gapMs = randomInt(0, 31);
        if (gapMs > 0) await delay(gapMs);
        await backend(w).kill();
        await backend(w).restart();
        const existedBeforeReplay = (await count(w, key)) > 0;
        await measure("restart.beforeReplay", {
          key,
          gapMs,
          existedBeforeReplay,
        });
        transport.resume();
        let error: string | undefined;
        try {
          await within(pending, `marker ${key} confirmed after restart`, 5000);
        } catch (caught) {
          error = String(caught);
        }

        const observation = {
          key,
          gapMs,
          existedBeforeReplay,
          resolved,
          count: await count(w, key),
          ...(error === undefined ? {} : { error }),
        };
        w.trials.push(observation);
        await measure("restart.trial", observation);
        await ws.close();
      }
      await measure(
        "restart.trialsKilledBeforeCommit",
        w.trials.filter((t) => !t.existedBeforeReplay).length,
      );
      await measure(
        "restart.trialsKilledAfterCommit",
        w.trials.filter((t) => t.existedBeforeReplay).length,
      );
      await measure(
        "restart.distribution",
        w.trials.map((t) => t.count),
      );
    },
  "the mutation's promise resolves after the restart {resolves}": (
    w,
    { resolves },
  ) => {
    for (const trial of w.trials!)
      expect(trial.resolved, JSON.stringify(trial)).toBe(resolves);
  },
  "every trial leaves exactly {markerRows} marker row": (w, { markerRows }) => {
    for (const trial of w.trials!)
      expect(trial.count, JSON.stringify(trial)).toBe(markerRows);
  },
});
