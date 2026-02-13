# 🚧 Agent LLM Integration

**Purpose:** Detailed documentation for the Agent LLM Integration pattern

---

## Overview

| Property | Value  |
| -------- | ------ |
| Status   | active |
| Category | DDD    |
| Phase    | 22     |

## Description

**Problem:** The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that
cannot call external APIs. The LLM runtime (`_llm/runtime.ts`) exists with OpenRouter
integration but is never invoked because mutations cannot make HTTP calls. Additionally,
rate limiting config exists as types only — no runtime enforcement protects against
runaway LLM costs.

**Solution:** Implement hybrid action/mutation handler pattern:

1. **Action handler factory** — EventBus delivers to Workpool action (not mutation)
2. **onComplete mutation** — Persists state atomically after LLM analysis
3. **Rate limiting enforcement** — `@convex-dev/rate-limiter` token bucket per agent
4. **Cost budget tracking** — Daily spend limits with automatic pause
5. **LLM fallback** — Graceful degradation to rule-based when LLM unavailable

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| LLM integration works | Actions can make external HTTP calls (mutations cannot) |
| Atomic persistence | Mutations in onComplete provide transactional guarantees |
| Cost control | Rate limiting prevents runaway LLM API costs |
| Graceful degradation | Fallback to rules when LLM unavailable or rate-limited |
| Conversation context | Thread adapter retains analysis history across events |
| Fault isolation | Circuit breaker prevents cascade failures from LLM outages |

**The Fundamental Constraint:**

| Function Type | Can Call External APIs | Database Writes | Workpool Retry |
| Mutation | No | Yes (atomic) | No (OCC auto-retry) |
| Action | Yes (fetch, LLM) | No (must use runMutation) | Yes (if enabled) |

This means the current single-mutation handler architecture fundamentally blocks LLM
integration. The solution requires splitting into action (LLM) + mutation (persist).

**Action/Mutation Split Architecture:**
"""
EventBus
|
v
Workpool.enqueueAction (agent event handler)
|
+--- 1. Load checkpoint (via runQuery)
+--- 2. Check idempotency (skip if already processed)
+--- 3. Load event history (via cross-component query)
+--- 4. Evaluate rule trigger (cheap, no LLM)
+--- 5. If triggered: call LLM analysis (external API)
+--- 6. Return AgentDecision
|
v
onComplete Mutation
|
+--- 7. Validate decision
+--- 8. Record to agent component (audit, command)
+--- 9. Create pending approval (if needed)
+--- 10. Update checkpoint
+--- 11. Handle failure (dead letter)
"""

**Design Decision: @convex-dev/agent Integration**

| Option | Trade-off |
| A: Full @convex-dev/agent | Thread management, tool execution, but opinionated patterns that may conflict with event-reactive architecture |
| B: Vercel AI SDK only (current) | More control, but must implement thread/tool patterns manually |
| C: Hybrid (Recommended) | Use @convex-dev/agent for threads and tools, keep custom EventBus subscription and pattern detection |

**Decision:** Option C — Hybrid approach.

- **@convex-dev/agent provides:** Thread management (conversation context), tool execution (structured tool calls), model abstraction
- **Platform provides:** EventBus subscription, pattern detection triggers, checkpoint/audit infrastructure, rate limiting
- **Integration point:** Agent action handler creates/resumes thread per customer, uses @convex-dev/agent for LLM call, returns result to platform's onComplete handler

**Design Decision: Rate Limiting Implementation**

Use `@convex-dev/rate-limiter` component (already installed in example app):

- **Token bucket per agent** — configurable maxRequestsPerMinute
- **Cost budget** — daily USD limit with alertThreshold and hard pause
- **Exceeded behavior** — queue event for later retry, or dead letter if queue full

| Rate Limit Type | Mechanism | Action When Exceeded |
| Requests/minute | Token bucket (@convex-dev/rate-limiter) | Queue for retry |
| Concurrent calls | Workpool maxParallelism | Natural backpressure |
| Daily cost budget | Custom tracker (agent component table) | Pause agent |
| Queue overflow | Workpool queueDepth | Dead letter |

