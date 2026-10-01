import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe4NestedCallSharesLimitsContract as contract } from "../../generated/contracts/facts.f13-transactions-have-limits.probe-4-nested-call-shares-limits.contract.js";
import {
  seedLimits,
  readTogether,
  assertTogether,
  readAlone,
  writeLimits,
} from "./shared-limits.js";
import type { LimitsWorld } from "./shared-limits.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f13-transactions-have-limits.probe-4-nested-call-shares-limits",
  ),
  verifies: ref(
    "spec:facts.f13-transactions-have-limits.probe-4-nested-call-shares-limits",
  ),
});
void anchor;
type World = LimitsWorld;
bindExample(contract, (): World => ({}), {
  "documents of {documentSize} each, {parentDocuments} that a parent mutation reads and {childDocuments} more that a nested query reads":
    async (world, { documentSize, parentDocuments, childDocuments }) =>
      seedLimits(
        world,
        documentSize,
        parentDocuments,
        childDocuments,
        "nested",
      ),
  "a client calls the parent mutation, which reads its documents and then calls the nested query through ctx.runQuery":
    async (world) => readTogether(world),
  "the call {together}": (world, { together }) =>
    assertTogether(world, together),
  "the parent reading alone {parentAlone} and the nested query called alone {childAlone}":
    async (world, { parentAlone, childAlone }) =>
      readAlone(world, parentAlone, childAlone),
  "the same split of bytes written by a parent mutation and a nested mutation {writesTogether}":
    async (world, { writesTogether }) => writeLimits(world, writesTogether),
});
