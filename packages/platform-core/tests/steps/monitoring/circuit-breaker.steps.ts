/**
 * Circuit Breaker - Step Definitions
 *
 * BDD step definitions for circuit breaker behavior:
 * - Closed circuit: operations execute normally
 * - Closed -> Open: after N failures (default threshold 5)
 * - Open -> Half-open: after timeout elapses
 * - Half-open -> Closed: on success
 * - Half-open -> Open: on failure
 * - successThreshold > 1
 * - getCircuitState returns "closed" for unknown circuits
 * - resetCircuit clears state
 * - Custom config respects overrides
 * - Success resets failure count
 *
 * Mechanical migration from tests/unit/monitoring/circuit-breaker.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  withCircuitBreaker,
  getCircuitState,
  resetCircuit,
} from "../../../src/monitoring/index.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  lastResult: unknown;
  lastError: Error | null;
  queriedState: string | null;
}

let state: TestState;

function resetState(): void {
  state = {
    lastResult: null,
    lastError: null,
    queriedState: null,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/** Open a circuit by triggering N failures with default config */
async function openCircuitByFailures(circuitName: string, count: number): Promise<void> {
  const failingOp = vi.fn().mockRejectedValue(new Error("fail"));
  for (let i = 0; i < count; i++) {
    await expect(withCircuitBreaker(circuitName, failingOp)).rejects.toThrow("fail");
  }
}