**Design Decision: LLM Fallback Strategy**

When LLM is unavailable (API key missing, rate limited, circuit breaker open):

1. Fall back to rule-based confidence scoring (existing logic in \_config.ts)
2. Record fallback decision with `analysisMethod: "rule-based-fallback"` in audit
3. Apply lower confidence threshold for fallback decisions (configurable)

This ensures the agent continues providing value even without LLM access.

**Dedicated Agent Workpool:**

Currently no `agentPool` exists in `convex.config.ts`. The agent shares whatever
pool the EventBus uses (likely `projectionPool`), creating resource contention.

| Config | Value | Rationale |
| Name | agentPool | Dedicated pool, separate from projectionPool |
| maxParallelism | 10 | LLM calls are slow (~1-5s) — limit concurrency to control costs |
| retryActionsByDefault | true | LLM APIs have transient failures |
| defaultRetryBehavior | 3 attempts, 1s initial, base 2 | Exponential backoff for rate limits |
| Partition key | event.streamId | Per-customer ordering (matches PM pattern) |

"""typescript
// convex.config.ts — dedicated agent pool
app.use(workpool, { name: "agentPool" });

// Agent pool configuration
const agentPool = new Workpool(components.agentPool, {
maxParallelism: 10,
retryActionsByDefault: true,
defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
});
"""

Separation of concerns: agent LLM calls don't compete with projection processing
in `projectionPool` (which handles high-throughput, low-latency CMS updates).

**createAgentActionHandler — Relationship to Existing Factory:**

The current `createAgentEventHandler` in `platform-core/src/agent/init.ts` returns
an `onEvent` callback designed for use inside mutations. The new `createAgentActionHandler`
returns an `internalAction` that can call external APIs.

| Factory | Returns | Can Call LLM | Used For |
| createAgentEventHandler (existing) | onEvent callback | No (mutation context) | Rule-only agents, no LLM needed |
| createAgentActionHandler (new) | internalAction | Yes (action context) | LLM-integrated agents |

`createAgentEventHandler` is NOT removed — it continues to serve rule-only agents.
The action handler reuses existing pure logic from the mutation handler:

- Pattern window filtering (`filterEventsInWindow`)
- Minimum event check (`hasMinimumEvents`)
- Approval determination (`shouldRequireApproval`)

The new capability is the LLM call between trigger evaluation and decision creation:
"""typescript
// Simplified action handler flow
// Steps 1-4: Same as mutation handler (reused pure functions)
// Step 5: NEW — LLM analysis (only possible in action context)
const analysis = await runtime.analyze(prompt, filteredEvents);
// Step 6: Build AgentDecision from analysis (reused pure function)
"""

**Thread Adapter Design — @convex-dev/agent Integration:**

One thread per (agentId, customerId) pair enables conversation context across events:

| Concern | Mechanism |
| Thread identity | Key: `agent:{agentId}:customer:{customerId}` |
| First event | Creates new thread, seeds with customer context |
| Subsequent events | Resumes existing thread, appends new event context |
| History window | Thread retains LLM conversation history for richer analysis |
| Thread cleanup | Threads expire naturally via @convex-dev/agent TTL |

The adapter translates between platform's `AgentInterface` (analyze/reason methods)
and `@convex-dev/agent`'s `Agent.generateText()`:
"""typescript
// Thread adapter bridges platform interface to @convex-dev/agent
class ThreadAdapter implements AgentInterface {
async analyze(prompt: string, events: FatEvent[]): Promise<LLMAnalysisResult> {
const threadId = await this.getOrCreateThread(agentId, customerId);
const result = await this.agent.generateText(ctx, { threadId }, {
prompt: buildAnalysisPrompt(prompt, events),
});
return parseAnalysisResult(result);
}
}
"""

**Circuit Breaker Integration — Phase 18 Relationship:**

Phase 18's circuit breaker (`platform-core/src/infrastructure/circuit-breaker.ts`)
provides the failure isolation pattern. Agent LLM calls use a named instance:

