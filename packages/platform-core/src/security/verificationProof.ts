import { z } from "zod";
import { v7 as uuidv7 } from "uuid";

/**
 * Development-only verification proof helper.
 *
 * IMPORTANT: This is a lightweight boundary marker for local development and
 * repository-controlled server code. It uses source-visible target strings and a
 * custom hash, so it is NOT a production-grade cryptographic authorization
 * mechanism. Treat it as a typed capability hint, not a substitute for
 * server-held keys/capabilities, standard signing, or authenticated audience
 * binding. For mounted components, prefer asymmetric signing; HMAC only makes
 * sense when the verifier can keep the secret outside source/config.
 */

export const VERIFICATION_TARGETS = ["agentBC", "eventStore"] as const;

export type VerificationTarget = (typeof VERIFICATION_TARGETS)[number];

export const VERIFICATION_SUBJECT_TYPES = [
  "reviewer",
  "agent",
  "boundedContext",
  "system",
] as const;

export type VerificationSubjectType = (typeof VERIFICATION_SUBJECT_TYPES)[number];

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

export const VerificationProofSchema = z.object({
  issuer: z.string().min(1),
  subjectId: z.string().min(1),
  subjectType: z.enum(VERIFICATION_SUBJECT_TYPES),
  boundedContext: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  nonce: z.string().min(1),
  signature: z.string().min(1),
});

export type VerificationProofSchemaType = z.infer<typeof VerificationProofSchema>;

interface VerificationProofPayload {
  readonly issuer: string;
  readonly subjectId: string;
  readonly subjectType: VerificationSubjectType;
  readonly boundedContext: string;
  readonly tenantId?: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly nonce: string;
}

export interface CreateVerificationProofInput {
  readonly target: VerificationTarget;
  readonly issuer: string;
  readonly subjectId: string;
  readonly subjectType: VerificationSubjectType;
  readonly boundedContext: string;
  readonly tenantId?: string;
  readonly issuedAt?: number;
  readonly expiresAt?: number;
  readonly nonce?: string;
  readonly ttlMs?: number;
}

const DEFAULT_VERIFICATION_PROOF_TTL_MS = 5 * 60 * 1000;

const TARGET_SECRETS: Record<VerificationTarget, string> = {
  agentBC: "platform-core:agentBC:verification-proof:v1",
  eventStore: "platform-store:eventStore:verification-proof:v1",
};

function serializeProofPayload(payload: VerificationProofPayload): string {
  return JSON.stringify({
    issuer: payload.issuer,
    subjectId: payload.subjectId,
    subjectType: payload.subjectType,
    boundedContext: payload.boundedContext,
    tenantId: payload.tenantId ?? null,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
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

async function signPayload(
  target: VerificationTarget,
  payload: VerificationProofPayload
): Promise<string> {
  const secret = TARGET_SECRETS[target];
  const input = `${target}:${secret}:${serializeProofPayload(payload)}`;
  return [2166136261, 2166136261 ^ 0x9e3779b9, 2166136261 ^ 0x85ebca6b, 2166136261 ^ 0xc2b2ae35]
    .map((seed) => hashString(input, seed))
    .join("");
}

export async function createVerificationProof(
  input: CreateVerificationProofInput
): Promise<VerificationProof> {
  const issuedAt = input.issuedAt ?? Date.now();
  const expiresAt =
    input.expiresAt ?? issuedAt + (input.ttlMs ?? DEFAULT_VERIFICATION_PROOF_TTL_MS);
  const payload: VerificationProofPayload = {
    issuer: input.issuer,
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    boundedContext: input.boundedContext,
    ...(input.tenantId !== undefined && { tenantId: input.tenantId }),
    issuedAt,
    expiresAt,
    nonce: input.nonce ?? uuidv7(),
  };

  return {
    ...payload,
    signature: await signPayload(input.target, payload),
  };
}
