/**
 * Unit Tests for Process Manager Types
 *
 * Tests type guards and interface structures for process manager runtime types.
 */
import { describe, it, expect } from "vitest";
import type {
  ProcessManagerDeadLetter,
  ProcessManagerStatus,
  DeadLetterStatus,
} from "../../../src/processManager/types.js";
import {
  PROCESS_MANAGER_STATUSES,
  isProcessManagerStatus,
  DEAD_LETTER_STATUSES,
  isDeadLetterStatus,
} from "../../../src/processManager/types.js";

// ============================================================================
// isProcessManagerStatus Type Guard Tests
// ============================================================================

describe("isProcessManagerStatus", () => {
  describe("valid statuses", () => {
    it("returns true for all valid statuses", () => {
      expect(isProcessManagerStatus("idle")).toBe(true);
      expect(isProcessManagerStatus("processing")).toBe(true);
      expect(isProcessManagerStatus("completed")).toBe(true);
      expect(isProcessManagerStatus("failed")).toBe(true);
    });

    it("matches all values in PROCESS_MANAGER_STATUSES", () => {
      for (const status of PROCESS_MANAGER_STATUSES) {
        expect(isProcessManagerStatus(status)).toBe(true);
      }
    });
  });

  describe("invalid statuses", () => {
    it("returns false for invalid status strings", () => {
      expect(isProcessManagerStatus("invalid")).toBe(false);
      expect(isProcessManagerStatus("running")).toBe(false);
      expect(isProcessManagerStatus("pending")).toBe(false);
      expect(isProcessManagerStatus("active")).toBe(false);
      expect(isProcessManagerStatus("")).toBe(false);
    });

    it("returns false for non-string values", () => {
      expect(isProcessManagerStatus(null)).toBe(false);
      expect(isProcessManagerStatus(undefined)).toBe(false);
      expect(isProcessManagerStatus(123)).toBe(false);
      expect(isProcessManagerStatus({})).toBe(false);
      expect(isProcessManagerStatus([])).toBe(false);
      expect(isProcessManagerStatus(true)).toBe(false);
    });

    it("returns false for array containing valid status", () => {
      expect(isProcessManagerStatus(["idle"])).toBe(false);
      expect(isProcessManagerStatus(["idle", "processing"])).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(isProcessManagerStatus("IDLE")).toBe(false);
      expect(isProcessManagerStatus("Idle")).toBe(false);
      expect(isProcessManagerStatus("PROCESSING")).toBe(false);
      expect(isProcessManagerStatus("Processing")).toBe(false);
      expect(isProcessManagerStatus("COMPLETED")).toBe(false);
      expect(isProcessManagerStatus("FAILED")).toBe(false);
    });
  });

  describe("type narrowing", () => {
    it("narrows type correctly in conditional", () => {
      const value: unknown = "processing";
      if (isProcessManagerStatus(value)) {
        // TypeScript should narrow value to ProcessManagerStatus
        const status: ProcessManagerStatus = value;
        expect(status).toBe("processing");
      }
    });

    it("can be used in array filter", () => {
      const values: unknown[] = ["idle", "invalid", "processing", null, "failed"];
      const validStatuses = values.filter(isProcessManagerStatus);
      expect(validStatuses).toEqual(["idle", "processing", "failed"]);
      expect(validStatuses).toHaveLength(3);
    });
  });
});

// ============================================================================
// PROCESS_MANAGER_STATUSES Constant Tests
// ============================================================================

describe("PROCESS_MANAGER_STATUSES", () => {
  it("exports exactly 4 statuses", () => {
    expect(PROCESS_MANAGER_STATUSES).toEqual(["idle", "processing", "completed", "failed"]);
    expect(PROCESS_MANAGER_STATUSES).toHaveLength(4);
  });

  it("is a readonly array", () => {
    // Verify the array is typed as readonly
    const statuses: readonly ProcessManagerStatus[] = PROCESS_MANAGER_STATUSES;
    expect(statuses[0]).toBe("idle");
    expect(statuses[3]).toBe("failed");
  });

  it("contains all states in the lifecycle", () => {
    expect(PROCESS_MANAGER_STATUSES).toContain("idle");
    expect(PROCESS_MANAGER_STATUSES).toContain("processing");
    expect(PROCESS_MANAGER_STATUSES).toContain("completed");
    expect(PROCESS_MANAGER_STATUSES).toContain("failed");
  });

  it("has statuses in logical lifecycle order", () => {
    // idle -> processing -> completed/failed
    expect(PROCESS_MANAGER_STATUSES.indexOf("idle")).toBeLessThan(
      PROCESS_MANAGER_STATUSES.indexOf("processing")
    );
    expect(PROCESS_MANAGER_STATUSES.indexOf("processing")).toBeLessThan(
      PROCESS_MANAGER_STATUSES.indexOf("completed")
    );
  });
});

