/**
 * Unit tests for scoped logger.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createScopedLogger,
  createPlatformNoOpLogger,
  createChildLogger,
} from "../../../src/logging/scoped.js";

// Mock console methods
const mockConsole = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  time: vi.fn(),
  timeEnd: vi.fn(),
};

// Store original console
const originalConsole = globalThis.console;

describe("createScopedLogger", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    // Replace console
    (globalThis as { console: typeof mockConsole }).console = mockConsole;
  });

  afterEach(() => {
    // Restore console
    (globalThis as { console: Console }).console = originalConsole;
  });

  describe("message formatting", () => {
    it("should prefix messages with scope", () => {
      const logger = createScopedLogger("TestScope", "DEBUG");
      logger.info("Test message");

      expect(mockConsole.info).toHaveBeenCalledWith("[TestScope] Test message");
    });

    it("should include data as JSON when provided", () => {
      const logger = createScopedLogger("TestScope", "DEBUG");
      logger.info("Test message", { key: "value" });

      expect(mockConsole.info).toHaveBeenCalledWith('[TestScope] Test message {"key":"value"}');
    });

    it("should not include data when empty object", () => {
      const logger = createScopedLogger("TestScope", "DEBUG");
      logger.info("Test message", {});

      expect(mockConsole.info).toHaveBeenCalledWith("[TestScope] Test message");
    });
  });

  describe("level filtering", () => {
    it("should log DEBUG at DEBUG level", () => {
      const logger = createScopedLogger("Test", "DEBUG");
      logger.debug("Debug message");

      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it("should not log DEBUG at INFO level", () => {
      const logger = createScopedLogger("Test", "INFO");
      logger.debug("Debug message");

      expect(mockConsole.debug).not.toHaveBeenCalled();
    });

    it("should log INFO at INFO level", () => {
      const logger = createScopedLogger("Test", "INFO");
      logger.info("Info message");

      expect(mockConsole.info).toHaveBeenCalled();
    });

    it("should log WARN at INFO level", () => {
      const logger = createScopedLogger("Test", "INFO");
      logger.warn("Warn message");

      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it("should log ERROR at any level", () => {
      const logger = createScopedLogger("Test", "ERROR");
      logger.error("Error message");

      expect(mockConsole.error).toHaveBeenCalled();
    });

    it("should default to INFO level", () => {
      const logger = createScopedLogger("Test");
      logger.debug("Debug message");
      logger.info("Info message");

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).toHaveBeenCalled();
    });
  });

  describe("console method mapping", () => {
    it("should use console.debug for debug level", () => {
      const logger = createScopedLogger("Test", "DEBUG");
      logger.debug("Test");
      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it("should use console.info for info level", () => {
      const logger = createScopedLogger("Test", "DEBUG");
      logger.info("Test");
      expect(mockConsole.info).toHaveBeenCalled();
    });

    it("should use console.warn for warn level", () => {
      const logger = createScopedLogger("Test", "DEBUG");
      logger.warn("Test");
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it("should use console.error for error level", () => {
      const logger = createScopedLogger("Test", "DEBUG");
      logger.error("Test");
      expect(mockConsole.error).toHaveBeenCalled();
    });

    it("should use console.log (JSON) for report level", () => {
      const logger = createScopedLogger("Test", "DEBUG");
      logger.report("Metrics", { count: 10 });

      expect(mockConsole.log).toHaveBeenCalled();
      const call = mockConsole.log.mock.calls[0];
      const parsed = JSON.parse(call[0] as string);
      expect(parsed.scope).toBe("Test");
      expect(parsed.message).toBe("Metrics");
      expect(parsed.count).toBe(10);
      expect(parsed.timestamp).toBeDefined();
    });
  });

  describe("trace level with timing", () => {
    it("should use console.time for timing start", () => {
      const logger = createScopedLogger("Test", "DEBUG");
      logger.trace("Operation", { timing: "start" });

      expect(mockConsole.time).toHaveBeenCalledWith("[Test] Operation");
    });

    it("should use console.timeEnd for timing end", () => {
      const logger = createScopedLogger("Test", "DEBUG");
      logger.trace("Operation", { timing: "end" });

      expect(mockConsole.timeEnd).toHaveBeenCalledWith("[Test] Operation");
    });

    it("should use console.debug for regular trace", () => {
      const logger = createScopedLogger("Test", "DEBUG");
      logger.trace("Trace message", { data: "value" });

      expect(mockConsole.debug).toHaveBeenCalled();
      expect(mockConsole.time).not.toHaveBeenCalled();
      expect(mockConsole.timeEnd).not.toHaveBeenCalled();
    });
  });
});

describe("createPlatformNoOpLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { console: typeof mockConsole }).console = mockConsole;
  });

  afterEach(() => {
    (globalThis as { console: Console }).console = originalConsole;
  });

  it("should not call any console methods", () => {
    const logger = createPlatformNoOpLogger();

    logger.debug("Debug");
    logger.trace("Trace");
    logger.info("Info");
    logger.report("Report");
    logger.warn("Warn");
    logger.error("Error");

    expect(mockConsole.debug).not.toHaveBeenCalled();
    expect(mockConsole.info).not.toHaveBeenCalled();
    expect(mockConsole.warn).not.toHaveBeenCalled();
    expect(mockConsole.error).not.toHaveBeenCalled();
    expect(mockConsole.log).not.toHaveBeenCalled();
  });

  it("should return a valid Logger interface", () => {
    const logger = createPlatformNoOpLogger();

    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.trace).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.report).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });
});

describe("createChildLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { console: typeof mockConsole }).console = mockConsole;
  });

  afterEach(() => {
    (globalThis as { console: Console }).console = originalConsole;
  });

  it("should combine parent and child scopes", () => {
    const logger = createChildLogger("Parent", "Child", "DEBUG");
    logger.info("Test");

    expect(mockConsole.info).toHaveBeenCalledWith("[Parent:Child] Test");
  });

  it("should respect provided log level", () => {
    const logger = createChildLogger("Parent", "Child", "WARN");

    logger.info("Info");
    logger.warn("Warn");

    expect(mockConsole.info).not.toHaveBeenCalled();
    expect(mockConsole.warn).toHaveBeenCalled();
  });

  it("should default to INFO level", () => {
    const logger = createChildLogger("Parent", "Child");

    logger.debug("Debug");
    logger.info("Info");

    expect(mockConsole.debug).not.toHaveBeenCalled();
    expect(mockConsole.info).toHaveBeenCalled();
  });
});