| Config | Value |
| Circuit name | "llm-provider" (or per-provider: "openrouter", "openai") |
| Failure threshold | 5 consecutive failures |
| Reset timeout | 60 seconds |
| Fallback | Rule-based analysis via existing `createMockAgentRuntime()` pattern |

When circuit is open:

1. LLM call is skipped (no HTTP request made)
2. Handler falls back to rule-based confidence scoring
3. Decision audit records `analysisMethod: "rule-based-fallback"` and `circuitState: "open"`
4. Circuit half-opens after timeout, allowing one probe request

## Dependencies

- Depends on: AgentBCComponentIsolation

## Acceptance Criteria

**Agent action handler calls LLM and returns decision**

- Given an agent configured with LLM runtime
- And an OrderCancelled event is delivered via EventBus
- When the action handler processes the event
- Then it loads the checkpoint via runQuery
- And it loads event history via cross-component query
- And it calls the LLM for pattern analysis
- And it returns an AgentDecision with confidence and reasoning

**onComplete mutation persists decision atomically**

- Given an agent action returned a successful AgentDecision
- When the onComplete handler fires with result.kind "success"
- Then the decision is recorded as an audit event in agent component
- And the command is emitted to agent component commands table
- And the checkpoint is updated with new position
- And all writes happen in a single atomic mutation

**Action handler rejects invalid agent configuration**

- Given an agent action handler with missing LLM runtime config
- And no fallback to rule-based analysis is configured
- When the handler is initialized
- Then it fails with AGENT_RUNTIME_REQUIRED error
- And the error message indicates LLM runtime or fallback must be configured

**LLM unavailable falls back to rule-based analysis**

- Given an agent configured with LLM runtime
- And the LLM API returns an error or times out
- When the action handler processes the event
- Then it falls back to rule-based confidence scoring
- And the decision audit records analysisMethod as "rule-based-fallback"
- And processing continues without failure

**Action failure triggers dead letter via onComplete**

- Given an agent action that throws an unrecoverable error
- When the onComplete handler fires with result.kind "failed"
- Then a dead letter entry is created in agent component
- And the checkpoint is NOT advanced
- And an AgentAnalysisFailed audit event is recorded

**Rate limiter allows LLM call within limits**

- Given an agent with rate limit of 60 requests per minute
- And 30 requests have been made this minute
- When a new event triggers LLM analysis
- Then the rate limiter allows the call
- And the LLM analysis proceeds normally

**Rate limiter blocks LLM call when exceeded**

- Given an agent with rate limit of 60 requests per minute
- And 60 requests have already been made this minute
- When a new event triggers LLM analysis
- Then the rate limiter denies the call
- And the event is requeued for later processing
- And an AgentRateLimited audit event is recorded

**Cost budget exceeded pauses agent**

- Given an agent with daily cost budget of 10.00 USD
- And 9.50 USD has been spent today
- When a new LLM call would cost approximately 0.60 USD
- Then the agent is paused automatically
- And an AgentBudgetExceeded audit event is recorded
- And the event falls back to rule-based analysis

**Queue overflow triggers dead letter**

- Given an agent with queue depth of 100
- And 100 events are already queued
- When another event is rate-limited
- Then it is sent to dead letter with reason "queue_overflow"
- And an AgentQueueOverflow audit event is recorded

**Agent subscription with onComplete receives completion callbacks**

- Given an agent subscription configured with custom onComplete handler
- When the agent action completes successfully
- Then the custom onComplete handler fires with result.kind "success"
- And the handler can update the agent checkpoint
- And the handler can record agent-specific audit events

**Failed agent jobs create dead letters via onComplete**

- Given an agent subscription configured with custom onComplete handler
- When the agent action fails with an error
- Then the custom onComplete handler fires with result.kind "failed"
- And a dead letter entry is created in the agent component
- And the checkpoint is not advanced past the failed event

**Agent subscription without onComplete uses global default**

- Given an agent subscription without a custom onComplete handler
- When the agent action fails
- Then the EventBus defaultOnComplete handler fires
- And the global dead letter handler processes the failure

