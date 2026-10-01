import { makeFunctionReference } from "convex/server";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { httpClient } from "../../harness/clients.js";
import { backend, client, fixture } from "./world.js";
import type { World } from "./world.js";
import { ordinaryClientRefusedInternalFunctionContract } from "../../generated/contracts/platform.acceptance-contract.ordinary-client-refused-internal-function.contract.js";
const anchor = specTest({
  id: testAnchorId("test:platform.ordinary-client-refused-internal-function"),
  verifies: ref(
    "spec:platform.acceptance-contract.ordinary-client-refused-internal-function",
  ),
});
void anchor;
bindExample(ordinaryClientRefusedInternalFunctionContract, (): World => ({}), {
  "a disposable backend running the fixture composition, which registers an internal mutation that writes one row":
    (world) => fixture(world),
  "an ordinary client carrying a token the harness signed for subject {subject}":
    async (world, { subject }) => {
      world.client = httpClient(
        backend(world).url,
        await backend(world).identity.token(subject),
      );
    },
  "the client calls the internal mutation by name": async (world) => {
    try {
      await client(world).mutation(
        makeFunctionReference<"mutation">("inspection:writeInternal"),
        {},
      );
    } catch (error) {
      world.error = error;
    }
  },
  "Convex refuses the call {refused}": async (world, { refused }) => {
    expect(world.error !== undefined).toBe(refused);
    expect(String(world.error)).toContain("Could not find public function");
    await expect(
      httpClient(backend(world).url).mutation(
        makeFunctionReference<"mutation">("inspection:writeInternal"),
        {},
      ),
    ).rejects.toThrow("Could not find public function");
  },
  "the row the internal mutation writes is stored {stored}": async (
    world,
    { stored },
  ) => {
    const rows = await backend(world).readTable("writes");
    expect(rows.length > 0).toBe(stored);
    expect(rows).toHaveLength(0);
  },
});
