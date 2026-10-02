import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { expectTypeOf } from "vitest";
import { brokenArgumentContractFailsBuildContract as contract } from "../../generated/contracts/command.command-declaration.broken-argument-contract-fails-build.contract.js";
import { api } from "../../example/convex/_generated/api.js";
const anchor = specTest({
  id: testAnchorId(
    "test:command.command-declaration.broken-argument-contract-fails-build",
  ),
  verifies: ref(
    "spec:command.command-declaration.broken-argument-contract-fails-build",
  ),
});
void anchor;
// Compiled and never run: the types project hands this file to tsc, starts no backend and runs no
// step. Each step's expectations are type expectations, and a @ts-expect-error line that stops being
// an error fails the compile.
type PlaceOrderArgs = FunctionArgs<typeof api.ordering.placeOrder>;
const line = { stockItemId: "sku-1", quantity: 2, unitPrice: 250 };
bindExample(contract, (): { client?: ConvexHttpClient } => ({}), {
  "a module exporting command {commandName} through the composition helpers":
    () => {
      expectTypeOf(api.ordering.placeOrder).toExtend<
        FunctionReference<"mutation", "public">
      >();
      // The public entry's input is the declaration's input validator.
      expectTypeOf<PlaceOrderArgs["input"]>().toEqualTypeOf<{
        orderId: string;
        lines: { stockItemId: string; quantity: number; unitPrice: number }[];
      }>();
    },
  "a typed caller references it through the generated api": async ({
    client,
  }) => {
    await client?.mutation(api.ordering.placeOrder, {
      tenantId: "t-1",
      input: { orderId: "order-1", lines: [line] },
    });
  },
  // The caller still sends what the contract asked before the change: an input without a field the
  // contract now requires, or a field of the type it no longer has.
  "the change {change} is made": () => {
    expectTypeOf<{ lines: (typeof line)[] }>().not.toExtend<
      PlaceOrderArgs["input"]
    >();
    expectTypeOf<{
      orderId: number;
      lines: (typeof line)[];
    }>().not.toExtend<PlaceOrderArgs["input"]>();
  },
  "the check that fails first is {failsAt}": async ({ client }) => {
    await client?.mutation(api.ordering.placeOrder, {
      tenantId: "t-1",
      // @ts-expect-error The input lacks the required orderId.
      input: { lines: [line] },
    });
    await client?.mutation(api.ordering.placeOrder, {
      tenantId: "t-1",
      // @ts-expect-error A line's quantity is a string where the contract has a number.
      input: { orderId: "order-1", lines: [{ ...line, quantity: "2" }] },
    });
  },
  "it fails {when}": () => {
    // The failures above are the compiler's, in a file no backend ever runs.
  },
});
