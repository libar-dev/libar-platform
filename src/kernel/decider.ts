// The decider contract of spec:kernel.decider-contract: the shapes a context's pure domain code fits, and its helpers.
import type { Rejection } from "./outcome.js";
// The adapter adds the envelope; a decider returns only these fields.
export type DomainEvent<T extends string = string, P = unknown> = {
  eventType: T;
  eventSchemaVersion: number;
  payload: P;
  occurredAt?: number;
};
// The kernel's structural view of the actor; the command family's Actor is assignable to it.
export type DecisionActor = {
  kind: string;
  id: string;
  onBehalfOf?: { kind: string; id: string };
  delegationRef?: string;
};
// now is milliseconds since the epoch; facts is {} when the parent captured none.
export type DecisionContext = {
  now: number;
  actor: DecisionActor;
  facts: Readonly<Record<string, unknown>>;
};
export type DecideResult<E extends DomainEvent, R> =
  | { kind: "applied"; events: readonly E[]; result: R }
  | { kind: "businessFailure"; events: readonly E[]; result: R }
  | { kind: "rejection"; rejection: Rejection };
export type Invariant<S> = { name: string; holds: (state: S) => boolean };
export type Decider<S, C, E extends DomainEvent, R> = {
  streamType: string;
  initial: () => S;
  decide: (
    state: S,
    command: C,
    context: DecisionContext,
  ) => DecideResult<E, R>;
  evolve: (state: S, event: E) => S;
  invariants?: readonly Invariant<S>[];
};
export type Transitions<
  Status extends string,
  Trigger extends string,
> = Readonly<Record<Status, Readonly<Partial<Record<Trigger, Status>>>>>;
// The only way the next state is computed: evolve applied left to right.
export function fold<S, E>(
  evolve: (state: S, event: E) => S,
  state: S,
  events: readonly E[],
): S {
  let next = state;
  for (const event of events) next = evolve(next, event);
  return next;
}
// start is the state the latest baseline event holds, and events are the events after it.
export function rebuild<S, C, E extends DomainEvent, R>(
  decider: Decider<S, C, E, R>,
  events: readonly E[],
  start?: S,
): S {
  return fold(
    decider.evolve,
    start === undefined ? decider.initial() : start,
    events,
  );
}
// Returns the names of the invariants that do not hold.
export function checkInvariants<S>(
  invariants: readonly Invariant<S>[],
  state: S,
): string[] {
  return invariants
    .filter((invariant) => !invariant.holds(state))
    .map((invariant) => invariant.name);
}
// undefined is an invalid transition, which decide turns into the context's invalidTransition rejection.
export function transition<Status extends string, Trigger extends string>(
  table: Transitions<Status, Trigger>,
  from: Status,
  trigger: Trigger,
): Status | undefined {
  const row = table[from];
  return Object.hasOwn(row, trigger) ? row[trigger] : undefined;
}
