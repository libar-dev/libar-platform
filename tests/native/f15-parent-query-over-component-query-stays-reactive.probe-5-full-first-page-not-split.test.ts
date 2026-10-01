import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe5FullFirstPageNotSplitContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-full-first-page-not-split.contract.js";
import { firstPageSteps, type FirstPageWorld } from "./first-page-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-full-first-page-not-split",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-full-first-page-not-split",
  ),
});
void anchor;
bindExample(contract, (): FirstPageWorld => ({}), firstPageSteps);
