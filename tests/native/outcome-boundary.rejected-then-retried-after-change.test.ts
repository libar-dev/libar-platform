import type { ConvexHttpClient } from "convex/browser";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { rejectedThenRetriedAfterChangeContract as contract } from "../../generated/contracts/command.outcome-boundary.rejected-then-retried-after-change.contract.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, required } from "../../harness/native.js";
const anchor = specTest({
  id: testAnchorId(
    "test:command.outcome-boundary.rejected-then-retried-after-change",
  ),
  verifies: ref(
    "spec:command.outcome-boundary.rejected-then-retried-after-change",
  ),
});
void anchor;
// The fixture's stock commands on one product in one tenant, sent by an ordinary client with a grant.
const tenantId = "t-1";
const subject = "user-1";
const productId = "p-1";
const lines = (quantity: number) => ({ lines: [{ productId, quantity }] });
// The command the example rejects and retries: one unit claimed against the stock on hand.
const claimOne = lines(1);
type StockResponse = FunctionReturnType<typeof api.depotCommands.claimStock>;
interface World {
  backend?: Backend;
  client?: ConvexHttpClient;
  requestKey?: string;
  // The operation ID of every call that applied, in order.
  applied: string[];
  firstError?: unknown;
  receiptsAfterFirstRun?: Record<string, Value>[];
  retry?: { returned: StockResponse } | { threw: unknown };
}
async function send(
  world: World,
  command: "addStock" | "claimStock",
  quantity: number,
) {
  const client = required(world.client, "the client");
  const response = await client.mutation(api.depotCommands[command], {
    tenantId,
    input: lines(quantity),
  });
  world.applied.push(response.operationId);
  return response;
}
async function streamRow(backend: Backend) {
  const rows = (
    await backend.admin.readTable("streams", { component: "depot" })
  ).filter((row) => row.tenantId === tenantId && row.streamId === productId);
  expect(rows).toHaveLength(1);
  return required(rows[0], "the stock stream");
}
async function receiptsFor(backend: Backend, requestKey: string) {
  return (await backend.admin.readTable("receipts")).filter(
    (receipt) =>
      receipt.tenantId === tenantId && receipt.requestKey === requestKey,
  );
}
async function journal(backend: Backend) {
  return (await backend.admin.readTable("events", { component: "depot" }))
    .filter((event) => event.tenantId === tenantId)
    .filter((event) => event.streamId === productId);
}
function retried(world: World): StockResponse {
  const retry = required(world.retry, "the retry");
  if (!("returned" in retry))
    throw new Error(`The retry threw: ${String(retry.threw)}`);
  return retry.returned;
}
bindExample(
  contract,
  (): World => ({ applied: [] }),
  {
    // Unreceipted stock commands bring the stream to the version with nothing on hand: three to an odd
    // version, then one unit added and claimed per two versions.
    "a receipted command with request key {requestKey} against a stream at version {version}":
      async (world, { requestKey, version }) => {
        const backend = await fixtureBackend();
        await backend.admin.run(getFunctionName(internal.grants.grant), {
          tenantId,
          principalKind: "human",
          principalId: `${backend.issuer.issuer}|${subject}`,
          permission: permissions.stock,
          grantedBy: "native-test",
        });
        Object.assign(world, {
          backend,
          requestKey,
          client: ordinaryClient(backend.url, {
            token: await backend.issuer.token(subject),
          }),
        });
        if (version === 1 || !Number.isSafeInteger(version) || version < 0)
          throw new Error(`No stock stream stands empty at version ${version}`);
        if (version % 2 === 1) {
          await send(world, "addStock", 2);
          await send(world, "claimStock", 1);
          await send(world, "claimStock", 1);
        }
        while (world.applied.length < version) {
          await send(world, "addStock", 1);
          await send(world, "claimStock", 1);
        }
        expect(await streamRow(backend)).toMatchObject({
          streamVersion: version,
          state: { onHand: 0 },
        });
      },
    // The test keeps the thrown error for the verification bullets; the caller acts as if it never came.
    "the command is rejected on its first run and the response is lost": async (
      world,
    ) => {
      const backend = required(world.backend, "the backend");
      const requestKey = required(world.requestKey, "the request key");
      const client = required(world.client, "the client");
      world.firstError = await client
        .mutation(api.depotCommands.claimStock, {
          tenantId,
          requestKey,
          input: claimOne,
        })
        .then(
          (response) => {
            throw new Error(
              `The first run applied at ${JSON.stringify(response.versions)}`,
            );
          },
          (error: unknown) => error,
        );
      world.receiptsAfterFirstRun = await receiptsFor(backend, requestKey);
    },
    "the stream then advances to version {newVersion} by another command":
      async (world, { newVersion }) => {
        const restock = await send(world, "addStock", 1);
        expect(restock.versions.map((version) => version.version)).toEqual([
          newVersion,
        ]);
      },
    "the caller retries the same command with the same key and input": async (
      world,
    ) => {
      const client = required(world.client, "the client");
      world.retry = await client
        .mutation(api.depotCommands.claimStock, {
          tenantId,
          requestKey: required(world.requestKey, "the request key"),
          input: claimOne,
        })
        .then(
          (returned) => ({ returned }),
          (threw: unknown) => ({ threw }),
        );
    },
    // A stock command decides against the version it loaded and appends one event, so the version it
    // ran against is one below the version it returns.
    "the retry runs against version {ranAgainst} and the outcome is {outcome}":
      async (world, { ranAgainst, outcome }) => {
        const backend = required(world.backend, "the backend");
        if (outcome === "applied") {
          const response = retried(world);
          expect(response.kind).toBe("applied");
          world.applied.push(response.operationId);
          expect(response.versions.map((version) => version.version)).toEqual([
            ranAgainst + 1,
          ]);
          return;
        }
        const retry = required(world.retry, "the retry");
        expect("threw" in retry && retry.threw).toBeInstanceOf(ConvexError);
        expect(await streamRow(backend)).toMatchObject({
          streamVersion: ranAgainst,
        });
      },
    // A record of the first attempt is a receipt for the key that is not the retry's, or a journal event
    // that no applied call wrote.
    "a receipt or record of the first attempt exists {firstAttemptRecorded}":
      async (world, { firstAttemptRecorded }) => {
        const backend = required(world.backend, "the backend");
        const requestKey = required(world.requestKey, "the request key");
        const retry = required(world.retry, "the retry");
        const retryId =
          "returned" in retry ? retry.returned.operationId : undefined;
        const receipts = (await receiptsFor(backend, requestKey)).filter(
          (receipt) => receipt.operationId !== retryId,
        );
        const events = (await journal(backend)).filter(
          (event) => !world.applied.includes(event.operationId as string),
        );
        expect([...receipts, ...events].length > 0).toBe(firstAttemptRecorded);
      },
  },
  async (world) => {
    // The verification bullets.
    const backend = required(world.backend, "the backend");
    const requestKey = required(world.requestKey, "the request key");
    expect(world.firstError).toBeInstanceOf(ConvexError);
    expect((world.firstError as ConvexError<Value>).data).toMatchObject({
      kind: "rejection",
      code: "insufficientStock",
      commandType: "ClaimStock",
    });
    expect(world.receiptsAfterFirstRun).toEqual([]);
    const response = retried(world);
    expect(response.replayed).toBe(false);
    expect(await receiptsFor(backend, requestKey)).toMatchObject([
      { operationId: response.operationId, outcome: "applied" },
    ]);
    expect(response.versions).toMatchObject([
      { streamId: productId, version: 7 },
    ]);
    const events = await journal(backend);
    expect(events.map((event) => event.streamVersion)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(events.map((event) => event.operationId)).toEqual(world.applied);
  },
);
