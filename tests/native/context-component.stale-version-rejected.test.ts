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
import { failIfDecidedMessage } from "../../fixture/convex/depot/streams.js";
import { staleVersionRejectedContract as contract } from "../../generated/contracts/context.context-component.stale-version-rejected.contract.js";
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
  id: testAnchorId("test:context.context-component.stale-version-rejected"),
  verifies: ref("spec:context.context-component.stale-version-rejected"),
});
void anchor;
// The fixture composition's AmendDocument command names the version its caller reviewed, and the
// depot's amendDocuments operation plans the amend at that expected version.
const documentId = "doc-1";
const parent = getFunctionName(api.depotCommands.amendDocument);
interface World {
  backend?: Backend;
  client?: ConvexHttpClient;
  reviewed?: number;
  callers?: number;
  before?: Awaited<ReturnType<typeof depotTables>>;
  mark?: LogMark;
  answers?: Answer[];
}
bindExample(contract, (): World => ({}), {
  // Created at version 1, amended up to the version before last, then submitted.
  "a context component mounted by the parent with a stream at version {version} in state {state}":
    async (world, { version, state }) => {
      expect(state).toBe("submitted");
      const backend = await fixtureBackend();
      world.backend = backend;
      const client = await grantedClient(backend, "user-1");
      world.client = client;
      await client.mutation(api.depotCommands.createDocument, {
        tenantId,
        input: { documentId, title: "Report" },
      });
      for (let amended = 2; amended < version; amended++)
        await client.mutation(api.depotCommands.amendDocument, {
          tenantId,
          input: { documentId, title: `Report, draft ${amended}` },
        });
      await client.mutation(api.depotCommands.submitDocument, {
        tenantId,
        input: { documentId },
      });
      const row = required(
        await streamRow(backend, "document", documentId),
        "the document's stream row",
      );
      expect(row.streamVersion).toBe(version);
      expect(row.state.status).toBe(state);
      world.before = await depotTables(backend);
    },
  "the caller last reviewed the stream at version {reviewed}": (
    world,
    { reviewed },
  ) => {
    world.reviewed = reviewed;
  },
  "{callers} callers send the same kind of command at the same time": (
    world,
    { callers },
  ) => {
    world.callers = callers;
  },
  "the parent calls the context operation {operation} through the component API":
    async (world, { operation }) => {
      expect(operation).toBe("amend naming the reviewed version");
      const backend = required(world.backend, "the backend");
      const client = required(world.client, "the client");
      expect(world.callers).toBe(1);
      world.mark = await backend.admin.logMark();
      world.answers = [
        await answerOf(
          client.mutation(api.depotCommands.amendDocument, {
            tenantId,
            input: {
              documentId,
              title: "Report, as reviewed",
              expectedVersion: required(world.reviewed, "the reviewed version"),
            },
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
    const before = required(world.before, "the tables before the call");
    expect(rejectionOf(required(answer, "the first answer"))).toEqual({
      code,
      details: {
        expected: world.reviewed,
        current: before.streams[0]?.streamVersion,
      },
    });
  },
  "the stream version afterwards is {after}": async (world, { after }) => {
    const backend = required(world.backend, "the backend");
    const row = required(
      await streamRow(backend, "document", documentId),
      "the document's stream row",
    );
    expect(row.streamVersion).toBe(after);
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
  // The fixture's FailIfDecided command, whose decide throws a plain Error if it is reached, sent
  // the same way: naming the reviewed version it gets the same answer as the amend, and naming the
  // current version it fails with that Error, so the answer comes before decide.
  "decide ran against {evaluated}": async (world, { evaluated }) => {
    expect(evaluated).toBe("nothing");
    const backend = required(world.backend, "the backend");
    const client = required(world.client, "the client");
    const before = required(world.before, "the tables before the call");
    const [amend] = required(world.answers, "the answers");
    const failIfDecided = (expectedVersion: number) =>
      answerOf(
        client.mutation(api.depotCommands.failIfDecided, {
          tenantId,
          input: { documentId, expectedVersion },
        }),
      );
    const atReviewed = await failIfDecided(
      required(world.reviewed, "the reviewed version"),
    );
    expect(rejectionOf(atReviewed)).toEqual(
      rejectionOf(required(amend, "the first answer")),
    );
    const atCurrent = await failIfDecided(
      required(before.streams[0], "the stored row").streamVersion,
    );
    expect(outcomeOf(atCurrent)).toBe("other");
    expect(atCurrent.kind === "error" && String(atCurrent.error)).toContain(
      failIfDecidedMessage,
    );
    expect(await depotTables(backend)).toEqual(before);
  },
  "the callers saw {saw}": async (world, { saw }) => {
    expect(saw).toBe("a version conflict and no engine retry");
    const [answer] = required(world.answers, "the answers");
    expect(rejectionOf(required(answer, "the first answer"))?.code).toBe(
      "staleVersion",
    );
    // The amend's one attempt in the function log was final, with no OCC conflict behind it.
    const attempts = await attemptsSince(
      required(world.backend, "the backend"),
      required(world.mark, "the log mark"),
      parent,
      1,
    );
    expect(attempts).toHaveLength(1);
    expect(attempts.filter(isRetried)).toEqual([]);
    expect(attempts[0]?.occInfo ?? null).toBeNull();
    expect(attempts[0]?.error).toContain('"code":"staleVersion"');
  },
});
