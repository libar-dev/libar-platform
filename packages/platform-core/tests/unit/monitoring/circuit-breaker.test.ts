/**
 * Circuit Breaker Unit Tests
 *
 * Tests for withCircuitBreaker(), getCircuitState(), and resetCircuit() including:
 * - Closed circuit: operations execute normally
 * - Closed -> Open: after N failures (default threshold 5)
 * - Open -> Half-open: after timeout elapses
 * - Half-open -> Closed: on success
 * - Half-open -> Open: on failure
 * - getCircuitState returns "closed" for unknown circuits
 * - resetCircuit clears state
 * - Custom config respects overrides
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withCircuitBreaker,
  getCircuitState,
  resetCircuit,
} from "../../../src/monitoring/index.js";

// ============================================================================
// Setup and Teardown
// ============================================================================

describe("Circuit Breaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    // Clean up any circuits from previous tests
    resetCircuit("test-circuit");
    resetCircuit("custom-circuit");
    resetCircuit("unknown-test");
    resetCircuit("reset-test");
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCircuit("test-circuit");
    resetCircuit("custom-circuit");
    resetCircuit("unknown-test");
    resetCircuit("reset-test");
  });

  // ==========================================================================
  // Closed State Tests
  // ==========================================================================

  describe("closed circuit", () => {
    it("executes operation normally and returns result", async () => {
      const operation = vi.fn().mockResolvedValue("success");

      const result = await withCircuitBreaker("test-circuit", operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
      expect(getCircuitState("test-circuit")).toBe("closed");
    });

    it("remains closed after a single failure", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("transient error"));

      await expect(withCircuitBreaker("test-circuit", operation)).rejects.toThrow(
        "transient error"
      );

      expect(getCircuitState("test-circuit")).toBe("closed");
    });
  });

  // ==========================================================================
  // Closed -> Open Transition Tests
  // ==========================================================================

  describe("closed -> open transition", () => {
    it("opens after default failure threshold (5 failures)", async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error("fail"));

      // Trigger 5 failures (default threshold)
      for (let i = 0; i < 5; i++) {
        await expect(withCircuitBreaker("test-circuit", failingOperation)).rejects.toThrow("fail");
      }

      // Circuit should now be open
      expect(getCircuitState("test-circuit")).toBe("open");

      // 6th call should be rejected immediately without calling operation
      const freshOperation = vi.fn().mockResolvedValue("should not be called");
      await expect(withCircuitBreaker("test-circuit", freshOperation)).rejects.toThrow(
        /Circuit breaker.*is open/
      );

      expect(freshOperation).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Open -> Half-open Transition Tests
  // ==========================================================================

  describe("open -> half-open transition", () => {
    it("transitions to half-open after timeout elapses", async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error("fail"));

      // Open the circuit (5 failures)
      for (let i = 0; i < 5; i++) {
        await expect(withCircuitBreaker("test-circuit", failingOperation)).rejects.toThrow("fail");
      }

      expect(getCircuitState("test-circuit")).toBe("open");

      // Advance past default timeout (60,000ms)
      vi.advanceTimersByTime(60_001);

      // getCircuitState should report half-open after timeout
      expect(getCircuitState("test-circuit")).toBe("half-open");

      // Next call should execute the operation (probe request)
      const probeOperation = vi.fn().mockResolvedValue("probe success");
      const result = await withCircuitBreaker("test-circuit", probeOperation);

      expect(result).toBe("probe success");
      expect(probeOperation).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Half-open -> Closed Transition Tests
  // ==========================================================================

  describe("half-open -> closed transition", () => {
    it("closes circuit on success in half-open state", async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error("fail"));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await expect(withCircuitBreaker("test-circuit", failingOperation)).rejects.toThrow("fail");
      }

      // Advance past timeout to go to half-open
      vi.advanceTimersByTime(60_001);

      // Successful probe should close the circuit
      const successOperation = vi.fn().mockResolvedValue("recovered");
      await withCircuitBreaker("test-circuit", successOperation);

      expect(getCircuitState("test-circuit")).toBe("closed");

      // Subsequent calls should work normally
      const normalOperation = vi.fn().mockResolvedValue("normal");
      const result = await withCircuitBreaker("test-circuit", normalOperation);
      expect(result).toBe("normal");
    });
  });

  // ==========================================================================
  // Half-open -> Open Transition Tests
  // ==========================================================================

  describe("half-open -> open transition", () => {
    it("re-opens circuit on failure in half-open state", async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error("fail"));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await expect(withCircuitBreaker("test-circuit", failingOperation)).rejects.toThrow("fail");
      }

      // Advance past timeout to go to half-open
      vi.advanceTimersByTime(60_001);

      // Failed probe should re-open the circuit
      const failedProbe = vi.fn().mockRejectedValue(new Error("still broken"));
      await expect(withCircuitBreaker("test-circuit", failedProbe)).rejects.toThrow("still broken");

      expect(getCircuitState("test-circuit")).toBe("open");

      // Should reject immediately again
      const nextCall = vi.fn().mockResolvedValue("should not run");
      await expect(withCircuitBreaker("test-circuit", nextCall)).rejects.toThrow(
        /Circuit breaker.*is open/
      );
      expect(nextCall).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // successThreshold > 1 Tests
  // ==========================================================================

  describe("successThreshold > 1", () => {
    beforeEach(() => {
      resetCircuit("threshold-circuit");
    });

    afterEach(() => {
      resetCircuit("threshold-circuit");
    });

    it("requires multiple consecutive successes in half-open to close circuit", async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error("fail"));

      // Open the circuit with threshold 2 and successThreshold 3
      for (let i = 0; i < 2; i++) {
        await expect(
          withCircuitBreaker("threshold-circuit", failingOperation, {
            failureThreshold: 2,
            timeout: 5000,
            successThreshold: 3,
          })
        ).rejects.toThrow("fail");
      }

      expect(getCircuitState("threshold-circuit")).toBe("open");

      // Advance past timeout to go to half-open
      vi.advanceTimersByTime(5001);
      expect(getCircuitState("threshold-circuit")).toBe("half-open");

      // First success — still half-open (need 3 total)
      const successOp = vi.fn().mockResolvedValue("ok");
      await withCircuitBreaker("threshold-circuit", successOp, {
        failureThreshold: 2,
        timeout: 5000,
        successThreshold: 3,
      });
      expect(getCircuitState("threshold-circuit")).toBe("half-open");

      // Second success — still half-open
      await withCircuitBreaker("threshold-circuit", successOp, {
        failureThreshold: 2,
        timeout: 5000,
        successThreshold: 3,
      });
      expect(getCircuitState("threshold-circuit")).toBe("half-open");

      // Third success — should close
      await withCircuitBreaker("threshold-circuit", successOp, {
        failureThreshold: 2,
        timeout: 5000,
        successThreshold: 3,
      });
      expect(getCircuitState("threshold-circuit")).toBe("closed");
    });
  });

  // ==========================================================================
  // getCircuitState Tests
  // ==========================================================================

  describe("getCircuitState", () => {
    it("returns closed for unknown circuit", () => {
      expect(getCircuitState("unknown-test")).toBe("closed");
    });

    it("reflects current state after operations", async () => {
      expect(getCircuitState("test-circuit")).toBe("closed");

      const operation = vi.fn().mockResolvedValue("ok");
      await withCircuitBreaker("test-circuit", operation);

      expect(getCircuitState("test-circuit")).toBe("closed");
    });
  });

  // ==========================================================================
  // resetCircuit Tests
  // ==========================================================================

  describe("resetCircuit", () => {
    it("clears circuit state back to closed", async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error("fail"));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await expect(withCircuitBreaker("reset-test", failingOperation)).rejects.toThrow("fail");
      }

      expect(getCircuitState("reset-test")).toBe("open");

      // Reset the circuit
      resetCircuit("reset-test");

      expect(getCircuitState("reset-test")).toBe("closed");

      // Should work normally again
      const operation = vi.fn().mockResolvedValue("back to normal");
      const result = await withCircuitBreaker("reset-test", operation);
      expect(result).toBe("back to normal");
    });
  });

  // ==========================================================================
  // Custom Config Tests
  // ==========================================================================

  describe("custom config", () => {
    it("respects custom failureThreshold", async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error("fail"));

      // With custom threshold of 2
      for (let i = 0; i < 2; i++) {
        await expect(
          withCircuitBreaker("custom-circuit", failingOperation, {
            failureThreshold: 2,
          })
        ).rejects.toThrow("fail");
      }

      // Should be open after 2 failures
      expect(getCircuitState("custom-circuit")).toBe("open");
    });

    it("respects custom timeout", async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error("fail"));

      // Open with threshold 2 and custom timeout 5000ms
      for (let i = 0; i < 2; i++) {
        await expect(
          withCircuitBreaker("custom-circuit", failingOperation, {
            failureThreshold: 2,
            timeout: 5000,
          })
        ).rejects.toThrow("fail");
      }

      expect(getCircuitState("custom-circuit")).toBe("open");

      // Advance 4 seconds - still open
      vi.advanceTimersByTime(4000);
      expect(getCircuitState("custom-circuit")).toBe("open");

      // Advance past 5 seconds - should be half-open
      vi.advanceTimersByTime(1001);
      expect(getCircuitState("custom-circuit")).toBe("half-open");
    });
  });

  // ==========================================================================
  // Success Resets Failure Count
  // ==========================================================================

  describe("success resets failure count", () => {
    it("resets failure count on success in closed state", async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error("fail"));
      const successOperation = vi.fn().mockResolvedValue("ok");

      // 4 failures (below threshold of 5)
      for (let i = 0; i < 4; i++) {
        await expect(withCircuitBreaker("test-circuit", failingOperation)).rejects.toThrow("fail");
      }

      // 1 success resets the counter
      await withCircuitBreaker("test-circuit", successOperation);

      // 4 more failures should not open (counter was reset)
      for (let i = 0; i < 4; i++) {
        await expect(withCircuitBreaker("test-circuit", failingOperation)).rejects.toThrow("fail");
      }

      expect(getCircuitState("test-circuit")).toBe("closed");
    });
  });
});
