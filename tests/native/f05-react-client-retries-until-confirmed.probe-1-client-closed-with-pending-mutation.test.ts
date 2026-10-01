import { setTimeout as sleep } from "node:timers/promises";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { probe1ClientClosedWithPendingMutationContract as contract } from "../../generated/contracts/facts.f05-react-client-retries-until-confirmed.probe-1-client-closed-with-pending-mutation.contract.js";
import type { Backend } from "../../harness/backend.js";
import { heldWebSocket, ordinarySocketClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { connected, markerRows } from "./marker-rows.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f05-react-client-retries-until-confirmed.probe-1-client-closed-with-pending-mutation",
  ),
  verifies: ref(
    "spec:facts.f05-react-client-retries-until-confirmed.probe-1-client-closed-with-pending-mutation",
  ),
});
void anchor;
interface Trial {
  trial: string;
  // Milliseconds between the send and the close.
  gapMs: number;
  // Whether the client received the mutation's result.
  confirmed: boolean;
  rows: number;
}
interface World {
  backend?: Backend;
  trials?: Trial[];
}
bindExample(contract, (): World => ({}), {
  "a WebSocket client, the ConvexClient of convex/browser, that sends a mutation which inserts one marker row":
    async (world) => {
      const backend = await fixtureBackend();
      world.backend = backend;
      // Left open, such a client gets its result and leaves one row.
      const client = ordinarySocketClient(backend.url);
      await client.mutation(api.markers.insert, { trial: "left open" });
      await client.close();
      expect((await markerRows(backend)).get("left open")).toBe(1);
    },
  "the client is closed before the mutation's result reaches it, in each of {trials} trials":
    async (world, { trials }) => {
      const backend = required(world.backend, "the backend");
      const closed: Trial[] = [];
      for (let index = 0; index < trials; index++) {
        const held = heldWebSocket();
        const client = ordinarySocketClient(backend.url, {
          webSocket: held.WebSocket,
        });
        await connected(client);
        // From here no response reaches the client, so the mutation stays pending until the close.
        held.holdResponses();
        const trial: Trial = {
          trial: `closed ${index}`,
          gapMs: index % 6,
          confirmed: false,
          rows: 0,
        };
        void client.mutation(api.markers.insert, { trial: trial.trial }).then(
          () => {
            trial.confirmed = true;
          },
          () => undefined,
        );
        if (trial.gapMs > 0) await sleep(trial.gapMs);
        await client.close();
        closed.push(trial);
      }
      // A closed client reports nothing more, so there is no event to wait for. Give the backend
      // time to finish what it had received, then read once.
      await sleep(500);
      const rows = await markerRows(backend);
      for (const trial of closed) trial.rows = rows.get(trial.trial) ?? 0;
      world.trials = closed;
      measure(
        "trials",
        closed.map((trial) => ({ ...trial })),
      );
      measure("closedClientSummary", {
        trials: closed.length,
        confirmed: closed.filter((trial) => trial.confirmed).length,
        noRow: closed.filter((trial) => trial.rows === 0).length,
        oneRow: closed.filter((trial) => trial.rows === 1).length,
      });
    },
  "no trial leaves more than {mostMarkerRows} marker row": (
    world,
    { mostMarkerRows },
  ) => {
    for (const trial of required(world.trials, "the trials"))
      expect(trial.rows, JSON.stringify(trial)).toBeLessThanOrEqual(
        mostMarkerRows,
      );
  },
  "at least {leastCommittedUnconfirmed} trial leaves its row although its client never received the result":
    (world, { leastCommittedUnconfirmed }) => {
      const trials = required(world.trials, "the trials");
      // Every close came with the mutation pending.
      expect(trials.filter((trial) => trial.confirmed)).toEqual([]);
      expect(
        trials.filter((trial) => trial.rows > 0).length,
        JSON.stringify(trials),
      ).toBeGreaterThanOrEqual(leastCommittedUnconfirmed);
    },
});
