/**
 * ## Agent as Bounded Context - AI Agent Event Reactor Pattern
 *
 * Enable AI agents as first-class bounded contexts that subscribe to domain events
 * and emit commands autonomously.
 *
 * Implements Agent as Bounded Context pattern where AI agents subscribe to domain
 * events via EventBus and emit commands based on pattern detection. Integrates
 * with @convex-dev/agent for LLM reasoning. Establishes patterns for agent state
 * management, EventBus subscriptions, and command validation.
 *
 * ### When to Use
 *
 * - When implementing AI-driven automation based on domain events
 * - When you need autonomous command emission from agents
 * - When integrating LLM reasoning with event-sourced systems
 * - When building intelligent event reactors
 *
 * ### Key Concepts
 *
 * - **Agent BC**: AI agent as first-class bounded context
 * - **Event Subscription**: Agent subscribes to EventBus events
 * - **Pattern Detection**: Agent detects patterns in event streams
 * - **Autonomous Commands**: Agent emits commands based on detected patterns
 *
 * @example
 * ```typescript
 * // Create agent BC that reacts to OrderSubmitted events
 * const agentBC = createAgentBC({
 *   subscriptions: ['OrderSubmitted', 'PaymentReceived'],
 *   onEvent: async (event, ctx) => {
 *     const decision = await ctx.agent.reason(event);
 *     if (decision.shouldReserveInventory) {
 *       return { command: 'ReserveStock', payload: decision.reservation };
 *     }
 *   }
 * });
 * ```
 */

/**
 * Configuration for Agent Bounded Context.
 *
 * Defines event subscriptions and reasoning handler for autonomous
 * command emission based on domain event patterns.
 */
export interface AgentBCConfig {
  /** Event types to subscribe to */
  readonly subscriptions: readonly string[];
  /** Agent reasoning handler invoked for each subscribed event */
  readonly onEvent: (event: unknown, ctx: AgentContext) => Promise<AgentDecision | null>;
}

/**
 * Context provided to agent reasoning handler.
 *
 * Provides access to agent reasoning capabilities and event history
 * for context-aware decision making.
 */
export interface AgentContext {
  /** Agent reasoning interface (integrates with @convex-dev/agent) */
  readonly agent: {
    readonly reason: (event: unknown) => Promise<unknown>;
  };
  /** Event history for context (recent events in stream) */
  readonly history: readonly unknown[];
}

/**
 * Decision output from agent reasoning.
 *
 * Represents a command to be emitted based on agent's pattern
 * detection and reasoning over domain events.
 */
export interface AgentDecision {
  /** Command type to emit */
  readonly command: string;
  /** Command payload */
  readonly payload: unknown;
  /** Confidence score (0-1, optional) */
  readonly confidence?: number;
}

/**
 * Create Agent Bounded Context.
 *
 * Registers an AI agent as a first-class bounded context that
 * subscribes to domain events and autonomously emits commands.
 *
 * @param _config - Agent BC configuration (unused - roadmap pattern)
 * @returns Agent BC instance (opaque handle)
 *
 * @throws Error - Pattern not yet implemented (roadmap)
 */
export function createAgentBC(_config: AgentBCConfig): unknown {
  throw new Error("AgentAsBoundedContext not yet implemented - roadmap pattern");
}
