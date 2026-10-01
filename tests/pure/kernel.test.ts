import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { expect, test, vi } from "vitest";
import {
  checkInvariants,
  fold,
  rebuild,
  transition,
  type Decider,
  type DomainEvent,
  type Transitions,
} from "../../src/kernel/index.js";
// Binds the kernel under src/kernel/ to its contract. The kernel imports no package at run time,
// so it cannot carry the anchor itself; its unit tests carry it for it.
const anchor = codeAnchor({
  id: codeAnchorId("impl:kernel.decider-contract"),
  label: "the domain kernel in src/kernel",
  satisfies: ref("spec:kernel.decider-contract"),
});
void anchor;
type Added = DomainEvent<"added", { amount: number }>;
function counter(initial: number): Decider<number, number, Added, null> {
  return {
    streamType: "counter",
    initial: vi.fn(() => initial),
    decide: (_state, amount) => ({
      kind: "applied",
      events: [
        { eventType: "added", eventSchemaVersion: 1, payload: { amount } },
      ],
      result: null,
    }),
    evolve: (state, event) => state + event.payload.amount,
  };
}
const added = (amount: number): Added => ({
  eventType: "added",
  eventSchemaVersion: 1,
  payload: { amount },
});

test("pure: fold applies evolve to each event from left to right", () => {
  expect(
    fold((state: string, event: string) => state + event, ">", ["a", "b", "c"]),
  ).toBe(">abc");
});

test("pure: fold over no events returns the state it was given", () => {
  const state = { onHand: 3 };
  expect(fold(() => ({ onHand: 0 }), state, [])).toBe(state);
});

test("pure: rebuild without a start folds from initial()", () => {
  const decider = counter(10);
  expect(rebuild(decider, [added(1), added(2)])).toBe(13);
  expect(decider.initial).toHaveBeenCalledTimes(1);
});

test("pure: rebuild with a start folds from it and never calls initial()", () => {
  const decider = counter(10);
  expect(rebuild(decider, [added(1), added(2)], 100)).toBe(103);
  // A start that is falsy is still a start.
  expect(rebuild(decider, [added(1)], 0)).toBe(1);
  expect(rebuild(decider, [], 0)).toBe(0);
  expect(decider.initial).not.toHaveBeenCalled();
});

type Light = "red" | "green" | "off";
type Signal = "go" | "stop" | "power";
const lights: Transitions<Light, Signal> = {
  red: { go: "green", power: "off" },
  green: { stop: "red", power: "off" },
  off: {},
};

test("pure: transition returns the status the table names for a trigger", () => {
  expect(transition(lights, "red", "go")).toBe("green");
  expect(transition(lights, "green", "stop")).toBe("red");
  expect(transition(lights, "green", "power")).toBe("off");
});

test("pure: transition returns undefined for a trigger the status has no entry for", () => {
  expect(transition(lights, "red", "stop")).toBeUndefined();
  expect(transition(lights, "off", "go")).toBeUndefined();
  // A trigger named like an inherited property is still absent from the table.
  expect(transition(lights, "red", "toString" as Signal)).toBeUndefined();
  expect(transition(lights, "red", "constructor" as Signal)).toBeUndefined();
});

test("pure: checkInvariants returns the names of the invariants that do not hold, in declared order", () => {
  const invariants = [
    { name: "positive", holds: (n: number) => n > 0 },
    { name: "even", holds: (n: number) => n % 2 === 0 },
    { name: "small", holds: (n: number) => n < 10 },
  ];
  expect(checkInvariants(invariants, 4)).toEqual([]);
  expect(checkInvariants(invariants, 3)).toEqual(["even"]);
  expect(checkInvariants(invariants, -11)).toEqual(["positive", "even"]);
  expect(checkInvariants([], -1)).toEqual([]);
});