/** Open a circuit with custom config */
async function openCircuitWithConfig(
  circuitName: string,
  config: { failureThreshold: number; timeout?: number; successThreshold?: number }
): Promise<void> {
  const failingOp = vi.fn().mockRejectedValue(new Error("fail"));
  for (let i = 0; i < config.failureThreshold; i++) {
    await expect(withCircuitBreaker(circuitName, failingOp, config)).rejects.toThrow("fail");
  }
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/monitoring/circuit-breaker.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    resetCircuit("test-circuit");
    resetCircuit("custom-circuit");
    resetCircuit("unknown-test");
    resetCircuit("reset-test");
    resetCircuit("threshold-circuit");
  });

  AfterEachScenario(() => {
    vi.useRealTimers();
    resetCircuit("test-circuit");
    resetCircuit("custom-circuit");
    resetCircuit("unknown-test");
    resetCircuit("reset-test");
    resetCircuit("threshold-circuit");
  });

  // ==========================================================================
  // Rule: A closed circuit executes operations normally
  // ==========================================================================

  Rule("A closed circuit executes operations normally", ({ RuleScenario }) => {
    RuleScenario("Operation executes normally and returns result", ({ Given, When, Then, And }) => {
      const operation = vi.fn().mockResolvedValue("success");

      Given('a circuit "test-circuit" in closed state', () => {
        // Already reset in BeforeEachScenario
      });

      When("I execute a succeeding operation through the circuit breaker", async () => {
        state.lastResult = await withCircuitBreaker("test-circuit", operation);
      });

      Then('the operation result is "success"', () => {
        expect(state.lastResult).toBe("success");
      });

      And("the operation was called 1 time", () => {
        expect(operation).toHaveBeenCalledTimes(1);
      });

      And('the circuit state is "closed"', () => {
        expect(getCircuitState("test-circuit")).toBe("closed");
      });
    });

    RuleScenario("Circuit remains closed after a single failure", ({ Given, When, Then, And }) => {
      const operation = vi.fn().mockRejectedValue(new Error("transient error"));

      Given('a circuit "test-circuit" in closed state', () => {
        // Already reset
      });

      When("I execute a failing operation through the circuit breaker", async () => {
        try {
          await withCircuitBreaker("test-circuit", operation);
        } catch (e) {
          state.lastError = e as Error;
        }
      });

      Then('the operation throws "transient error"', () => {
        expect(state.lastError).toBeDefined();
        expect(state.lastError!.message).toBe("transient error");
      });

      And('the circuit state is "closed"', () => {
        expect(getCircuitState("test-circuit")).toBe("closed");
      });
    });
  });

  // ==========================================================================
  // Rule: A closed circuit opens after reaching the failure threshold
  // ==========================================================================

  Rule("A closed circuit opens after reaching the failure threshold", ({ RuleScenario }) => {
    RuleScenario(
      "Circuit opens after default failure threshold of 5 failures",
      ({ Given, When, Then, And }) => {
        Given('a circuit "test-circuit" in closed state', () => {
          // Already reset
        });

        When('I trigger 5 consecutive failures on circuit "test-circuit"', async () => {
          await openCircuitByFailures("test-circuit", 5);
        });

        Then('the circuit state is "open"', () => {
          expect(getCircuitState("test-circuit")).toBe("open");
        });

        And(
          'the next operation on circuit "test-circuit" is rejected without invocation',
          async () => {
            const freshOperation = vi.fn().mockResolvedValue("should not be called");
            await expect(withCircuitBreaker("test-circuit", freshOperation)).rejects.toThrow(
              /Circuit breaker.*is open/
            );
            expect(freshOperation).not.toHaveBeenCalled();
          }
        );
      }
    );
  });

  // ==========================================================================
  // Rule: An open circuit transitions to half-open after the timeout elapses
  // ==========================================================================

  Rule("An open circuit transitions to half-open after the timeout elapses", ({ RuleScenario }) => {
    RuleScenario("Circuit transitions to half-open after timeout", ({ Given, When, Then, And }) => {
      Given('a circuit "test-circuit" that has been opened by 5 failures', async () => {
        await openCircuitByFailures("test-circuit", 5);
        expect(getCircuitState("test-circuit")).toBe("open");
      });

      When("I advance time by 60001 milliseconds", () => {
        vi.advanceTimersByTime(60_001);
      });

      Then('the circuit state is "half-open"', () => {
        expect(getCircuitState("test-circuit")).toBe("half-open");
      });

      And('a probe operation on circuit "test-circuit" returns "probe success"', async () => {
        const probeOp = vi.fn().mockResolvedValue("probe success");
        const result = await withCircuitBreaker("test-circuit", probeOp);
        expect(result).toBe("probe success");
        expect(probeOp).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ==========================================================================
  // Rule: A half-open circuit closes on a successful probe
  // ==========================================================================

  Rule("A half-open circuit closes on a successful probe", ({ RuleScenario }) => {
    RuleScenario("Circuit closes on success in half-open state", ({ Given, When, Then, And }) => {
      Given('a circuit "test-circuit" in half-open state', async () => {
        await openCircuitByFailures("test-circuit", 5);
        vi.advanceTimersByTime(60_001);
        expect(getCircuitState("test-circuit")).toBe("half-open");
      });

      When(
        'I execute a succeeding operation returning "recovered" through circuit "test-circuit"',
        async () => {
          const successOp = vi.fn().mockResolvedValue("recovered");
          await withCircuitBreaker("test-circuit", successOp);
        }
      );

      Then('the circuit state is "closed"', () => {
        expect(getCircuitState("test-circuit")).toBe("closed");
      });

      And('a normal operation on circuit "test-circuit" returns "normal"', async () => {
        const normalOp = vi.fn().mockResolvedValue("normal");
        const result = await withCircuitBreaker("test-circuit", normalOp);
        expect(result).toBe("normal");
      });
    });
  });

  // ==========================================================================
  // Rule: A half-open circuit re-opens on a failed probe
  // ==========================================================================

  Rule("A half-open circuit re-opens on a failed probe", ({ RuleScenario }) => {
    RuleScenario("Circuit re-opens on failure in half-open state", ({ Given, When, Then, And }) => {
      Given('a circuit "test-circuit" in half-open state', async () => {
        await openCircuitByFailures("test-circuit", 5);
        vi.advanceTimersByTime(60_001);
        expect(getCircuitState("test-circuit")).toBe("half-open");
      });

      When(
        'I execute a failing operation throwing "still broken" through circuit "test-circuit"',
        async () => {
          const failedProbe = vi.fn().mockRejectedValue(new Error("still broken"));
          await expect(withCircuitBreaker("test-circuit", failedProbe)).rejects.toThrow(
            "still broken"
          );
        }
      );

      Then('the circuit state is "open"', () => {
        expect(getCircuitState("test-circuit")).toBe("open");
      });

      And(
        'the next operation on circuit "test-circuit" is rejected without invocation',
        async () => {
          const nextCall = vi.fn().mockResolvedValue("should not run");
          await expect(withCircuitBreaker("test-circuit", nextCall)).rejects.toThrow(
            /Circuit breaker.*is open/
          );
          expect(nextCall).not.toHaveBeenCalled();
        }
      );
    });
  });

  // ==========================================================================
  // Rule: With successThreshold > 1, multiple consecutive successes are required
  // ==========================================================================

  Rule(
    "With successThreshold > 1, multiple consecutive successes are required to close",
    ({ RuleScenario }) => {
      RuleScenario(
        "Requires 3 consecutive successes in half-open to close circuit",
        ({ Given, When, Then, And }) => {
          const config = {
            failureThreshold: 2,
            timeout: 5000,
            successThreshold: 3,
          };

          Given(
            'a circuit "threshold-circuit" opened with failureThreshold 2 and timeout 5000 and successThreshold 3',
            async () => {
              await openCircuitWithConfig("threshold-circuit", config);
              expect(getCircuitState("threshold-circuit")).toBe("open");
            }
          );

          When("I advance time by 5001 milliseconds", () => {
            vi.advanceTimersByTime(5001);
          });

          Then('the circuit state for "threshold-circuit" is "half-open"', () => {
            expect(getCircuitState("threshold-circuit")).toBe("half-open");
          });

          And(
            'the circuit "threshold-circuit" remains half-open after each success until the 3rd with config failureThreshold 2 timeout 5000 successThreshold 3',
            async () => {
              const successOp = vi.fn().mockResolvedValue("ok");

              // First success — still half-open
              await withCircuitBreaker("threshold-circuit", successOp, config);
              expect(getCircuitState("threshold-circuit")).toBe("half-open");

              // Second success — still half-open
              await withCircuitBreaker("threshold-circuit", successOp, config);
              expect(getCircuitState("threshold-circuit")).toBe("half-open");

              // Third success — should close
              await withCircuitBreaker("threshold-circuit", successOp, config);
              expect(getCircuitState("threshold-circuit")).toBe("closed");
            }
          );
        }
      );
    }
  );

  // ==========================================================================
  // Rule: getCircuitState returns the current state of a circuit
  // ==========================================================================

  Rule("getCircuitState returns the current state of a circuit", ({ RuleScenario }) => {
    RuleScenario("Returns closed for unknown circuit", ({ When, Then }) => {
      When('I query the state of circuit "unknown-test"', () => {
        state.queriedState = getCircuitState("unknown-test");
      });

      Then('the queried circuit state is "closed"', () => {
        expect(state.queriedState).toBe("closed");
      });
    });

    RuleScenario("Reflects current state after a successful operation", ({ Given, When, Then }) => {
      Given('a circuit "test-circuit" in closed state', () => {
        // Already reset
      });

      When("I execute a succeeding operation through the circuit breaker", async () => {
        const operation = vi.fn().mockResolvedValue("ok");
        await withCircuitBreaker("test-circuit", operation);
      });

      Then('the circuit state is "closed"', () => {
        expect(getCircuitState("test-circuit")).toBe("closed");
      });
    });
  });

  // ==========================================================================
  // Rule: resetCircuit clears circuit state back to closed
  // ==========================================================================

  Rule("resetCircuit clears circuit state back to closed", ({ RuleScenario }) => {
    RuleScenario("Reset clears an open circuit back to closed", ({ Given, When, Then, And }) => {
      Given('a circuit "reset-test" that has been opened by 5 failures', async () => {
        await openCircuitByFailures("reset-test", 5);
        expect(getCircuitState("reset-test")).toBe("open");
      });

      When('I reset circuit "reset-test"', () => {
        resetCircuit("reset-test");
      });

      Then('the circuit state for "reset-test" is "closed"', () => {
        expect(getCircuitState("reset-test")).toBe("closed");
      });

      And('a normal operation on circuit "reset-test" returns "back to normal"', async () => {
        const operation = vi.fn().mockResolvedValue("back to normal");
        const result = await withCircuitBreaker("reset-test", operation);
        expect(result).toBe("back to normal");
      });
    });
  });

  // ==========================================================================
  // Rule: Custom configuration overrides default thresholds and timeouts
  // ==========================================================================

  Rule("Custom configuration overrides default thresholds and timeouts", ({ RuleScenario }) => {
    RuleScenario("Respects custom failureThreshold", ({ Given, When, Then }) => {
      Given('a circuit "custom-circuit" in closed state', () => {
        // Already reset
      });

      When(
        'I trigger 2 consecutive failures on circuit "custom-circuit" with failureThreshold 2',
        async () => {
          await openCircuitWithConfig("custom-circuit", {
            failureThreshold: 2,
          });
        }
      );

      Then('the circuit state for "custom-circuit" is "open"', () => {
        expect(getCircuitState("custom-circuit")).toBe("open");
      });
    });

    RuleScenario("Respects custom timeout", ({ Given, When, Then }) => {
      Given(
        'a circuit "custom-circuit" opened with failureThreshold 2 and timeout 5000',
        async () => {
          await openCircuitWithConfig("custom-circuit", {
            failureThreshold: 2,
            timeout: 5000,
          });
          expect(getCircuitState("custom-circuit")).toBe("open");
        }
      );

      When("I advance time by 4000 milliseconds", () => {
        vi.advanceTimersByTime(4000);
      });

      Then('the circuit state for "custom-circuit" is "open"', () => {
        expect(getCircuitState("custom-circuit")).toBe("open");
      });

      When("I advance time by 1001 milliseconds", () => {
        vi.advanceTimersByTime(1001);
      });

      Then('the circuit state for "custom-circuit" is "half-open"', () => {
        expect(getCircuitState("custom-circuit")).toBe("half-open");
      });
    });
  });

  // ==========================================================================
  // Rule: A success in closed state resets the failure counter
  // ==========================================================================

  Rule("A success in closed state resets the failure counter", ({ RuleScenario }) => {
    RuleScenario(
      "Failure count resets on success in closed state",
      ({ Given, When, Then, And }) => {
        Given('a circuit "test-circuit" in closed state', () => {
          // Already reset
        });

        When('I trigger 4 consecutive failures on circuit "test-circuit"', async () => {
          const failingOp = vi.fn().mockRejectedValue(new Error("fail"));
          for (let i = 0; i < 4; i++) {
            await expect(withCircuitBreaker("test-circuit", failingOp)).rejects.toThrow("fail");
          }
        });

        And("I execute a succeeding operation through the circuit breaker", async () => {
          const successOp = vi.fn().mockResolvedValue("ok");
          await withCircuitBreaker("test-circuit", successOp);
        });

        And('I trigger 4 more consecutive failures on circuit "test-circuit"', async () => {
          const failingOp = vi.fn().mockRejectedValue(new Error("fail"));
          for (let i = 0; i < 4; i++) {
            await expect(withCircuitBreaker("test-circuit", failingOp)).rejects.toThrow("fail");
          }
        });

        Then('the circuit state is "closed"', () => {
          expect(getCircuitState("test-circuit")).toBe("closed");
        });
      }
    );
  });
});
