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
import { ordinaryClientRefusedComponentFunctionContract } from "../../generated/contracts/platform.native-harness.ordinary-client-refused-component-function.contract.js";
const anchor = specTest({
  id: testAnchorId("test:platform.ordinary-client-refused-component-function"),
  verifies: ref(
    "spec:platform.native-harness.ordinary-client-refused-component-function",
  ),
});
void anchor;
bindExample(ordinaryClientRefusedComponentFunctionContract, (): World => ({}), {
  "a disposable backend running the fixture composition, which mounts a component with a mutation that writes one row":
    (world) => fixture(world),
  "an ordinary client carrying a token the harness signed for subject {subject}":
    async (world, { subject }) => {
      world.client = httpClient(
        backend(world).url,
        await backend(world).identity.token(subject),
      );
    },
  "the client calls the component's mutation directly by component path and name":
    async (world) => {
      try {
        await client(world).function("inspection:write", "probe", {});
      } catch (error) {
        world.error = error;
      }
    },
  "Convex refuses the call {refused}": async (world, { refused }) => {
    expect(world.error !== undefined).toBe(refused);
    expect(String(world.error)).toContain("BadDeployKey");
    await expect(
      httpClient(backend(world).url).function("inspection:write", "probe", {}),
    ).rejects.toThrow("BadDeployKey");
  },
  "the row the component's mutation writes is stored {stored}": async (
    world,
    { stored },
  ) => {
    const rows = await backend(world).readTable("writes", "probe");
    expect(rows.length > 0).toBe(stored);
    expect(rows).toHaveLength(0);
  },
});
