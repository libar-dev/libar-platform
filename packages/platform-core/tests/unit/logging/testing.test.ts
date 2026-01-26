/**
 * Unit tests for logging testing utilities.
 */
import { describe, it, expect } from "vitest";
import { createMockLogger, createFilteredMockLogger } from "../../../src/logging/testing.js";

describe("createMockLogger", () => {
  describe("basic functionality", () => {
    it("should capture all log calls", () => {
      const logger = createMockLogger();

      logger.debug("Debug message", { key: "debug" });
      logger.trace("Trace message", { key: "trace" });
      logger.info("Info message", { key: "info" });
      logger.report("Report message", { key: "report" });
      logger.warn("Warn message", { key: "warn" });
      logger.error("Error message", { key: "error" });

      expect(logger.calls).toHaveLength(6);
    });

    it("should capture level correctly", () => {
      const logger = createMockLogger();

      logger.debug("Debug");
      logger.trace("Trace");
      logger.info("Info");
      logger.report("Report");
      logger.warn("Warn");
      logger.error("Error");

      expect(logger.calls[0].level).toBe("DEBUG");
      expect(logger.calls[1].level).toBe("TRACE");
      expect(logger.calls[2].level).toBe("INFO");
      expect(logger.calls[3].level).toBe("REPORT");
      expect(logger.calls[4].level).toBe("WARN");
      expect(logger.calls[5].level).toBe("ERROR");
    });

    it("should capture message correctly", () => {
      const logger = createMockLogger();
      logger.info("Test message");

      expect(logger.calls[0].message).toBe("Test message");
    });

    it("should capture data correctly", () => {
      const logger = createMockLogger();
      logger.info("Test", { key: "value", count: 42 });

      expect(logger.calls[0].data).toEqual({ key: "value", count: 42 });
    });

    it("should set data to undefined when not provided", () => {
      const logger = createMockLogger();
      logger.info("No data");

      expect(logger.calls[0].data).toBeUndefined();
    });

    it("should include timestamp", () => {
      const before = Date.now();
      const logger = createMockLogger();
      logger.info("Test");
      const after = Date.now();

      expect(logger.calls[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(logger.calls[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("clear()", () => {
    it("should reset calls array", () => {
      const logger = createMockLogger();
      logger.info("Message 1");
      logger.info("Message 2");

      expect(logger.calls).toHaveLength(2);

      logger.clear();

      expect(logger.calls).toHaveLength(0);
    });
  });

  describe("getCallsAtLevel()", () => {
    it("should filter calls by level", () => {
      const logger = createMockLogger();
      logger.debug("Debug 1");
      logger.info("Info 1");
      logger.debug("Debug 2");
      logger.error("Error 1");

      const debugCalls = logger.getCallsAtLevel("DEBUG");
      const infoCalls = logger.getCallsAtLevel("INFO");
      const errorCalls = logger.getCallsAtLevel("ERROR");
      const warnCalls = logger.getCallsAtLevel("WARN");

      expect(debugCalls).toHaveLength(2);
      expect(infoCalls).toHaveLength(1);
      expect(errorCalls).toHaveLength(1);
      expect(warnCalls).toHaveLength(0);
    });
  });

  describe("hasLoggedMessage()", () => {
    it("should find message by partial match", () => {
      const logger = createMockLogger();
      logger.info("Command executed successfully");
      logger.warn("Command failed with error");

      expect(logger.hasLoggedMessage("executed")).toBe(true);
      expect(logger.hasLoggedMessage("failed")).toBe(true);
      expect(logger.hasLoggedMessage("not logged")).toBe(false);
    });

    it("should work with exact message", () => {
      const logger = createMockLogger();
      logger.info("Exact message");

      expect(logger.hasLoggedMessage("Exact message")).toBe(true);
    });
  });

  describe("hasLoggedAt()", () => {
    it("should check level and message together", () => {
      const logger = createMockLogger();
      logger.info("Info message");
      logger.error("Error message");

      expect(logger.hasLoggedAt("INFO", "Info")).toBe(true);
      expect(logger.hasLoggedAt("ERROR", "Info")).toBe(false);
      expect(logger.hasLoggedAt("INFO", "Error")).toBe(false);
      expect(logger.hasLoggedAt("ERROR", "Error")).toBe(true);
    });
  });

  describe("getLastCallAt()", () => {
    it("should return the last call at a specific level", () => {
      const logger = createMockLogger();
      logger.info("First info");
      logger.info("Second info");
      logger.info("Third info");

      const lastInfo = logger.getLastCallAt("INFO");

      expect(lastInfo?.message).toBe("Third info");
    });

    it("should return undefined if no calls at level", () => {
      const logger = createMockLogger();
      logger.info("Info message");

      const lastError = logger.getLastCallAt("ERROR");

      expect(lastError).toBeUndefined();
    });
  });

  describe("calls readonly array", () => {
    it("should return same reference on multiple accesses", () => {
      const logger = createMockLogger();
      logger.info("Test");

      const calls1 = logger.calls;
      const calls2 = logger.calls;

      // Verify the arrays have the same content
      expect(calls1).toEqual(calls2);
    });
  });
});

describe("createFilteredMockLogger", () => {
  describe("level filtering", () => {
    it("should only capture logs at or above minimum level", () => {
      const logger = createFilteredMockLogger("INFO");

      logger.debug("Debug");
      logger.trace("Trace");
      logger.info("Info");
      logger.report("Report");
      logger.warn("Warn");
      logger.error("Error");

      expect(logger.calls).toHaveLength(4);
      expect(logger.getCallsAtLevel("DEBUG")).toHaveLength(0);
      expect(logger.getCallsAtLevel("TRACE")).toHaveLength(0);
      expect(logger.getCallsAtLevel("INFO")).toHaveLength(1);
      expect(logger.getCallsAtLevel("REPORT")).toHaveLength(1);
      expect(logger.getCallsAtLevel("WARN")).toHaveLength(1);
      expect(logger.getCallsAtLevel("ERROR")).toHaveLength(1);
    });

    it("should capture all levels at DEBUG", () => {
      const logger = createFilteredMockLogger("DEBUG");

      logger.debug("Debug");
      logger.trace("Trace");
      logger.info("Info");
      logger.report("Report");
      logger.warn("Warn");
      logger.error("Error");

      expect(logger.calls).toHaveLength(6);
    });

    it("should only capture ERROR at ERROR level", () => {
      const logger = createFilteredMockLogger("ERROR");

      logger.debug("Debug");
      logger.trace("Trace");
      logger.info("Info");
      logger.report("Report");
      logger.warn("Warn");
      logger.error("Error");

      expect(logger.calls).toHaveLength(1);
      expect(logger.calls[0].level).toBe("ERROR");
    });

    it("should capture WARN and ERROR at WARN level", () => {
      const logger = createFilteredMockLogger("WARN");

      logger.debug("Debug");
      logger.trace("Trace");
      logger.info("Info");
      logger.report("Report");
      logger.warn("Warn");
      logger.error("Error");

      expect(logger.calls).toHaveLength(2);
      expect(logger.getCallsAtLevel("WARN")).toHaveLength(1);
      expect(logger.getCallsAtLevel("ERROR")).toHaveLength(1);
    });
  });

  describe("helper methods work with filtered logger", () => {
    it("should clear filtered calls", () => {
      const logger = createFilteredMockLogger("INFO");
      logger.info("Test");
      logger.debug("Filtered out");

      expect(logger.calls).toHaveLength(1);

      logger.clear();

      expect(logger.calls).toHaveLength(0);
    });

    it("should find messages in filtered calls", () => {
      const logger = createFilteredMockLogger("WARN");
      logger.info("Info message");
      logger.warn("Warning message");

      expect(logger.hasLoggedMessage("Info")).toBe(false);
      expect(logger.hasLoggedMessage("Warning")).toBe(true);
    });
  });
});
