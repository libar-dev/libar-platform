# Holistic Review Findings: Agent-as-BC Design Sessions

> **Session date:** 2026-02-06
> **Scope:** Validation of DS-1, DS-2, DS-4, DS-5 against actual `@convex-dev/agent` component
> **Status:** Findings compiled — needs resolution before DS-3 or implementation

---

## Executive Summary

DS-1/2/4/5 cover ~80% of major architectural decisions for the agent BC. However, validation
against the actual `@convex-dev/agent` component (v0.3.2) and the existing codebase reveals
**3 critical**, **4 high**, and **4 medium** findings that need resolution.

The most significant finding: **no DS references `@convex-dev/agent` at all**. The design
sessions create a bespoke agent BC component but never address how it coexists with the
`@convex-dev/agent` component that provides LLM thread/message management.

---

## Critical Findings

### F-1: Component Name Collision (Critical)

**Problem:** Both components use `defineComponent("agent")`.

| Component           | Source                                                       | Name      |
| ------------------- | ------------------------------------------------------------ | --------- |
| DS-1 Agent BC       | `stubs/agent-component-isolation/component/convex.config.ts` | `"agent"` |
| `@convex-dev/agent` | `deps-packages/convex-agent/src/component/convex.config.ts`  | `"agent"` |

Convex requires unique component names. When `@convex-dev/agent` is mounted for LLM
integration (DS-3 scope), this collision will be a build error.

**Resolution options:**

| Option                 | Mount Pattern                          | Access Pattern          |
| ---------------------- | -------------------------------------- | ----------------------- |
| A: Rename BC component | `defineComponent("agentBC")`           | `components.agentBC.*`  |
| B: Alias LLM component | `app.use(agent, { name: "llmAgent" })` | `components.llmAgent.*` |
| C: Nest LLM inside BC  | `component.use(agent)` inside agentBC  | See F-2 for constraints |

**Recommendation:** Option A — rename the BC component to `"agentBC"`. This is the simplest
change and follows the pattern of descriptive component names (like `projectionPool`,
`dcbRetryPool`).

**Affected stubs:** `convex.config.ts`, all handler stubs referencing `components.agent.*`

---

### F-2: Component Nesting vs Peer Mounting Decision (Critical)

**Problem:** No DS addresses whether `@convex-dev/agent` should be nested inside the BC
component or mounted as a peer at app level. Validation reveals nesting has a fundamental
constraint.

**Nesting constraint (process.env):**

The `Agent` class requires a `LanguageModel` at construction time:

```typescript
const agent = new Agent(components.agent, {
  languageModel: openai("gpt-4o"), // openai() reads process.env.OPENAI_API_KEY
});
```

AI SDK providers read API keys from `process.env` at module import time. **Components cannot
access `process.env`** (per CLAUDE.md component isolation rules). If `@convex-dev/agent` is
nested inside the BC component, the BC component's internal code cannot configure the
`LanguageModel` because it has no access to environment variables.

**Workflow → workpool precedent:** Workflow nests workpool successfully because workpool
doesn't need external API keys — it just schedules functions. `@convex-dev/agent` is
fundamentally different: it needs LLM provider credentials.

**Validated architecture — peer mounting:**

```
App (convex.config.ts)
├── eventStore
├── commandBus
├── projectionPool (workpool)
├── agentPool (workpool)          ← NEW: dedicated pool for agent actions
├── workflow (nests workpool)
├── orders (BC component)
├── inventory (BC component)
├── agentBC (BC component)        ← DS-1 tables: checkpoints, audit, etc.
└── llmAgent (@convex-dev/agent)  ← NEW: threads, messages, embeddings
```

The action handler (app-level) interacts with BOTH components:

- `components.llmAgent` — for thread creation, LLM calls (via `Agent` class)
- `components.agentBC` — for checkpoint, audit, commands, approvals (via component API)

**Resolution:** Add AD (architectural decision) to DS-1 amendment:

- `@convex-dev/agent` and agent BC are **peer components**, not nested
- App-level action handler coordinates between both
- `Agent` class instantiated at app level (has `process.env` access)
- Thread-to-checkpoint correlation is managed by the action handler

---

### F-3: Orphaned onComplete Handler (Critical — Existing Bug)

**Problem:** The agent's `handleChurnRiskOnComplete` handler is defined but **never wired**
to the EventBus subscription.

**Evidence:**

`eventSubscriptions.ts:93`:

```typescript
registry.add(
  createAgentSubscription(churnRiskAgentConfig, {
    handler: handleChurnRiskEventRef,
    priority: 250,
    // NO onComplete field!
  })
);
```

`CreateAgentSubscriptionOptions` interface lacks an `onComplete` field entirely.

