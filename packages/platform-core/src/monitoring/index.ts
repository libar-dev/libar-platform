/**
 * ## Production Hardening - Observability and Operational Tooling
 *
 * Production-ready observability, monitoring, and operational tooling.
 *
 * Comprehensive production hardening including advanced observability, monitoring
 * dashboards, error tracking, performance profiling, and operational tooling. Builds
 * on existing logging infrastructure with metrics collection, distributed tracing,
 * and health check endpoints. Implements circuit breakers, rate limiting refinements,
 * and graceful degradation patterns.
 *
 * ### When to Use
 *
 * - When preparing for production deployment
 * - When operational visibility is critical
 * - When you need SLA monitoring and alerting
 * - When debugging production issues requires deep observability
 *
 * ### Key Components
 *
 * - **Metrics Collection**: Prometheus/Grafana integration
 * - **Distributed Tracing**: OpenTelemetry for request correlation
 * - **Health Checks**: Liveness and readiness probes
 * - **Circuit Breakers**: Fault tolerance for external dependencies
 * - **Admin Tooling**: Projection rebuild, DLQ management, diagnostics
 *
 * ### Observability Layers
 *
 * 1. **Metrics**: Counters, gauges, histograms (command latency, event throughput)
 * 2. **Logs**: Structured logging with correlation IDs (existing)
 * 3. **Traces**: Request flow across components (OpenTelemetry)
 * 4. **Profiles**: CPU/memory profiling for performance optimization
 *
 * @example
 * ```typescript
 * // Health check endpoint
 * const health = await checkSystemHealth(ctx);
 * // { status: 'healthy', components: { eventStore: 'up', workpool: 'up' } }
 *
 * // Circuit breaker for external API
 * const result = await withCircuitBreaker('payment-gateway', async () => {
 *   return await callPaymentAPI();
 * });
 * ```
 */

/**
 * System health status.
 */
export interface SystemHealth {
  /** Overall status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Component-level health */
  components: Record<string, "up" | "down" | "degraded">;
  /** Optional details */
  details?: Record<string, unknown>;
}

/**
 * Circuit breaker states.
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Failure threshold before opening */
  failureThreshold: number;
  /** Timeout before attempting recovery (ms) */
  timeout: number;
  /** Success threshold in half-open state */
  successThreshold: number;
}

// ============================================================================
// Circuit Breaker Defaults
// ============================================================================

/**
 * Default circuit breaker configuration.
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  timeout: 60_000,
  successThreshold: 1,
};

// ============================================================================
// Circuit Breaker Internal State
// ============================================================================

/**
 * Internal state for a circuit breaker instance.
 */
interface CircuitBreakerState {
  /** Current circuit state */
  state: CircuitState;
  /** Number of consecutive failures */
  failureCount: number;
  /** Number of consecutive successes in half-open state */
  successCount: number;
  /** Timestamp when the circuit was opened (ms since epoch) */
  openedAt: number;
  /** Configuration for this circuit */
  config: CircuitBreakerConfig;
}

/**
 * In-memory circuit breaker state registry.
 *
 * WARNING — CONVEX EXECUTION MODEL LIMITATION:
 * Each Convex function invocation runs in a fresh V8 isolate. This Map
 * resets on every invocation. The circuit breaker state does NOT persist
 * across function calls.
 *
 * This means the circuit breaker is ONLY useful within a single action
 * that makes multiple sequential calls to the same external service
 * (e.g., an action that calls 5 LLM APIs — if the first calls fail,
 * subsequent calls in the SAME action are rejected).
 *
 * For cross-invocation circuit breaking, table-backed state is required.
 * @see Phase 18 (ProductionHardening) for table-backed implementation.
 *
 * @internal
 */
const circuits = new Map<string, CircuitBreakerState>();

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Get or create the internal state for a named circuit breaker.
 *
 * @param name - Circuit breaker name
 * @param config - Optional configuration overrides
 * @returns Circuit breaker state
 */
