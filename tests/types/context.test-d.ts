import type { Infer } from "convex/values";
import { expectTypeOf, test } from "vitest";
import {
  actorKindValidator,
  actorValidator,
  callerNamespaceValidator,
  type Actor,
  type ActorKind,
  type CallerNamespace,
} from "../../src/command/actor-and-scope.js";
import {
  causedByValidator,
  eventEnvelopeValidator,
  operationRefValidator,
  type CausedBy,
  type EventEnvelope,
  type OperationRef,
  type OperationArgs,
  type OperationOutcome,
} from "../../src/context/index.js";
import type { DecisionActor } from "../../src/kernel/index.js";
test("compiled: each validator infers exactly its pinned type", () => {
  expectTypeOf<Infer<typeof actorKindValidator>>().toEqualTypeOf<ActorKind>();
  expectTypeOf<Infer<typeof actorValidator>>().toEqualTypeOf<Actor>();
  expectTypeOf<
    Infer<typeof callerNamespaceValidator>
  >().toEqualTypeOf<CallerNamespace>();
  expectTypeOf<Infer<typeof causedByValidator>>().toEqualTypeOf<CausedBy>();
  expectTypeOf<
    Infer<typeof operationRefValidator>
  >().toEqualTypeOf<OperationRef>();
  expectTypeOf<Infer<typeof eventEnvelopeValidator>>().toEqualTypeOf<
    EventEnvelope<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  >();
});
test("compiled: the command family's actor is a decision actor", () => {
  expectTypeOf<Actor>().toExtend<DecisionActor>();
});
test("compiled: an operation's outcome is the kernel's committed outcome with its streams", () => {
  expectTypeOf<OperationOutcome<number>["kind"]>().toEqualTypeOf<
    "applied" | "businessFailure"
  >();
  expectTypeOf<OperationArgs<{ lines: string[] }>["input"]>().toEqualTypeOf<{
    lines: string[];
  }>();
});
