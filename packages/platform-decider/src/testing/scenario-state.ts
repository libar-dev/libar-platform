/**
 * Decider Scenario State for BDD Tests
 *
 * Provides generic scenario state management for testing pure decider functions.
 * Domain-specific tests extend these types with their CMS types.
 *
 * @module @libar-dev/platform-decider/testing
 */

import type { DeciderContext, DeciderOutput, DeciderEvent } from "../types.js";

/**
 * Internal type alias for any DeciderEvent.
 */
type AnyEvent = DeciderEvent;

/**
 * Internal type alias for any DeciderOutput.
 */
type AnyDeciderOutput = DeciderOutput<AnyEvent, unknown, unknown, AnyEvent>;

/**
 * Generic scenario state for decider tests.
 *
 * Tracks the context, current state, command, and result across
 * Given/When/Then steps.
 *
 * @typeParam TState - The CMS state type being tested (e.g., OrderCMS)
 * @typeParam TCommand - The command type (defaults to generic record)
 *
 * @example
 * ```typescript
 * import { DeciderScenarioState } from '@libar-dev/platform-decider/testing';
 * import type { OrderCMS } from './domain/order';
 *
 * // Domain-specific type alias
 * type OrderDeciderState = DeciderScenarioState<OrderCMS>;
 *
 * let state: OrderDeciderState | null = null;
 * ```
 */
export interface DeciderScenarioState<TState, TCommand = Record<string, unknown>> {
  /**
   * Decider context with timestamp and correlation IDs.
   */
  context: DeciderContext;

  /**
   * Current CMS state (null for new entity scenarios).
   */
  state: TState | null;

  /**
   * Command being tested.
   */
  command: TCommand;

  /**
   * Result from the decider (null before When step).
   */
  result: AnyDeciderOutput | null;
}

/**
 * Initialize a fresh decider scenario state.
 *
 * Creates state with default context values suitable for testing.
 * Call this in BeforeEachScenario hooks.
 *
 * @typeParam TState - The CMS state type
 * @returns Fresh scenario state with default context
 *
 * @example
 * ```typescript
 * import { initDeciderState } from '@libar-dev/platform-decider/testing';
 *
 * BeforeEachScenario(() => {
 *   state = initDeciderState<OrderCMS>();
 * });
 * ```
 */
export function initDeciderState<TState>(): DeciderScenarioState<TState> {
  return {
    context: createDeciderContext(),
    state: null,
    command: {},
    result: null,
  };
}

/**
 * Create a DeciderContext with test defaults.
 *
 * Useful when you need a context for direct decider invocation in tests.
 *
 * @param overrides - Optional overrides for context fields
 * @returns DeciderContext with test values
 *
 * @example
 * ```typescript
 * const ctx = createDeciderContext({ commandId: "cmd_special" });
 * const result = decideCreateOrder(state, command, ctx);
 * ```
 */
export function createDeciderContext(overrides?: Partial<DeciderContext>): DeciderContext {
  return {
    now: Date.now(),
    commandId: "cmd_test_001",
    correlationId: "corr_test_001",
    ...overrides,
  };
}
