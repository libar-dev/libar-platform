import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe7FreshImportContract as contract } from "../../generated/contracts/facts.f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import.contract.js";
import { schedulingBackend } from "./scheduler-composition.js";
import type { SchedulerWorld } from "./scheduler-cases.js";
import { freshImport } from "./scheduler-restore.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import",
  ),
  verifies: ref(
    "spec:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import",
  ),
});
void anchor;
bindExample(contract, (): SchedulerWorld => ({}), {
  "the production composition with temporary scheduler functions": async (
    world,
  ) => {
    Object.assign(world, await schedulingBackend());
  },
  "the native backend exercises fresh-import": async (world) => {
    world.result = await freshImport(world.backend!, world.directory!);
  },
  "the observation is {result}": (world, { result }) => {
    expect(world.result).toBe(result);
  },
});
