// The outcome boundary of spec:command.outcome-boundary: the wire shape of a rejection and of a
// transient refusal, the helpers that throw them, and the one rethrow at the pipeline's outermost level.
import { ConvexError, getConvexSize, v } from "convex/values";
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
// The platform codes at run time. A record, so that a code added to the union must be added here too.
const platformRejectionCodes: Readonly<Record<PlatformRejectionCode, true>> = {
  invalidInput: true,
  unauthenticated: true,
  forbidden: true,
  idempotencyConflict: true,
  staleVersion: true,
  entityExists: true,
  operationTooLarge: true,
  unsupportedContractVersion: true,
};
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
// The bound on a rejection's details, measured as Convex measures a value.
const limitDetailsBytes = 16384;
export function reject(data: Omit<RejectionData, "kind">): never {
  if (data.details !== undefined) {
    const bytes = getConvexSize(data.details);
    if (bytes > limitDetailsBytes)
      throw new Error(
        `A ${data.code} rejection of ${data.commandType} carries ${bytes} bytes of details, above ${limitDetailsBytes}`,
      );
  }
  throw new ConvexError<RejectionData>({ kind: "rejection", ...data });
}
export function refuseTransient(data: Omit<TransientData, "kind">): never {
  throw new ConvexError<TransientData>({ kind: "transient", ...data });
}
// Rethrows every error. A bare kernel Rejection, as a context throws it, gains the discriminator and the
// command type when its code is a platform code or one the declaration lists in rejections; any other
// code is a technical failure, rethrown as a plain Error. Everything else, a ConvexError of this
// boundary included, passes through unchanged.
export function normalizeThrown(
  error: unknown,
  commandType: string,
  rejections: readonly string[],
): never {
  if (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    !("kind" in error.data) &&
    validate(rejectionValidator, error.data)
  ) {
    const { code } = error.data;
    if (
      !Object.hasOwn(platformRejectionCodes, code) &&
      !rejections.includes(code)
    )
      throw new Error(
        `${commandType} was rejected with the code ${code}, which is neither a platform code nor one its declaration lists in rejections`,
      );
    throw new ConvexError<RejectionData>({
      kind: "rejection",
      commandType,
      ...error.data,
    });
  }
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
