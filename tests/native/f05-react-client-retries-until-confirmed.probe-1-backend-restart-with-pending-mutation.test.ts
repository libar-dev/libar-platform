import { setTimeout as sleep } from "node:timers/promises";
import { expect, onTestFinished } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { probe1BackendRestartWithPendingMutationContract as contract } from "../../generated/contracts/facts.f05-react-client-retries-until-confirmed.probe-1-backend-restart-with-pending-mutation.contract.js";
import type { Backend } from "../../harness/backend.js";
import { heldWebSocket, ordinarySocketClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { within } from "../../harness/wait.js";
import { connected, markerRows } from "./marker-rows.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f05-react-client-retries-until-confirmed.probe-1-backend-restart-with-pending-mutation",
  ),
  verifies: ref(
    "spec:facts.f05-react-client-retries-until-confirmed.probe-1-backend-restart-with-pending-mutation",
  ),
});
void anchor;
interface Trial {
  trial: string;
  // Milliseconds between the send and the SIGKILL.
  delayMs: number;
  // Whether the row was stored when the backend came back, before the client could send again.
  committedBeforeKill: boolean;
  // Whether the mutation's promise was still unresolved once the killed process had exited.
  pendingAtKill: boolean;
  // Whether it was still unresolved just before the held responses were released.
  pendingAtRelease: boolean;
  // Whether it resolved at all, within 15 seconds of the release.
  resolved: boolean;
  rows: number;
}
// The promise resolved after the restart: it was unresolved at the kill and at the release.
function resolvedAfterRestart(trial: Trial): boolean {
  return trial.pendingAtKill && trial.pendingAtRelease && trial.resolved;
}
interface World {
  backend?: Backend;
  trials?: Trial[];
}
// No delay for the first three trials in ten, then 1, 2, 4 and so on. On the pinned release a
// local mutation commits a few milliseconds after the send, so the trials fall on both sides.
function killDelayMs(index: number, trials: number): number {
  const immediate = Math.ceil(trials * 0.3);
  return index < immediate ? 0 : 2 ** (index - immediate);
}
bindExample(contract, (): World => ({}), {
  "a WebSocket client, the ConvexClient of convex/browser, that sends a mutation which inserts one marker row":
    async (world) => {
      const backend = await fixtureBackend();
      world.backend = backend;
      // With no restart, such a client gets its result and leaves one row.
      const client = ordinarySocketClient(backend.url);
      await client.mutation(api.markers.insert, { trial: "no restart" });
      await client.close();
      expect((await markerRows(backend)).get("no restart")).toBe(1);
    },
  "the backend process is killed and restarted on the same storage while the client stays open, in each of {trials} trials":
    async (world, { trials }) => {
      const backend = required(world.backend, "the backend");
      const restarted: Trial[] = [];
      for (let index = 0; index < trials; index++) {
        const held = heldWebSocket();
        const client = ordinarySocketClient(backend.url, {
          webSocket: held.WebSocket,
        });
        onTestFinished(() => client.close());
        await connected(client);
        // No response reaches the client, and it cannot reconnect, until the release below.
        held.holdResponses();
        held.pauseConnections();
        const trial: Trial = {
          trial: `restart ${index}`,
          delayMs: killDelayMs(index, trials),
          committedBeforeKill: false,
          pendingAtKill: false,
          pendingAtRelease: false,
          resolved: false,
          rows: 0,
        };
        const result = client
          .mutation(api.markers.insert, { trial: trial.trial })
          .then(() => {
            trial.resolved = true;
          });
        if (trial.delayMs > 0) await sleep(trial.delayMs);
        await backend.kill();
        trial.pendingAtKill = !trial.resolved;
        await backend.restart();
        trial.committedBeforeKill =
          ((await markerRows(backend)).get(trial.trial) ?? 0) > 0;
        trial.pendingAtRelease = !trial.resolved;
        held.release();
        await within(result, `${trial.trial} to resolve`, 15000).catch(
          () => undefined,
        );
        trial.rows = (await markerRows(backend)).get(trial.trial) ?? 0;
        restarted.push(trial);
        await client.close();
      }
      world.trials = restarted;
      measure(
        "trials",
        restarted.map((trial) => ({ ...trial })),
      );
      measure("restartSummary", {
        trials: restarted.length,
        resolvedAfterRestart: restarted.filter(resolvedAfterRestart).length,
        resolvedBeforeRelease: restarted.filter(
          (trial) => !trial.pendingAtRelease,
        ).length,
        killedBeforeCommit: restarted.filter(
          (trial) => !trial.committedBeforeKill,
        ).length,
        killedAfterCommit: restarted.filter(
          (trial) => trial.committedBeforeKill,
        ).length,
        rowCounts: restarted.map((trial) => trial.rows),
      });
    },
  "the mutation's promise resolves after the restart in {resolvedTrials} trials":
    (world, { resolvedTrials }) => {
      const trials = required(world.trials, "the trials");
      // A promise that resolved before the kill, or before the release, did not resolve after
      // the restart, and does not count.
      expect(
        trials.filter(resolvedAfterRestart).length,
        JSON.stringify(trials),
      ).toBe(resolvedTrials);
    },
  "every trial leaves exactly {markerRows} marker row": (
    world,
    { markerRows },
  ) => {
    for (const trial of required(world.trials, "the trials"))
      expect(trial.rows, JSON.stringify(trial)).toBe(markerRows);
  },
  "at least {leastKilledBeforeCommit} trial was killed before its commit and at least {leastKilledAfterCommit} after it":
    (world, { leastKilledBeforeCommit, leastKilledAfterCommit }) => {
      const trials = required(world.trials, "the trials");
      expect(
        trials.filter((trial) => !trial.committedBeforeKill).length,
        JSON.stringify(trials),
      ).toBeGreaterThanOrEqual(leastKilledBeforeCommit);
      expect(
        trials.filter((trial) => trial.committedBeforeKill).length,
        JSON.stringify(trials),
      ).toBeGreaterThanOrEqual(leastKilledAfterCommit);
    },
});
