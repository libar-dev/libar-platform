import type { ConvexHttpClient } from "convex/browser";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { internal } from "../../fixture/convex/_generated/api.js";
import { ordinaryClientRefusedInternalFunctionContract as contract } from "../../generated/contracts/platform.native-harness.ordinary-client-refused-internal-function.contract.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, required } from "../../harness/native.js";
const anchor = specTest({
  id: testAnchorId(
    "test:platform.native-harness.ordinary-client-refused-internal-function",
  ),
  verifies: ref(
    "spec:platform.native-harness.ordinary-client-refused-internal-function",
  ),
});
void anchor;
// The refused call and the admin call name the same function.
const target = getFunctionName(internal.notes.addInternal);
const callByName = (client: ConvexHttpClient) =>
  client.mutation(makeFunctionReference<"mutation">(target), {});
interface World {
  backend?: Backend;
  client?: ConvexHttpClient;
  error?: unknown;
}
bindExample(contract, (): World => ({}), {
  "a disposable backend running the fixture composition, which registers an internal mutation that writes one row":
    async (world) => {
      world.backend = await fixtureBackend();
    },
  "an ordinary client carrying a token the harness signed for subject {subject}":
    async (world, { subject }) => {
      const backend = required(world.backend, "the backend");
      world.client = ordinaryClient(backend.url, {
        token: await backend.issuer.token(subject),
      });
    },
  "the client calls the internal mutation by name": async (world) => {
    world.error = await callByName(required(world.client, "the client")).then(
      () => undefined,
      (error: unknown) => error,
    );
  },
  "the call fails with an error whose text holds {refusal}": async (
    world,
    { refusal },
  ) => {
    expect(world.error).toBeInstanceOf(Error);
    expect(String(world.error)).toContain(refusal);
    expect(String(world.error)).toContain(target);
    const noToken = ordinaryClient(required(world.backend, "the backend").url);
    await expect(callByName(noToken)).rejects.toThrow(refusal);
  },
  "the table the internal mutation writes holds {rowsAfterRefusal} rows":
    async (world, { rowsAfterRefusal }) => {
      const { admin } = required(world.backend, "the backend");
      expect(await admin.readTable("notes")).toHaveLength(rowsAfterRefusal);
    },
  "the same mutation called with the harness's admin access writes {rowsAfterAdminCall} row":
    async (world, { rowsAfterAdminCall }) => {
      const { admin } = required(world.backend, "the backend");
      await admin.run(target);
      const rows = await admin.readTable("notes");
      expect(rows).toHaveLength(rowsAfterAdminCall);
      expect(rows[0]).toMatchObject({ source: "internal" });
    },
});
