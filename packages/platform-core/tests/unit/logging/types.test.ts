/**
 * Unit tests for logging types.
 */
import { describe, it, expect } from "vitest";
import {
  LOG_LEVEL_PRIORITY,
  DEFAULT_LOG_LEVEL,
  shouldLog,
  type LogLevel,
} from "../../../src/logging/types.js";

describe("LogLevel", () => {
  describe("LOG_LEVEL_PRIORITY", () => {
    it("should have correct priority order (lower = more verbose)", () => {
      expect(LOG_LEVEL_PRIORITY.DEBUG).toBeLessThan(LOG_LEVEL_PRIORITY.TRACE);
      expect(LOG_LEVEL_PRIORITY.TRACE).toBeLessThan(LOG_LEVEL_PRIORITY.INFO);
      expect(LOG_LEVEL_PRIORITY.INFO).toBeLessThan(LOG_LEVEL_PRIORITY.REPORT);
      expect(LOG_LEVEL_PRIORITY.REPORT).toBeLessThan(LOG_LEVEL_PRIORITY.WARN);
      expect(LOG_LEVEL_PRIORITY.WARN).toBeLessThan(LOG_LEVEL_PRIORITY.ERROR);
    });

    it("should have all 6 levels defined", () => {
      const levels: LogLevel[] = ["DEBUG", "TRACE", "INFO", "REPORT", "WARN", "ERROR"];
      for (const level of levels) {
        expect(LOG_LEVEL_PRIORITY[level]).toBeDefined();
        expect(typeof LOG_LEVEL_PRIORITY[level]).toBe("number");
      }
    });
  });

  describe("DEFAULT_LOG_LEVEL", () => {
    it("should be INFO", () => {
      expect(DEFAULT_LOG_LEVEL).toBe("INFO");
    });
  });

  describe("shouldLog", () => {
    it("should return true when message level >= configured level", () => {
      // At INFO level, INFO and above should log
      expect(shouldLog("INFO", "INFO")).toBe(true);
      expect(shouldLog("REPORT", "INFO")).toBe(true);
      expect(shouldLog("WARN", "INFO")).toBe(true);
      expect(shouldLog("ERROR", "INFO")).toBe(true);
    });

    it("should return false when message level < configured level", () => {
      // At INFO level, DEBUG and TRACE should not log
      expect(shouldLog("DEBUG", "INFO")).toBe(false);
      expect(shouldLog("TRACE", "INFO")).toBe(false);
    });

    it("should allow all levels at DEBUG", () => {
      expect(shouldLog("DEBUG", "DEBUG")).toBe(true);
      expect(shouldLog("TRACE", "DEBUG")).toBe(true);
      expect(shouldLog("INFO", "DEBUG")).toBe(true);
      expect(shouldLog("REPORT", "DEBUG")).toBe(true);
      expect(shouldLog("WARN", "DEBUG")).toBe(true);
      expect(shouldLog("ERROR", "DEBUG")).toBe(true);
    });

    it("should only allow ERROR at ERROR level", () => {
      expect(shouldLog("DEBUG", "ERROR")).toBe(false);
      expect(shouldLog("TRACE", "ERROR")).toBe(false);
      expect(shouldLog("INFO", "ERROR")).toBe(false);
      expect(shouldLog("REPORT", "ERROR")).toBe(false);
      expect(shouldLog("WARN", "ERROR")).toBe(false);
      expect(shouldLog("ERROR", "ERROR")).toBe(true);
    });

    it("should handle WARN level correctly", () => {
      expect(shouldLog("DEBUG", "WARN")).toBe(false);
      expect(shouldLog("TRACE", "WARN")).toBe(false);
      expect(shouldLog("INFO", "WARN")).toBe(false);
      expect(shouldLog("REPORT", "WARN")).toBe(false);
      expect(shouldLog("WARN", "WARN")).toBe(true);
      expect(shouldLog("ERROR", "WARN")).toBe(true);
    });
  });
});
