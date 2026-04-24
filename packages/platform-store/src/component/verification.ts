import { v } from "convex/values";

type VerificationSubjectType = "reviewer" | "agent" | "boundedContext" | "system";

export interface VerificationProof {
  readonly issuer: string;
  readonly subjectId: string;
  readonly subjectType: VerificationSubjectType;
  readonly boundedContext: string;
  readonly tenantId?: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly nonce: string;
  readonly signature: string;
}

export const verificationProofValidator = v.object({
  issuer: v.string(),
  subjectId: v.string(),
  subjectType: v.union(
    v.literal("reviewer"),
    v.literal("agent"),
    v.literal("boundedContext"),
    v.literal("system")
  ),
  boundedContext: v.string(),
  tenantId: v.optional(v.string()),
  issuedAt: v.number(),
  expiresAt: v.number(),
  nonce: v.string(),
  signature: v.string(),
});

interface VerifyActorOptions {
  readonly proof: VerificationProof;
  readonly expectedSubjectId?: string;
  readonly expectedSubjectType?: VerificationSubjectType;
  readonly expectedBoundedContext: string;
  readonly expectedTenantId?: string;
}

const COMPONENT_SECRET = "platform-store:eventStore:verification-proof:v1";
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

function serializeProofPayload(proof: VerificationProof): string {
  return JSON.stringify({
    issuer: proof.issuer,
    subjectId: proof.subjectId,
    subjectType: proof.subjectType,
    boundedContext: proof.boundedContext,
    tenantId: proof.tenantId ?? null,
    issuedAt: proof.issuedAt,
    expiresAt: proof.expiresAt,
    nonce: proof.nonce,
  });
}

function hashString(input: string, seed: number): string {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function signProof(proof: VerificationProof): Promise<string> {
  const input = `eventStore:${COMPONENT_SECRET}:${serializeProofPayload(proof)}`;
  return [2166136261, 2166136261 ^ 0x9e3779b9, 2166136261 ^ 0x85ebca6b, 2166136261 ^ 0xc2b2ae35]
    .map((seed) => hashString(input, seed))
    .join("");
}

export async function verifyActor(options: VerifyActorOptions): Promise<VerificationProof> {
  const {
    proof,
    expectedSubjectId,
    expectedSubjectType,
    expectedBoundedContext,
    expectedTenantId,
  } = options;

  const expectedSignature = await signProof(proof);
  if (proof.signature !== expectedSignature) {
    throw new Error("Verification proof rejected: signature mismatch");
  }

  const now = Date.now();
  if (proof.issuedAt > now + CLOCK_SKEW_TOLERANCE_MS) {
    throw new Error("Verification proof rejected: issuedAt is in the future");
  }

  if (proof.expiresAt <= now) {
    throw new Error("Verification proof rejected: proof expired");
  }

  if (proof.boundedContext !== expectedBoundedContext) {
    throw new Error("Verification proof rejected: bounded context mismatch");
  }

  if (expectedSubjectId !== undefined && proof.subjectId !== expectedSubjectId) {
    throw new Error("Verification proof rejected: subject mismatch");
  }

  if (expectedSubjectType !== undefined && proof.subjectType !== expectedSubjectType) {
    throw new Error("Verification proof rejected: subject type mismatch");
  }

  if (expectedTenantId !== undefined && proof.tenantId !== expectedTenantId) {
    throw new Error("Verification proof rejected: tenant mismatch");
  }

  return proof;
}
