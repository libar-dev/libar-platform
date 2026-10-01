// The outcome model of spec:kernel.outcome-model. Types only; the validators belong to the context boundary.
import type { Value } from "convex/values";
export type StreamVersion = {
  tenantId: string;
  contextId: string;
  streamType: string;
  streamId: string;
  version: number;
};
// Thrown inside a ConvexError, never returned; details are Convex values so the error always serializes.
export type Rejection = {
  code: string;
  message: string;
  details?: Record<string, Value>;
};
export type Outcome<R> =
  | { kind: "applied"; result: R; versions: StreamVersion[] }
  | { kind: "businessFailure"; result: R; versions: StreamVersion[] }
  | { kind: "rejection"; rejection: Rejection };
// What a context operation returns: a rejection is thrown, so it never travels as a return value.
export type CommittedOutcome<R> = Extract<
  Outcome<R>,
  { kind: "applied" | "businessFailure" }
>;
export type AffectedRef = {
  contextId: string;
  streamType: string;
  streamId: string;
};
