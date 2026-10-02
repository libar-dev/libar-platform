import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe7InPlaceImportContract as contract } from "../../generated/contracts/facts.f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import.contract.js";
import { schedulingBackend } from "./scheduler-composition.js";
import type { SchedulerWorld } from "./scheduler-cases.js";
import { inPlaceImport } from "./scheduler-restore.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import",
  ),
  verifies: ref(
    "spec:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import",
  ),
});
void anchor;
bindExample(contract, (): SchedulerWorld => ({}), {
  "the production composition with temporary scheduler functions": async (
    world,
  ) => {
    Object.assign(world, await schedulingBackend());
  },
  "the native backend exercises in-place-import": async (world) => {
    world.result = await inPlaceImport(world.backend!, world.directory!);
  },
  "the observation is {result}": (world, { result }) => {
    expect(world.result).toBe(result);
  },
});
