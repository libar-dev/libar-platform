import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { probe11ComponentCallsContract as contract } from "../../generated/contracts/facts.f19-nested-calls-share-time-budgets.probe-11-component-calls.contract.js";
import {
  prepareBudget,
  reachBudget,
  measureCalls,
  type BudgetWorld,
} from "./call-budget.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f19-nested-calls-share-time-budgets.probe-11-component-calls",
  ),
  verifies: ref(
    "spec:facts.f19-nested-calls-share-time-budgets.probe-11-component-calls",
  ),
});
void anchor;
bindExample(contract, (): BudgetWorld => ({}), {
  "a parent mutation that calls an empty component mutation repeatedly": async (
    world,
  ) => prepareBudget(world, "component"),
  "the client increases the call count until the backend refuses the mutation":
    reachBudget,
  "the error names {budget} time": (world, { budget }) => {
    expect(world.error).toContain(budget);
  },
  "each empty component call reads {reads} and writes {writes} documents":
    async (world, { reads, writes }) => measureCalls(world, reads, writes),
});
