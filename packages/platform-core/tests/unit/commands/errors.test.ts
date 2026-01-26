/**
 * Unit Tests for Command Errors
 *
 * Tests the error categorization and CommandError class:
 * - Error categories and constants
 * - CommandError creation and serialization
 * - Factory functions
 * - Recovery helpers
 */
import { describe, it, expect } from "vitest";
import {
  ErrorCategory,
  ERROR_CATEGORIES,
  isErrorCategory,
  CommandError,
  CommandErrors,
  isCommandErrorOfCategory,
  isRecoverableError,
  getRetryDelay,
} from "../../../src/commands/errors";

describe("ErrorCategory", () => {
  it("contains all four error categories", () => {
    expect(ERROR_CATEGORIES).toHaveLength(4);
    expect(ERROR_CATEGORIES).toContain("domain");
    expect(ERROR_CATEGORIES).toContain("validation");
    expect(ERROR_CATEGORIES).toContain("concurrency");
    expect(ERROR_CATEGORIES).toContain("infra");
  });

  it("has correct values", () => {
    expect(ErrorCategory.DOMAIN).toBe("domain");
    expect(ErrorCategory.VALIDATION).toBe("validation");
    expect(ErrorCategory.CONCURRENCY).toBe("concurrency");
    expect(ErrorCategory.INFRASTRUCTURE).toBe("infra");
  });
});

describe("isErrorCategory", () => {
  it("returns true for valid categories", () => {
    expect(isErrorCategory("domain")).toBe(true);
    expect(isErrorCategory("validation")).toBe(true);
    expect(isErrorCategory("concurrency")).toBe(true);
    expect(isErrorCategory("infra")).toBe(true);
  });

  it("returns false for invalid values", () => {
    expect(isErrorCategory("invalid")).toBe(false);
    expect(isErrorCategory("DOMAIN")).toBe(false);
    expect(isErrorCategory(null)).toBe(false);
    expect(isErrorCategory(undefined)).toBe(false);
    expect(isErrorCategory(123)).toBe(false);
  });
});