// ============================================================================
// isDeadLetterStatus Type Guard Tests
// ============================================================================

describe("isDeadLetterStatus", () => {
  describe("valid statuses", () => {
    it("returns true for all valid statuses", () => {
      expect(isDeadLetterStatus("pending")).toBe(true);
      expect(isDeadLetterStatus("replayed")).toBe(true);
      expect(isDeadLetterStatus("ignored")).toBe(true);
    });

    it("matches all values in DEAD_LETTER_STATUSES", () => {
      for (const status of DEAD_LETTER_STATUSES) {
        expect(isDeadLetterStatus(status)).toBe(true);
      }
    });
  });

  describe("invalid statuses", () => {
    it("returns false for invalid status strings", () => {
      expect(isDeadLetterStatus("invalid")).toBe(false);
      expect(isDeadLetterStatus("active")).toBe(false);
      expect(isDeadLetterStatus("processed")).toBe(false);
      expect(isDeadLetterStatus("failed")).toBe(false);
      expect(isDeadLetterStatus("")).toBe(false);
    });

    it("returns false for PM statuses (different domain)", () => {
      expect(isDeadLetterStatus("idle")).toBe(false);
      expect(isDeadLetterStatus("processing")).toBe(false);
      expect(isDeadLetterStatus("completed")).toBe(false);
    });

    it("returns false for non-string values", () => {
      expect(isDeadLetterStatus(null)).toBe(false);
      expect(isDeadLetterStatus(undefined)).toBe(false);
      expect(isDeadLetterStatus(123)).toBe(false);
      expect(isDeadLetterStatus({})).toBe(false);
      expect(isDeadLetterStatus([])).toBe(false);
      expect(isDeadLetterStatus(true)).toBe(false);
    });

    it("returns false for array containing valid status", () => {
      expect(isDeadLetterStatus(["pending"])).toBe(false);
      expect(isDeadLetterStatus(["pending", "replayed"])).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(isDeadLetterStatus("PENDING")).toBe(false);
      expect(isDeadLetterStatus("Pending")).toBe(false);
      expect(isDeadLetterStatus("REPLAYED")).toBe(false);
      expect(isDeadLetterStatus("Replayed")).toBe(false);
      expect(isDeadLetterStatus("IGNORED")).toBe(false);
      expect(isDeadLetterStatus("Ignored")).toBe(false);
    });
  });

  describe("type narrowing", () => {
    it("narrows type correctly in conditional", () => {
      const value: unknown = "replayed";
      if (isDeadLetterStatus(value)) {
        // TypeScript should narrow value to DeadLetterStatus
        const status: DeadLetterStatus = value;
        expect(status).toBe("replayed");
      }
    });

    it("can be used in array filter", () => {
      const values: unknown[] = ["pending", "invalid", "replayed", null, "ignored"];
      const validStatuses = values.filter(isDeadLetterStatus);
      expect(validStatuses).toEqual(["pending", "replayed", "ignored"]);
      expect(validStatuses).toHaveLength(3);
    });
  });
});

// ============================================================================
// DEAD_LETTER_STATUSES Constant Tests
// ============================================================================

describe("DEAD_LETTER_STATUSES", () => {
  it("exports exactly 3 statuses", () => {
    expect(DEAD_LETTER_STATUSES).toEqual(["pending", "replayed", "ignored"]);
    expect(DEAD_LETTER_STATUSES).toHaveLength(3);
  });

  it("is a readonly array", () => {
    // Verify the array is typed as readonly
    const statuses: readonly DeadLetterStatus[] = DEAD_LETTER_STATUSES;
    expect(statuses[0]).toBe("pending");
    expect(statuses[2]).toBe("ignored");
  });

  it("contains all dead letter states", () => {
    expect(DEAD_LETTER_STATUSES).toContain("pending");
    expect(DEAD_LETTER_STATUSES).toContain("replayed");
    expect(DEAD_LETTER_STATUSES).toContain("ignored");
  });

  it("has statuses in logical workflow order", () => {
    // pending -> replayed/ignored (terminal states)
    expect(DEAD_LETTER_STATUSES.indexOf("pending")).toBeLessThan(
      DEAD_LETTER_STATUSES.indexOf("replayed")
    );
    expect(DEAD_LETTER_STATUSES.indexOf("pending")).toBeLessThan(
      DEAD_LETTER_STATUSES.indexOf("ignored")
    );
  });
});

// ============================================================================
// ProcessManagerDeadLetter Interface Tests
// ============================================================================

