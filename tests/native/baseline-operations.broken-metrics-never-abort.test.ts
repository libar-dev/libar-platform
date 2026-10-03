import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { brokenMetricsNeverAbortContract as contract } from "../../generated/contracts/operations.baseline-operations.broken-metrics-never-abort.contract.js";
import {
  prepare,
  select,
  run,
  assertResult,
  assertFailure,
  sendControl,
  type BaselineOperationsWorld,
} from "./baseline-operations-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:operations.baseline-operations.broken-metrics-never-abort",
  ),
  verifies: ref(
    "spec:operations.baseline-operations.broken-metrics-never-abort",
  ),
});
void anchor;
bindExample(
  contract,
  (): BaselineOperationsWorld => ({}),
  {
    "a valid command whose use case emits diagnostics and writes {audit}":
      async (world, { audit }) => prepare(world, audit),
    "the {subsystem} subsystem is broken by fault injection": (
      world,
      { subsystem },
    ) => select(world, subsystem),
    "the command runs": async (world) => run(world),
    "the command {result}": async (world, { result }) =>
      assertResult(world, result),
    "the failure is {surfaced}": async (world, { surfaced }) =>
      assertFailure(world, surfaced),
  },
  sendControl,
);
