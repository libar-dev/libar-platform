import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { describe } from "vitest";
import { firstActivationMakesReadModelWritableContract as contract } from "../../generated/contracts/application.generation-registry.first-activation-makes-read-model-writable.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.generation-registry.first-activation-makes-read-model-writable",
  ),
  verifies: ref(
    "spec:application.generation-registry.first-activation-makes-read-model-writable",
  ),
});
void anchor;
// A read model is installed through its first rebuild: startGeneration, its batches and
// switchGeneration. The rebuild is not built, so the example is bound to its steps and skipped, and
// each step throws until the rebuild's build fills it in.
const notBuilt = (step: string): never => {
  throw new Error(`Not built: ${step}`);
};
type World = Record<string, never>;
describe.skip("the first rebuild installs a read model", () => {
  bindExample(contract, (): World => ({}), {
    "a read model with {generationRows} generation rows and {orders} subjects that already have history":
      () => notBuilt("a read model with history and no generation row"),
    "an operator starts a generation, its batches finish and the operator switches it":
      () => notBuilt("startGeneration, its batches and switchGeneration"),
    "generation {generation} of the read model is {state}": () =>
      notBuilt("the generation row after the switch"),
    "the read model holds {rows} rows for the subjects that existed before it":
      () => notBuilt("the rows of the subjects that existed before"),
    "a second start while generation 1 is being built is {second}": () =>
      notBuilt("the refusal of a second start"),
  });
});
