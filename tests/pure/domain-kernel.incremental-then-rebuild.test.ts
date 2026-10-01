import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { incrementalThenRebuildContract as contract } from "../../generated/contracts/kernel.domain-kernel.incremental-then-rebuild.contract.js";
import { rebuild, type DomainEvent } from "../../src/kernel/index.js";
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
  id: testAnchorId("test:kernel.domain-kernel.incremental-then-rebuild"),
  verifies: ref("spec:kernel.domain-kernel.incremental-then-rebuild"),
});
void anchor;
interface World<S, C, E extends DomainEvent, R> {
  fixture: KernelFixture<S, C, E, R>;
  state?: S;
  inputs?: DecisionInput<C>[];
  incremental?: { state: S; events: E[] };
  rebuilt?: S;
  // The events the rebuild handed to evolve, in order.
  applied?: E[];
  io?: string[];
}
// Once per fixture stream type: the rebuild equality is a test for every stream type.
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
      deepFreeze({ state: world.state, inputs: world.inputs });
    },
    "the kernel is exercised as {exercise}": (world, { exercise }) => {
      expect(exercise).toBe(
        "run the commands incrementally then rebuild from the events",
      );
      const { decider } = world.fixture;
      const state = required(world.state, "state");
      const inputs = required(world.inputs, "inputs");
      const applied: E[] = [];
      const watched = {
        ...decider,
        evolve: (from: S, event: E) => {
          applied.push(event);
          return decider.evolve(from, event);
        },
      };
      const observed = observeIo(() => {
        const incremental = runIncrementally(decider, state, inputs);
        return { incremental, rebuilt: rebuild(watched, incremental.events) };
      });
      world.incremental = observed.value.incremental;
      world.rebuilt = observed.value.rebuilt;
      world.applied = applied;
      world.io = observed.calls;
    },
    "the rebuilt business state {rebuilt} the incrementally computed state": (
      world,
      { rebuilt },
    ) => {
      const incremental = required(world.incremental, "incremental run");
      // A rebuild that returned the initial state would equal nothing the commands built.
      expect(incremental.state).not.toStrictEqual(
        world.fixture.decider.initial(),
      );
      if (rebuilt === "equals")
        expect(world.rebuilt).toStrictEqual(incremental.state);
      else expect(world.rebuilt).not.toStrictEqual(incremental.state);
    },
    "the rebuilt stream version is {version}": (world, { version }) => {
      // The version is the count of events the rebuild folded: every recorded event, in order, and
      // no other, which a final state that a later event overwrites cannot show.
      const applied = required(world.applied, "events the rebuild applied");
      expect(applied).toStrictEqual(
        required(world.incremental, "incremental run").events,
      );
      expect(applied).toHaveLength(version);
    },
    "the number of I/O calls observed is {io}": (world, { io }) => {
      expect(required(world.io, "observed calls")).toHaveLength(io);
    },
  });
}
bindFor(documentFixture);
bindFor(stockFixture);
