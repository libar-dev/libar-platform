import { describe, expect, it } from "vitest";

import {
  assertPMValidTransition,
  getPMValidEventsFrom,
  planPMProcessingEntry,
} from "../../../src/processManager/index.js";

describe("process manager lifecycle parity", () => {
  it("uses the lifecycle map as the canonical source for processing entry", () => {
    expect(planPMProcessingEntry("idle")).toEqual({
      mode: "transition",
      event: "START",
      to: "processing",
    });
    expect(planPMProcessingEntry("failed")).toEqual({
      mode: "transition",
      event: "RETRY",
      to: "processing",
    });
    expect(planPMProcessingEntry("processing")).toEqual({
      mode: "resume",
      event: null,
      to: "processing",
    });
    expect(planPMProcessingEntry("completed")).toBeNull();
  });

  it("keeps success and failure transitions canonical for transition consumers", () => {
    expect(assertPMValidTransition("processing", "SUCCESS", "pm", "inst")).toBe("completed");
    expect(assertPMValidTransition("processing", "FAIL", "pm", "inst")).toBe("failed");
    expect(getPMValidEventsFrom("failed")).toEqual(["RETRY", "RESET"]);
  });
});
