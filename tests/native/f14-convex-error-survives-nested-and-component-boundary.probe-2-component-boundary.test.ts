import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe2ComponentBoundaryContract as contract } from "../../generated/contracts/facts.f14-convex-error-survives-nested-and-component-boundary.probe-2-component-boundary.contract.js";
import {
  prepare,
  parents,
  callParents,
  assertCaught,
  assertPassed,
  assertRows,
} from "./thrown-data.js";
import type { ThrownWorld } from "./thrown-data.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f14-convex-error-survives-nested-and-component-boundary.probe-2-component-boundary",
  ),
  verifies: ref(
    "spec:facts.f14-convex-error-survives-nested-and-component-boundary.probe-2-component-boundary",
  ),
});
void anchor;
type World = ThrownWorld;
bindExample(contract, (): World => ({}), {
  "a mutation inside a component that writes one row and then throws a ConvexError carrying structured data with code {code}":
    async (world, { code }) => prepare(world, code, "annex"),
  "two parent mutations that call it through the component API, one that writes a row of its own, catches the error and returns its data, and one that lets the error pass":
    (world) => parents(world),
  "a client calls each parent": async (world) => callParents(world),
  "the catching parent returns the thrown data unchanged": (world) =>
    assertCaught(world),
  "the client of the other parent reads the thrown data unchanged from the error it receives":
    (world) => assertPassed(world),
  "after the catching parent committed, the component mutation's table holds {childRows} rows and the parent's own table holds {parentRows} row":
    async (world, { childRows, parentRows }) =>
      assertRows(world, childRows, parentRows),
});
