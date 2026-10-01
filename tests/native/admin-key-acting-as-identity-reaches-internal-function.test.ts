import { makeFunctionReference } from "convex/server";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { adminClient } from "../../harness/clients.js";
import { backend, client, fixture } from "./world.js";
import type { World } from "./world.js";
import { adminKeyActingAsIdentityReachesInternalFunctionContract } from "../../generated/contracts/platform.native-harness.admin-key-acting-as-identity-reaches-internal-function.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:platform.admin-key-acting-as-identity-reaches-internal-function",
  ),
  verifies: ref(
    "spec:platform.native-harness.admin-key-acting-as-identity-reaches-internal-function",
  ),
});
void anchor;
bindExample(
  adminKeyActingAsIdentityReachesInternalFunctionContract,
  (): World => ({}),
  {
    "a disposable backend running the fixture composition, which registers an internal mutation that writes one row":
      (world) => fixture(world),
    "a client holding the admin key and acting as the identity with subject {subject}":
      (world, { subject }) => {
        const issuer = backend(world).identity.issuer;
        world.identity = {
          issuer,
          subject,
          tokenIdentifier: `${issuer}|${subject}`,
        };
        world.client = adminClient(
          backend(world).url,
          backend(world).adminKey,
          world.identity,
        );
      },
    "the client calls the internal mutation by name": async (world) => {
      try {
        world.result = await client(world).mutation(
          makeFunctionReference<"mutation">("inspection:writeInternal"),
          {},
        );
      } catch (error) {
        world.error = error;
      }
    },
    "Convex runs the call {runs}": async (world, { runs }) => {
      expect(world.error === undefined && world.result === null).toBe(runs);
      const identity = await client(world).query(api.inspection.identity, {});
      expect(identity).toMatchObject(world.identity!);
    },
    "the row the internal mutation writes is stored {stored}": async (
      world,
      { stored },
    ) => {
      const rows = await backend(world).readTable("writes");
      expect(rows.length === 1).toBe(stored);
      expect(rows[0]).toMatchObject({ marker: "internal" });
    },
  },
);
