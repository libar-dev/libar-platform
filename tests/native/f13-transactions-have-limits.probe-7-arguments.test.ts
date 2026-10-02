import { expect, vi } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe7ArgumentsContract as contract } from "../../generated/contracts/facts.f13-transactions-have-limits.probe-7-arguments.contract.js";
import { schedulingBackend } from "./scheduler-composition.js";
import { argumentsCase, type SchedulerWorld } from "./scheduler-cases.js";
const anchor = specTest({
  id: testAnchorId("test:facts.f13-transactions-have-limits.probe-7-arguments"),
  verifies: ref("spec:facts.f13-transactions-have-limits.probe-7-arguments"),
});
void anchor;
vi.setConfig({ testTimeout: 300000 });
bindExample(contract, (): SchedulerWorld => ({}), {
  "the production composition with temporary scheduler functions": async (
    world,
  ) => {
    Object.assign(world, await schedulingBackend());
  },
  "the native backend exercises arguments": async (world) => {
    world.result = await argumentsCase(world.backend!);
  },
  "the observation is {result}": (world, { result }) => {
    expect(world.result).toBe(result);
  },
});
