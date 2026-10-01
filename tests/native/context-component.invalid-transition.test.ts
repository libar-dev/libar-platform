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
import { invalidTransitionContract as contract } from "../../generated/contracts/context.context-component.invalid-transition.contract.js";
import type { LogMark } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import { fixtureBackend, required } from "../../harness/native.js";
import {
  answerOf,
  attemptsSince,
  depotTables,
  grantedClient,
  isRetried,
  outcomeOf,
  rejectionOf,
  streamRow,
  tenantId,
  type Answer,
} from "./context-scenarios.js";
const anchor = specTest({
  id: testAnchorId("test:context.context-component.invalid-transition"),
  verifies: ref("spec:context.context-component.invalid-transition"),
});
void anchor;
// The fixture composition's ShipDocument command calls the depot's shipDocuments operation; the
// document stream's transition table has no ship from draft.
const documentId = "doc-1";
const parent = getFunctionName(api.depotCommands.shipDocument);
interface World {
  backend?: Backend;
  client?: ConvexHttpClient;
  callers?: number;
  before?: Awaited<ReturnType<typeof depotTables>>;
  mark?: LogMark;
  answers?: Answer[];
}
bindExample(contract, (): World => ({}), {
  "a context component mounted by the parent with a stream at version {version} in state {state}":
    async (world, { version, state }) => {
      const backend = await fixtureBackend();
      world.backend = backend;
      world.client = await grantedClient(backend, "user-1");
      await world.client.mutation(api.depotCommands.createDocument, {
        tenantId,
        input: { documentId, title: "Report" },
      });
      const row = required(
        await streamRow(backend, "document", documentId),
        "the document's stream row",
      );
      expect(row.streamVersion).toBe(version);
      expect(row.state.status).toBe(state);
      world.before = await depotTables(backend);
    },
  "{callers} callers send the same kind of command at the same time": (
    world,
    { callers },
  ) => {
    world.callers = callers;
  },
  "the parent calls the context operation {operation} through the component API":
    async (world, { operation }) => {
      expect(operation).toBe("ship");
      const backend = required(world.backend, "the backend");
      const client = required(world.client, "the client");
      expect(world.callers).toBe(1);
      world.mark = await backend.admin.logMark();
      world.answers = [
        await answerOf(
          client.mutation(api.depotCommands.shipDocument, {
            tenantId,
            input: { documentId },
          }),
        ),
      ];
    },
  "the first caller's outcome is {first}": (world, { first }) => {
    const [answer] = required(world.answers, "the answers");
    expect(outcomeOf(required(answer, "the first answer"))).toBe(first);
  },
  "the second caller's outcome is {second}": (world, { second }) => {
    expect(second).toBe("absent");
    expect(required(world.answers, "the answers")).toHaveLength(1);
  },
  "the rejection code is {code}": (world, { code }) => {
    const [answer] = required(world.answers, "the answers");
    expect(rejectionOf(required(answer, "the first answer"))).toMatchObject({
      code,
    });
  },
  "the stream version afterwards is {after}": async (world, { after }) => {
    const backend = required(world.backend, "the backend");
    const row = required(
      await streamRow(backend, "document", documentId),
      "the document's stream row",
    );
    expect(row.streamVersion).toBe(after);
    // The row and the events table read exactly as they did before the call.
    expect(await depotTables(backend)).toEqual(world.before);
  },
  "the number of events appended is {appended}": async (
    world,
    { appended },
  ) => {
    const before = required(world.before, "the tables before the call");
    const { events } = await depotTables(
      required(world.backend, "the backend"),
    );
    expect(events.length - before.events.length).toBe(appended);
  },
  "decide ran against {evaluated}": async (world, { evaluated }) => {
    expect(evaluated).toBe("the fresh state");
    const backend = required(world.backend, "the backend");
    const [answer] = required(world.answers, "the answers");
    // The rejection's details are decide's: the status it found is the one stored before the call.
    const stored = required(world.before, "the tables before the call")
      .streams[0];
    expect(rejectionOf(required(answer, "the first answer"))).toEqual({
      code: "invalidTransition",
      details: { from: stored?.state.status, trigger: "ship" },
    });
    // One attempt of the parent mutation, not rerun, failed with that rejection.
    const attempts = await attemptsSince(
      backend,
      required(world.mark, "the log mark"),
      parent,
      1,
    );
    expect(attempts).toHaveLength(1);
    expect(attempts.filter(isRetried)).toEqual([]);
    expect(attempts[0]?.error).toContain('"code":"invalidTransition"');
  },
});
