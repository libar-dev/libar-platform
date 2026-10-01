// The outcome boundary of spec:command.outcome-boundary: the wire shape of a rejection and of a
// transient refusal, the helpers that throw them, and the one rethrow at the pipeline's outermost level.
import { ConvexError, v } from "convex/values";
import { validate } from "convex-helpers/validators";
import { rejectionValidator } from "../context/outcome.js";
import type { Rejection } from "../kernel/index.js";
export type PlatformRejectionCode =
  | "invalidInput"
  | "unauthenticated"
  | "forbidden"
  | "idempotencyConflict"
  | "staleVersion"
  | "entityExists"
  | "operationTooLarge"
  | "unsupportedContractVersion";
// The Spec names DomainRejectionCode without declaring it. A command's domain codes are the strings its
// declaration lists in rejections, so the union is a parameter here, open by default.
export type RejectionCode<Domain extends string = string> =
  PlatformRejectionCode | Domain;
export type TransientCode = "rateLimited" | "capacity" | "writePaused";
export type RejectionData<Domain extends string = string> = Rejection & {
  kind: "rejection";
  code: RejectionCode<Domain>;
  commandType: string;
};
export type TransientData = {
  kind: "transient";
  code: TransientCode;
  message: string;
  retryAfterMs?: number;
};
// code is a string at the validator, because the domain half is closed per declaration.
export const errorDataValidator = v.union(
  v.object({
    kind: v.literal("rejection"),
    code: v.string(),
    message: v.string(),
    commandType: v.string(),
    details: v.optional(v.record(v.string(), v.any())),
  }),
  v.object({
    kind: v.literal("transient"),
    code: v.union(
      v.literal("rateLimited"),
      v.literal("capacity"),
      v.literal("writePaused"),
    ),
    message: v.string(),
    retryAfterMs: v.optional(v.number()),
  }),
);
export function reject(data: Omit<RejectionData, "kind">): never {
  throw new ConvexError<RejectionData>({ kind: "rejection", ...data });
}
export function refuseTransient(data: Omit<TransientData, "kind">): never {
  throw new ConvexError<TransientData>({ kind: "transient", ...data });
}
// Rethrows every error. A bare kernel Rejection, as a context throws it, gains the discriminator and the
// command type; everything else, a ConvexError of this boundary included, passes through unchanged.
export function normalizeThrown(error: unknown, commandType: string): never {
  if (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    !("kind" in error.data) &&
    validate(rejectionValidator, error.data)
  )
    throw new ConvexError<RejectionData>({
      kind: "rejection",
      commandType,
      ...error.data,
    });
  throw error;
}
// For tests and for callers that must tell the kinds apart; the pipeline itself relays every throw.
// A ConvexError whose data does not fit errorDataValidator, a bare kernel Rejection included, is technical.
export function classifyThrown(
  error: unknown,
):
  | { kind: "rejection"; data: RejectionData }
  | { kind: "transient"; data: TransientData }
  | { kind: "technical"; error: unknown } {
  if (error instanceof ConvexError && validate(errorDataValidator, error.data))
    return error.data.kind === "rejection"
      ? { kind: "rejection", data: error.data }
      : { kind: "transient", data: error.data };
  return { kind: "technical", error };
}
