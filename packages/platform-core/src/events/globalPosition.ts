/**
 * Canonical globalPosition representation and compatibility helpers.
 *
 * Legacy checkpoints stored `globalPosition` as a JavaScript number. New code uses bigint
 * so positions remain exact and strictly comparable at real `Date.now()` scales.
 */

export type GlobalPosition = bigint;
export type GlobalPositionLike = bigint | number;

export const NO_GLOBAL_POSITION = -1n;
export const INITIAL_GLOBAL_POSITION = 0n;
export const GLOBAL_POSITION_SEQUENCE_MODULO = 1_000_000n;

export interface GlobalPositionAllocatorState {
  readonly lastTimestamp: number;
  readonly lastSequence: number;
}

export interface AllocatedGlobalPositions {
  readonly positions: GlobalPosition[];
  readonly lastTimestamp: number;
  readonly lastSequence: number;
}

function assertIntegerNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be a finite integer. Received ${value}.`);
  }
}

export function normalizeGlobalPosition(
  value: GlobalPositionLike,
  fieldName = "globalPosition"
): GlobalPosition {
  if (typeof value === "bigint") {
    return value;
  }

  assertIntegerNumber(value, fieldName);
  return BigInt(value);
}

export function normalizeOptionalGlobalPosition(
  value: GlobalPositionLike | null | undefined,
  fallback: GlobalPosition = NO_GLOBAL_POSITION,
  fieldName = "globalPosition"
): GlobalPosition {
  if (value === null || value === undefined) {
    return fallback;
  }

  return normalizeGlobalPosition(value, fieldName);
}

export function compareGlobalPositions(a: GlobalPositionLike, b: GlobalPositionLike): -1 | 0 | 1 {
  const left = normalizeGlobalPosition(a, "left globalPosition");
  const right = normalizeGlobalPosition(b, "right globalPosition");

  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

export function isGlobalPositionAfter(a: GlobalPositionLike, b: GlobalPositionLike): boolean {
  return compareGlobalPositions(a, b) === 1;
}

export function isGlobalPositionAtOrAfter(a: GlobalPositionLike, b: GlobalPositionLike): boolean {
  return compareGlobalPositions(a, b) >= 0;
}

export function isGlobalPositionAtOrBefore(a: GlobalPositionLike, b: GlobalPositionLike): boolean {
  return compareGlobalPositions(a, b) <= 0;
}

export function subtractGlobalPositions(
  a: GlobalPositionLike,
  b: GlobalPositionLike
): GlobalPosition {
  return (
    normalizeGlobalPosition(a, "left globalPosition") -
    normalizeGlobalPosition(b, "right globalPosition")
  );
}

export function maxGlobalPosition(
  positions: Iterable<GlobalPositionLike>,
  fallback: GlobalPosition = INITIAL_GLOBAL_POSITION
): GlobalPosition {
  let max = fallback;
  let hasValue = false;

  for (const position of positions) {
    const normalized = normalizeGlobalPosition(position);
    if (!hasValue || normalized > max) {
      max = normalized;
      hasValue = true;
    }
  }

  return hasValue ? max : fallback;
}

export function serializeGlobalPosition(value: GlobalPositionLike): string {
  return normalizeGlobalPosition(value).toString();
}

export function decomposeGlobalPosition(value: GlobalPositionLike): {
  timestamp: number;
  sequence: number;
} {
  const normalized = normalizeGlobalPosition(value);
  if (normalized < INITIAL_GLOBAL_POSITION) {
    throw new Error(`globalPosition must be non-negative. Received ${normalized}.`);
  }

  return {
    timestamp: Number(normalized / GLOBAL_POSITION_SEQUENCE_MODULO),
    sequence: Number(normalized % GLOBAL_POSITION_SEQUENCE_MODULO),
  };
}

export function allocateGlobalPositions(
  state: GlobalPositionAllocatorState | null,
  count: number,
  now = Date.now()
): AllocatedGlobalPositions {
  assertIntegerNumber(count, "count");
  if (count <= 0) {
    throw new Error(`count must be positive. Received ${count}.`);
  }

  assertIntegerNumber(now, "now");

  let timestamp = state === null ? now : Math.max(now, state.lastTimestamp);
  let sequence = state !== null && timestamp === state.lastTimestamp ? state.lastSequence + 1 : 0;

  const positions: GlobalPosition[] = [];
  const maxSequence = Number(GLOBAL_POSITION_SEQUENCE_MODULO - 1n);

  for (let index = 0; index < count; index++) {
    if (sequence > maxSequence) {
      timestamp += 1;
      sequence = 0;
    }

    positions.push(BigInt(timestamp) * GLOBAL_POSITION_SEQUENCE_MODULO + BigInt(sequence));
    sequence += 1;
  }

  return {
    positions,
    lastTimestamp: timestamp,
    lastSequence: sequence - 1,
  };
}