describe("CommandError", () => {
  describe("constructor", () => {
    it("creates error with all properties", () => {
      const error = new CommandError(
        ErrorCategory.DOMAIN,
        "ORDER_NOT_FOUND",
        "Order was not found",
        false,
        { orderId: "123" }
      );

      expect(error.category).toBe("domain");
      expect(error.code).toBe("ORDER_NOT_FOUND");
      expect(error.message).toBe("Order was not found");
      expect(error.recoverable).toBe(false);
      expect(error.context).toEqual({ orderId: "123" });
      expect(error.name).toBe("CommandError");
    });

    it("extends Error", () => {
      const error = new CommandError(ErrorCategory.DOMAIN, "TEST", "test message", false);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("from", () => {
    it("returns CommandError unchanged", () => {
      const original = new CommandError(ErrorCategory.DOMAIN, "TEST", "test", false);
      const result = CommandError.from(original);
      expect(result).toBe(original);
    });

    it("wraps regular Error", () => {
      const original = new Error("Something went wrong");
      const result = CommandError.from(original, "WRAPPED_ERROR");

      expect(result.category).toBe(ErrorCategory.INFRASTRUCTURE);
      expect(result.code).toBe("WRAPPED_ERROR");
      expect(result.message).toBe("Something went wrong");
      expect(result.recoverable).toBe(true);
      expect(result.context?.originalError).toBe("Error");
    });

    it("wraps string value", () => {
      const result = CommandError.from("string error");
      expect(result.message).toBe("string error");
      expect(result.category).toBe(ErrorCategory.INFRASTRUCTURE);
    });

    it("wraps unknown values", () => {
      const result = CommandError.from(123);
      expect(result.message).toBe("123");
    });
  });

  describe("toJSON", () => {
    it("serializes to plain object", () => {
      const error = new CommandError(
        ErrorCategory.DOMAIN,
        "ORDER_NOT_FOUND",
        "Order was not found",
        false,
        { orderId: "123" }
      );

      const json = error.toJSON();

      expect(json).toEqual({
        name: "CommandError",
        category: "domain",
        code: "ORDER_NOT_FOUND",
        message: "Order was not found",
        recoverable: false,
        context: { orderId: "123" },
      });
    });

    it("handles undefined context", () => {
      const error = new CommandError(ErrorCategory.DOMAIN, "TEST", "test", false);

      const json = error.toJSON();
      expect(json.context).toBeUndefined();
    });
  });
});

describe("CommandErrors factory", () => {
  describe("domain", () => {
    it("creates domain error with correct category", () => {
      const error = CommandErrors.domain(
        "ORDER_ALREADY_SUBMITTED",
        "Order has already been submitted"
      );

      expect(error.category).toBe(ErrorCategory.DOMAIN);
      expect(error.code).toBe("ORDER_ALREADY_SUBMITTED");
      expect(error.recoverable).toBe(false);
    });
  });

  describe("validation", () => {
    it("creates validation error with correct category", () => {
      const error = CommandErrors.validation("INVALID_EMAIL", "Email format is invalid");

      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.recoverable).toBe(false);
    });
  });

  describe("concurrency", () => {
    it("creates concurrency error with recoverable=true", () => {
      const error = CommandErrors.concurrency(
        "VERSION_CONFLICT",
        "Resource was modified by another request"
      );

      expect(error.category).toBe(ErrorCategory.CONCURRENCY);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("infrastructure", () => {
    it("creates infrastructure error with recoverable=true", () => {
      const error = CommandErrors.infrastructure(
        "DATABASE_UNAVAILABLE",
        "Database connection failed"
      );

      expect(error.category).toBe(ErrorCategory.INFRASTRUCTURE);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("notFound", () => {
    it("creates not found error with formatted message", () => {
      const error = CommandErrors.notFound("Order", "ord_123");

      expect(error.code).toBe("ORDER_NOT_FOUND");
      expect(error.message).toBe('Order with ID "ord_123" was not found');
      expect(error.category).toBe(ErrorCategory.DOMAIN);
      expect(error.context).toEqual({
        entityType: "Order",
        entityId: "ord_123",
      });
    });
  });

  describe("alreadyExists", () => {
    it("creates already exists error with formatted message", () => {
      const error = CommandErrors.alreadyExists("Order", "ord_123");

      expect(error.code).toBe("ORDER_ALREADY_EXISTS");
      expect(error.message).toBe('Order with ID "ord_123" already exists');
    });
  });

  describe("invalidState", () => {
    it("creates invalid state error with state info", () => {
      const error = CommandErrors.invalidState("Order", "draft", "submitted");

      expect(error.code).toBe("INVALID_ORDER_STATE");
      expect(error.message).toBe('Order is in "draft" state but "submitted" is required');
      expect(error.context).toEqual({
        entityType: "Order",
        currentState: "draft",
        requiredState: "submitted",
      });
    });
  });

  describe("unauthorized", () => {
    it("creates unauthorized error", () => {
      const error = CommandErrors.unauthorized("delete order");

      expect(error.code).toBe("UNAUTHORIZED");
      expect(error.message).toBe("Not authorized to perform action: delete order");
    });
  });

  describe("rateLimited", () => {
    it("creates rate limited error with retry info", () => {
      const error = CommandErrors.rateLimited(5000);

      expect(error.code).toBe("RATE_LIMITED");
      expect(error.category).toBe(ErrorCategory.INFRASTRUCTURE);
      expect(error.recoverable).toBe(true);
      expect(error.context?.retryAfterMs).toBe(5000);
    });
  });
});

describe("isCommandErrorOfCategory", () => {
  it("returns true for matching category", () => {
    const error = new CommandError(ErrorCategory.DOMAIN, "TEST", "test", false);
    expect(isCommandErrorOfCategory(error, ErrorCategory.DOMAIN)).toBe(true);
  });

  it("returns false for non-matching category", () => {
    const error = new CommandError(ErrorCategory.DOMAIN, "TEST", "test", false);
    expect(isCommandErrorOfCategory(error, ErrorCategory.VALIDATION)).toBe(false);
  });

  it("returns false for non-CommandError", () => {
    const error = new Error("test");
    expect(isCommandErrorOfCategory(error, ErrorCategory.DOMAIN)).toBe(false);
  });
});

describe("isRecoverableError", () => {
  it("returns true for recoverable CommandError", () => {
    const error = CommandErrors.concurrency("TEST", "test");
    expect(isRecoverableError(error)).toBe(true);
  });

  it("returns false for non-recoverable CommandError", () => {
    const error = CommandErrors.domain("TEST", "test");
    expect(isRecoverableError(error)).toBe(false);
  });

  it("returns true for unknown errors (assumes infrastructure)", () => {
    const error = new Error("unknown");
    expect(isRecoverableError(error)).toBe(true);
  });
});

describe("getRetryDelay", () => {
  it("returns -1 for non-recoverable errors", () => {
    const error = CommandErrors.domain("TEST", "test");
    expect(getRetryDelay(error)).toBe(-1);
  });

  it("returns quick delay for concurrency errors", () => {
    const error = CommandErrors.concurrency("TEST", "test");
    expect(getRetryDelay(error, 1)).toBe(50);
    expect(getRetryDelay(error, 2)).toBe(100);
    expect(getRetryDelay(error, 3)).toBe(200);
  });

  it("caps concurrency delay at 500ms", () => {
    const error = CommandErrors.concurrency("TEST", "test");
    expect(getRetryDelay(error, 10)).toBe(500);
  });

  it("returns exponential backoff for infrastructure errors", () => {
    const error = CommandErrors.infrastructure("TEST", "test");
    expect(getRetryDelay(error, 1)).toBe(1000);
    expect(getRetryDelay(error, 2)).toBe(2000);
    expect(getRetryDelay(error, 3)).toBe(4000);
  });

  it("caps infrastructure delay at 30 seconds", () => {
    const error = CommandErrors.infrastructure("TEST", "test");
    expect(getRetryDelay(error, 10)).toBe(30000);
  });

  it("returns exponential backoff for unknown errors", () => {
    const error = new Error("unknown");
    expect(getRetryDelay(error, 1)).toBe(1000);
  });
});
