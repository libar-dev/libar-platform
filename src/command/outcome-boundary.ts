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
  // The name of the entry that refused.
  entry: string;
};
export type TransientData = {
  kind: "transient";
  code: TransientCode;
  message: string;
  retryAfterMs?: number;
};
// code is a string at the validator, because the domain half is closed per declaration.
const wireRejectionValidator = v.object({
  kind: v.literal("rejection"),
  code: v.string(),
  message: v.string(),
  entry: v.string(),
  details: v.optional(v.record(v.string(), v.any())),
});
export const errorDataValidator = v.union(
  wireRejectionValidator,
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
// convex-helpers' validate takes an array where a record is expected, and Convex does not: data and
// details fit a record only as a plain object.
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function detailsAreRecord(data: Record<string, unknown>): boolean {
  return data.details === undefined || isRecord(data.details);
}
// A rejection candidate is ConvexError data that claims to be a rejection: a record with its own code
// and no kind, the bare form a context throws, or a record whose kind is "rejection", the wire form.
type Candidate = { form: "bare" | "wire"; data: Record<string, unknown> };
function rejectionCandidate(data: unknown): Candidate | null {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return null;
  const record = data as Record<string, unknown>;
  if (!Object.hasOwn(record, "kind"))
    return Object.hasOwn(record, "code")
      ? { form: "bare", data: record }
      : null;
  return record.kind === "rejection" ? { form: "wire", data: record } : null;
}
// The bare form fits the kernel's rejectionValidator and the wire form the rejection branch of
// errorDataValidator, and in both the details, when present, are a record.
function fitsShape({ form, data }: Candidate): boolean {
  return (
    isRecord(data) &&
    validate(
      form === "bare" ? rejectionValidator : wireRejectionValidator,
      data,
    ) &&
    detailsAreRecord(data)
  );
}
// The bound on a rejection's details, measured as Convex measures a value.
const limitDetailsBytes = 16384;
// Throws a plain Error, a technical failure, when the details measure above the bound.
function checkDetails(rejection: Rejection, entry: string) {
  if (rejection.details === undefined) return;
  const bytes = getConvexSize(rejection.details);
  if (bytes > limitDetailsBytes)
    throw new Error(
      `A ${rejection.code} rejection of ${entry} carries ${bytes} bytes of details, above ${limitDetailsBytes}`,
    );
}
export function reject(data: Omit<RejectionData<never>, "kind">): never {
  checkDetails(data, data.entry);
  throw new ConvexError<RejectionData>({ kind: "rejection", ...data });
}
export function refuseTransient(data: Omit<TransientData, "kind">): never {
  throw new ConvexError<TransientData>({ kind: "transient", ...data });
}
// Every rejection candidate passes its shape, the declaration's code list, the entry it names and the
// details bound. A bare rejection gains the wire shape; a valid rejection already in that shape keeps
// its identity. Every other throw passes unchanged.
export function normalizeThrown(
  error: unknown,
  entry: string,
  rejections: readonly string[],
): never {
  const candidate =
    error instanceof ConvexError ? rejectionCandidate(error.data) : null;
  if (candidate === null) throw error;
  const wire = candidate.form === "wire";
  if (!fitsShape(candidate))
    throw new Error(
      `${entry} received a rejection that does not fit the ${candidate.form} shape`,
    );
  // fitsShape established code, message and details for both forms, and entry for the wire form.
  const rejection = candidate.data as Rejection & { entry?: string };
  const { code } = rejection;
  if (
    !Object.hasOwn(platformRejectionCodes, code) &&
    !rejections.includes(code)
  )
    throw new Error(
      `${entry} was rejected with the code ${code}, which is neither a platform code nor one its declaration lists in rejections`,
    );
  if (wire && rejection.entry !== entry)
    throw new Error(
      `${entry} received a rejection naming ${String(rejection.entry)}`,
    );
  checkDetails(rejection, entry);
  if (wire) throw error;
  throw new ConvexError<RejectionData>({
    kind: "rejection",
    entry,
    ...rejection,
  });
}
// For tests and for callers that must tell the kinds apart; the pipeline itself relays every throw.
// A ConvexError whose data does not fit errorDataValidator, with its details a record, is technical,
// a bare kernel Rejection included.
export function classifyThrown(
  error: unknown,
):
  | { kind: "rejection"; data: RejectionData }
  | { kind: "transient"; data: TransientData }
  | { kind: "technical"; error: unknown } {
  if (
    error instanceof ConvexError &&
    isRecord(error.data) &&
    validate(errorDataValidator, error.data) &&
    detailsAreRecord(error.data)
  )
    return error.data.kind === "rejection"
      ? { kind: "rejection", data: error.data }
      : { kind: "transient", data: error.data };
  return { kind: "technical", error };
}
