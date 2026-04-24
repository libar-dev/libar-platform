import { describe, expect, it } from "vitest";

import {
  GLOBAL_POSITION_SEQUENCE_MODULO,
  NO_GLOBAL_POSITION,
  allocateGlobalPositions,
  compareGlobalPositions,
  decomposeGlobalPosition,
  normalizeGlobalPosition,
  normalizeOptionalGlobalPosition,
} from "../../../src/events/globalPosition.js";

describe("globalPosition helpers", () => {
  it("normalizes legacy numeric checkpoints to bigint", () => {
    expect(normalizeGlobalPosition(1_703_001_234_567_001)).toBe(1_703_001_234_567_001n);
    expect(normalizeOptionalGlobalPosition(undefined)).toBe(NO_GLOBAL_POSITION);
  });

  it("allocates strictly monotonic positions at real timestamps", () => {
    const now = Date.now();
    const allocated = allocateGlobalPositions(null, 1_000, now);

    expect(allocated.positions).toHaveLength(1_000);
    expect(allocated.positions[0]).toBe(BigInt(now) * GLOBAL_POSITION_SEQUENCE_MODULO);

    for (let index = 1; index < allocated.positions.length; index++) {
      expect(
        compareGlobalPositions(allocated.positions[index]!, allocated.positions[index - 1]!)
      ).toBe(1);
    }
  });

  it("stays monotonic when the wall clock does not advance", () => {
    const first = allocateGlobalPositions(null, 2, 1_700_000_000_000);
    const second = allocateGlobalPositions(
      { lastTimestamp: first.lastTimestamp, lastSequence: first.lastSequence },
      2,
      1_700_000_000_000
    );

    expect(compareGlobalPositions(second.positions[0]!, first.positions[1]!)).toBe(1);
    expect(decomposeGlobalPosition(second.positions[0]!)).toEqual({
      timestamp: first.lastTimestamp,
      sequence: first.lastSequence + 1,
    });
  });

  it("moves to the next millisecond when the sequence space is exhausted", () => {
    const allocated = allocateGlobalPositions(
      { lastTimestamp: 1_700_000_000_000, lastSequence: 999_999 },
      2,
      1_700_000_000_000
    );

    expect(decomposeGlobalPosition(allocated.positions[0]!)).toEqual({
      timestamp: 1_700_000_000_001,
      sequence: 0,
    });
    expect(compareGlobalPositions(allocated.positions[1]!, allocated.positions[0]!)).toBe(1);
  });
});
