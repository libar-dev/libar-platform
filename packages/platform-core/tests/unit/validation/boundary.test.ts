import { describe, expect, it } from "vitest";

import {
  BoundaryValueTooLargeError,
  DEFAULT_BOUNDARY_VALUE_MAX_BYTES,
  assertBoundaryValueSize,
  getSerializedBoundaryValueSize,
} from "../../../src/validation/boundary.js";

function makePayloadOfSize(bytes: number): { blob: string } {
  return { blob: "x".repeat(bytes) };
}

describe("boundary validation helper", () => {
  it("accepts values below the default 64KiB cap", () => {
    const payload = makePayloadOfSize(60 * 1024);

    expect(() => assertBoundaryValueSize("payload", payload)).not.toThrow();
  });

  it("rejects values above the default 64KiB cap", () => {
    const payload = makePayloadOfSize(128 * 1024);

    expect(() => assertBoundaryValueSize("payload", payload)).toThrow(BoundaryValueTooLargeError);
    expect(() => assertBoundaryValueSize("payload", payload)).toThrow(/PAYLOAD_TOO_LARGE/);
  });

  it("reports the serialized boundary size", () => {
    const payload = makePayloadOfSize(1024);

    expect(getSerializedBoundaryValueSize(payload)).toBeGreaterThan(1024);
    expect(DEFAULT_BOUNDARY_VALUE_MAX_BYTES).toBe(64 * 1024);
  });
});
