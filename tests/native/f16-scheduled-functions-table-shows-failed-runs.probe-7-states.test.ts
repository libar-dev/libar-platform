import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe7StatesContract as contract } from "../../generated/contracts/facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-states.contract.js";
import { schedulingBackend } from "./scheduler-composition.js";
import { statesCase, type SchedulerWorld } from "./scheduler-cases.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-states",
  ),
  verifies: ref(
    "spec:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-states",
  ),
});
void anchor;
bindExample(contract, (): SchedulerWorld => ({}), {
  "the production composition with temporary scheduler functions": async (
    world,
  ) => {
    Object.assign(world, await schedulingBackend());
  },
  "the native backend exercises states": async (world) => {
    world.result = await statesCase(world.backend!);
  },
  "the observation is {result}": (world, { result }) => {
    expect(world.result).toBe(result);
  },
});