## Business Rules

**Agent event handlers are actions for LLM integration**

**Invariant:** Agent event handlers that require LLM analysis must be Convex actions,
not mutations. All state changes (checkpoint, audit, commands) happen in the onComplete
mutation handler, never in the action.

    **Rationale:** Convex mutations cannot make external HTTP calls. The action/mutation
    split enables LLM integration while maintaining atomic state persistence. Actions are
    retryable by Workpool (mutations are not — they rely on OCC auto-retry).

    **Handler Factory Signature:**

```typescript
// createAgentActionHandler replaces createAgentEventHandler
// Returns an internalAction (not internalMutation)
export function createAgentActionHandler(config: {
  agentConfig: AgentBCConfig;
  runtime: AgentRuntimeConfig; // LLM runtime (or mock)
  loadHistory: (ctx: ActionCtx, event: AgentEventHandlerArgs) => Promise<EventHistory>;
}): RegisteredAction<"internal", AgentEventHandlerArgs, AgentDecision>;
```

**Verified by:** Action calls LLM, onComplete persists, fallback works, timeout handled

_Verified by: Agent action handler calls LLM and returns decision, onComplete mutation persists decision atomically, Action handler rejects invalid agent configuration, LLM unavailable falls back to rule-based analysis, Action failure triggers dead letter via onComplete_

**Rate limiting is enforced before LLM calls**

**Invariant:** Every LLM call must check rate limits before execution. Exceeded
limits queue the event for later retry or send to dead letter if queue is full.

    **Rationale:** LLM API costs can spiral quickly under high event volume. Rate limiting
    protects against runaway costs and external API throttling. The existing `rateLimits`
    config in `AgentBCConfig` defines the limits — this rule enforces them at runtime.

    **Rate Limit Check Flow:**

```text
Event arrives → Check token bucket → Allowed? → Proceed to LLM
                                        → Denied?  → Check queue depth
                                                    → Queue available? → Requeue
                                                    → Queue full?      → Dead letter
```

**Verified by:** Rate limit blocks excess calls, cost budget pauses agent,
queue overflow creates dead letter

_Verified by: Rate limiter allows LLM call within limits, Rate limiter blocks LLM call when exceeded, Cost budget exceeded pauses agent, Queue overflow triggers dead letter_

**Agent subscriptions support onComplete callbacks**

**Invariant:** `CreateAgentSubscriptionOptions` must include an optional `onComplete`
field that receives Workpool completion callbacks, enabling agent-specific dead letter
handling and checkpoint updates.

    **Rationale:** The current `CreateAgentSubscriptionOptions` type lacks the `onComplete`
    field. While the EventBus falls back to the global `defaultOnComplete` (dead letter handler),
    agents need custom completion logic: checkpoint updates, agent-specific audit events,
    and rate limit tracking. Without this field, the agent-specific `handleChurnRiskOnComplete`
    handler is orphaned — defined but never wired.

    **Current Gap:**

```typescript
// CreateAgentSubscriptionOptions (current - missing onComplete)
    interface CreateAgentSubscriptionOptions {
      handler: FunctionReference<...>;
      priority?: number;
      toHandlerArgs?: ...;
      getPartitionKey?: ...;
      logger?: Logger;
      // No onComplete field!
    }
```

**Target:**

```typescript
// CreateAgentSubscriptionOptions (target - with onComplete)
    interface CreateAgentSubscriptionOptions {
      handler: FunctionReference<...>;
      onComplete?: FunctionReference<...>; // Agent-specific completion handler
      priority?: number;
      toHandlerArgs?: ...;
      getPartitionKey?: ...;
      logger?: Logger;
    }
```

**Verified by:** onComplete receives callbacks, dead letters created on failure,
checkpoint updated on success

_Verified by: Agent subscription with onComplete receives completion callbacks, Failed agent jobs create dead letters via onComplete, Agent subscription without onComplete uses global default_

---

[← Back to Pattern Registry](../PATTERNS.md)
