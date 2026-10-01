import { ConvexHttpClient } from "convex/browser";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { adminKeyActingAsIdentityReachesInternalFunctionContract as contract } from "../../generated/contracts/platform.native-harness.admin-key-acting-as-identity-reaches-internal-function.contract.js";
import type { Backend } from "../../harness/backend.js";
import { fixtureBackend, required } from "../../harness/native.js";
const anchor = specTest({
  id: testAnchorId(
    "test:platform.native-harness.admin-key-acting-as-identity-reaches-internal-function",
  ),
  verifies: ref(
    "spec:platform.native-harness.admin-key-acting-as-identity-reaches-internal-function",
  ),
});
void anchor;
const target = getFunctionName(internal.notes.addInternal);
interface World {
  backend?: Backend;
  subject?: string;
  client?: ConvexHttpClient;
  outcome?: { returned: unknown } | { threw: unknown };
}
bindExample(contract, (): World => ({}), {
  "a disposable backend running the fixture composition, which registers an internal mutation that writes one row":
    async (world) => {
      world.backend = await fixtureBackend();
    },
  "a client holding the admin key and acting as the identity with subject {subject}":
    (world, { subject }) => {
      const backend = required(world.backend, "the backend");
      const client = new ConvexHttpClient(backend.url);
      // This is the caller the harness rules forbid. It exists in this test only.
      // Convex 1.46.0 implements setAdminAuth and strips it from its declarations.
      (
        client as unknown as {
          setAdminAuth(
            key: string,
            actingAs: { issuer: string; subject: string },
          ): void;
        }
      ).setAdminAuth(backend.adminKey, {
        issuer: backend.issuer.issuer,
        subject,
      });
      world.subject = subject;
      world.client = client;
    },
  "the client calls the internal mutation by name": async (world) => {
    world.outcome = await required(world.client, "the client")
      .mutation(makeFunctionReference<"mutation">(target), {})
      .then(
        (returned: unknown) => ({ returned }),
        (threw: unknown) => ({ threw }),
      );
  },
  "the call returns without an error": (world) => {
    expect(world.outcome).toEqual({ returned: null });
  },
  "the table the internal mutation writes holds {rows} row": async (
    world,
    { rows },
  ) => {
    const backend = required(world.backend, "the backend");
    expect(await backend.admin.readTable("notes")).toHaveLength(rows);
    // Inside a handler this client is the identity it acts as.
    const subject = required(world.subject, "the subject");
    expect(
      await required(world.client, "the client").query(api.identity.caller, {}),
    ).toMatchObject({
      issuer: backend.issuer.issuer,
      subject,
      tokenIdentifier: `${backend.issuer.issuer}|${subject}`,
    });
  },
});