**Consequence:** When the agent handler throws (unrecoverable error), the Workpool's
`onComplete` callback goes to the **global projection dead letter handler**
(`projections/deadLetters:onProjectionComplete`), NOT the agent-specific dead letter handler.
The agent's `agentDeadLetters` table only receives entries from **inline** error handling
within the mutation handler itself.

**This creates two disconnected dead letter paths:**

| Failure Mode                     | Dead Letter Destination       | Handler                          |
| -------------------------------- | ----------------------------- | -------------------------------- |
| Handler catches error internally | `agentDeadLetters` table      | Inline code in `eventHandler.ts` |
| Handler throws/crashes           | `projectionDeadLetters` table | Global `deadLetterOnComplete`    |

**Resolution:** PDR-011 (DS-2) already designs `EventSubscription` as a discriminated union
with `onComplete` support. This finding confirms it's not just a design improvement but a
**bug fix** — the agent onComplete was always intended to be wired but the type system
prevented it.

**Urgency:** Must be resolved during DS-2 implementation (already designed, just needs wiring).

---

## High Findings

### F-4: No DS References `@convex-dev/agent` (High)

**Problem:** All four completed DS sessions (DS-1, DS-2, DS-4, DS-5) and their PDRs
(PDR-010 through PDR-013) make zero references to `@convex-dev/agent`. The design maintains
a bespoke `AgentRuntimeConfig` abstraction that wraps the AI SDK directly:

```typescript
// Current abstraction (platform-core/src/agent/init.ts)
interface AgentRuntimeConfig {
  analyze(prompt, events): Promise<LLMAnalysisResult>;
  reason(event): Promise<unknown>;
}
```

This is fundamentally different from the `@convex-dev/agent` `Agent` class which provides:

- Thread-per-user conversation management
- Message persistence with ordering (order + stepOrder)
- Context window management (recent messages, vector search, text search)
- Tool execution framework (`createTool`)
- Streaming support with delta persistence
- Built-in `usageHandler` for token tracking
- `mockModel` for testing

**The parent spec (Phase 22)** explicitly chose "Option C: Hybrid" integration with
`@convex-dev/agent` and shows code examples using `Agent.generateText()` and `createTool()`.
But no DS has designed the actual integration boundary.

**Unresolved architectural decision:**

| Approach                  | Pros                                                                     | Cons                                                      |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Keep `AgentRuntimeConfig` | Simple, tested, no new dependency                                        | No conversation history, no tools, no embedding search    |
| Adopt `Agent` class       | Thread history, tools, streaming, testing utilities                      | Two component DBs, richer but heavier, AI SDK v5 required |
| Hybrid                    | `AgentRuntimeConfig` for simple analysis, `Agent` for complex multi-turn | More code paths to maintain                               |

**Resolution:** DS-3 must make this an explicit AD. If adopting the `Agent` class, DS-2's
`createAgentActionHandler` factory needs redesigning to accept an `Agent` instance.

---

### F-5: AI SDK v4 → v5 Migration Required (High)

**Problem:** Version conflict between the example app and `@convex-dev/agent`:

| Package                       | Example App                  | @convex-dev/agent requires |
| ----------------------------- | ---------------------------- | -------------------------- |
| `ai` (Vercel AI SDK)          | `^4.3.16` (resolved: 4.3.19) | `^5.0.29`                  |
| `@ai-sdk/provider`            | `^1.1.3`                     | `^2.0.0` (devDep)          |
| `@ai-sdk/provider-utils`      | not installed                | `^3.0.7`                   |
| `@openrouter/ai-sdk-provider` | `^0.4.3`                     | `^1.2.0` (devDep)          |

The peerDependency violation is currently silent (pnpm warning) because `@convex-dev/agent`
APIs are never called at runtime. Once DS-3 introduces actual `Agent` usage, this becomes a
build/runtime failure.

**Migration surface:** Small — only 2 files use AI SDK directly (`_llm/config.ts`,
`_llm/runtime.ts`). The `generateObject` API is largely stable across v4→v5. Platform
packages (`platform-core`, `platform-bus`, etc.) have zero AI SDK imports.

**Resolution:** Pre-requisite migration before DS-3 implementation. Should be a separate
deliverable (not part of any DS).

---

### F-6: Agent Shares projectionPool — LLM Actions Will Block Projections (High)

**Problem:** The agent EventBus subscription uses the same `projectionPool` workpool as all
projections and process managers. When DS-2/PDR-011 converts the agent handler from mutation
to action (for LLM API calls), each LLM call will occupy a pool slot for 1-10 seconds.

**Current pool topology:**

```
projectionPool (workpool) — shared by:
├── All projection subscriptions (fast mutations, <50ms)
├── All process manager subscriptions (fast mutations, <50ms)
└── Agent subscription (will become slow action, 1-10s with LLM)
```

