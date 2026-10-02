import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { probe9NestedTimeContract as contract } from "../../generated/contracts/facts.f19-nested-calls-share-time-budgets.probe-9-nested-time.contract.js";
import {
  prepareBudget,
  reachBudget,
  computeBudget,
  type BudgetWorld,
} from "./call-budget.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f19-nested-calls-share-time-budgets.probe-9-nested-time",
  ),
  verifies: ref(
    "spec:facts.f19-nested-calls-share-time-budgets.probe-9-nested-time",
  ),
});
void anchor;
bindExample(contract, (): BudgetWorld => ({}), {
  "a parent mutation that calls an empty nested mutation repeatedly": async (
    world,
  ) => prepareBudget(world, "nested"),
  "the client increases the call count until the backend refuses the mutation":
    reachBudget,
  "the error names {budget} time": (world, { budget }) => {
    expect(world.error).toContain(budget);
  },
  "a direct computation fails with {cpu} time": async (world, { cpu }) =>
    computeBudget(world, cpu),
});
