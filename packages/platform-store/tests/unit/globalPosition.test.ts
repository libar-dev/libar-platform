import { describe, expect, it } from "vitest";

import {
  GLOBAL_POSITION_SEQUENCE_MODULO,
  allocateGlobalPositions,
  compareGlobalPositions,
  decomposeGlobalPosition,
  normalizeGlobalPosition,
} from "../../../platform-core/src/events/globalPosition.js";

describe("EventStore globalPosition allocation", () => {
  it("stays exact at real Date.now() scales", () => {
    const now = Date.now();
    const allocated = allocateGlobalPositions(null, 1, now);

    expect(allocated.positions[0]).toBe(BigInt(now) * GLOBAL_POSITION_SEQUENCE_MODULO);
  });

  it("is strictly monotonic for 1000 sequential appends", () => {
    const allocated = allocateGlobalPositions(null, 1_000, Date.now());

    for (let index = 1; index < allocated.positions.length; index++) {
      expect(
        compareGlobalPositions(allocated.positions[index]!, allocated.positions[index - 1]!)
      ).toBe(1);
    }
  });

  it("produces distinct values for two appends 1ms apart", () => {
    const first = allocateGlobalPositions(null, 1, 1_700_000_000_000);
    const second = allocateGlobalPositions(
      { lastTimestamp: first.lastTimestamp, lastSequence: first.lastSequence },
      1,
      1_700_000_000_001
    );

    expect(compareGlobalPositions(second.positions[0]!, first.positions[0]!)).toBe(1);
    expect(decomposeGlobalPosition(second.positions[0]!)).toEqual({
      timestamp: 1_700_000_000_001,
      sequence: 0,
    });
  });

  it("reads legacy numeric checkpoints through the compat path", () => {
    const legacyCheckpoint = 1_703_001_234_567_890;

    expect(normalizeGlobalPosition(legacyCheckpoint)).toBe(1_703_001_234_567_890n);
  });
});
