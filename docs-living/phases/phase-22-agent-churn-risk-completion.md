# AgentChurnRiskCompletion

**Purpose:** Detailed patterns for AgentChurnRiskCompletion

---

## Summary

**Progress:** [██████████░░░░░░░░░░] 3/6 (50%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 3     |
| 🚧 Active    | 3     |
| 📋 Planned   | 0     |
| **Total**    | 6     |

---

## 🚧 Active Patterns

### 🚧 Agent BC Component Isolation

| Property | Value  |
| -------- | ------ |
| Status   | active |
| Effort   | 1w     |

**Problem:** Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`,
`agentCommands`, `pendingApprovals`) reside in the shared app schema without physical
BC isolation. Any app mutation can read/write agent tables directly, violating the core
platform principle that bounded contexts should have isolated databases enforced by
Convex component boundaries.

**Solution:** Implement agent as a proper Convex component:

1. **`defineComponent("agent")`** with isolated schema and private tables
2. **Public API handlers** for checkpoint, audit, dead letter, and command operations
3. **Cross-component query pattern** for app-level projections like `customerCancellations`

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Physical BC isolation | Component tables are private, accessed only via API boundary |
| Schema evolution safety | Component schema evolves independently of app schema |
| Clear ownership | Agent component owns its domain data exclusively |
| Consistent patterns | Aligns with orders/inventory component architecture |
| OCC blast radius reduction | Agent writes isolated from app-level transaction conflicts |
| Testing isolation | Component can be tested with `t.registerComponent()` |

**Current State (app-level tables):**
| Table | Current Location | Issue |
| agentCheckpoints | Main schema.ts | No access control, OCC blast radius |
| agentAuditEvents | Main schema.ts | Any mutation can modify audit trail |
| agentDeadLetters | Main schema.ts | No encapsulation |
| agentCommands | Main schema.ts | No API boundary |
| pendingApprovals | Main schema.ts | Shared transaction scope |

**Target State (component isolation):**
| Table | Target Location | Access Pattern |
| agentCheckpoints | Agent component schema | Via components.agent.checkpoints._ |
| agentAuditEvents | Agent component schema | Via components.agent.audit._ |
| agentDeadLetters | Agent component schema | Via components.agent.deadLetters._ |
| agentCommands | Agent component schema | Via components.agent.commands._ |
| pendingApprovals | Agent component schema | Via components.agent.approvals.\* |

**Design Decision: Projection Ownership (customerCancellations)**

The `customerCancellations` projection is updated by CommandOrchestrator (orders BC context)
but consumed exclusively by the agent for O(1) pattern detection lookup.

| Option | Trade-off |
| A: Keep at app level (Recommended) | Agent queries via cross-component query; natural per CLAUDE.md "all projections at app level" |
| B: Move into agent component | Faster queries but requires cross-BC event subscription for updates |
| C: Duplicate to both locations | Redundant data, consistency challenges |

**Decision:** Option A. Projections often combine data from multiple BCs and belong at
the app level per platform architecture. The agent uses a cross-component query pattern
to access `customerCancellations` — the same pattern any component uses to read app data.

**Design Decision: Component API Surface**

Expose minimal API that supports all current use cases without over-engineering:

| API Group | Handlers | Purpose |
| Checkpoints | loadCheckpoint, updateCheckpoint | Exactly-once processing |
| Audit | recordAuditEvent, queryAuditEvents, getAuditEventsByAgent | Explainability |
| Dead Letters | recordDeadLetter, replayDeadLetter, ignoreDeadLetter, queryDeadLetters | Error management |
| Commands | recordCommand, updateCommandStatus, queryCommands | Command lifecycle |
| Approvals | createApproval, approveAction, rejectAction, queryPendingApprovals | Human-in-loop |

**Design Decision: Migration Strategy**

Staged migration from app tables to component tables:

1. Create component with new schema (parallel to existing tables)
2. Update handlers to use component API
3. Migrate existing data (one-time migration script)
4. Remove old tables from app schema

**Design Decision: Peer Mounting Architecture (AD-6)**

`agentBC`, `@convex-dev/agent` (as `llmAgent`), and `agentPool` workpool are all PEER
components at the app level — NOT nested (agentBC does NOT `component.use(agent)`).

| Component | Purpose | Why Peer |
| agentBC | BC state: checkpoints, audit, commands, approvals | Owns domain data |
| llmAgent (@convex-dev/agent) | LLM: threads, messages, embeddings | Needs process.env for API keys |
| agentPool (workpool) | Dedicated pool for agent actions | Separate parallelism from projections |

Components cannot access `process.env` — the app-level action handler coordinates
between both components, passing API keys as arguments.

"""typescript
// convex.config.ts — all three are app-level peers
import agentBC from "@libar-dev/platform-core/agent/convex.config";
import { agent } from "@convex-dev/agent/convex.config";
import { workpool } from "@convex-dev/workpool/convex.config";

app.use(agentBC); // BC: checkpoints, audit, commands, approvals
app.use(agent, { name: "llmAgent" }); // LLM: threads, messages, embeddings
app.use(workpool, { name: "agentPool" }); // Dedicated pool for agent actions
"""

**Data Flow with Peer Components:**
"""
EventBus → agentPool.enqueueAction() → app-level action handler
action: ctx.runQuery(agentBC.checkpoints._) + llmAgent.generateText()
onComplete: ctx.runMutation(agentBC.audit._) + ctx.runMutation(agentBC.checkpoints.\*)
"""

**Schema Evolution Notes (from design stubs):**

The component schema expands beyond the current app-level definitions:

| Aspect | Current (app schema) | Target (component schema) |
| Checkpoint statuses | 3: active, paused, stopped | 4: adds error_recovery (DS-5 lifecycle) |
| Audit event types | 6: Decision, Approved, Rejected, Expired, Completed, Failed | 16: adds DS-4 routing + DS-5 lifecycle types |
| Checkpoint indexes | by_agentId only | Adds by_agentId_subscriptionId for O(1) lookup |
| Forward declarations | None | configOverrides: v.optional(v.any()) for ReconfigureAgent (DS-5) |

All 16 audit event types declared from day one to avoid schema migration:

- DS-1 base (8): PatternDetected, CommandEmitted, ApprovalRequested/Granted/Rejected/Expired, DeadLetterRecorded, CheckpointUpdated
- DS-4 routing (2): AgentCommandRouted, AgentCommandRoutingFailed
- DS-5 lifecycle (6): AgentStarted, AgentPaused, AgentResumed, AgentStopped, AgentReconfigured, AgentErrorRecoveryStarted

**Cron Migration Note:**

The existing `expirePendingApprovals` cron runs as an `internalMutation` with direct
`ctx.db` access. After component isolation, crons cannot call component internals
directly — an app-level wrapper mutation must delegate to `components.agent.approvals.expirePending`.

**Component Isolation Constraints (per platform architecture):**
| Constraint | Impact on Agent Component |
| No ctx.auth inside component | Pass userId as argument to all handlers |
| IDs become strings at boundary | Use business IDs (agentId, eventId) not Convex doc IDs |
| Sub-transactions | Agent writes commit independently from parent mutations |
| No process.env | Pass configuration (API keys, model names) as arguments |

#### Dependencies

- Depends on: AgentAsBoundedContext

#### Acceptance Criteria

**Agent component registers with isolated schema**

- Given the agent component is defined with defineComponent
- When the app mounts the agent component via app.use
- Then the agent's tables are isolated from the app schema
- And the app cannot directly query agentCheckpoints
- And all access goes through components.agent.\* handlers

**Component API provides full CRUD for checkpoints**

- Given the agent component is mounted
- When a checkpoint is created via components.agent.checkpoints.load
- Then the checkpoint is stored in the component's isolated database
- And it can be updated via components.agent.checkpoints.update
- And it can be queried via components.agent.checkpoints.load

**Direct table access is not possible from parent**

- Given the agent component is mounted
- When the parent app attempts ctx.db.query("agentCheckpoints")
- Then the query returns no results
- And agent data is only accessible through component API handlers

**Component sub-transactions provide isolation**

- Given a parent mutation that calls agent component handlers
- When the agent component handler throws an error
- And the parent catches the exception
- Then only the agent component write is rolled back
- And the parent mutation's other writes succeed

**Agent handler receives projection data as argument**

- Given the agent event handler is triggered by an OrderCancelled event
- When the handler needs customer cancellation history
- Then it receives the history as a pre-loaded argument
- And it does not directly query customerCancellations table

**Missing projection data returns empty result**

- Given a new customer with no cancellation history
- When the agent handler receives an event for this customer
- Then the cancellation history argument is an empty array
- And the handler proceeds with rule-based analysis
- And no error is thrown

**Agent handler cannot directly access app-level projection tables**

- Given the agent component is processing an event
- When the handler attempts to query customerCancellations directly
- Then the query is not available inside the component context
- And the handler must use the injected data argument instead

**App-level queries can access agent data via component API**

- Given the admin UI needs to display agent audit events
- When it queries via components.agent.audit.queryAuditEvents
- Then it receives the audit events for the requested agent
- And the query respects agent component boundaries

#### Business Rules

**Agent component provides isolated database**

**Invariant:** All agent-specific state (checkpoints, audit events, dead letters,
commands, pending approvals) must reside in the agent component's isolated database.
No agent data in the shared app schema.

    **Rationale:** Physical BC isolation prevents accidental coupling. Parent app mutations
    cannot query agent tables directly — this is enforced by Convex's component architecture,
    not just convention. This matches the orders/inventory pattern where each BC owns its
    tables via `defineComponent()`.

    **Verified by:** Component isolation test, API boundary test, schema separation test

_Verified by: Agent component registers with isolated schema, Component API provides full CRUD for checkpoints, Direct table access is not possible from parent, Component sub-transactions provide isolation_

**Cross-component queries use explicit API**

**Invariant:** Agent BC must access external data (like `customerCancellations` projection)
through explicit cross-component query patterns, never through direct table access.

    **Rationale:** Maintains BC isolation while enabling necessary data access. The
    `customerCancellations` projection lives at the app level (owned by CommandOrchestrator),
    so the agent handler must receive this data as an argument or query it through
    a well-defined interface.

    **Cross-Component Data Flow:**
    | Data Source | Owner | Consumer | Access Pattern |
    | customerCancellations | App (projection) | Agent handler | Passed as argument to handler |
    | Order events | EventBus | Agent subscription | Delivered via Workpool |
    | Agent decisions | Agent component | Admin UI queries | Via component API |

    **Verified by:** Cross-component query works, missing data handled gracefully,
    no direct table coupling between agent and app

_Verified by: Agent handler receives projection data as argument, Missing projection data returns empty result, Agent handler cannot directly access app-level projection tables, App-level queries can access agent data via component API_

---

### 🚧 Agent LLM Integration

| Property | Value  |
| -------- | ------ |
| Status   | active |
| Effort   | 1w     |

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

1. Error propagates from pattern.analyze() through the action handler
2. Workpool retries with exponential backoff (maxAttempts: 3)
3. After retries exhausted, event goes to dead letter queue

This ensures failed events are tracked and can be replayed after the issue is resolved.

**Dedicated Agent Workpool:**

A dedicated `agentPool` peer mount exists in `convex.config.ts`, separating LLM
work from `projectionPool` to avoid resource contention.

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

**createAgentActionHandler — Factory:**

`createAgentActionHandler` returns an `internalAction` that can call external APIs
(LLM). The legacy `createAgentEventHandler` (mutation-based `onEvent` callback) has
been removed — all agent event handling now uses the action-based handler.
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
2. Error propagates to Workpool which retries after backoff
3. Dead letter records circuit state context if retries exhausted
4. Circuit half-opens after timeout, allowing one probe request

#### Dependencies

- Depends on: AgentBCComponentIsolation

#### Acceptance Criteria

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
- Then the error propagates to the Workpool for retry
- And after retries exhausted the event is dead-lettered
- And a DeadLetterRecorded audit event is created

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

#### Business Rules

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

### 🚧 Confirmed Order Cancellation

| Property | Value  |
| -------- | ------ |
| Status   | active |
| Effort   | 2d     |

**Problem:** The Order FSM treats `confirmed` as terminal. Orders cannot be
cancelled after saga confirmation, blocking the Agent BC demo which requires
3+ cancellations to trigger churn risk detection. The Reservation FSM already
supports `confirmed -> released`, but no coordination exists to release
reservations when confirmed orders are cancelled.

**Solution:** Enable cancellation of confirmed orders with automatic reservation release:

1. **FSM change:** Add `confirmed -> cancelled` transition to Order FSM
2. **Decider change:** Remove `ORDER_ALREADY_CONFIRMED` rejection in CancelOrder
3. **Process Manager:** ReservationReleaseOnOrderCancel PM releases reservation
   when a confirmed order is cancelled

**Why It Matters:**
| Benefit | How |
| Agent BC enablement | 3+ cancellations trigger churn risk pattern detection |
| Business flexibility | Customers can cancel even after confirmation |
| Stock recovery | Reserved inventory returns to available pool |
| Consistency | Order and Reservation states stay synchronized |

**Cross-Context Coordination:**
| Event Source | Event | PM Action | Target BC |
| Orders BC | OrderCancelled | Trigger | PM |
| PM | ReleaseReservation | Command | Inventory BC |
| Inventory BC | ReservationReleased | Audit | - |

**Design Decision: PM vs Saga:**

- No compensation needed (simple event -> command)
- No multi-step coordination
- No external event awaits
- Therefore: **Process Manager** is the correct choice (per ADR-033)

#### Dependencies

- Depends on: SagaOrchestration
- Depends on: AgentAsBoundedContext

#### Acceptance Criteria

**Cancel a confirmed order**

- Given an order "ord-conf-cancel-01" exists with status "confirmed"
- When I send a CancelOrder command for "ord-conf-cancel-01" with reason "Customer changed mind"
- Then the command should succeed
- And the order "ord-conf-cancel-01" status should be "cancelled"

**Cannot cancel already cancelled order (unchanged behavior)**

- Given an order "ord-conf-cancel-02" exists with status "cancelled"
- When I send a CancelOrder command for "ord-conf-cancel-02" with reason "Double cancel attempt"
- Then the command should be rejected with code "ORDER_ALREADY_CANCELLED"

**OrderCancelled evolves confirmed state to cancelled**

- Given an order state with status "confirmed"
- When OrderCancelled event is applied
- Then state should have status "cancelled"

**Reservation is released after confirmed order cancellation**

- Given a product "prod-rel-01" exists with 10 available and 5 reserved stock
- And a confirmed order "ord-rel-01" with a confirmed reservation for 5 units
- When I cancel order "ord-rel-01" with reason "Customer changed mind"
- Then the order "ord-rel-01" should have status "cancelled"
- And I wait for projections to process
- And the reservation for order "ord-rel-01" should have status "released"
- And the product "prod-rel-01" should have 15 available and 0 reserved stock

**Cancelling draft order does not trigger reservation release**

- Given a draft order "ord-rel-02" exists
- When I cancel order "ord-rel-02" with reason "Changed mind early"
- Then the order "ord-rel-02" should have status "cancelled"
- And no ReleaseReservation command should be emitted

**Cancelling submitted order with pending reservation releases it**

- Given a submitted order "ord-rel-03" with a pending reservation
- When I cancel order "ord-rel-03" with reason "Changed mind before confirmation"
- Then the order "ord-rel-03" should have status "cancelled"
- And the reservation for order "ord-rel-03" should have status "released"

**PM is idempotent for duplicate OrderCancelled events**

- Given a confirmed order "ord-rel-04" with a confirmed reservation
- When OrderCancelled event is delivered twice for "ord-rel-04"
- Then the reservation should only be released once

**Three cancellations trigger churn risk agent**

- Given a customer "cust-churn-01" exists
- And 3 confirmed orders for customer "cust-churn-01"
- When I cancel all 3 orders for customer "cust-churn-01"
- Then the churn risk agent should detect the pattern
- And an approval request should be created for customer outreach

#### Business Rules

**Confirmed orders can be cancelled**

The Order FSM must allow transitioning from `confirmed` to `cancelled`.
The CancelOrder decider must accept cancellation requests for confirmed orders.

    **FSM Change:**

```typescript
// Before:
    confirmed: [], // terminal state

    // After:
    confirmed: ["cancelled"], // can cancel confirmed orders
```

**Decider Change:**

```typescript
// Remove this rejection:
// if (state.status === "confirmed") {
//   return rejected("ORDER_ALREADY_CONFIRMED", "...");
// }
// Let FSM handle the transition validation
```

_Verified by: Cancel a confirmed order, Cannot cancel already cancelled order (unchanged behavior), OrderCancelled evolves confirmed state to cancelled_

**Reservation is released when confirmed order is cancelled**

The ReservationReleaseOnOrderCancel PM subscribes to OrderCancelled events.
When triggered, it checks if the order had a reservation and releases it.

    **PM Definition:**
    | Property | Value |
    | processManagerName | reservationReleaseOnOrderCancel |
    | eventSubscriptions | OrderCancelled |
    | emitsCommands | ReleaseReservation |
    | context | orders |
    | correlationStrategy | orderId |

    **PM Logic:**

```typescript
async function handleOrderCancelled(ctx, event) {
  // Query orderWithInventoryStatus projection for reservationId
  const orderStatus = await ctx.db
    .query("orderWithInventoryStatus")
    .withIndex("by_orderId", (q) => q.eq("orderId", event.payload.orderId))
    .first();

  // Only release if reservation exists and is not already released
  if (orderStatus?.reservationId && orderStatus.reservationStatus !== "released") {
    return [
      {
        commandType: "ReleaseReservation",
        payload: {
          reservationId: orderStatus.reservationId,
          reason: `Order ${event.payload.orderId} cancelled: ${event.payload.reason}`,
        },
        causationId: event.eventId,
        correlationId: event.correlationId,
      },
    ];
  }

  return []; // No command to emit
}
```

_Verified by: Reservation is released after confirmed order cancellation, Cancelling draft order does not trigger reservation release, Cancelling submitted order with pending reservation releases it, PM is idempotent for duplicate OrderCancelled events_

**Agent BC demo flow is enabled**

The primary use case is enabling the Agent BC churn risk detection demo.

_Verified by: Three cancellations trigger churn risk agent_

---

## ✅ Completed Patterns

### ✅ Agent As Bounded Context

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 2w        |

**Problem:** AI agents are invoked manually without integration into the
event-driven architecture. No pattern for agents to react to business events.

**Solution:** AI agents implemented as bounded contexts that:

1. **Subscribe** to event streams via EventBus
2. **Detect patterns** across events using LLM or rules
3. **Emit commands** based on detected patterns

This is the culminating pattern demonstrating full platform integration.

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| AI-native architecture | Events are natural agent input |
| Pattern detection | Agents analyze event sequences via LLM |
| Reactive intelligence | Real-time response to business events |
| Loose coupling | Agent BC is just another bounded context |
| Explainability | All decisions audited with reasoning |

**Architectural Decisions:**
| Decision | Choice | Rationale |
| EventBus subscription | Workpool-based | Durable, retries, partition ordering (like PM) |
| Pattern detection | Hybrid (rules + LLM) | Fast rules trigger, LLM adds nuance |
| Human-in-loop | @convex-dev/workflow | awaitEvent() for approvals + CMS table |
| State model | Agent BC owns CMS | Separate from @convex-dev/agent threads |
| LLM integration | @convex-dev/agent + createTool | Tools for command emission and analysis |
| LLM fault isolation | Phase 18 circuit breaker | Graceful degradation, prevents cascade failures |

**@convex-dev/agent Integration:**

Agent BC uses `@convex-dev/agent` for LLM reasoning while maintaining its own state model.

| Concern | Agent BC Owns | @convex-dev/agent Owns |
| Event subscription | Yes - EventBus | No |
| Pattern detection | Yes - rules + trigger | No |
| LLM reasoning | Delegates | Yes - threads, context |
| Decision audit | Yes - audit events | No |
| Thread management | Delegates | Yes - conversation state |
| Tool execution | Coordinates | Yes - tool runtime |

**Integration Pattern:**
"""typescript
import { Agent, createTool } from "@convex-dev/agent";

// Create agent with command emission tool
const orderAgent = new Agent(components.agent, {
name: "order-analyzer",
languageModel: openai("gpt-4"),
instructions: "Analyze order patterns and suggest actions.",
tools: {
emitCommand: createTool({
description: "Emit a command based on analysis",
args: z.object({
type: z.string(),
payload: z.any(),
confidence: z.number(),
reason: z.string(),
}),
handler: async (ctx, args) => {
await agentBC.emitCommand(ctx, args);
return { emitted: true };
},
}),
},
});

// Use in event handler
async function handleEvent(ctx: ActionCtx, event: FatEvent) {
const { threadId } = await orderAgent.createThread(ctx, {
userId: event.streamId, // Customer as user
});

    const result = await orderAgent.generateText(ctx, { threadId }, {
      prompt: `Analyze this event and decide if action needed: ${JSON.stringify(event)}`,
    });

    // Decision already emitted via tool if needed

}
"""

**Alternative Designs (Use-Case Dependent):**

The agent execution model can be implemented with two approaches, chosen based on durability needs:

| Approach | Component | When to Use | Trade-offs |
| Workpool-based | @convex-dev/workpool | Event-driven, fire-and-forget | Lower overhead, simpler mental model |
| Workflow-based | @convex-dev/workflow | Multi-step with awaits, sagas | Full durability, survives restarts mid-analysis |

**Option A: Workpool-Based Agent (Recommended Default)**
"""typescript
// Fire-and-forget pattern analysis with retry and partitioning
const agentPool = new Workpool(components.agentPool, {
maxParallelism: 10,
retryActionsByDefault: true,
defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
});

// Partition by streamId for ordered processing per entity
await agentPool.enqueueAction(ctx, internal.agent.analyzeEvent, { event }, {
key: event.streamId, // Maintains order per customer/entity
onComplete: internal.agent.handleAnalysisResult,
});
"""

- Best for: High-throughput event processing, simple analyze-then-emit flows
- Guarantees: Retry with exponential backoff, partition ordering, onComplete audit

**Checkpoint Pattern (required for Workpool durability):**
"""typescript
// Agent checkpoint schema for resumption after restart
interface AgentCheckpoint {
agentId: string; // Agent BC identifier (e.g., "churn-detector")
subscriptionId: string; // Subscription instance ID
lastProcessedPosition: number; // -1 = no events processed
lastEventId: string; // For causation tracking
status: "active" | "paused" | "stopped";
eventsProcessed: number;
updatedAt: number;
}

// onComplete handler updates checkpoint and records audit
export const handleAnalysisResult = internalMutation({
args: vOnCompleteValidator(v.object({
agentId: v.string(),
eventId: v.string(),
globalPosition: v.number(),
correlationId: v.string(),
})),
handler: async (ctx, { context, result }) => {
if (result.kind === "success") {
// Update checkpoint on success
await patchAgentCheckpoint(ctx, context.agentId, {
lastProcessedPosition: context.globalPosition,
lastEventId: context.eventId,
});
// Emit audit event
await emitAgentAuditEvent(ctx, "AgentAnalysisCompleted", context);
} else {
// Record to agent dead letter queue (don't advance checkpoint)
await recordAgentDeadLetter(ctx, context, result.error);
await emitAgentAuditEvent(ctx, "AgentAnalysisFailed", context);
}
},
});
"""
Note: Checkpoint updates ensure agents resume from the correct position after restarts.
Failed events are recorded to dead letter queue without advancing the checkpoint.

**Option B: Workflow-Based Agent (Fully Durable)**
"""typescript
// Durable agent workflow that survives restarts mid-analysis
export const agentAnalysisWorkflow = workflow.define({
args: { event: v.any(), patternWindow: v.any() },
handler: async (ctx, { event, patternWindow }): Promise<AgentDecision> => {
// Step 1: Load historical events (durable checkpoint)
const history = await ctx.runQuery(internal.events.loadWindow, patternWindow);

      // Step 2: LLM analysis (retryable action)
      const analysis = await ctx.runAction(
        internal.agent.llmAnalyze,
        { event, history },
        { retry: { maxAttempts: 5, initialBackoffMs: 2000, base: 2 } }
      );

      // Step 3: Human approval if needed (can wait days)
      if (analysis.requiresApproval) {
        const approval = await ctx.awaitEvent({ name: "humanApproval" });
        if (!approval.approved) return { status: "rejected" };
      }

      // Step 4: Emit command (mutation step)
      await ctx.runMutation(internal.commands.emit, {
        command: analysis.suggestedCommand,
        metadata: { confidence: analysis.confidence, reason: analysis.reason },
      });

      return { status: "executed", command: analysis.suggestedCommand };
    },

});
"""

- Best for: Long-running analysis, human-in-loop with multi-day waits, complex multi-step agents
- Guarantees: Full durability (survives restarts), awaitEvent for external signals, nested workflows

**Decision Criteria:**
| Criterion | Use Workpool | Use Workflow |
| Analysis duration | < 30 seconds | > 30 seconds or unpredictable |
| Human-in-loop | Separate flow (poll CMS) | awaitEvent() in same flow |
| Multi-step with waits | No | Yes |
| Throughput priority | High | Moderate |
| Complexity | Lower | Higher (determinism rules) |

**Note on Dependencies:** Phase 21 (IntegrationPatterns) is NOT a blocking dependency.
Agent BC consumes domain events via existing EventBus and fat events (Phase 20).
Phase 21's Published Language is an optional enhancement for cross-BC integration.

**Note on Scheduling:** For scheduled agent triggers (periodic pattern analysis, approval
timeouts), Agent BC can use `@convex-dev/crons` directly. The Time-Triggered PM (Phase 23)
is an optional enhancement providing rate-limiting, hybrid triggers, and PM-specific lifecycle
management. Basic scheduling does NOT require Phase 23.

**Agent BC Architecture:**
"""
EventBus Agent BC Command Bus
│ │ │
│ OrderSubmitted ──────>│ Pattern Detection ────────>│ SuggestOutreach
│ OrderCancelled ──────>│ (@convex-dev/agent) │
│ PaymentFailed ──────>│ │ │
│ │ Audit Trail │
│ │ (AgentDecisionMade) │
"""

**Core Type Definitions:**

| Type | Location | Description |
| AgentBCConfig | platform-core/src/agent/types.ts | Full agent configuration |
| PatternDefinition | platform-core/src/agent/patterns.ts | Pattern with trigger and analysis |
| PatternWindow | platform-core/src/agent/patterns.ts | Time/event window constraints |
| AgentSubscription | platform-core/src/agent/subscription.ts | Active subscription handle |
| AgentDecision | platform-core/src/agent/types.ts | Analysis result with action |
| HumanInLoopConfig | platform-core/src/agent/approval.ts | Approval workflow settings |
| AgentCheckpoint | platform-core/src/agent/checkpoint.ts | Position tracking state |
| AgentAuditEvent | platform-core/src/agent/audit.ts | Decision audit record |
| RateLimitConfig | platform-core/src/agent/rate-limit.ts | LLM call throttling |

**AgentBCConfig Fields:**

| Field | Type | Required | Default | Description |
| id | string | Yes | - | Unique agent identifier |
| subscriptions | string[] | Yes | - | Event types to subscribe |
| patternWindow | PatternWindow | Yes | - | Window constraints |
| confidenceThreshold | number | Yes | - | Auto-execute threshold (0-1) |
| humanInLoop | HumanInLoopConfig | No | {} | Approval requirements |
| rateLimits | RateLimitConfig | No | null | LLM rate limiting |
| onEvent | EventHandler | Yes | - | Event processing handler |

**PatternWindow Fields:**

| Field | Type | Required | Default | Description |
| duration | string | Yes | - | Time window (e.g., 7d, 30d) |
| eventLimit | number | No | 100 | Max events to load |
| minEvents | number | No | 1 | Min events to trigger |
| loadBatchSize | number | No | 50 | Lazy loading batch size |

**AgentDecision Fields:**

| Field | Type | Description |
| command | string or null | Command to emit, null if no action |
| payload | unknown | Command payload |
| confidence | number | Analysis confidence (0-1) |
| reason | string | Human-readable explanation |
| requiresApproval | boolean | Needs human review |
| triggeringEvents | string[] | Event IDs that triggered |

**Key Concepts:**
| Concept | Description | Example |
| Event Subscription | Agent subscribes to relevant event types | OrderSubmitted, PaymentFailed |
| Pattern Window | Events within time window for analysis | 7 days, max 100 events |
| Confidence Threshold | Minimum confidence for auto-execution | 0.8 (80%) |
| Human-in-Loop | Flag for review vs auto-execute | Low confidence → review |
| Audit Trail | All agent decisions logged as events | AgentDecisionMade |

**Pattern Examples:**
| Pattern | Trigger | Agent Response | Confidence |
| ChurnRisk | Multiple cancellations in 30d | SuggestCustomerOutreach | 0.75 |
| FraudRisk | Unusual order frequency | FlagForReview | 0.90 |
| InventoryAlert | Low stock + high demand | SuggestReorder | 0.85 |
| AnomalyDetection | Deviation from normal patterns | InvestigateAnomaly | 0.70 |

**Current State (manual invocation):**
"""typescript
// Manual agent invocation - not integrated with events
const response = await agent.chat('Analyze this order');
"""

**Target State (event-reactive agent):**
"""typescript
// Agent BC subscribes to events and emits commands
const agentBC = createAgentBC({
subscriptions: ['OrderSubmitted', 'OrderCancelled', 'PaymentFailed'],
patternWindow: { duration: '7d', eventLimit: 100 },
confidenceThreshold: 0.8,
humanInLoop: { requiresApproval: ['HighValueOrder'] },
onEvent: async (event, ctx) => {
const analysis = await ctx.agent.analyze(event, ctx.history);
if (analysis.confidence > ctx.confidenceThreshold) {
return { command: analysis.suggestedCommand, confidence: analysis.confidence };
}
return null;
}
});
"""

**Agent BC Initialization:**
"""typescript
// Bootstrap agent BC with EventBus registration
export async function initializeAgentBC(
ctx: MutationCtx,
components: { eventBus: EventBusComponent; agent: AgentComponent },
config: AgentBCConfig
): Promise<AgentSubscription> {
// 1. Validate configuration
const validation = validateAgentBCConfig(config);
if (!validation.ok) throw new AgentConfigError(validation.error);

    // 2. Create or resume checkpoint
    const checkpoint = await getOrCreateCheckpoint(ctx, config.id);

    // 3. Register EventBus subscription
    const subscription = await components.eventBus.subscribe({
      name: `agent:${config.id}`,
      eventTypes: config.subscriptions,
      handler: internal.agent.handleEvent,
      startPosition: checkpoint.lastProcessedPosition + 1,
      partitionKey: (event) => event.streamId,
    });

    // 4. Return subscription handle
    return {
      subscriptionId: subscription.id,
      agentId: config.id,
      pause: () => pauseAgent(ctx, config.id),
      resume: () => resumeAgent(ctx, config.id),
      unsubscribe: () => unsubscribeAgent(ctx, config.id),
    };

}
"""

**AgentSubscription Return Type:**

| Field | Type | Description |
| subscriptionId | string | EventBus subscription ID |
| agentId | string | Agent BC identifier |
| pause | function | Pause event processing |
| resume | function | Resume from checkpoint |
| unsubscribe | function | Stop and cleanup |

**Configuration Validators:**
"""typescript
import { v } from "convex/values";

export const vPatternWindow = v.object({
duration: v.string(),
eventLimit: v.optional(v.number()),
minEvents: v.optional(v.number()),
loadBatchSize: v.optional(v.number()),
});

export const vHumanInLoopConfig = v.object({
confidenceThreshold: v.optional(v.number()),
requiresApproval: v.optional(v.array(v.string())),
autoApprove: v.optional(v.array(v.string())),
approvalTimeout: v.optional(v.string()),
});

export const vRateLimitConfig = v.object({
maxRequestsPerMinute: v.number(),
maxConcurrent: v.optional(v.number()),
queueDepth: v.optional(v.number()),
});

export const vAgentBCConfig = v.object({
id: v.string(),
subscriptions: v.array(v.string()),
patternWindow: vPatternWindow,
confidenceThreshold: v.number(),
humanInLoop: v.optional(vHumanInLoopConfig),
rateLimits: v.optional(vRateLimitConfig),
});
"""

#### Dependencies

- Depends on: ReactiveProjections
- Depends on: EcstFatEvents

#### Acceptance Criteria

**Agent receives subscribed events**

- Given an agent subscribed to OrderSubmitted, OrderCancelled
- When an OrderSubmitted event is published
- Then the agent should receive the event
- And event should include full fat-event payload

**Agent receives filtered events only**

- Given an agent subscribed with filter amount > 100
- When OrderSubmitted with amount 50 is published
- And OrderSubmitted with amount 150 is published
- Then the agent should receive only the 150 event

**Agent receives events in order**

- Given an agent subscribed to OrderSubmitted
- When events E1, E2, E3 are published in sequence
- Then the agent receives events in same order

**Agent resumes from last processed position after restart**

- Given an agent subscribed to OrderSubmitted
- And agent has processed events up to position 100
- When server restarts
- And agent subscription resumes
- Then processing should continue from position 101
- And no events should be reprocessed
- And no events should be lost

**Agent configuration validation**

- Given an agent configuration with <violation>
- When the agent is initialized
- Then it should fail with code "<error_code>"
- And error message should indicate "<message>"

**Agent detects multiple cancellations pattern**

- Given events for customer "cust_123":
- When agent analyzes pattern window
- Then "ChurnRisk" pattern should be detected
- And confidence should be above 0.8

| type           | timestamp            |
| -------------- | -------------------- |
| OrderCancelled | 2026-01-10T10:00:00Z |
| OrderCancelled | 2026-01-11T10:00:00Z |
| OrderCancelled | 2026-01-12T10:00:00Z |

**Agent uses LLM for pattern analysis**

- Given a pattern window with 10 order events
- When agent invokes LLM analysis
- Then analysis includes detected patterns
- And analysis includes confidence scores
- And analysis includes reasoning

**Pattern window respects time boundary**

- Given events spanning 60 days
- And pattern window duration is 30 days
- When agent analyzes pattern
- Then only events from last 30 days are considered

**Pattern window loads events lazily for memory efficiency**

- Given pattern window duration is 30 days
- And 1000 events exist within the pattern window
- When pattern trigger is evaluated
- Then events should be loaded in batches
- And memory usage should remain bounded
- And all relevant events should still be considered for pattern detection

**Pattern definition validation**

- Given a pattern definition with <violation>
- When the pattern is registered
- Then it should fail with code "<error_code>"

**Agent emits recommendation command**

- Given a detected ChurnRisk pattern
- When agent decides to act
- Then SuggestCustomerOutreach command should be emitted
- And command should include:

| field           | value                                 |
| --------------- | ------------------------------------- |
| reason          | Multiple order cancellations detected |
| suggestedAction | Proactive support call                |
| confidence      | 0.85                                  |

**Command includes triggering event references**

- Given a detected pattern from events E1, E2, E3
- When agent emits command
- Then command.metadata.eventIds contains [E1.id, E2.id, E3.id]
- And events can be traced back from command

**Command requires minimum metadata**

- Given an agent attempting to emit command without reason
- When emitCommand is called
- Then an error is thrown with code "REASON_REQUIRED"

**LLM rate limit is handled with exponential backoff**

- Given an agent attempting LLM analysis
- And LLM API returns 429 rate limit error
- When agent retries the analysis
- Then retry should use exponential backoff
- And event processing queue should not be blocked
- And retry attempts should be logged for observability

**Command validation**

- Given an agent command with <violation>
- When emitCommand is called
- Then it should fail with code "<error_code>"

**LLM error handling**

- Given an agent attempting LLM analysis
- And LLM API returns <error_type>
- When the error is handled
- Then recovery action should be "<recovery>"
- And error should be logged with code "<error_code>"

**Action based on confidence threshold**

- Given confidence threshold is 0.8
- And agent detects pattern with confidence <confidence>
- When determining action
- Then execution mode should be "<mode>"

**High-risk actions always require approval**

- Given an action type in requiresApproval list
- And agent confidence is 0.99
- When determining action
- Then execution mode should be "flag-for-review"

**Pending approval expires after timeout**

- Given an action flagged for review
- And approval timeout is 24 hours
- When 24 hours pass without approval
- Then action status becomes "expired"
- And AgentActionExpired event is recorded

**Agent decision creates audit event**

- Given an agent decision to emit SuggestCustomerOutreach
- When the command is emitted
- Then AgentDecisionMade event should be recorded
- And event should include pattern, reasoning, and action

**Audit includes LLM metadata**

- Given an agent using LLM for pattern analysis
- When decision is made
- Then AgentDecisionMade includes llmContext
- And llmContext has model, tokens, duration

**Query agent decision history**

- Given agent has made 10 decisions
- When I query AgentDecisionMade events for agent BC
- Then I receive all 10 decision records
- And each includes full audit trail

**Audit captures rejected actions**

- Given an agent decision that was flagged for review
- And human reviewer rejected the action
- When AgentActionRejected event is recorded
- Then it includes reviewerId and rejectionReason

#### Business Rules

**Agent subscribes to relevant event streams**

EventBus delivers events to agent BC like any other subscriber.

    **Subscription API:**

```typescript
// Agent BC subscribes to specific event types
const subscription = agentBC.subscribe({
  eventTypes: ["OrderSubmitted", "OrderCancelled", "PaymentFailed"],
  filter: (event) => event.payload.amount > 100, // Optional filter
  handler: agentAnalysisHandler,
});
// Events delivered as fat events with full context
```

_Verified by: Agent receives subscribed events, Agent receives filtered events only, Agent receives events in order, Agent resumes from last processed position after restart, Agent configuration validation_

**Agent detects patterns across events**

Pattern window groups events for analysis (LLM or rule-based).

    **Pattern Detection API:**

```typescript
// Define pattern with detection criteria
const churnRiskPattern = definePattern({
  name: "ChurnRisk",
  window: { duration: "30d", minEvents: 3 },
  trigger: (events) => {
    const cancellations = events.filter((e) => e.type === "OrderCancelled");
    return cancellations.length >= 3;
  },
  analyze: async (events, agent) => {
    // LLM analysis for deeper insight
    return await agent.analyze({
      prompt: "Analyze churn risk from these cancellation patterns",
      events,
    });
  },
});
```

_Verified by: Agent detects multiple cancellations pattern, Agent uses LLM for pattern analysis, Pattern window respects time boundary, Pattern window loads events lazily for memory efficiency, Pattern definition validation_

**Agent emits commands with explainability**

Commands include reasoning and suggested action.

    **Command Emission API:**

```typescript
// Agent emits command with full explainability
await agentBC.emitCommand({
  type: "SuggestCustomerOutreach",
  payload: {
    customerId: pattern.customerId,
    suggestedAction: "Proactive support call",
  },
  metadata: {
    patternId: pattern.id,
    confidence: 0.85,
    reason: "Multiple order cancellations detected",
    analysis: analysisResult, // Full LLM response
    eventIds: triggeringEvents.map((e) => e.id),
  },
});
```

**LLM Fault Isolation (Optional Enhancement):**
For production deployments, wrap LLM calls with Phase 18's circuit breaker:

```typescript
const analysis = await withCircuitBreaker(
  ctx,
  "llm-provider",
  async () => {
    return await agent.analyze({ event, history });
  },
  { failureThreshold: 5, resetTimeoutMs: 60000 }
);
```

This triggers fallback to rule-based analysis when LLM is unavailable,
preventing cascade failures during LLM provider outages.

_Verified by: Agent emits recommendation command, Command includes triggering event references, Command requires minimum metadata, LLM rate limit is handled with exponential backoff, Command validation, LLM error handling_

**Human-in-loop controls automatic execution**

High-confidence actions can auto-execute; low-confidence require approval.

    **Human-in-Loop Configuration:**

```typescript
// Configure approval requirements
const humanInLoopConfig = {
  confidenceThreshold: 0.8, // Below this → require approval
  requiresApproval: [
    "HighValueOrder", // Always require approval
    "AccountSuspension", // Always require approval
  ],
  autoApprove: [
    "LowRiskNotification", // Always auto-execute
  ],
  approvalTimeout: "24h", // Expire pending approvals
};
```

**Approval Timeout Implementation (Cron-based expiration):**
Approval expiration uses a periodic cron job that queries pending approvals
past their timeout. This is simpler than per-approval workflow orchestration
and matches the component API design (approvals.expirePending mutation).

_Verified by: Action based on confidence threshold, High-risk actions always require approval, Pending approval expires after timeout_

**LLM calls are rate-limited**

Rate limiting behavior including token bucket throttling, queue overflow handling,
and cost budget enforcement is specified in AgentLLMIntegration (Phase 22b).

    See agent-llm-integration.feature Rule: Rate limiting is enforced before LLM calls

**All agent decisions are audited**

Audit trail captures pattern detection, reasoning, and outcomes.

    **Audit Event Structure:**

```typescript
// AgentDecisionMade event structure
    {
      type: 'AgentDecisionMade',
      streamId: agentBC.id,
      payload: {
        decisionId: 'dec_abc123',
        patternDetected: 'ChurnRisk',
        confidence: 0.85,
        reasoning: 'Customer had 3 cancellations in 14 days',
        action: {
          type: 'SuggestCustomerOutreach',
          executionMode: 'auto-execute',
        },
        triggeringEvents: ['evt_1', 'evt_2', 'evt_3'],
        llmContext: {
          model: 'claude-3-sonnet',
          tokens: 1523,
          duration: 1.2,
        }
      }
    }
```

_Verified by: Agent decision creates audit event, Audit includes LLM metadata, Query agent decision history, Audit captures rejected actions_

---

### ✅ Agent Churn Risk Completion

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 1w        |

**Problem:** The churn-risk agent in the order-management example app has working
infrastructure from Phases 22a-22c (action handler, onComplete handler, pattern
definition, component migration, approval cron) but critical gaps prevent it from
being a genuine AI agent reference implementation:

1. **Rule-based fallback defeats AI purpose** — `churnRisk.ts` catches LLM errors
   and falls back to `createRuleBasedAnalysis()` which produces the same
   `SuggestCustomerOutreach` command with formula-derived confidence. The AI agent
   is functionally indistinguishable from a rule engine.
2. **Command routing is a stub** — `routeCommand.ts` has a no-op orchestrator that
   returns `{ success: true }` without creating a domain record or emitting an
   `OutreachCreated` event. Commands go nowhere.
3. **No end-to-end integration test with real LLM** — Coverage exists across 3 test
   files but no single test exercises the full pipeline (cancellation → agent →
   LLM → command → outreach) with an actual OpenRouter API call.
4. **No BDD feature file** for the churn-risk flow in order-management.
5. **`highValueChurnPattern` is rule-only** — A second pattern with no `analyze()`
   function serves no purpose in an AI agent feature.

**Solution:** Complete the churn-risk agent as a genuine AI agent reference:

1. **Remove rule-based fallback** — LLM failure → Workpool retry → dead letter
2. **Real outreach handler** — Create outreach record + emit `OutreachCreated` event
3. **Full pipeline integration test** — Real LLM via OpenRouter (~$0.01/run)
4. **BDD feature file** — Executable spec for churn-risk flow
5. **Remove `highValueChurnPattern`** — Rule-only pattern contradicts AI purpose

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Production-ready example | Full AI agent pattern demonstrated end-to-end |
| LLM integration proof | Validates action/mutation split with real API calls |
| Complete command flow | Agent decisions trigger real domain actions |
| Reference implementation | Other agents follow this exact pattern |
| Operational visibility | LLM failures are visible via dead letters, not silently degraded |

**End-to-End Flow (target state):**
"""

1. Customer cancels order (OrderCancelled event)
   |
2. EventBus delivers to churn-risk agent (agentPool action, priority 250)
   |
3. Action handler loads checkpoint, checks idempotency
   |
4. Action handler loads customerCancellations projection (cross-BC query)
   |
5. Pattern trigger: 3+ cancellations in 30 days?
   |
   +--- No --> Skip, return null (onComplete advances checkpoint only)
   +--- Yes --> Continue to step 6
   |
6. LLM analysis via OpenRouter: confidence score + reasoning + command
   |
   +--- LLM error --> Error propagates → Workpool retries (3x) → dead letter
   |
7. Confidence >= 0.8 (auto-execute threshold)?
   |
   +--- Yes --> Return AgentActionResult with SuggestCustomerOutreach command
   +--- No --> Return AgentActionResult with pending approval
   |
8. onComplete (mutation): persist audit → command → approval → checkpoint
   |
9. routeCommand (scheduled mutation): routes SuggestCustomerOutreach
   |
10. Outreach handler creates outreach task record, emits OutreachCreated event
    """

**Design Decision: LLM Testing Strategy**

| Aspect | Decision |
| API calls | Real OpenRouter calls in integration tests, NOT mocked |
| API key | `OPENROUTER_INTEGRATION_TEST_API_KEY` env var (dedicated CI key) |
| Model | Gemini Flash via OpenRouter (~$0.001-0.01 per call) |
| Skip when unavailable | Tests skip (not fail) when API key is not set |
| Existing pattern | `agent-llm.integration.test.ts` already uses this approach |

**Design Decision: No Rule-Based Fallback**

| Current (wrong) | Target (correct) |
| LLM fails → same command emitted with formula confidence | LLM fails → error propagates → Workpool retries → dead letter |
| Agent indistinguishable from rule engine | LLM is essential — failure is an operational event |
| Silent degradation hides API issues | Dead letter visible in admin UI for operator triage |

**Rationale:** An AI agent that silently produces the same outcome without AI
is not an AI agent — it is a rule engine with extra steps. The LLM analysis is
the differentiating value. Its absence should be surfaced as an operational concern
(dead letter), not hidden behind a formula that mimics the same result.

**Changes:** Remove `createRuleBasedAnalysis()` and the `catch` block in
`churnRisk.ts:179-182`. Remove `highValueChurnPattern` (rule-only variant).
Workpool retry config (3 attempts, 1000ms backoff, base 2) handles transient
LLM failures. Persistent failures create dead letters visible in the admin UI.

**Design Decision: SuggestCustomerOutreach Handler**

Replace the no-op minimal orchestrator in `routeCommand.ts` with a handler that:

1. Creates an outreach task record (new `outreachTasks` projection or CMS table)
2. Emits `OutreachCreated` domain event via the event store
3. Validates customerId and riskLevel from command payload
4. Records the outreach in a queryable projection for the admin UI

This completes the loop: cancellation → agent → LLM → command → outreach record.
Future phases can add actual notification delivery (email, SMS) as outreach
consumers — the handler itself is simple domain record creation.

**Design Decision: Approval Expiration Mechanism**

| Aspect | Decision |
| Approach | Hourly cron job (already implemented) |
| Location | `crons.ts` → `expirePendingApprovals` mutation |
| Timeout | 24h default from `AgentBCConfig.humanInLoop.approvalTimeout` |
| Status | **Complete** — cron, mutation, and integration tests all working |

**Infrastructure Completed by Phases 22a-22c:**
| Component | Status | Location |
| Action handler factory | Complete | `platform-core/src/agent/action-handler.ts` |
| onComplete handler factory | Complete | `platform-core/src/agent/oncomplete-handler.ts` |
| Pattern executor | Complete | `platform-core/src/agent/pattern-executor.ts` |
| Agent component (5 tables) | Complete | `platform-core/src/agent/component/` |
| Command bridge | Complete | `platform-core/src/agent/commands.ts` |
| Dead letter handler | Complete | `platform-core/src/agent/dead-letter.ts` |
| Agent rate limiter | Complete | `platform-core/src/agent/agent-rate-limiter.ts` |
| Thread adapter | Complete | `platform-core/src/agent/thread-adapter.ts` |
| Lifecycle FSM | Complete | `platform-core/src/agent/lifecycle-handlers.ts` |
| EventBus action subscription | Complete | `platform-bus/agent-subscription.ts` |

#### Dependencies

- Depends on: AgentCommandInfrastructure

#### Acceptance Criteria

**Three cancellations trigger LLM analysis via OpenRouter**

- Given customer "cust_123" has cancelled 3 orders in the last 30 days
- When an OrderCancelled event is published for "cust_123"
- Then the pattern trigger fires (3+ cancellations detected)
- And the LLM is called via OpenRouter with event history
- And the analysis returns a confidence score and reasoning
- And the analysisMethod is "llm"

**Two cancellations do not trigger LLM**

- Given customer "cust_456" has cancelled 2 orders in the last 30 days
- When an OrderCancelled event is published for "cust_456"
- Then the pattern trigger does not fire
- And no LLM call is made
- And the checkpoint advances without emitting a command

**High confidence triggers auto-execution of SuggestCustomerOutreach**

- Given customer "cust_789" has cancelled 4 orders in the last 30 days
- And the LLM returns confidence 0.92 (above threshold 0.8)
- When the agent processes the OrderCancelled event
- Then a SuggestCustomerOutreach command is included in the AgentActionResult
- And the onComplete handler persists the command and audit event
- And the command is scheduled for routing via routeAgentCommand

**Low confidence queues for human approval**

- Given customer "cust_101" has cancelled 3 orders in the last 30 days
- And the LLM returns confidence 0.65 (below threshold 0.8)
- When the agent processes the analysis result
- Then a pending approval is created with the LLM reasoning
- And no command is emitted immediately
- And an ApprovalRequested audit event is recorded
- And the approval expires after 24 hours if not acted on

**LLM failure exhausts retries and creates dead letter**

- Given customer "cust_err" has cancelled 3 orders in the last 30 days
- And the LLM API is unreachable (network error)
- When an OrderCancelled event triggers analysis
- Then the Workpool retries the action 3 times with exponential backoff
- And after all retries fail, onComplete receives kind "failed"
- And a dead letter is created with the error details
- And an AgentAnalysisFailed audit event is recorded
- And no SuggestCustomerOutreach command is emitted
- And the dead letter is visible in the admin UI for operator triage

**Cron expires approval after timeout**

- Given a pending approval created 25 hours ago
- And the approval timeout is 24 hours
- When the expiration cron runs
- Then the approval status transitions to "expired"
- And an ApprovalExpired audit event is recorded

**Expired approval cannot be approved or rejected**

- Given an approval that has been expired by the cron
- When a reviewer attempts to approve the expired item
- Then the action is rejected with APPROVAL_EXPIRED error
- And the approval remains in "expired" status

**Approved before timeout succeeds normally**

- Given a pending approval created 12 hours ago
- When a reviewer approves the action
- Then the approval status transitions to "approved"
- And the associated command is submitted for execution

**SuggestCustomerOutreach creates outreach record and emits event**

- Given the agent has emitted a SuggestCustomerOutreach command
- And the command includes customerId "cust_123", riskLevel "high", cancellationCount 4
- When the command bridge routes to the outreach handler
- Then an outreach task record is created with the customer context
- And an OutreachCreated domain event is emitted with the outreach details
- And the agent command status updates to "completed"

**Full end-to-end flow from cancellation to outreach record**

- Given a customer who has cancelled 2 orders previously
- When the customer cancels a third order
- Then the churn-risk agent detects the pattern (3+ cancellations)
- And the LLM is called via OpenRouter and returns high confidence
- And a SuggestCustomerOutreach command is emitted
- And the command is routed to the outreach handler
- And an outreach task record is created
- And an OutreachCreated event confirms the action end-to-end

**Command with missing customerId fails validation**

- Given the agent emitted a SuggestCustomerOutreach command
- And the command payload has no customerId
- When the command bridge attempts to route the command
- Then the routing fails with a validation error
- And an AgentCommandRoutingFailed audit event is recorded

**Command handler failure creates dead letter for operator triage**

- Given the agent has emitted a SuggestCustomerOutreach command
- And the outreach handler throws an error during record creation
- When the command bridge reports the failure
- Then the agent command status updates to "failed"
- And an AgentCommandRoutingFailed audit event is recorded
- And the failure is visible in the dead letter management panel

#### Business Rules

**LLM analysis is essential, not optional**

**Invariant:** When the pattern trigger fires (3+ cancellations in 30 days for
the same customer), the LLM MUST be called. There is no rule-based fallback that
produces the same outcome. If the LLM is unavailable, the event is retried by
Workpool (3 attempts with exponential backoff). If all retries fail, a dead letter
is created for operator triage.

    **Rationale:** An AI agent's value comes from LLM analysis — confidence scoring,
    pattern reasoning, contextual recommendations. A rule-based formula that produces
    `SuggestCustomerOutreach` regardless of LLM availability makes the AI irrelevant.
    Failure should be visible (dead letter), not invisible (silent fallback).

    **Error Handling Chain:**
    | Step | What Happens |
    | LLM call fails | Error propagates from `analyze()` to pattern executor |
    | Pattern executor throws | Error propagates to action handler |
    | Action handler throws | Workpool catches, retries (attempt 1/3) |
    | All 3 retries fail | Workpool onComplete receives `kind: "failed"` |
    | onComplete failure path | Creates dead letter, records `AgentAnalysisFailed` audit |
    | Dead letter visible | Admin UI shows failed event for operator replay/ignore |

    **Verified by:** LLM called on trigger, failure creates dead letter, no silent fallback

_Verified by: Three cancellations trigger LLM analysis via OpenRouter, Two cancellations do not trigger LLM, High confidence triggers auto-execution of SuggestCustomerOutreach, Low confidence queues for human approval, LLM failure exhausts retries and creates dead letter_

**Approvals expire after configured timeout**

**Invariant:** Pending approvals must transition to "expired" status after
`approvalTimeout` elapses (default 24 hours). A cron job runs hourly to expire
stale approvals.

    **Rationale:** Pending approvals cannot linger indefinitely. Without expiration,
    the system accumulates stale decisions that may no longer be relevant. The hourly
    cron approach is pragmatic for 24h timeouts where up-to-1-hour latency is acceptable.

    **Status:** The approval expiration mechanism is **complete** (cron, mutation,
    integration tests). These scenarios document the expected behavior for reference.

    **Verified by:** Expiration transitions correctly, expired cannot be acted on

_Verified by: Cron expires approval after timeout, Expired approval cannot be approved or rejected, Approved before timeout succeeds normally_

**Emitted commands create real domain records**

**Invariant:** `SuggestCustomerOutreach` command emitted by the agent routes
through the command bridge to a handler that creates an outreach task record
and emits an `OutreachCreated` domain event. The current no-op stub that returns
`{ success: true }` must be replaced with a real domain handler.

    **Rationale:** A command that produces no domain effect is not a command — it is
    a log entry. Completing the routing makes the agent actionable: analysis leads to
    real business outcomes (outreach records) rather than entries in a table.

    **Outreach Handler Design:**
    | Step | Action |
    | 1. Validate payload | Ensure customerId, riskLevel, agentId present |
    | 2. Create outreach record | Write to outreach CMS/projection table |
    | 3. Emit OutreachCreated event | Via event store append in same mutation |
    | 4. Update agent command status | Mark as "completed" via agent component |

    **OutreachCreated Event Payload:**
    | Field | Source |
    | outreachId | Generated UUID |
    | customerId | From command payload |
    | agentId | From command context |
    | riskLevel | From command payload ("high" / "medium") |
    | cancellationCount | From command payload |
    | correlationId | From command context |
    | createdAt | Current timestamp |

    **Verified by:** Command routes to handler, handler creates record, event emitted

_Verified by: SuggestCustomerOutreach creates outreach record and emits event, Full end-to-end flow from cancellation to outreach record, Command with missing customerId fails validation, Command handler failure creates dead letter for operator triage_

---

### ✅ Agent Command Infrastructure

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 1w        |

**Problem:** Three interconnected gaps in agent command infrastructure:

1. **Commands go nowhere** — Agent emits commands to `agentCommands` table but nothing
   consumes or routes them to target BC handlers
2. **No lifecycle control** — Agent cannot be paused, resumed, or reconfigured.
   The `pause()`, `resume()` stubs in `init.ts` are TODO(Phase-23) placeholders
3. **Parallel pattern systems** — `_patterns/churnRisk.ts` defines formal `PatternDefinition`
   with `analyze()` that calls LLM, while `_config.ts` has inline `onEvent` that reimplements
   trigger logic without LLM. These are disconnected implementations

**Solution:** Complete agent command infrastructure:

1. **Command routing** via CommandOrchestrator — agent commands flow through existing infrastructure
2. **Agent lifecycle FSM** — formal state machine with commands for state transitions
3. **Unified pattern registry** — single source of truth for pattern trigger + analysis

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Commands have effect | Emitted agent commands route to actual domain handlers |
| Agent controllability | Operators can pause/resume/reconfigure agents via commands |
| Single pattern source | One PatternDefinition powers both trigger and LLM analysis |
| Audit completeness | Full command lifecycle tracked through Command Bus |
| Consistent architecture | Agent commands use same infrastructure as domain commands |
| Operational safety | Lifecycle FSM prevents invalid state transitions |

**Current Gap: Command Emission Dead End**
"""
Agent detects pattern
|
v
emitAgentCommand()
|
v
INSERT into agentCommands table
|
v
??? (nothing consumes the command)
"""

**Target: Full Command Routing**
"""
Agent detects pattern
|
v
CommandOrchestrator.execute(agentCommandConfig)
|
+--> Command Bus (idempotency, audit)
+--> Target BC handler (e.g., customerOutreach)
+--> Event Store (CommandEmitted event)
+--> Projection update
"""

**Design Decision: Command Routing Approach**

| Option | Mechanism | Trade-off |
| A: CommandOrchestrator (Recommended) | Agent commands flow through same orchestrator as domain commands | Consistent, audited, idempotent; adds standard indirection |
| B: Direct handler calls | Agent calls target BC mutation directly via makeFunctionReference | Simpler but bypasses command infrastructure |
| C: Integration events | Agent publishes integration event, consumer PM handles | Loosest coupling but most complex; better for cross-system |

**Decision:** Option A — CommandOrchestrator provides:

- Command idempotency via Command Bus
- Full audit trail (command recorded, status tracked)
- Middleware pipeline (validation, logging, authorization)
- Consistent with how all other commands work in the platform

**Design Decision: Agent Lifecycle FSM**

"""
stopped ──> active ──> paused ──> active
| |
v v
stopped stopped
|
v
error_recovery ──> active
"""

| State | Description | Allowed Transitions |
| stopped | Not processing events | -> active (via StartAgent) |
| active | Processing events normally | -> paused, stopped, error_recovery |
| paused | Temporarily not processing, checkpoint preserved | -> active, stopped |
| error_recovery | Automatic recovery after repeated failures | -> active (after cooldown) |

**Lifecycle Commands:**
| Command | Transition | Effect |
| StartAgent | stopped -> active | Resume/start EventBus subscription from checkpoint |
| PauseAgent | active -> paused | Stop processing, preserve checkpoint for resume |
| ResumeAgent | paused -> active | Resume from last checkpoint position |
| StopAgent | any -> stopped | Stop and clear subscription (checkpoint preserved) |
| ReconfigureAgent | active/paused -> active | Update config without losing state |

**Design Decision: Pattern System Unification**

**Current disconnect:**
| Implementation | Location | Uses LLM | Used in Production |
| \_config.ts onEvent (inline) | contexts/agent/\_config.ts | No | Yes (EventBus handler) |
| PatternDefinition.analyze() | contexts/agent/\_patterns/churnRisk.ts | Yes | No (never called) |

**Target: Unified pattern flow**

1. Remove inline `onEvent` from `AgentBCConfig`
2. Add `patterns: PatternDefinition[]` field to `AgentBCConfig`
3. Handler uses pattern's `trigger()` to check if analysis needed
4. Handler uses pattern's `analyze()` for LLM analysis (in action)
5. Single definition powers both cheap rule check and expensive LLM call

"""typescript
// Target AgentBCConfig (simplified)
interface AgentBCConfig {
id: string;
subscriptions: string[];
patterns: PatternDefinition[]; // Replaces onEvent
confidenceThreshold: number;
humanInLoop?: HumanInLoopConfig;
rateLimits?: RateLimitConfig;
// onEvent removed - patterns handle detection + analysis
}
"""

**SuggestCustomerOutreach Command Registration:**

Agent commands are domain commands — they route to target BC handlers (e.g.,
`customerOutreach`), not back to the agent. Registration follows the existing
`commands/registry.ts` pattern used by order and inventory commands.

"""typescript
// commands/agent/configs.ts — agent command config
import { z } from "zod";
import { globalRegistry } from "@libar-dev/platform-core";

const SuggestCustomerOutreachSchema = z.object({
customerId: z.string(),
suggestedAction: z.string(),
riskLevel: z.enum(["low", "medium", "high"]),
triggeringPatternId: z.string(),
});

globalRegistry.register("SuggestCustomerOutreach", {
schema: SuggestCustomerOutreachSchema,
description: "Agent-emitted suggestion for customer outreach based on detected pattern",
category: "agent",
version: 1,
handler: internal.commands.agent.handleSuggestCustomerOutreach,
projections: [], // No projections — handler creates follow-up task or notification
});
"""

**Lifecycle FSM ↔ Checkpoint Status Mapping:**

Lifecycle commands map directly to checkpoint statuses (from stubs `schema.ts:72-77`):

| Command | From Status | To Status | EventBus Effect | Checkpoint Effect |
| StartAgent | stopped | active | Subscription activated from checkpoint position | Status → active |
| PauseAgent | active | paused | Subscription deactivated | Status → paused, position preserved |
| ResumeAgent | paused | active | Subscription reactivated from lastProcessedPosition + 1 | Status → active |
| StopAgent | any | stopped | Subscription removed | Status → stopped, position preserved |
| (automatic) | active | error_recovery | Subscription paused after repeated failures | Status → error_recovery, cooldown starts |
| (automatic) | error_recovery | active | Auto-resume after cooldown period | Status → active |

The `error_recovery` state is NOT triggered by commands but by the agent framework
detecting repeated failures (e.g., 5 consecutive dead letters). After a configurable
cooldown period, the agent auto-resumes to `active`. This prevents tight retry loops
that amplify transient failures.

**ReconfigureAgent** applies runtime config overrides stored in checkpoint's
`configOverrides: v.optional(v.any())` field (forward-declared in stubs). Overrides
are merged with base `AgentBCConfig` at handler invocation time, allowing threshold
changes without redeployment.

**Pattern Registry Concrete API:**

"""typescript
// Agent pattern registry — maps pattern names to definitions
const patternRegistry = new Map<string, PatternDefinition>();

export function registerPattern(name: string, definition: PatternDefinition): void {
if (patternRegistry.has(name)) throw new Error(`Pattern '${name}' already registered`);
patternRegistry.set(name, definition);
}

export function getPattern(name: string): PatternDefinition | undefined {
return patternRegistry.get(name);
}

// Registration at module init (existing patterns from \_patterns/)
registerPattern("churn-risk", churnRiskPattern);
registerPattern("high-value-churn", highValueChurnPattern);
"""

Agent config references patterns by name string, resolved at initialization:
"""typescript
const churnRiskAgentConfig: AgentBCConfig = {
id: "churn-risk-agent",
subscriptions: ["OrderCancelled", "OrderSubmitted", "PaymentFailed"],
patterns: ["churn-risk", "high-value-churn"], // Resolved from registry
confidenceThreshold: 0.8,
};
"""

**Migration Notes — Inline onEvent to Pattern-Based Architecture:**

Backward-compatible transition in 4 phases:

| Phase | Change | Breaking |
| 1 | Add optional `patterns` field to `AgentBCConfig` (alongside existing `onEvent`) | No |
| 2 | Handler checks: if `patterns` present → use pattern registry; if `onEvent` → legacy path | No |
| 3 | Migrate `churnRiskAgentConfig` from `onEvent` to `patterns` array | No (both paths work) |
| 4 | Deprecate `onEvent` field (log warning when used) | No (soft deprecation) |

The existing `_config.ts` inline `onEvent` handler and `_patterns/churnRisk.ts` formal
`PatternDefinition` converge into a single code path: patterns handle both cheap trigger
evaluation (formerly inline in `onEvent`) and expensive LLM analysis (formerly unreachable
in `_patterns/churnRisk.ts`).

#### Dependencies

- Depends on: AgentLLMIntegration

#### Acceptance Criteria

**Agent command routes through CommandOrchestrator to handler**

- Given an agent has emitted a SuggestCustomerOutreach command
- When the command is routed via CommandOrchestrator
- Then the registered handler for SuggestCustomerOutreach is called
- And the command status transitions pending -> processing -> completed
- And an audit event records the command execution

**Unknown command type is rejected with validation error**

- Given an agent emits a command with unregistered type "UnknownAction"
- When the command routing attempts to find a handler
- Then the routing fails with UNKNOWN_COMMAND_TYPE error
- And the command status transitions to "failed"
- And an audit event records the failure

**Command idempotency prevents duplicate processing**

- Given an agent emits a SuggestCustomerOutreach command with commandId "cmd_123"
- And the command has already been processed successfully
- When the same commandId is submitted again
- Then the Command Bus rejects it as a duplicate
- And no handler is called

**PauseAgent transitions active agent to paused**

- Given a churn-risk agent in "active" state
- When a PauseAgent command is executed
- Then the agent state transitions to "paused"
- And the checkpoint is preserved at current position
- And new events are not processed while paused
- And an AgentPaused audit event is recorded

**ResumeAgent resumes from checkpoint position**

- Given a churn-risk agent in "paused" state
- And the checkpoint is at position 42
- When a ResumeAgent command is executed
- Then the agent state transitions to "active"
- And event processing resumes from position 43
- And an AgentResumed audit event is recorded

**Invalid lifecycle transition is rejected**

- Given a churn-risk agent in "stopped" state
- When a PauseAgent command is executed
- Then the command is rejected with INVALID_LIFECYCLE_TRANSITION
- And the agent remains in "stopped" state
- And the rejection is recorded in audit trail

**ReconfigureAgent updates configuration without losing state**

- Given an active churn-risk agent with confidenceThreshold 0.8
- When a ReconfigureAgent command changes threshold to 0.7
- Then the agent continues from its current checkpoint
- And future analysis uses the new threshold
- And the config change is recorded in audit trail

**Agent config references patterns from registry**

- Given a pattern "churn-risk" registered in the pattern registry
- When configuring a churn-risk agent
- Then the agent config references patterns by name
- And the handler loads pattern definitions from registry at startup

**Handler uses pattern trigger for cheap detection**

- Given an event delivered to the agent handler
- When the handler evaluates patterns
- Then it calls pattern.trigger(eventHistory) first
- And only proceeds to pattern.analyze() if trigger returns true
- And this avoids unnecessary LLM calls for non-matching events

**Handler uses pattern analyze for LLM analysis**

- Given a pattern trigger has fired for 3+ cancellations
- When the handler calls pattern.analyze(eventHistory, agentContext)
- Then the LLM analysis provides confidence, reasoning, and suggested action
- And the result is wrapped in an AgentDecision
- And the analysis method is recorded as "llm" in the audit trail

**Unknown pattern name in config fails validation**

- Given an agent config referencing pattern "nonexistent-pattern"
- When the agent is initialized
- Then initialization fails with PATTERN_NOT_FOUND error
- And the error includes the pattern name for debugging

#### Business Rules

**Emitted commands are routed to handlers**

**Invariant:** Commands emitted by agents must flow through CommandOrchestrator and
be processed by registered handlers. Commands cannot remain unprocessed in a table.

    **Rationale:** The current `agentCommands` table receives inserts from `emitAgentCommand()`
    but nothing acts on them. The emitted `SuggestCustomerOutreach` command sits with status
    "pending" forever. For the agent to have real impact, its commands must reach domain handlers.

    **Command Routing Flow:**
    | Step | Action | Component |
    | 1 | Agent decides to emit command | Agent action handler |
    | 2 | Command recorded in onComplete | Agent component |
    | 3 | CommandOrchestrator.execute() | Platform orchestrator |
    | 4 | Target BC handler processes command | Domain BC |
    | 5 | Command status updated | Agent component |

    **Verified by:** Command routes to handler, status lifecycle tracked,
    unknown command rejected

_Verified by: Agent command routes through CommandOrchestrator to handler, Unknown command type is rejected with validation error, Command idempotency prevents duplicate processing_

**Agent lifecycle is controlled via commands**

**Invariant:** Agent state changes (start, pause, resume, stop, reconfigure) must
happen via commands, not direct database manipulation. Each transition is validated
by the lifecycle FSM and recorded in the audit trail.

    **Rationale:** Commands provide audit trail, FSM validation, and consistent state
    transitions. Direct DB manipulation bypasses these safeguards. The lifecycle FSM
    prevents invalid transitions (e.g., pausing an already-stopped agent).

    **Verified by:** Valid transitions succeed, invalid transitions rejected,
    paused agent stops processing

_Verified by: PauseAgent transitions active agent to paused, ResumeAgent resumes from checkpoint position, Invalid lifecycle transition is rejected, ReconfigureAgent updates configuration without losing state_

**Pattern definitions are the single source of truth**

**Invariant:** Each agent references named patterns from a registry. The pattern's
`trigger()` and `analyze()` functions are used by the event handler, eliminating
parallel implementations.

    **Rationale:** The current codebase has two disconnected pattern implementations:
    `_config.ts` with inline rule-based detection and `_patterns/churnRisk.ts` with
    formal `PatternDefinition` including LLM analysis. This creates confusion about
    which code path runs in production and makes the LLM analysis unreachable.

    **Unified Flow:**

```text
Event arrives at agent
         |
         v
    For each pattern in agent.patterns:
         |
         +--- pattern.trigger(events) -> boolean
         |         |
         |    No?  +--- Skip to next pattern
         |    Yes? |
         |         v
         +--- pattern.analyze(events, agent) -> AnalysisResult
         |         |
         |         v
         +--- Build AgentDecision from analysis
```

**Verified by:** Config references patterns by name, handler uses pattern methods,
inline onEvent removed

_Verified by: Agent config references patterns from registry, Handler uses pattern trigger for cheap detection, Handler uses pattern analyze for LLM analysis, Unknown pattern name in config fails validation_

---

[← Back to Roadmap](../ROADMAP.md)
