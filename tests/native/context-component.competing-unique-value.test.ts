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
import { competingUniqueValueContract as contract } from "../../generated/contracts/context.context-component.competing-unique-value.contract.js";
import type { Backend } from "../../harness/backend.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import {
  depotTables,
  eventsOf,
  grantedClient,
  inCommitOrder,
  isRetried,
  outcomeOf,
  raceUntilRetried,
  rejectionOf,
  streamRow,
  tenantId,
  type Answer,
  type Round,
} from "./context-scenarios.js";
const anchor = specTest({
  id: testAnchorId("test:context.context-component.competing-unique-value"),
  verifies: ref("spec:context.context-component.competing-unique-value"),
});
void anchor;
// The fixture composition's RegisterDocument command calls the depot's registerDocuments operation,
// which claims the reference at expected version 0 and then creates the document.
const parent = getFunctionName(api.depotCommands.registerDocument);
const maxRounds = 20;
const references = Array.from(
  { length: maxRounds },
  (_, index) => `ref-${index + 1}`,
);
const documentOf = (reference: string, caller: number) =>
  `${reference}-doc-${caller}`;
interface World {
  backend?: Backend;
  unclaimed?: (reference: string) => Promise<void>;
  clients?: ConvexHttpClient[];
  rounds?: Round[];
}
const rounds = (world: World) => required(world.rounds, "the rounds");
// The document the applied caller registered, from its response.
function winnerOf(round: Round): string {
  const [answer] = inCommitOrder(round);
  const response =
    answer?.kind === "response"
      ? (answer.response as { result: { documentId: string } })
      : undefined;
  return required(response, "the applied response").result.documentId;
}
function loserOf(round: Round): Answer {
  const [, answer] = inCommitOrder(round);
  return required(answer, "the second answer");
}
bindExample(contract, (): World => ({}), {
  // Every round's reference is checked the same way before its race: no stream holds it yet.
  "a context component mounted by the parent with a stream at version {version} in state {state}":
    async (world, { version, state }) => {
      expect(state).toBe("a unique value nobody holds");
      expect(version).toBe(0);
      const backend = await fixtureBackend();
      world.backend = backend;
      world.unclaimed = async (reference) => {
        expect(
          await streamRow(backend, "reference", reference),
        ).toBeUndefined();
        expect(await eventsOf(backend, "reference", reference)).toHaveLength(
          version,
        );
      };
      await world.unclaimed(required(references[0], "the first reference"));
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
      expect(operation).toBe("create a document claiming the unique value");
      const backend = required(world.backend, "the backend");
      const clients = required(world.clients, "the clients");
      world.rounds = await raceUntilRetried(backend, parent, {
        keys: references,
        prepare: required(world.unclaimed, "the unclaimed check"),
        send: (reference) =>
          clients.map((client, index) =>
            client.mutation(api.depotCommands.registerDocument, {
              tenantId,
              input: {
                documentId: documentOf(reference, index + 1),
                reference,
                title: "Report",
              },
            }),
          ),
      });
      measure(
        "rounds",
        world.rounds.map((round) => ({
          reference: round.key,
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
      expect(outcomeOf(loserOf(round))).toBe(second);
    }
  },
  "the rejection code is {code}": (world, { code }) => {
    for (const round of rounds(world)) {
      expect(rejectionOf(loserOf(round))?.code).toBe(code);
      const finals = round.attempts.filter((attempt) => !isRetried(attempt));
      expect(finals[0]?.error).toBeNull();
      expect(finals[1]?.error).toContain(`"code":"${code}"`);
    }
  },
  // The stream of the Given is the reference stream, now held by the winner's document.
  "the stream version afterwards is {after}": async (world, { after }) => {
    const backend = required(world.backend, "the backend");
    for (const round of rounds(world)) {
      const row = required(
        await streamRow(backend, "reference", round.key),
        "the reference's stream row",
      );
      expect(row.streamVersion).toBe(after);
      expect(row.state).toEqual({ holder: winnerOf(round) });
    }
  },
  "the number of events appended is {appended}": async (
    world,
    { appended },
  ) => {
    const backend = required(world.backend, "the backend");
    const { events } = await depotTables(backend);
    let earlier = 0;
    for (const round of rounds(world)) {
      expect(round.before.events.length).toBe(earlier);
      const winner = winnerOf(round);
      const loser = [1, 2]
        .map((caller) => documentOf(round.key, caller))
        .find((documentId) => documentId !== winner);
      const ofRound = events.filter(
        (event) =>
          event.streamId === round.key ||
          event.streamId.startsWith(`${round.key}-`),
      );
      expect(ofRound).toHaveLength(appended);
      expect(await eventsOf(backend, "reference", round.key)).toMatchObject([
        {
          eventType: "referenceClaimed",
          streamVersion: 1,
          payload: { holder: winner },
        },
      ]);
      expect(await eventsOf(backend, "document", winner)).toMatchObject([
        { eventType: "created", streamVersion: 1 },
      ]);
      const loserDocument = required(loser, "the loser's document");
      expect(await eventsOf(backend, "document", loserDocument)).toEqual([]);
      expect(
        await streamRow(backend, "document", loserDocument),
      ).toBeUndefined();
      earlier += appended;
    }
    expect(events).toHaveLength(earlier);
  },
  // The loser's answer is step 3's, from the row its rerun loaded, and not the reference decider's.
  "decide ran against {evaluated}": (world, { evaluated }) => {
    expect(evaluated).toBe("nothing");
    for (const round of rounds(world))
      expect(rejectionOf(loserOf(round))).toEqual({
        code: "entityExists",
        details: { existing: round.key, current: 1 },
      });
  },
  // The function log shows the engine rerunning a registration after an OCC conflict, and neither
  // caller of that round, nor of any other, received a version conflict or an engine error.
  "the callers saw {saw}": (world, { saw }) => {
    expect(saw).toBe("no engine retry and no version conflict");
    const all = rounds(world);
    const last = required(all.at(-1), "the last round");
    expect(last.attempts.filter(isRetried).length).toBeGreaterThan(0);
    for (const round of all)
      for (const answer of round.answers) {
        expect(["applied", "rejection"]).toContain(outcomeOf(answer));
        expect(rejectionOf(answer)?.code).not.toBe("staleVersion");
        expect(rejectionOf(answer)?.code).not.toBe("referenceTaken");
      }
  },
});