**Impact:** A burst of agent events could starve projection processing. Projections drive
real-time UI updates — a 10-second delay is unacceptable.

**Resolution:** Add a dedicated `agentPool` workpool:

```typescript
// convex.config.ts
app.use(workpool, { name: "agentPool" });
```

The EventBus already supports per-subscription pool routing (the `ActionSubscription` type
from DS-2/PDR-011 could carry its own pool reference). This is partially designed in DS-2
but not explicitly called out as requiring a new workpool mount.

---

### F-7: `generateObject` vs `Agent.generateText` + Tools Decision (High)

**Problem:** Two fundamentally different LLM integration patterns exist, and no DS decides
between them.

**Pattern A — Current (`AgentRuntimeConfig`):**

```typescript
// Direct AI SDK call with structured output
const result = await generateObject({
  model,
  schema: PatternAnalysisSchema, // Zod schema
  prompt: fullPrompt,
});
return { patterns: result.object.patterns, confidence: result.object.confidence };
```

**Pattern B — `@convex-dev/agent` class:**

```typescript
// Thread-based with tools
const { thread } = await agent.createThread(ctx, { userId: customerId });
const result = await thread.generateText({
  prompt: buildAnalysisPrompt(events),
  // Agent has tools like emitCommand, lookupHistory
});
```

**Key differences:**

| Aspect               | Pattern A (generateObject) | Pattern B (Agent class)              |
| -------------------- | -------------------------- | ------------------------------------ |
| Conversation history | None (stateless)           | Full thread history                  |
| Output format        | Structured (Zod schema)    | Free text or structured              |
| Tool use             | None                       | createTool with Convex ctx           |
| Context window       | Manual (pass events)       | Automatic (recent messages + search) |
| Cost                 | One LLM call               | Potentially multiple (tool calls)    |
| Complexity           | Lower                      | Higher                               |
| Testing              | Mock runtime               | `mockModel()` from agent             |

**Resolution:** DS-3 architectural decision. Both patterns are valid for different use cases.
The churn-risk agent (simple pattern detection) may not need full thread history, while a
more complex agent (multi-turn reasoning) would benefit from it.

---

## Medium Findings

### F-8: Cron Migration for Approval Expiration (Medium)

**Problem:** The current `expire-pending-approvals` cron job
(`crons.ts:56`) calls `expirePendingApprovals` which uses `ctx.db.query("pendingApprovals")`
directly. When `pendingApprovals` moves into the agent BC component, this cron breaks.

**Current:**

```typescript
// crons.ts
crons.interval("expire-pending-approvals", { hours: 1 }, internal.agent.expirePendingApprovals);
```

**After migration:**

```typescript
// crons.ts — must call through component API
crons.interval(
  "expire-pending-approvals",
  { hours: 1 },
  internal.agent.expireApprovalsViaComponent
);

// New app-level handler that delegates to component:
export const expireApprovalsViaComponent = internalMutation({
  handler: async (ctx) => {
    await ctx.runMutation(components.agentBC.approvals.expirePending, {});
  },
});
```

**Resolution:** Add cron migration as explicit deliverable in DS-1 implementation plan.
The DS-1 stub for `approvals.ts` already includes `expirePending()` in the component API
surface, but the cron re-wiring is not listed as a deliverable.

---

### F-9: `usageHandler` Built-in for Cost Tracking (Medium)

**Problem:** DS-3 plans to build custom cost budget tracking, but `@convex-dev/agent`
provides a built-in `usageHandler` callback:

```typescript
new Agent(components.llmAgent, {
  usageHandler: async (ctx, { userId, agentName, usage, model }) => {
    // usage = { promptTokens, completionTokens, totalTokens }
    // Natural hook for cost tracking!
  },
});
```

This fires after every LLM call with token counts. DS-3 should evaluate using this
instead of building a parallel tracking mechanism.

**Resolution:** Add to DS-3 scope as known capability to evaluate.

---

### F-10: Rate Limiter Access from Agent Component (Medium)

**Problem:** The app-level `rateLimiter` component (`components.rateLimiter`) cannot be
called from within the agent BC component's internal code (component isolation prevents
cross-component calls). Currently, rate limit config in `AgentBCConfig` is purely
declarative — never enforced at runtime.

**Resolution options:**

| Option                            | Pattern                       | Trade-off                     |
| --------------------------------- | ----------------------------- | ----------------------------- |
| Rate-limit in app-level action    | Check before Workpool enqueue | Cleanest; wastes no pool slot |
| Rate-limit inside action handler  | Check at start of action      | Wastes pool slot if denied    |
| Mount rate limiter inside agentBC | `component.use(rateLimiter)`  | Separate rate limit state     |

DS-3 should decide. The `reserve: true` pattern (documented in DESIGN-SESSION-GUIDE.md
DS-3 section) is already noted as a constraint.