describe("ProcessManagerDeadLetter", () => {
  describe("structure validation", () => {
    it("has correct structure for pending dead letter with all fields", () => {
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "testPM",
        instanceId: "inst-123",
        eventId: "evt-456",
        error: "Command execution failed",
        attemptCount: 3,
        status: "pending",
        failedCommand: {
          commandType: "SendNotification",
          payload: { orderId: "ord-789" },
        },
        context: { retryable: true },
        failedAt: Date.now(),
      };

      expect(deadLetter.processManagerName).toBe("testPM");
      expect(deadLetter.instanceId).toBe("inst-123");
      expect(deadLetter.eventId).toBe("evt-456");
      expect(deadLetter.error).toBe("Command execution failed");
      expect(deadLetter.attemptCount).toBe(3);
      expect(deadLetter.status).toBe("pending");
      expect(deadLetter.failedCommand?.commandType).toBe("SendNotification");
      expect(deadLetter.failedCommand?.payload).toEqual({ orderId: "ord-789" });
      expect(deadLetter.context).toEqual({ retryable: true });
      expect(deadLetter.failedAt).toBeGreaterThan(0);
    });

    it("allows optional fields to be undefined", () => {
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "testPM",
        instanceId: "inst-123",
        error: "Failed",
        attemptCount: 1,
        status: "pending",
        failedAt: Date.now(),
      };

      expect(deadLetter.eventId).toBeUndefined();
      expect(deadLetter.failedCommand).toBeUndefined();
      expect(deadLetter.context).toBeUndefined();
    });
  });

  describe("status values", () => {
    it("supports pending status", () => {
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "testPM",
        instanceId: "inst-123",
        error: "Failed",
        attemptCount: 1,
        status: "pending",
        failedAt: Date.now(),
      };
      expect(deadLetter.status).toBe("pending");
    });

    it("supports replayed status", () => {
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "testPM",
        instanceId: "inst-123",
        error: "Failed",
        attemptCount: 2,
        status: "replayed",
        failedAt: Date.now(),
      };
      expect(deadLetter.status).toBe("replayed");
    });

    it("supports ignored status", () => {
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "testPM",
        instanceId: "inst-123",
        error: "Non-retryable error",
        attemptCount: 1,
        status: "ignored",
        failedAt: Date.now(),
      };
      expect(deadLetter.status).toBe("ignored");
    });

    it("supports all dead letter statuses in a loop", () => {
      const statuses: ProcessManagerDeadLetter["status"][] = ["pending", "replayed", "ignored"];
      statuses.forEach((status) => {
        const dl: ProcessManagerDeadLetter = {
          processManagerName: "testPM",
          instanceId: "inst-123",
          error: "Failed",
          attemptCount: 1,
          status,
          failedAt: Date.now(),
        };
        expect(dl.status).toBe(status);
      });
    });
  });

  describe("failedCommand structure", () => {
    it("captures command type and payload", () => {
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "orderNotificationPM",
        instanceId: "inst-456",
        error: "Notification service unavailable",
        attemptCount: 3,
        status: "pending",
        failedCommand: {
          commandType: "SendOrderConfirmation",
          payload: {
            orderId: "ord-123",
            customerId: "cust-456",
            email: "customer@example.com",
          },
        },
        failedAt: Date.now(),
      };

      expect(deadLetter.failedCommand).toBeDefined();
      expect(deadLetter.failedCommand?.commandType).toBe("SendOrderConfirmation");
      expect(deadLetter.failedCommand?.payload).toHaveProperty("orderId", "ord-123");
      expect(deadLetter.failedCommand?.payload).toHaveProperty("customerId", "cust-456");
    });

    it("allows empty payload object", () => {
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "testPM",
        instanceId: "inst-123",
        error: "Failed",
        attemptCount: 1,
        status: "pending",
        failedCommand: {
          commandType: "NoOpCommand",
          payload: {},
        },
        failedAt: Date.now(),
      };

      expect(deadLetter.failedCommand?.payload).toEqual({});
    });
  });

  describe("edge cases", () => {
    it("handles high attempt counts", () => {
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "testPM",
        instanceId: "inst-123",
        error: "Persistent failure",
        attemptCount: 999,
        status: "pending",
        failedAt: Date.now(),
      };

      expect(deadLetter.attemptCount).toBe(999);
    });

    it("handles long error messages", () => {
      const longError = "Error: ".repeat(100) + "Stack trace...";
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "testPM",
        instanceId: "inst-123",
        error: longError,
        attemptCount: 1,
        status: "pending",
        failedAt: Date.now(),
      };

      expect(deadLetter.error).toBe(longError);
    });

    it("handles complex context objects", () => {
      const deadLetter: ProcessManagerDeadLetter = {
        processManagerName: "testPM",
        instanceId: "inst-123",
        error: "Failed",
        attemptCount: 1,
        status: "pending",
        context: {
          correlationId: "corr-123",
          timestamp: Date.now(),
          metadata: {
            source: "integration-event",
            version: 2,
          },
          tags: ["critical", "retry"],
        },
        failedAt: Date.now(),
      };

      expect(deadLetter.context).toHaveProperty("correlationId", "corr-123");
      expect(deadLetter.context).toHaveProperty("metadata");
      expect(deadLetter.context).toHaveProperty("tags");
    });
  });
});
