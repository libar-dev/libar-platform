import { expectTypeOf, test } from "vitest";
import type {
  AffectedRef,
  CommittedOutcome,
  DecisionActor,
  Outcome,
  Rejection,
  StreamVersion,
} from "../../src/kernel/index.js";
test("compiled: a committed outcome is the applied and business-failure half of the outcome union", () => {
  expectTypeOf<CommittedOutcome<number>["kind"]>().toEqualTypeOf<
    "applied" | "businessFailure"
  >();
  expectTypeOf<Outcome<number>["kind"]>().toEqualTypeOf<
    "applied" | "businessFailure" | "rejection"
  >();
  expectTypeOf<CommittedOutcome<number>>().toExtend<Outcome<number>>();
});
test("compiled: an affected stream is a stream version without its tenant and version", () => {
  expectTypeOf<AffectedRef>().toEqualTypeOf<
    Omit<StreamVersion, "tenantId" | "version">
  >();
});
test("compiled: a rejection's details hold Convex values and nothing else", () => {
  expectTypeOf<{ when: number; ids: string[] }>().toExtend<
    NonNullable<Rejection["details"]>
  >();
  expectTypeOf<{ at: Date }>().not.toExtend<
    NonNullable<Rejection["details"]>
  >();
  expectTypeOf<{ code: string; message: string }>().toExtend<Rejection>();
});
test("compiled: an actor acting for another is a decision actor", () => {
  expectTypeOf<{
    kind: "agent";
    id: string;
    onBehalfOf: { kind: "user"; id: string };
    delegationRef: string;
  }>().toExtend<DecisionActor>();
});
