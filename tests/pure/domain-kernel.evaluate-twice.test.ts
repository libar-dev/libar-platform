import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { evaluateTwiceContract as contract } from "../../generated/contracts/kernel.domain-kernel.evaluate-twice.contract.js";
import type { DecideResult, DomainEvent } from "../../src/kernel/index.js";
import {
  decisionInputs,
  deepFreeze,
  documentFixture,
  observeIo,
  required,
  runIncrementally,
  stockFixture,
  type DecisionInput,
  type KernelFixture,
} from "./domain-kernel.js";
const anchor = specTest({
  id: testAnchorId("test:kernel.domain-kernel.evaluate-twice"),
  verifies: ref("spec:kernel.domain-kernel.evaluate-twice"),
});
void anchor;
interface World<S, C, E extends DomainEvent, R> {
  fixture: KernelFixture<S, C, E, R>;
  state?: S;
  inputs?: DecisionInput<C>[];
  before?: unknown;
  outputs?: [DecideResult<E, R>, DecideResult<E, R>];
  io?: string[];
}
// Once per fixture stream type.
function bindFor<S, C, E extends DomainEvent, R>(
  fixture: KernelFixture<S, C, E, R>,
) {
  bindExample(contract, (): World<S, C, E, R> => ({ fixture }), {
    "a decider whose stream starts from its initial state": (world) => {
      world.state = world.fixture.decider.initial();
    },
    "a sequence of {commands} valid commands, each with its decision context": (
      world,
      { commands },
    ) => {
      world.inputs = decisionInputs(world.fixture, commands);
    },
    "every input is frozen before the kernel runs": (world) => {
      const inputs = { state: world.state, inputs: world.inputs };
      world.before = structuredClone(inputs);
      deepFreeze(inputs);
    },
    "the kernel is exercised as {exercise}": (world, { exercise }) => {
      expect(exercise).toBe("evaluate one decision twice");
      const { decider } = world.fixture;
      const inputs = required(world.inputs, "inputs");
      // The decision is the last command, against the state the earlier ones leave.
      const { state } = runIncrementally(
        decider,
        required(world.state, "state"),
        inputs.slice(0, -1),
      );
      const { command, context } = required(inputs.at(-1), "command");
      const observed = observeIo(
        () =>
          [
            decider.decide(state, command, context),
            decider.decide(state, command, context),
          ] as const,
      );
      world.outputs = [...observed.value];
      world.io = observed.calls;
    },
    "the outputs of the two evaluations are {outputs}": (
      world,
      { outputs },
    ) => {
      const [first, second] = required(world.outputs, "outputs");
      expect(first.kind).toBe("applied");
      if (outputs === "identical") expect(second).toStrictEqual(first);
      else expect(second).not.toStrictEqual(first);
    },
    "the inputs afterwards are {inputs}": (world, { inputs }) => {
      const after = { state: world.state, inputs: world.inputs };
      if (inputs === "unchanged") expect(after).toStrictEqual(world.before);
      else expect(after).not.toStrictEqual(world.before);
    },
    "the number of I/O calls observed is {io}": (world, { io }) => {
      expect(required(world.io, "observed calls")).toHaveLength(io);
    },
  });
}
bindFor(documentFixture);
bindFor(stockFixture);
