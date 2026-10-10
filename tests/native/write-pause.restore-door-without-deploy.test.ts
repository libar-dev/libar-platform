import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { restoreDoorWithoutDeployContract as contract } from "../../generated/contracts/application.write-pause.restore-door-without-deploy.contract.js";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, required } from "../../harness/native.js";
const anchor = specTest({
  id: testAnchorId("test:application.write-pause.restore-door-without-deploy"),
  verifies: ref("spec:application.write-pause.restore-door-without-deploy"),
});
void anchor;
// The restore door is the deployment's MAINTENANCE_MODE, changed through the admin API with no deploy
// between the change and the next call. The fixture's CreateDocument is the write.
type Client = ReturnType<typeof ordinaryClient>;
interface World {
  backend?: Backend;
  callers?: { tenantId: string; client: Client }[];
  receiptsBefore?: number;
}
const create = (client: Client, tenantId: string, key: string) =>
  client.mutation(api.depotCommands.createDocument, {
    tenantId,
    requestKey: key,
    input: { documentId: key, title: "Report" },
  });
const internalCreate = (backend: Backend) =>
  backend.admin.run(
    getFunctionName(internal.depotCommands.createDocumentInternal),
    {
      tenantId: "t-1",
      namespace: "worker",
      actor: { kind: "service", id: "svc-1" },
      requestKey: "internal-1",
      input: { documentId: "internal-1", title: "Report" },
    },
  );
async function thrownData(promise: Promise<unknown>): Promise<Value> {
  const error = await promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<Value>).data;
}
const paused = (message: string) => ({
  kind: "transient",
  code: "writePaused",
  message,
});
const getGate = (backend: Backend) =>
  backend.admin.run(getFunctionName(internal.gate.getGate), {});
bindExample(contract, (): World => ({}), {
  "a disposable backend running the fixture composition, where a caller in each of {tenants} tenants holds a grant and one command has applied":
    async (world, { tenants }) => {
      const backend = await fixtureBackend();
      world.backend = backend;
      const grant = (
        tenantId: string,
        principalKind: "human" | "service",
        principalId: string,
      ) =>
        backend.admin.run(getFunctionName(internal.grants.grant), {
          tenantId,
          principalKind,
          principalId,
          permission: permissions.documents,
          grantedBy: "native-test",
        });
      world.callers = [];
      for (let n = 1; n <= tenants; n += 1) {
        const tenantId = `t-${n}`;
        await grant(tenantId, "human", `${backend.issuer.issuer}|user-${n}`);
        world.callers.push({
          tenantId,
          client: ordinaryClient(backend.url, {
            token: await backend.issuer.token(`user-${n}`),
          }),
        });
      }
      // Authorization, step 4, precedes the gate, step 7: the internal entry's actor holds a grant.
      await grant("t-1", "service", "svc-1");
      const [first] = world.callers;
      expect(
        await create(required(first, "a caller").client, "t-1", "before"),
      ).toMatchObject({ kind: "applied" });
      world.receiptsBefore = (await backend.admin.readTable("receipts")).length;
    },
  "an operator sets the environment variable MAINTENANCE_MODE to {value} with admin access and deploys nothing":
    async (world, { value }) => {
      await required(world.backend, "the backend").admin.setEnvironment({
        MAINTENANCE_MODE: value,
      });
    },
  "each tenant's next command is refused with the message {message}": async (
    world,
    { message },
  ) => {
    for (const { tenantId, client } of required(world.callers, "the callers"))
      expect(await thrownData(create(client, tenantId, "door"))).toEqual(
        paused(message),
      );
  },
  "the internal entry is refused with the same message {internalRefused}":
    async (world, { internalRefused }) => {
      expect(internalRefused).toBe(true);
      expect(
        await thrownData(internalCreate(required(world.backend, "backend"))),
      ).toEqual(paused("write paused for all: restore"));
    },
  "the gate read by getGate answers restore {restore}": async (
    world,
    { restore },
  ) => {
    expect(await getGate(required(world.backend, "the backend"))).toEqual({
      restore,
      closed: [],
    });
  },
  "once the variable is set to {reopen} each refused request key applies {applied}":
    async (world, { reopen, applied }) => {
      const backend = required(world.backend, "the backend");
      expect(applied).toBe(true);
      // Nothing of the refused calls was stored while the door was closed.
      expect(await backend.admin.readTable("receipts")).toHaveLength(
        required(world.receiptsBefore, "the receipts before"),
      );
      // Only the exact value closes the door.
      await backend.admin.setEnvironment({ MAINTENANCE_MODE: "Restore" });
      expect(await getGate(backend)).toEqual({ restore: false, closed: [] });
      await backend.admin.setEnvironment({ MAINTENANCE_MODE: reopen });
      for (const { tenantId, client } of required(world.callers, "callers"))
        expect(await create(client, tenantId, "door")).toMatchObject({
          kind: "applied",
          replayed: false,
        });
      expect(await internalCreate(backend)).toMatchObject({ kind: "applied" });
    },
});
