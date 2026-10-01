import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe3ComponentCallFromMutationContract as contract } from "../../generated/contracts/facts.f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-mutation.contract.js";
import {
  prepareCost,
  sampleCost,
  assertCost,
  assertRecords,
} from "./read-cost.js";
import type { CostWorld } from "./read-cost.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-mutation",
  ),
  verifies: ref(
    "spec:facts.f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-mutation",
  ),
});
void anchor;
type World = CostWorld;
bindExample(contract, (): World => ({}), {
  "a parent mutation that reads the same document {reads} times in a row through one of three paths: a helper function, a nested query, a component query":
    async (world, { reads }) => prepareCost(world, reads),
  "a client calls the parent mutation once for each path, several times over":
    async (world) => sampleCost(world, "mutation"),
  "the median execution time through the component is {componentAgainstHelper} than through the helper":
    (world, { componentAgainstHelper }) =>
      assertCost(world, componentAgainstHelper),
  "the function log holds {recordsPerCall} completion record for one parent call through the component":
    (world, { recordsPerCall }) => assertRecords(world, recordsPerCall),
});