---

### F-11: Dead Letter Handler Needs Upsert Semantics (Medium)

**Problem:** The current `onComplete` handler reads `agentDeadLetters` by `eventId` to check
for existing entries before insert/patch (idempotent upsert). The DS-1 component API
`recordDeadLetter` should handle this atomically.

**Current pattern (handlers/onComplete.ts:100-103):**

```
1. Query by eventId → existing?
2. If exists → patch (increment attemptCount)
3. If not → insert new record
```

**Resolution:** The DS-1 stub's `deadLetters.record()` mutation should implement upsert
internally (query + conditional insert/patch within the same mutation). This is already
the natural pattern for component APIs — just needs explicit documentation in the stub.

---

## Summary: What Needs Resolution Before Implementation

### Before DS-3 Starts

| #   | Finding                  | Action                                                | Owner               |
| --- | ------------------------ | ----------------------------------------------------- | ------------------- |
| F-1 | Component name collision | Rename BC to `"agentBC"` in DS-1 stubs                | DS-1 amendment      |
| F-2 | Peer vs nested mounting  | Add AD: peer mounting due to `process.env` constraint | DS-1 amendment      |
| F-5 | AI SDK v4→v5 migration   | Separate pre-requisite deliverable                    | Implementation prep |

### DS-3 Must Address

| #    | Finding                                          | Scope                       |
| ---- | ------------------------------------------------ | --------------------------- |
| F-4  | `AgentRuntimeConfig` vs `Agent` class            | Architectural decision      |
| F-6  | Dedicated agentPool workpool                     | Infrastructure decision     |
| F-7  | `generateObject` vs `Agent.generateText` + tools | Architectural decision      |
| F-9  | `usageHandler` for cost tracking                 | Evaluate built-in vs custom |
| F-10 | Rate limiter access pattern                      | Enforcement point decision  |

### Implementation Deliverables (No DS Change Needed)

| #    | Finding                                       | When                                               |
| ---- | --------------------------------------------- | -------------------------------------------------- |
| F-3  | Wire agent onComplete to subscription         | DS-2 implementation (PDR-011 already designs this) |
| F-8  | Cron migration for approval expiration        | DS-1 implementation                                |
| F-11 | Dead letter upsert semantics in component API | DS-1 implementation                                |

### Holistic Review Checklist Updates

Add these items to `DESIGN-SESSION-GUIDE.md` holistic review checklist:

- [ ] F-1: Component renamed from `"agent"` to `"agentBC"` in all stubs
- [ ] F-2: Peer mounting decision documented (not nested, due to process.env)
- [ ] F-3: Agent onComplete wired to EventBus subscription (existing bug)
- [ ] F-4: `@convex-dev/agent` integration boundary decided (DS-3)
- [ ] F-5: AI SDK v4→v5 migration completed (pre-requisite)
- [ ] F-6: Dedicated agentPool workpool added
- [ ] F-7: LLM call pattern decided: generateObject vs Agent class (DS-3)
- [ ] F-8: Cron migration for approval expiration
- [ ] F-9: usageHandler evaluated for cost tracking (DS-3)
- [ ] F-10: Rate limiter enforcement point decided (DS-3)
- [ ] F-11: Dead letter upsert semantics in component API

---

## Appendix: Validated Claims

Claims validated by codebase exploration:

| Claim                                         | Status        | Evidence                                         |
| --------------------------------------------- | ------------- | ------------------------------------------------ |
| Workflow nests workpool via `component.use()` | **Confirmed** | `workflow/component/convex.config.ts:6`          |
| Nested components invisible to app            | **Confirmed** | Workflow's workpool not in app's `components`    |
| Agent class needs ActionCtx                   | **Confirmed** | Check at `client/index.ts:306`                   |
| DS-1 stubs don't mention @convex-dev/agent    | **Confirmed** | All 8 stub files checked                         |
| PDR-010/011 don't mention @convex-dev/agent   | **Confirmed** | Both decision specs checked                      |
| AI SDK v4→v5 is a real version conflict       | **Confirmed** | peerDep violation in lockfile                    |
| Platform packages have zero AI SDK imports    | **Confirmed** | Only `_llm/` directory uses AI SDK               |
| Agent onComplete never wired                  | **Confirmed** | `eventSubscriptions.ts:93` — no onComplete field |
| Agent shares projectionPool                   | **Confirmed** | `infrastructure.ts:377` — single EventBus pool   |
| Approval uses CMS table, not workflow         | **Confirmed** | `tools/approval.ts` — direct `ctx.db` pattern    |
| @convex-dev/agent not currently mounted       | **Confirmed** | Not in `convex.config.ts`                        |
| No table name overlap between components      | **Confirmed** | Different naming conventions                     |
