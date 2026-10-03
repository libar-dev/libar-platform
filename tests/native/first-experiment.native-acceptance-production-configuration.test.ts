import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { ConvexHttpClient } from "convex/browser";
import {
  getFunctionName,
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { ESLint } from "eslint";
import { join } from "node:path";
import { expect } from "vitest";
import { api, internal } from "../../example/convex/_generated/api.js";
import { nativeAcceptanceProductionConfigurationContract as contract } from "../../generated/contracts/application.first-experiment.native-acceptance-production-configuration.contract.js";
import type { CompletionRecord } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { required } from "../../harness/native.js";
import {
  application,
  configurationIs,
  placeOrderIdentifier,
  tenantId,
} from "./first-experiment-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.first-experiment.native-acceptance-production-configuration",
  ),
  verifies: ref(
    "spec:application.first-experiment.native-acceptance-production-configuration",
  ),
});
void anchor;
const root = join(import.meta.dirname, "../..");
// The production composition's internal functions, which only trusted server code and admin access
// reach.
const internalFunctions = [
  internal.ordering.placeOrderInternal,
  internal.receiving.receiveStockInternal,
  internal.grants.grant,
  internal.grants.revoke,
  internal.rebuild.startGeneration,
  internal.rebuild.switchGeneration,
].map((reference) => getFunctionName(reference));
type Answer = { returned: unknown } | { threw: unknown };
interface AcceptanceWorld {
  backend?: Backend;
  client?: ConvexHttpClient;
  answers?: Record<string, Answer>;
  log?: CompletionRecord[];
}
const answer = (promise: Promise<unknown>): Promise<Answer> =>
  promise.then(
    (returned) => ({ returned }),
    (threw: unknown) => ({ threw }),
  );