function getOrCreateCircuit(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreakerState {
  const existing = circuits.get(name);
  if (existing) {
    return existing;
  }

  const effectiveConfig: CircuitBreakerConfig = {
    ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
    ...config,
  };

  const state: CircuitBreakerState = {
    state: "closed",
    failureCount: 0,
    successCount: 0,
    openedAt: 0,
    config: effectiveConfig,
  };

  circuits.set(name, state);
  return state;
}

/**
 * Record a successful operation for a circuit.
 *
 * @param circuit - Circuit breaker state to update
 */
function recordSuccess(circuit: CircuitBreakerState): void {
  if (circuit.state === "half-open") {
    circuit.successCount++;
    if (circuit.successCount >= circuit.config.successThreshold) {
      // Enough successes — close the circuit
      circuit.state = "closed";
      circuit.failureCount = 0;
      circuit.successCount = 0;
    }
  } else if (circuit.state === "closed") {
    // Reset failure count on success
    circuit.failureCount = 0;
  }
}

/**
 * Record a failed operation for a circuit.
 *
 * @param circuit - Circuit breaker state to update
 */
function recordFailure(circuit: CircuitBreakerState): void {
  circuit.failureCount++;

  if (circuit.state === "half-open") {
    // Any failure in half-open → back to open
    circuit.state = "open";
    circuit.openedAt = Date.now();
    circuit.successCount = 0;
  } else if (
    circuit.state === "closed" &&
    circuit.failureCount >= circuit.config.failureThreshold
  ) {
    // Threshold reached — open the circuit
    circuit.state = "open";
    circuit.openedAt = Date.now();
  }
}

/**
 * Check if an open circuit should transition to half-open.
 *
 * @param circuit - Circuit breaker state to check
 * @returns true if timeout has elapsed and circuit should probe
 */
function shouldAttemptRecovery(circuit: CircuitBreakerState): boolean {
  if (circuit.state !== "open") {
    return false;
  }
  return Date.now() - circuit.openedAt >= circuit.config.timeout;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check overall system health.
 *
 * @param ctx - Convex query context
 * @returns System health status
 */
export function checkSystemHealth(ctx: unknown): Promise<SystemHealth> {
  throw new Error("ProductionHardening not yet implemented - roadmap pattern");
}

/**
 * Execute operation with circuit breaker protection.
 *
 * State machine:
 * - **closed**: Operations execute normally. On failure, increment failure count.
 *   If failure count reaches threshold, transition to **open**.
 * - **open**: Operations are rejected immediately with an error.
 *   After timeout elapses, transition to **half-open**.
 * - **half-open**: Allow one probe request. On success, transition to **closed**.
 *   On failure, transition back to **open**.
 *
 * @param name - Circuit breaker name (each name tracks independent state)
 * @param operation - Async operation to execute
 * @param config - Optional circuit breaker configuration overrides
 * @returns Operation result
 * @throws {Error} If circuit is open (with "Circuit breaker open" message)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await withCircuitBreaker('payment-gateway', async () => {
 *   return await callPaymentAPI();
 * });
 *
 * // With custom config
 * const result = await withCircuitBreaker('email-service', sendEmail, {
 *   failureThreshold: 3,
 *   timeout: 30_000,
 * });
 * ```
 */
export async function withCircuitBreaker<T>(
  name: string,
  operation: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const circuit = getOrCreateCircuit(name, config);

  // Check if open circuit should attempt recovery
  if (circuit.state === "open") {
    if (shouldAttemptRecovery(circuit)) {
      circuit.state = "half-open";
      circuit.successCount = 0;
    } else {
      throw new Error(
        `Circuit breaker '${name}' is open. Retry after ${circuit.config.timeout}ms.`
      );
    }
  }

  try {
    const result = await operation();
    recordSuccess(circuit);
    return result;
  } catch (error) {
    recordFailure(circuit);
    throw error;
  }
}

/**
 * Get the current state of a named circuit breaker.
 *
 * Useful for observability dashboards and health checks.
 *
 * @param name - Circuit breaker name
 * @returns Current circuit state, or "closed" if no circuit exists
 *
 * @example
 * ```typescript
 * const state = getCircuitState('payment-gateway');
 * if (state === 'open') {
 *   // Payment gateway circuit is tripped
 * }
 * ```
 */
export function getCircuitState(name: string): CircuitState {
  const circuit = circuits.get(name);
  if (!circuit) {
    return "closed";
  }

  // Check if an open circuit should be half-open
  if (circuit.state === "open" && shouldAttemptRecovery(circuit)) {
    return "half-open";
  }

  return circuit.state;
}

/**
 * Reset a named circuit breaker to closed state.
 *
 * Useful for testing and manual recovery. Removes all tracked
 * state for the circuit, returning it to a clean initial state.
 *
 * @param name - Circuit breaker name to reset
 *
 * @example
 * ```typescript
 * // In test teardown
 * resetCircuit('payment-gateway');
 *
 * // Manual recovery after fixing an external dependency
 * resetCircuit('email-service');
 * ```
 */
export function resetCircuit(name: string): void {
  circuits.delete(name);
}
