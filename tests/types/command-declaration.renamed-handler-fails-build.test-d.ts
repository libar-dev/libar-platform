import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { ConvexHttpClient } from "convex/browser";
import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
  FunctionType,
} from "convex/server";
import { expectTypeOf } from "vitest";
import { renamedHandlerFailsBuildContract as contract } from "../../generated/contracts/command.command-declaration.renamed-handler-fails-build.contract.js";
import { api, internal } from "../../example/convex/_generated/api.js";
import type * as ordering from "../../example/convex/ordering.js";
const anchor = specTest({
  id: testAnchorId(
    "test:command.command-declaration.renamed-handler-fails-build",
  ),
  verifies: ref("spec:command.command-declaration.renamed-handler-fails-build"),
});
void anchor;
// Compiled and never run: the types project hands this file to tsc, starts no backend and runs no
// step. Each step's expectations are type expectations, and a @ts-expect-error line that stops being
// an error fails the compile.
// ordering.ts after its export placeOrder is renamed submitOrder, and the api the generated
// api.d.ts builds from it, with the same two types it uses.
type RenamedOrdering = Omit<typeof ordering, "placeOrder"> & {
  submitOrder: (typeof ordering)["placeOrder"];
};
type RenamedApi = FilterApi<
  ApiFromModules<{ ordering: RenamedOrdering }>,
  FunctionReference<FunctionType, "public">
>;
const args = {
  tenantId: "t-1",
  requestKey: "k-1",
  input: {
    orderId: "order-1",
    lines: [{ stockItemId: "sku-1", quantity: 2, unitPrice: 250 }],
  },
};
bindExample(contract, (): { client?: ConvexHttpClient } => ({}), {
  "a module exporting command {commandName} through the composition helpers":
    () => {
      expectTypeOf(api.ordering.placeOrder).toExtend<
        FunctionReference<"mutation", "public">
      >();
      expectTypeOf(internal.ordering.placeOrderInternal).toExtend<
        FunctionReference<"mutation", "internal">
      >();
    },
  "a typed caller references it through the generated api": async ({
    client,
  }) => {
    const response = await client?.mutation(api.ordering.placeOrder, args);
    if (response?.replayed === false)
      expectTypeOf(response.result).toEqualTypeOf<{
        orderId: string;
        lineCount: number;
        total: number;
      }>();
  },
  "the change {change} is made": () => {
    expectTypeOf<keyof RenamedApi["ordering"]>().toEqualTypeOf<"submitOrder">();
  },
  "the check that fails first is {failsAt}": async ({ client }) => {
    // @ts-expect-error The caller's reference names an export the module no longer has.
    await client?.mutation(({} as RenamedApi).ordering.placeOrder, args);
    // @ts-expect-error The generated api of the module as it is has no submitOrder.
    void api.ordering.submitOrder;
  },
  "it fails {when}": () => {
    // The failure above is the compiler's, in a file no backend ever runs.
  },
});