function returned(answers: Record<string, Answer>, name: string): unknown {
  const found = required(answers[name], name);
  if (!("returned" in found))
    throw new Error(`${name} threw: ${String(found.threw)}`);
  return found.returned;
}
function thrown(answers: Record<string, Answer>, name: string): unknown {
  const found = required(answers[name], name);
  if (!("threw" in found))
    throw new Error(`${name} returned ${JSON.stringify(found.returned)}`);
  return found.threw;
}
const dataOf = (error: unknown) => {
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<Value>).data;
};
// A small end-to-end path through the production composition's entry points, as an ordinary client
// meets them: commands applied and rejected, the parent queries answered and refused, and the internal
// functions named directly.
async function endToEndPath(world: AcceptanceWorld) {
  const backend = required(world.backend, "the backend");
  const client = required(world.client, "the client");
  const stranger = ordinaryClient(backend.url, {
    token: await backend.issuer.token("user-2"),
  });
  const anonymous = ordinaryClient(backend.url);
  const line = { stockItemId: "sku-1", quantity: 2, unitPrice: 150 };
  const mark = await backend.admin.logMark();
  const answers: Record<string, Answer> = {};
  answers["receiveStock"] = await answer(
    client.mutation(api.receiving.receiveStock, {
      tenantId,
      input: { items: [{ stockItemId: "sku-1", quantity: 2 }] },
    }),
  );
  answers["placeOrder"] = await answer(
    client.mutation(api.ordering.placeOrder, {
      tenantId,
      requestKey: "k-1",
      input: { orderId: "order-1", lines: [line] },
    }),
  );
  answers["placeOrder short of stock"] = await answer(
    client.mutation(api.ordering.placeOrder, {
      tenantId,
      requestKey: "k-2",
      input: { orderId: "order-2", lines: [{ ...line, quantity: 1 }] },
    }),
  );
  answers["placeOrder without a grant"] = await answer(
    stranger.mutation(api.ordering.placeOrder, {
      tenantId,
      requestKey: "k-3",
      input: { orderId: "order-3", lines: [line] },
    }),
  );
  const getArgs = { tenantId, orderId: "order-1" };
  answers["getOrder"] = await answer(
    client.query(api.orderQueries.getOrder, getArgs),
  );
  answers["getOrder without an identity"] = await answer(
    anonymous.query(api.orderQueries.getOrder, getArgs),
  );
  answers["getOrder without a grant"] = await answer(
    stranger.query(api.orderQueries.getOrder, getArgs),
  );
  answers["listOrders"] = await answer(
    client.query(api.orderQueries.listOrders, {
      tenantId,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  );
  for (const name of internalFunctions)
    answers[name] = await answer(
      client.mutation(
        makeFunctionReference<"mutation">(name) as FunctionReference<
          "mutation",
          "public",
          Record<string, Value>,
          Value
        >,
        {},
      ),
    );
  // Last, so its record closes the log the test reads.
  answers["listOrderSummaries"] = await answer(
    client.query(api.readModels.listOrderSummaries, {
      tenantId,
      status: "placed",
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  );
  const last = getFunctionName(api.readModels.listOrderSummaries);
  world.answers = answers;
  world.log = await backend.admin.completionsSince(mark, (records) =>
    records.some((record) => record.identifier === last),
  );
}
// Authority: who may do what is the production composition's own grants and entry points.
function authorityHolds(world: AcceptanceWorld) {
  const answers = required(world.answers, "the path's answers");
  expect(returned(answers, "receiveStock")).toMatchObject({
    kind: "applied",
  });
  expect(returned(answers, "placeOrder")).toMatchObject({
    kind: "applied",
    result: { orderId: "order-1", lineCount: 1, total: 300 },
  });
  expect(dataOf(thrown(answers, "placeOrder short of stock"))).toMatchObject({
    kind: "rejection",
    code: "insufficientStock",
    commandType: "PlaceOrder",
  });
  expect(dataOf(thrown(answers, "placeOrder without a grant"))).toMatchObject({
    kind: "rejection",
    code: "forbidden",
    commandType: "PlaceOrder",
  });
  expect(returned(answers, "getOrder")).toMatchObject({
    orderId: "order-1",
    status: "placed",
    total: 300,
  });
  expect(dataOf(thrown(answers, "getOrder without an identity"))).toMatchObject(
    { kind: "rejection", code: "unauthenticated", commandType: "getOrder" },
  );
  expect(dataOf(thrown(answers, "getOrder without a grant"))).toMatchObject({
    kind: "rejection",
    code: "forbidden",
    commandType: "getOrder",
  });
  expect(returned(answers, "listOrders")).toMatchObject({
    page: [{ orderId: "order-1" }],
    isDone: true,
  });
  expect(returned(answers, "listOrderSummaries")).toMatchObject({
    page: [{ key: "order-1", status: "placed", lineCount: 1, total: 300 }],
  });
  for (const name of internalFunctions) {
    const error = thrown(answers, name);
    expect(error).not.toBeInstanceOf(ConvexError);
    expect(String(error)).toContain(
      `Could not find public function for '${name}'`,
    );
  }
}
// Schemas: the applied order's documents are stored in the production schema's tables, and the
// refused calls stored nothing.
async function schemasHold(world: AcceptanceWorld) {
  const backend = required(world.backend, "the backend");
  const answers = required(world.answers, "the path's answers");
  const { operationId } = returned(answers, "placeOrder") as {
    operationId: string;
  };
  expect(await backend.admin.readTable("receipts")).toMatchObject([
    { tenantId, requestKey: "k-1", operationId },
  ]);
  expect(
    await backend.admin.readTable("streams", { component: "orders" }),
  ).toMatchObject([
    { tenantId, contextId: "orders", streamType: "order", streamId: "order-1" },
  ]);
  expect(
    await backend.admin.readTable("streams", { component: "inventory" }),
  ).toMatchObject([
    {
      tenantId,
      contextId: "inventory",
      streamType: "stockItem",
      streamId: "sku-1",
      state: { onHand: 2, allocated: 2 },
    },
  ]);
  expect(await backend.admin.readTable("orderSummaries")).toMatchObject([
    { tenantId, key: "order-1", status: "placed" },
  ]);
}
// Code path: every call of the path ran as one top-level execution of the function it named, and no
// other function ran: no job, no action, no function a test added.
function codePathHolds(world: AcceptanceWorld) {
  const answers = required(world.answers, "the path's answers");
  const log = required(world.log, "the function log");
  expect(log.every((record) => record.componentPath === null)).toBe(true);
  expect(
    log.every(
      (record) => record.udfType === "Query" || record.udfType === "Mutation",
    ),
  ).toBe(true);
  const called = new Set([
    getFunctionName(api.receiving.receiveStock),
    placeOrderIdentifier,
    getFunctionName(api.orderQueries.getOrder),
    getFunctionName(api.orderQueries.listOrders),
    getFunctionName(api.readModels.listOrderSummaries),
    ...internalFunctions,
  ]);
  expect(log.filter((record) => !called.has(record.identifier))).toEqual([]);
  expect(new Set(log.map((record) => record.requestId)).size).toBe(log.length);
  expect(log).toHaveLength(Object.keys(answers).length);
  // A refused internal function read nothing.
  for (const name of internalFunctions)
    expect(
      log.find((record) => record.identifier === name)?.usageStats[
        "databaseReadDocuments"
      ],
    ).toBe(0);
}
bindExample(
  contract,
  (): AcceptanceWorld => ({}),
  {
    "the production composition on a native backend": (world) =>
      application(world),
    "the backend runs with {configuration}": (world, { configuration }) =>
      configurationIs(world, configuration),
    "{run} runs": async (world, { run }) => {
      if (run !== "the end-to-end path")
        throw new Error(`This example runs the end-to-end path, not ${run}`);
      await endToEndPath(world);
    },
    "authority, schemas and code path {parity}": async (world, { parity }) => {
      if (parity !== "match a release")
        throw new Error(`The harness deploys nothing that may ${parity}`);
      authorityHolds(world);
      await schemasHold(world);
      codePathHolds(world);
    },
  },
  // The verification bullets.
  async (world) => {
    const backend = required(world.backend, "the backend");
    expect(backend.facts()).toMatchObject({
      composition: "production",
      identitySource: { kind: "fixture issuer", issuer: backend.issuer.issuer },
    });
    // The check that needs no backend: no module of the production composition imports test code.
    const results = await new ESLint({ cwd: root }).lintFiles([
      "example/**/*.ts",
    ]);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.flatMap((result) =>
        result.messages
          .filter((message) => message.ruleId === "production/no-test-code")
          .map((message) => `${result.filePath}: ${message.message}`),
      ),
    ).toEqual([]);
  },
);
