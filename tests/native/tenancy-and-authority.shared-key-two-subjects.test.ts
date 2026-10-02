import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { ConvexHttpClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { sharedKeyTwoSubjectsContract as contract } from "../../generated/contracts/command.tenancy-and-authority.shared-key-two-subjects.contract.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, required } from "../../harness/native.js";
import {
  type Answer,
  type Response,
  principalOf,
  settle,
  stored,
  threw,
} from "./tenancy-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:command.tenancy-and-authority.shared-key-two-subjects",
  ),
  verifies: ref("spec:command.tenancy-and-authority.shared-key-two-subjects"),
});
void anchor;
interface World {
  backend?: Backend;
  tenantId?: string;
  principalId?: string;
  client?: ConvexHttpClient;
  grantedLocalId?: string;
  takenKey?: string;
  takenLocalId?: string;
  original?: Response;
  before?: Awaited<ReturnType<typeof stored>>;
  answer?: Answer;
}
async function grant(world: World, principalId: string, streamId: string) {
  const backend = required(world.backend, "backend");
  await backend.admin.run(getFunctionName(internal.grants.grant), {
    tenantId: required(world.tenantId, "tenant"),
    principalKind: "human",
    principalId: principalOf(backend, principalId),
    permission: "depot.documents",
    grantedBy: "operator",
    subject: { contextId: "depot", streamType: "document", streamId },
  });
}
function errorData(world: World) {
  const error = threw(world.answer);
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<Value>).data;
}
bindExample(
  contract,
  (): World => ({}),
  {
    "a tenant {tenantId} whose caller {principalId} holds a grant for the command":
      async (world, { tenantId, principalId }) => {
        const backend = await fixtureBackend();
        Object.assign(world, {
          backend,
          tenantId,
          principalId,
          client: ordinaryClient(backend.url, {
            token: await backend.issuer.token(principalId),
          }),
        });
      },
    "the caller's grant names the subject with local ID {grantedLocalId} and no other":
      async (world, { grantedLocalId }) => {
        await grant(
          world,
          required(world.principalId, "caller"),
          grantedLocalId,
        );
        world.grantedLocalId = grantedLocalId;
      },
    "another caller {otherPrincipalId} of the tenant already applied the receipted command with request key {takenKey} and local ID {takenLocalId}":
      async (world, { otherPrincipalId, takenKey, takenLocalId }) => {
        const backend = required(world.backend, "backend");
        await grant(world, otherPrincipalId, takenLocalId);
        const other = ordinaryClient(backend.url, {
          token: await backend.issuer.token(otherPrincipalId),
        });
        const original = await other.mutation(
          api.depotCommands.createDocument,
          {
            tenantId: required(world.tenantId, "tenant"),
            requestKey: takenKey,
            input: { documentId: takenLocalId, title: "Report" },
          },
        );
        expect(original).toMatchObject({ kind: "applied", replayed: false });
        Object.assign(world, {
          takenKey,
          takenLocalId,
          original,
          before: await stored(backend),
        });
      },
    "the caller's grant is {grant}": async (world, { grant: status }) => {
      expect(status).toBe("still valid");
      const backend = required(world.backend, "backend");
      const grants = (await backend.admin.readTable("grants")).filter(
        (row) =>
          row.principalId ===
          principalOf(backend, required(world.principalId, "caller")),
      );
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({
        subject: { streamId: world.grantedLocalId },
      });
    },
    "the caller sends the receipted command with request key {sentKey} and local ID {sentLocalId}":
      async (world, { sentKey, sentLocalId }) => {
        world.answer = await settle(
          required(world.client, "client").mutation(
            api.depotCommands.createDocument,
            {
              tenantId: required(world.tenantId, "tenant"),
              requestKey: sentKey,
              input: { documentId: sentLocalId, title: "Report" },
            },
          ),
        );
      },
    "the answer is {answer}": (world, { answer }) => {
      expect(answer).toBe("conflict");
      expect(errorData(world)).toMatchObject({
        kind: "rejection",
        code: "idempotencyConflict",
        commandType: "CreateDocument",
      });
      expect.soft(errorData(world)).not.toHaveProperty("details");
    },
    "a stored outcome is disclosed to the caller {disclosed}": (
      world,
      { disclosed },
    ) => {
      expect(disclosed).toBe(false);
      expect
        .soft(JSON.stringify(errorData(world)))
        .not.toContain(
          required(world.original, "original response").operationId,
        );
    },
    "the namespace the server assigned is {namespace}": async (
      world,
      { namespace },
    ) => {
      const receipts = (await stored(required(world.backend, "backend")))
        .receipts;
      expect(receipts.map((row) => row.namespace)).toEqual([namespace]);
    },
  },
  async (world) => {
    const backend = required(world.backend, "backend");
    const denied = await settle(
      required(world.client, "client").mutation(
        api.depotCommands.createDocument,
        {
          tenantId: required(world.tenantId, "tenant"),
          requestKey: "unused-key",
          input: {
            documentId: required(world.takenLocalId, "stored subject"),
            title: "Report",
          },
        },
      ),
    );
    const error = threw(denied);
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<Value>).data).toMatchObject({
      kind: "rejection",
      code: "forbidden",
    });
    const after = await stored(backend);
    expect(after).toEqual(world.before);
    expect(
      after.receipts.filter((row) => row.requestKey === world.takenKey),
    ).toHaveLength(1);
    expect(
      after.streams.some((row) => row.streamId === world.grantedLocalId),
    ).toBe(false);
  },
);
