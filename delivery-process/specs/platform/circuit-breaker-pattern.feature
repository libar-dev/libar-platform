@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:CircuitBreakerPattern
@libar-docs-status:roadmap
@libar-docs-phase:18b-3
@libar-docs-effort:1w
@libar-docs-product-area:Platform
@libar-docs-business-value:external-service-resilience-and-budget-preservation
@libar-docs-depends-on:DurableFunctionAdapters
@libar-docs-executable-specs:platform-core/tests/features/behavior/circuit-breaker
Feature: Circuit Breaker Pattern - External Service Resilience

  **Problem:** External API failures (Stripe, SendGrid, webhooks) cascade through the system.
  Without automatic isolation:
  - Action budget is wasted on calls destined to fail
  - Users experience long timeouts instead of fast failures
  - Partial outages become full outages via resource exhaustion
  - No automatic recovery testing when service comes back

  **Solution:** Database-backed circuit breaker with state machine:
  - **CLOSED** - Normal operation, track failure count
  - **OPEN** - Fail fast, no requests sent to failing service
  - **HALF_OPEN** - Allow one test request to check recovery
  - **Scheduled transitions** - `ctx.scheduler.runAfter` for timeout-based state changes
  - **Action Retrier integration** - Half-open probe uses Retrier with maxFailures: 0

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Budget preservation | OPEN state prevents wasting actions on failing services |
  | Fast failure | Users get immediate error instead of timeout |
  | Automatic recovery | Half-open probe tests service without manual intervention |
  | Observability | Circuit state changes are logged for alerting |
  | Per-service isolation | Each external service has independent circuit |

  **Convex Constraint:** No in-memory state across function invocations. Circuit state must
  persist in Convex table. Timeout transitions use `ctx.scheduler.runAfter`, not in-memory timers.

  # ===========================================================================
  # DELIVERABLES
  # ===========================================================================

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Circuit breaker state machine (pure) | pending | @libar-dev/platform-core/src/monitoring/circuit-breaker/stateMachine.ts | Yes | unit |
      | Circuit breaker types | pending | @libar-dev/platform-core/src/monitoring/circuit-breaker/types.ts | Yes | unit |
      | circuitBreakers table schema | pending | examples/order-management/convex/schema.ts | No | - |
      | withCircuitBreaker wrapper | pending | @libar-dev/platform-core/src/monitoring/circuit-breaker/withCircuitBreaker.ts | Yes | unit |
      | loadCircuitState query | pending | examples/order-management/convex/monitoring/circuitBreakers.ts | Yes | integration |
      | recordSuccess mutation | pending | examples/order-management/convex/monitoring/circuitBreakers.ts | Yes | integration |
      | recordFailure mutation | pending | examples/order-management/convex/monitoring/circuitBreakers.ts | Yes | integration |
      | checkHalfOpen scheduled mutation | pending | examples/order-management/convex/monitoring/circuitBreakers.ts | Yes | integration |
      | onCircuitProbeComplete handler | pending | examples/order-management/convex/monitoring/circuitBreakers.ts | Yes | integration |
      | Circuit breaker metrics | pending | examples/order-management/convex/monitoring/circuitBreakers.ts | Yes | integration |

  # ===========================================================================
  # RULE 1: State Machine Definition
  # ===========================================================================

  Rule: Circuit breaker follows three-state machine

    The circuit breaker is a state machine with well-defined transitions:

    **State Diagram:**
    """
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │   ┌──────────┐    failures >= threshold    ┌──────────┐   │
    │   │          │ ─────────────────────────► │          │   │
    │   │  CLOSED  │                             │   OPEN   │   │
    │   │          │ ◄───────────────────────── │          │   │
    │   └──────────┘    probe success            └────┬─────┘   │
    │        ▲                                        │         │
    │        │ probe success                          │         │
    │        │                                        │         │
    │   ┌────┴─────┐    resetTimeout expires         │         │
    │   │          │ ◄────────────────────────────────┘         │
    │   │HALF_OPEN │                                            │
    │   │          │ ─────────────────────────────────────────► │
    │   └──────────┘    probe failure            (back to OPEN) │
    │                                                           │
    └─────────────────────────────────────────────────────────────┘
    """

    **State Behaviors:**
    | State | Request Handling | Transitions |
    | CLOSED | Execute normally, track failures | → OPEN after threshold failures |
    | OPEN | Reject immediately (fail fast) | → HALF_OPEN after timeout |
    | HALF_OPEN | Allow single probe request | → CLOSED on success, → OPEN on failure |

    **Pure State Machine:**
    """typescript
    // stateMachine.ts - Pure function, no I/O
    export type CircuitState = "closed" | "open" | "half_open";
    export type CircuitEvent = "success" | "failure" | "timeout" | "probe_success" | "probe_failure";

    export interface CircuitBreakerState {
      state: CircuitState;
      failureCount: number;
      lastFailureAt?: number;
      openedAt?: number;
      probeRunId?: string;
    }

    export interface CircuitBreakerConfig {
      failureThreshold: number;      // Failures before opening (default: 5)
      resetTimeoutMs: number;        // Time in OPEN before half-open (default: 30000)
      successThreshold: number;      // Successes in half-open to close (default: 1)
    }

    export function computeNextState(
      current: CircuitBreakerState,
      event: CircuitEvent,
      config: CircuitBreakerConfig,
      now: number
    ): { nextState: CircuitBreakerState; sideEffect?: "schedule_timeout" | "probe_started" } {
      switch (current.state) {
        case "closed":
          if (event === "success") {
            return { nextState: { ...current, failureCount: 0 } };
          }
          if (event === "failure") {
            const newCount = current.failureCount + 1;
            if (newCount >= config.failureThreshold) {
              return {
                nextState: { state: "open", failureCount: newCount, openedAt: now },
                sideEffect: "schedule_timeout",
              };
            }
            return { nextState: { ...current, failureCount: newCount, lastFailureAt: now } };
          }
          break;

        case "open":
          if (event === "timeout") {
            return { nextState: { ...current, state: "half_open" } };
          }
          // Ignore success/failure in open state (requests are rejected)
          break;

        case "half_open":
          if (event === "probe_success") {
            return { nextState: { state: "closed", failureCount: 0 } };
          }
          if (event === "probe_failure") {
            return {
              nextState: { state: "open", failureCount: current.failureCount, openedAt: now },
              sideEffect: "schedule_timeout",
            };
          }
          break;
      }

      return { nextState: current };
    }
    """

    @acceptance-criteria @happy-path
    Scenario: Circuit remains closed on success
      Given a circuit in "closed" state with failureCount 3
      When a "success" event occurs
      Then circuit should remain "closed"
      And failureCount should reset to 0

    @acceptance-criteria @happy-path
    Scenario: Circuit opens after threshold failures
      Given a circuit in "closed" state with failureCount 4
      And failureThreshold is 5
      When a "failure" event occurs
      Then circuit should transition to "open"
      And sideEffect should be "schedule_timeout"
      And openedAt should be set to current time

    @acceptance-criteria @happy-path
    Scenario: Circuit transitions to half-open after timeout
      Given a circuit in "open" state
      When a "timeout" event occurs
      Then circuit should transition to "half_open"

    @acceptance-criteria @happy-path
    Scenario: Successful probe closes circuit
      Given a circuit in "half_open" state
      When a "probe_success" event occurs
      Then circuit should transition to "closed"
      And failureCount should be 0

    @acceptance-criteria @validation
    Scenario: Failed probe reopens circuit
      Given a circuit in "half_open" state
      When a "probe_failure" event occurs
      Then circuit should transition to "open"
      And sideEffect should be "schedule_timeout"

  # ===========================================================================
  # RULE 2: Database-Backed State
  # ===========================================================================

  Rule: Circuit state persists in Convex table

    Convex functions are stateless across invocations. Circuit state must persist
    in a table to survive function restarts and be consistent across workers.

    **Schema:**
    """typescript
    // schema.ts
    circuitBreakers: defineTable({
      name: v.string(),                    // e.g., "stripe-api", "sendgrid"
      state: v.union(v.literal("closed"), v.literal("open"), v.literal("half_open")),
      failureCount: v.number(),
      lastFailureAt: v.optional(v.number()),
      openedAt: v.optional(v.number()),
      probeRunId: v.optional(v.string()),  // Action Retrier run ID for probe
      probeScheduledAt: v.optional(v.number()),
      config: v.object({
        failureThreshold: v.number(),
        resetTimeoutMs: v.number(),
        successThreshold: v.number(),
      }),
      updatedAt: v.number(),
    }).index("by_name", ["name"]),
    """

    **State Operations:**
    """typescript
    // monitoring/circuitBreakers.ts
    export const loadCircuitState = internalQuery({
      args: { name: v.string() },
      handler: async (ctx, { name }) => {
        const circuit = await ctx.db
          .query("circuitBreakers")
          .withIndex("by_name", (q) => q.eq("name", name))
          .unique();

        if (!circuit) {
          // Default to closed with default config
          return {
            name,
            state: "closed" as const,
            failureCount: 0,
            config: DEFAULT_CIRCUIT_CONFIG,
          };
        }

        return circuit;
      },
    });

    export const updateCircuitState = internalMutation({
      args: {
        name: v.string(),
        event: v.union(v.literal("success"), v.literal("failure"), /* ... */),
      },
      handler: async (ctx, { name, event }) => {
        const current = await loadCircuitState(ctx, { name });
        const { nextState, sideEffect } = computeNextState(
          current,
          event,
          current.config,
          Date.now()
        );

        // Upsert circuit state
        if (current._id) {
          await ctx.db.patch(current._id, { ...nextState, updatedAt: Date.now() });
        } else {
          await ctx.db.insert("circuitBreakers", {
            name,
            ...nextState,
            config: current.config,
            updatedAt: Date.now(),
          });
        }

        // Handle side effects
        if (sideEffect === "schedule_timeout") {
          await ctx.scheduler.runAfter(
            current.config.resetTimeoutMs,
            internal.monitoring.circuitBreakers.onTimeout,
            { name, openedAt: nextState.openedAt }
          );
        }

        return nextState;
      },
    });
    """

    @acceptance-criteria @happy-path
    Scenario: Circuit state persists across function calls
      Given a circuit "stripe-api" in "closed" state
      When two concurrent requests fail
      Then both failures should be recorded
      And failureCount should be 2 (not 1)

    @acceptance-criteria @validation
    Scenario: Non-existent circuit defaults to closed
      Given no circuit entry for "new-service"
      When loading circuit state
      Then state should be "closed"
      And failureCount should be 0
      And default config should be applied

  # ===========================================================================
  # RULE 3: Scheduled Timeout Transitions
  # ===========================================================================

  Rule: Open-to-half-open transition uses scheduler

    The OPEN → HALF_OPEN transition happens after `resetTimeoutMs` elapses.
    Since Convex has no in-memory timers, use `ctx.scheduler.runAfter`.

    **Important:** Schedule is a one-shot, not a recurring cron. Each circuit-open
    event schedules its own timeout.

    **Timeout Handler:**
    """typescript
    export const onTimeout = internalMutation({
      args: {
        name: v.string(),
        openedAt: v.number(),  // Guard against stale timeouts
      },
      handler: async (ctx, { name, openedAt }) => {
        const current = await ctx.db
          .query("circuitBreakers")
          .withIndex("by_name", (q) => q.eq("name", name))
          .unique();

        if (!current) return;

        // Guard: only transition if still open AND openedAt matches
        // (prevents stale timeout from older open-close-open cycle)
        if (current.state !== "open" || current.openedAt !== openedAt) {
          return { skipped: true, reason: "circuit state changed" };
        }

        const { nextState } = computeNextState(current, "timeout", current.config, Date.now());
        await ctx.db.patch(current._id, { ...nextState, updatedAt: Date.now() });

        return { transitioned: true, newState: nextState.state };
      },
    });
    """

    **Why Guard with openedAt:**
    Without the guard, this could happen:
    1. Circuit opens at T=0, schedules timeout for T=30s
    2. Manual intervention closes circuit at T=10s
    3. Circuit opens again at T=20s, schedules timeout for T=50s
    4. Stale timeout fires at T=30s, transitions to half-open unexpectedly

    The `openedAt` guard ensures only the timeout from the current open cycle fires.

    @acceptance-criteria @happy-path
    Scenario: Timeout transitions open to half-open
      Given a circuit "stripe-api" opened at timestamp 1000
      And resetTimeoutMs is 30000
      When timeout fires at timestamp 31000
      Then circuit should transition to "half_open"

    @acceptance-criteria @validation
    Scenario: Stale timeout is ignored
      Given a circuit "stripe-api" was opened at timestamp 1000
      And circuit was manually closed at timestamp 10000
      And circuit opened again at timestamp 20000
      When stale timeout fires with openedAt=1000
      Then timeout should be skipped
      And circuit should remain in current state

  # ===========================================================================
  # RULE 4: Action Retrier Integration for Probes
  # ===========================================================================

  Rule: Half-open probes use Action Retrier with zero retries

    When circuit enters HALF_OPEN, we need to test if the service recovered.
    Use Action Retrier with `maxFailures: 0` (no retries) for a controlled probe.

    **Why Action Retrier:**
    - Provides `onComplete` callback for probe result handling
    - Tracks run ID for correlating probe result with circuit
    - No retries means single attempt for clean pass/fail signal

    **Probe Pattern:**
    """typescript
    import { ActionRetrier } from "@convex-dev/action-retrier";

    export async function executeWithCircuitBreaker<T>(
      ctx: ActionCtx,
      circuitName: string,
      operation: FunctionReference<"action">,
      args: Record<string, unknown>
    ): Promise<{ result: T } | { error: string; retryAfterMs?: number }> {
      const circuit = await loadCircuitState(ctx, { name: circuitName });

      if (circuit.state === "open") {
        const retryAfterMs = circuit.config.resetTimeoutMs -
          (Date.now() - (circuit.openedAt ?? Date.now()));
        return { error: `CIRCUIT_OPEN:${circuitName}`, retryAfterMs };
      }

      if (circuit.state === "half_open") {
        // Probe mode: single attempt, no retries
        const runId = await retrier.run(ctx, operation, args, {
          maxFailures: 0,  // No retries
          onComplete: internal.monitoring.circuitBreakers.onProbeComplete,
        });

        // Track probe run ID
        await ctx.runMutation(internal.monitoring.circuitBreakers.setProbeRunId, {
          name: circuitName,
          runId,
        });

        return { result: "PROBE_STARTED" as T, probeRunId: runId };
      }

      // Closed state: normal execution with failure tracking
      try {
        const result = await ctx.runAction(operation, args);
        await ctx.runMutation(internal.monitoring.circuitBreakers.recordSuccess, {
          name: circuitName,
        });
        return { result };
      } catch (error) {
        await ctx.runMutation(internal.monitoring.circuitBreakers.recordFailure, {
          name: circuitName,
          error: String(error),
        });
        throw error;
      }
    }

    // Probe completion handler
    export const onProbeComplete = internalMutation({
      args: { result: runResultValidator },
      handler: async (ctx, { result }) => {
        // Find circuit by probeRunId
        const circuit = await ctx.db
          .query("circuitBreakers")
          .filter((q) => q.eq(q.field("probeRunId"), result.runId))
          .unique();

        if (!circuit) return;

        if (result.type === "success") {
          await updateCircuitState(ctx, { name: circuit.name, event: "probe_success" });
        } else {
          await updateCircuitState(ctx, { name: circuit.name, event: "probe_failure" });
        }

        // Clear probe run ID
        await ctx.db.patch(circuit._id, { probeRunId: undefined });
      },
    });
    """

    @acceptance-criteria @happy-path
    Scenario: Half-open probe closes circuit on success
      Given a circuit "stripe-api" in "half_open" state
      When a probe request succeeds
      Then onProbeComplete should receive success result
      And circuit should transition to "closed"
      And probeRunId should be cleared

    @acceptance-criteria @validation
    Scenario: Half-open probe reopens circuit on failure
      Given a circuit "stripe-api" in "half_open" state
      When a probe request fails
      Then onProbeComplete should receive failed result
      And circuit should transition to "open"
      And a new timeout should be scheduled

    @acceptance-criteria @happy-path
    Scenario: Open circuit returns fast failure
      Given a circuit "stripe-api" in "open" state
      And circuit opened 10 seconds ago
      And resetTimeoutMs is 30000
      When a request is attempted
      Then request should fail immediately with "CIRCUIT_OPEN:stripe-api"
      And retryAfterMs should be approximately 20000

  # ===========================================================================
  # RULE 5: Configuration per Service
  # ===========================================================================

  Rule: Each external service has independent circuit configuration

    Different services have different failure characteristics. A payment API
    might need a higher threshold than a notification service.

    **Configuration Options:**
    | Option | Default | Description |
    | failureThreshold | 5 | Consecutive failures before opening |
    | resetTimeoutMs | 30000 | Time in open state before half-open |
    | successThreshold | 1 | Successes in half-open before closing |

    **Per-Service Configuration:**
    """typescript
    // Infrastructure setup
    const circuitConfigs: Record<string, CircuitBreakerConfig> = {
      "stripe-api": {
        failureThreshold: 3,    // Payment is critical, open quickly
        resetTimeoutMs: 60000,  // Wait longer before retrying payments
        successThreshold: 1,
      },
      "sendgrid": {
        failureThreshold: 10,   // Email is less critical
        resetTimeoutMs: 30000,
        successThreshold: 1,
      },
      "webhook-delivery": {
        failureThreshold: 5,
        resetTimeoutMs: 15000,  // Retry webhooks more frequently
        successThreshold: 2,    // Require 2 successes to fully close
      },
    };
    """

    @acceptance-criteria @happy-path
    Scenario: Payment circuit opens after 3 failures
      Given a circuit "stripe-api" with failureThreshold 3
      When 3 consecutive failures occur
      Then circuit should be "open"

    @acceptance-criteria @happy-path
    Scenario: Email circuit tolerates more failures
      Given a circuit "sendgrid" with failureThreshold 10
      When 5 failures occur
      Then circuit should still be "closed"
      And failureCount should be 5

    @acceptance-criteria @validation
    Scenario: Different services have independent circuits
      Given circuit "stripe-api" is "open"
      And circuit "sendgrid" is "closed"
      When a Stripe request is made
      Then it should fail fast
      When a SendGrid request is made
      Then it should execute normally
