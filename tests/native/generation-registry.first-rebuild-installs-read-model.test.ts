import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { getFunctionName } from "convex/server";
import type { ConvexHttpClient } from "convex/browser";
import { expect, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { readPermission } from "../../fixture/convex/readModels.js";
import { firstRebuildInstallsReadModelContract as contract } from "../../generated/contracts/application.generation-registry.first-rebuild-installs-read-model.contract.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, required } from "../../harness/native.js";
import { giveGrant } from "./tenancy-steps.js";
import {
  generationEntry,
  generations,
  waitForGeneration,
} from "./rebuild-install.js";

const anchor = specTest({
  id: testAnchorId(
    "test:application.generation-registry.first-rebuild-installs-read-model",
  ),
  verifies: ref(
    "spec:application.generation-registry.first-rebuild-installs-read-model",
  ),
});
void anchor;
const operator = "document installer";
const tenantId = "documents";
interface World {
  backend?: Backend;
  client?: ConvexHttpClient;
  generationId?: string;
  second?: string;
  documentIds: string[];
}
async function prepare(world: World, count: number) {
  const backend = await fixtureBackend();
  await giveGrant(backend, tenantId, "writer");
  await backend.admin.run(getFunctionName(internal.grants.grant), {
    tenantId,
    principalKind: "human",
    principalId: `${backend.issuer.issuer}|writer`,
    permission: readPermission,
    grantedBy: operator,
  });
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token("writer"),
  });
  Object.assign(world, { backend, client });
  for (let i = 0; i < count; i++) {
    const documentId = `document-${i}`;
    const result = await client.mutation(api.depotCommands.createDocument, {
      tenantId,
      input: { documentId, title: documentId },
    });
    // generation-registry.first-rebuild-installs-read-model.sdp.md:29: CreateDocument needs no read model.
    expect(result.kind).toBe("applied");
    world.documentIds.push(documentId);
  }
}
function list(world: World) {
  return required(world.client, "the caller").query(
    api.readModels.listDocumentSummaries,
    {
      tenantId,
      status: "draft",
      paginationOpts: { cursor: null, numItems: 10 },
    },
  );
}
export async function plainNativeMessage(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    return (
      String(error).split("Uncaught Error: ")[1]?.split("\n")[0] ??
      String(error)
    );
  }
  throw new Error("Expected a plain error");
}
async function rebuild(world: World) {
  const backend = required(world.backend, "the backend");
  // rebuild.sdp.md:123: park the batch so the building row can be observed without a scheduler race.
  await backend.admin.run(getFunctionName(internal.gate.closeGate), {
    scopeKey: `tenant:${tenantId}`,
    reason: "observe the first generation",
    operator,
  });
  const generationId = await backend.admin.run(
    getFunctionName(internal.rebuild.startGeneration),
    {
      readModel: "documentSummary",
      operator,
    },
  );
  if (typeof generationId !== "string")
    throw new Error("Expected a generation ID");
  world.generationId = generationId;
  const entries = await generations(backend, "documentSummary");
  // generation-registry.first-rebuild-installs-read-model.sdp.md:29: one building generation with the latest version and stated operator.
  expect(entries.map(({ generation }) => generation)).toMatchObject([
    {
      _id: generationId,
      generation: 1,
      state: "building",
      projectionVersion: 1,
      startedBy: operator,
    },
  ]);
  // generation-registry.first-rebuild-installs-read-model.sdp.md:29: exactly one generation row.
  expect(entries).toHaveLength(1);
  world.second = await plainNativeMessage(
    backend.admin.run(getFunctionName(internal.rebuild.startGeneration), {
      readModel: "documentSummary",
      operator,
    }),
  );
  // generation-registry.first-rebuild-installs-read-model.sdp.md:30; rebuild.sdp.md:115: exact in-flight refusal.
  expect(world.second).toBe(
    "Read model documentSummary already has generation 1 in building",
  );
  // generation-registry.first-rebuild-installs-read-model.sdp.md:30: the refused start adds no row.
  expect(await backend.admin.readTable("generations")).toEqual(
    entries.map(({ generation }) => generation),
  );
  // Let the scheduled batch park before reopening the gate.
  await waitForGeneration(
    backend,
    "documentSummary",
    generationId,
    ({ progress }) =>
      progress.lastError ===
      `write paused for tenant:${tenantId}: observe the first generation`,
  );
  await backend.admin.run(getFunctionName(internal.gate.resumeGate), {
    scopeKey: `tenant:${tenantId}`,
    operator,
  });
  await backend.admin.run(getFunctionName(internal.rebuild.resumeGeneration), {
    generationId,
    operator,
  });
  const verified = await waitForGeneration(
    backend,
    "documentSummary",
    generationId,
  );
  // generation-registry.first-rebuild-installs-read-model.sdp.md:31: verified still has no active generation.
  expect(await plainNativeMessage(list(world))).toBe(
    "The read model documentSummary has no active generation",
  );
  if (world.documentIds.length === 0) {
    // generation-registry.first-rebuild-installs-read-model.sdp.md:32: one empty tenant takes one backfill and one verify batch.
    expect(verified.progress).toMatchObject({ pass: "idle", batchesDone: 2 });
  }
  await backend.admin.run(getFunctionName(internal.rebuild.switchGeneration), {
    generationId,
    operator,
  });
  // generation-registry.first-rebuild-installs-read-model.sdp.md:31: the first switch retires no generation.
  expect(
    (await generations(backend, "documentSummary")).filter(
      ({ generation }) => generation.state === "retired",
    ),
  ).toEqual([]);
}
bindExample(contract, (): World => ({ documentIds: [] }), {
  "a read model with {generationRows} generation rows and {orders} subjects that already have history":
    async (world, { generationRows, orders }) => {
      await prepare(world, orders);
      // generation-registry.first-rebuild-installs-read-model.sdp.md:29: history exists before the first generation.
      expect(
        await required(world.backend, "the backend").admin.readTable(
          "generations",
        ),
      ).toHaveLength(generationRows);
    },
  "an operator starts a generation, its batches finish and the operator switches it":
    rebuild,
  "generation {generation} of the read model is {state}": async (
    world,
    { generation, state },
  ) => {
    const entry = await generationEntry(
      required(world.backend, "the backend"),
      "documentSummary",
      required(world.generationId, "the generation"),
    );
    // generation-registry.first-rebuild-installs-read-model.sdp.md:31: first switch makes generation 1 active.
    expect(entry.generation).toMatchObject({ generation, state });
  },
  "the read model holds {rows} rows for the subjects that existed before it":
    async (world, { rows }) => {
      const page = await list(world);
      // generation-registry.first-rebuild-installs-read-model.sdp.md:31: all three prior documents appear under draft status.
      expect(
        page.page.map(({ documentId, status }) => ({ documentId, status })),
      ).toEqual(
        world.documentIds.map((documentId) => ({
          documentId,
          status: "draft",
        })),
      );
      // generation-registry.first-rebuild-installs-read-model.sdp.md:31: the list returns three documents.
      expect(page.page).toHaveLength(rows);
    },
  "a second start while generation 1 is being built is {second}": (world) => {
    // generation-registry.first-rebuild-installs-read-model.sdp.md:30: the second start is refused during building.
    expect(world.second).toBe(
      "Read model documentSummary already has generation 1 in building",
    );
  },
});
test("native: the first rebuild installs an empty read model in two batches", async () => {
  const world: World = { documentIds: [] };
  await prepare(world, 0);
  await rebuild(world);
  // generation-registry.first-rebuild-installs-read-model.sdp.md:32: the same sequence serves the empty tenant.
  expect((await list(world)).page).toEqual([]);
});
