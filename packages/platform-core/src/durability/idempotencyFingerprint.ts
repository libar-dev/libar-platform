export interface IdempotencyFingerprintInput {
  readonly streamType: string;
  readonly streamId: string;
  readonly boundedContext: string;
  readonly tenantId?: string;
  readonly eventType: string;
  readonly category: "domain" | "integration" | "trigger" | "fat";
  readonly schemaVersion: number;
  readonly payload: unknown;
}

function normalizeForStableStringify(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForStableStringify(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeForStableStringify(
          (value as Record<string, unknown>)[key]
        );
        return accumulator;
      }, {});
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableStringify(value));
}

export function createIdempotencyFingerprint(input: IdempotencyFingerprintInput): string {
  return stableStringify({
    streamType: input.streamType,
    streamId: input.streamId,
    boundedContext: input.boundedContext,
    tenantId: input.tenantId ?? null,
    eventType: input.eventType,
    category: input.category,
    schemaVersion: input.schemaVersion,
    payload: input.payload,
  });
}
