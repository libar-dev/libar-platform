import type { ConvexHttpClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { competingCommandsContract as contract } from "../../generated/contracts/context.context-component.competing-commands.contract.js";
import type { Backend } from "../../harness/backend.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import {
  eventsOf,
  grantedClient,
  inCommitOrder,
  isRetried,
  outcomeOf,
  raceUntilRetried,
  rejectionOf,
  streamRow,
  tenantId,
  type Round,
} from "./context-scenarios.js";
const anchor = specTest({
  id: testAnchorId("test:context.context-component.competing-commands"),
  verifies: ref("spec:context.context-component.competing-commands"),
});
void anchor;
// The fixture composition's ClaimStock command calls the depot's claimStock operation, which plans a
// claim on the product's stock stream with no expected version.
const parent = getFunctionName(api.depotCommands.claimStock);
const maxRounds = 20;
const products = Array.from(
  { length: maxRounds },
  (_, index) => `p-${index + 1}`,
);
interface World {
  backend?: Backend;
  stock?: (productId: string) => Promise<void>;
  clients?: ConvexHttpClient[];
  rounds?: Round[];
}
const rounds = (world: World) => required(world.rounds, "the rounds");
bindExample(contract, (): World => ({}), {
  // Every round's product is stocked the same way before its race.
  "a context component mounted by the parent with a stream at version {version} in state {state}":
    async (world, { version, state }) => {
      expect(state).toBe("stock of 1");
      const backend = await fixtureBackend();
      world.backend = backend;
      const client = await grantedClient(backend, "user-0");
      world.stock = async (productId) => {
        await client.mutation(api.depotCommands.addStock, {
          tenantId,
          input: { lines: [{ productId, quantity: 1 }] },
        });
        const row = required(
          await streamRow(backend, "stock", productId),
          "the stock's stream row",
        );
        expect(row.streamVersion).toBe(version);
        expect(row.state).toEqual({ onHand: 1 });
      };
      await world.stock(required(products[0], "the first product"));
    },
  "{callers} callers send the same kind of command at the same time": async (
    world,
    { callers },
  ) => {
    const backend = required(world.backend, "the backend");
    world.clients = [];
    for (let caller = 1; caller <= callers; caller++)
      world.clients.push(await grantedClient(backend, `user-${caller}`));
  },
  "the parent calls the context operation {operation} through the component API":
    async (world, { operation }) => {
      expect(operation).toBe("claim one unit");
      const backend = required(world.backend, "the backend");
      const clients = required(world.clients, "the clients");
      world.rounds = await raceUntilRetried(backend, parent, {
        keys: products,
        prepare: required(world.stock, "the stocking step"),
        send: (productId) =>
          clients.map((client) =>
            client.mutation(api.depotCommands.claimStock, {
              tenantId,
              input: { lines: [{ productId, quantity: 1 }] },
            }),
          ),
      });
      measure(
        "rounds",
        world.rounds.map((round) => ({
          productId: round.key,
          attempts: round.attempts.map((attempt) => ({
            willRetry: attempt.willRetry ?? null,
            occTable: attempt.occInfo?.tableName ?? null,
            failed: attempt.error !== null,
          })),
        })),
      );
    },
  "the first caller's outcome is {first}": (world, { first }) => {
    for (const round of rounds(world)) {
      const [answer] = inCommitOrder(round);
      expect(outcomeOf(required(answer, "the first answer"))).toBe(first);
    }
  },
  "the second caller's outcome is {second}": (world, { second }) => {
    for (const round of rounds(world)) {
      expect(round.answers).toHaveLength(2);
      const [, answer] = inCommitOrder(round);
      expect(outcomeOf(required(answer, "the second answer"))).toBe(second);
    }
  },
  "the rejection code is {code}": (world, { code }) => {
    for (const round of rounds(world)) {
      const [, answer] = inCommitOrder(round);
      expect(rejectionOf(required(answer, "the second answer"))?.code).toBe(
        code,
      );
      const finals = round.attempts.filter((attempt) => !isRetried(attempt));
      expect(finals[0]?.error).toBeNull();
      expect(finals[1]?.error).toContain(`"code":"${code}"`);
    }
  },
  "the stream version afterwards is {after}": async (world, { after }) => {
    const backend = required(world.backend, "the backend");
    for (const round of rounds(world)) {
      const row = required(
        await streamRow(backend, "stock", round.key),
        "the stock's stream row",
      );
      expect(row.streamVersion).toBe(after);
      expect(row.state).toEqual({ onHand: 0 });
    }
  },
  "the number of events appended is {appended}": async (
    world,
    { appended },
  ) => {
    const backend = required(world.backend, "the backend");
    for (const round of rounds(world)) {
      const stocked = round.before.events.filter(
        (event) => event.streamType === "stock" && event.streamId === round.key,
      ).length;
      const events = await eventsOf(backend, "stock", round.key);
      expect(events.length - stocked).toBe(appended);
      expect(events.slice(stocked)).toMatchObject([
        { eventType: "claimed", streamVersion: 2, payload: { quantity: 1 } },
      ]);
    }
  },
  // The loser's rejection is decide's, and the stock it names is the one the winner left.
  "decide ran against {evaluated}": (world, { evaluated }) => {
    expect(evaluated).toBe("the fresh state");
    for (const round of rounds(world)) {
      const [, answer] = inCommitOrder(round);
      expect(rejectionOf(required(answer, "the second answer"))).toEqual({
        code: "insufficientStock",
        details: { requested: 1, onHand: 0 },
      });
    }
  },
  // The function log shows the engine rerunning a claim after an OCC conflict, and neither caller of
  // that round, nor of any other, received a version conflict or an engine error.
  "the callers saw {saw}": (world, { saw }) => {
    expect(saw).toBe("no engine retry and no version conflict");
    const all = rounds(world);
    const last = required(all.at(-1), "the last round");
    expect(last.attempts.filter(isRetried).length).toBeGreaterThan(0);
    for (const round of all)
      for (const answer of round.answers) {
        expect(["applied", "rejection"]).toContain(outcomeOf(answer));
        expect(rejectionOf(answer)?.code).not.toBe("staleVersion");
      }
  },
});
