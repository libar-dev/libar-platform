import { stableStringify } from "../durability/idempotencyFingerprint.js";

export const DEFAULT_BOUNDARY_VALUE_MAX_BYTES = 64 * 1024;

export class BoundaryValueTooLargeError extends Error {
  readonly code = "PAYLOAD_TOO_LARGE";

  constructor(
    readonly fieldName: string,
    readonly actualBytes: number,
    readonly maxBytes: number
  ) {
    super(
      `${fieldName} exceeds ${maxBytes} bytes (${actualBytes} bytes). ` +
        `code=${"PAYLOAD_TOO_LARGE"}`
    );
    this.name = "BoundaryValueTooLargeError";
  }
}

export function getSerializedBoundaryValueSize(value: unknown): number {
  const serialized = stableStringify(value);
  let byteLength = 0;

  for (const char of serialized) {
    const codePoint = char.codePointAt(0)!;

    if (codePoint <= 0x7f) {
      byteLength += 1;
    } else if (codePoint <= 0x7ff) {
      byteLength += 2;
    } else if (codePoint <= 0xffff) {
      byteLength += 3;
    } else {
      byteLength += 4;
    }
  }

  return byteLength;
}

export function assertBoundaryValueSize(
  fieldName: string,
  value: unknown,
  maxBytes: number = DEFAULT_BOUNDARY_VALUE_MAX_BYTES
): void {
  const actualBytes = getSerializedBoundaryValueSize(value);
  if (actualBytes > maxBytes) {
    throw new BoundaryValueTooLargeError(fieldName, actualBytes, maxBytes);
  }
}

export function assertBoundaryValuesSize(
  values: Array<{
    fieldName: string;
    value: unknown;
    maxBytes?: number;
  }>
): void {
  for (const { fieldName, value, maxBytes } of values) {
    if (value === undefined) {
      continue;
    }
    assertBoundaryValueSize(fieldName, value, maxBytes);
  }
}
