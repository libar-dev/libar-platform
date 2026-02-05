@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:AgentAsBoundedContext
@libar-docs-status:roadmap
@libar-docs-phase:22
@libar-docs-effort:2w
@libar-docs-product-area:Platform
@libar-docs-depends-on:ReactiveProjections,EcstFatEvents
@libar-docs-executable-specs:platform-core/tests/features/behavior/agent
Feature: Agent as Bounded Context - AI-Native Architecture Pattern

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
    key: event.streamId,  // Maintains order per customer/entity
    onComplete: internal.agent.handleAnalysisResult,
  });
  """
  - Best for: High-throughput event processing, simple analyze-then-emit flows
  - Guarantees: Retry with exponential backoff, partition ordering, onComplete audit

  **Checkpoint Pattern (required for Workpool durability):**
  """typescript
  // Agent checkpoint schema for resumption after restart
  interface AgentCheckpoint {
    agentId: string;              // Agent BC identifier (e.g., "churn-detector")
    subscriptionId: string;       // Subscription instance ID
    lastProcessedPosition: number; // -1 = no events processed
    lastEventId: string;          // For causation tracking
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
  EventBus                 Agent BC                    Command Bus
     │                        │                            │
     │  OrderSubmitted ──────>│ Pattern Detection ────────>│ SuggestOutreach
     │  OrderCancelled ──────>│ (@convex-dev/agent)        │
     │  PaymentFailed  ──────>│        │                   │
     │                        │ Audit Trail               │
     │                        │ (AgentDecisionMade)       │
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

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Agent BC example | planned | examples/order-management/contexts/agent/ | Yes | integration |
      | EventBus subscription for agents | planned | @libar-dev/platform-bus/src/agent-subscription.ts | Yes | unit |
      | Pattern detection framework | planned | @libar-dev/platform-core/src/agent/patterns.ts | Yes | unit |
      | Command emission from agents | planned | @libar-dev/platform-core/src/agent/commands.ts | Yes | unit |
      | Agent audit trail | planned | @libar-dev/platform-core/src/agent/audit.ts | Yes | unit |
      | Human-in-loop configuration | planned | @libar-dev/platform-core/src/agent/approval.ts | Yes | unit |
      | Agent checkpoint types | planned | @libar-dev/platform-core/src/agent/checkpoint.ts | Yes | unit |
      | Agent types and validators | planned | @libar-dev/platform-core/src/agent/types.ts | Yes | unit |
      | Agent initialization | planned | @libar-dev/platform-core/src/agent/init.ts | Yes | unit |
      | Rate limiting config | planned | @libar-dev/platform-core/src/agent/rate-limit.ts | Yes | unit |
      | Dead letter handler | planned | @libar-dev/platform-core/src/agent/dead-letter.ts | Yes | unit |
      | Agent as BC documentation | planned | docs/architecture/AGENT-AS-BC.md | No | - |

  Rule: Agent subscribes to relevant event streams

    EventBus delivers events to agent BC like any other subscriber.

    **Subscription API:**
    """typescript
    // Agent BC subscribes to specific event types
    const subscription = agentBC.subscribe({
      eventTypes: ['OrderSubmitted', 'OrderCancelled', 'PaymentFailed'],
      filter: (event) => event.payload.amount > 100,  // Optional filter
      handler: agentAnalysisHandler,
    });
    // Events delivered as fat events with full context
    """

    @acceptance-criteria @happy-path
    Scenario: Agent receives subscribed events
      Given an agent subscribed to OrderSubmitted, OrderCancelled
      When an OrderSubmitted event is published
      Then the agent should receive the event
      And event should include full fat-event payload

    @acceptance-criteria @happy-path
    Scenario: Agent receives filtered events only
      Given an agent subscribed with filter amount > 100
      When OrderSubmitted with amount 50 is published
      And OrderSubmitted with amount 150 is published
      Then the agent should receive only the 150 event

    @acceptance-criteria @happy-path
    Scenario: Agent receives events in order
      Given an agent subscribed to OrderSubmitted
      When events E1, E2, E3 are published in sequence
      Then the agent receives events in same order

    @acceptance-criteria @edge-case
    Scenario: Agent resumes from last processed position after restart
      Given an agent subscribed to OrderSubmitted
      And agent has processed events up to position 100
      When server restarts
      And agent subscription resumes
      Then processing should continue from position 101
      And no events should be reprocessed
      And no events should be lost

    @acceptance-criteria @validation
    Scenario Outline: Agent configuration validation
      Given an agent configuration with <violation>
      When the agent is initialized
      Then it should fail with code "<error_code>"
      And error message should indicate "<message>"

      Examples:
        | violation                    | error_code                   | message                                              |
        | empty subscription list      | NO_SUBSCRIPTIONS             | Agent must subscribe to at least one event           |
        | invalid pattern window       | INVALID_PATTERN_WINDOW       | Pattern window duration must be positive             |
        | confidence threshold > 1     | INVALID_CONFIDENCE_THRESHOLD | Confidence threshold must be between 0 and 1         |
        | conflicting approval rules   | CONFLICTING_APPROVAL_RULES   | Action cannot be in both autoApprove and requiresApproval |
        | missing agent id             | AGENT_ID_REQUIRED            | Agent must have a unique identifier                  |

  Rule: Agent detects patterns across events

    Pattern window groups events for analysis (LLM or rule-based).

    **Pattern Detection API:**
    """typescript
    // Define pattern with detection criteria
    const churnRiskPattern = definePattern({
      name: 'ChurnRisk',
      window: { duration: '30d', minEvents: 3 },
      trigger: (events) => {
        const cancellations = events.filter(e => e.type === 'OrderCancelled');
        return cancellations.length >= 3;
      },
      analyze: async (events, agent) => {
        // LLM analysis for deeper insight
        return await agent.analyze({
          prompt: 'Analyze churn risk from these cancellation patterns',
          events,
        });
      }
    });
    """

    @acceptance-criteria @happy-path
    Scenario: Agent detects multiple cancellations pattern
      Given events for customer "cust_123":
        | type | timestamp |
        | OrderCancelled | 2026-01-10T10:00:00Z |
        | OrderCancelled | 2026-01-11T10:00:00Z |
        | OrderCancelled | 2026-01-12T10:00:00Z |
      When agent analyzes pattern window
      Then "ChurnRisk" pattern should be detected
      And confidence should be above 0.8

    @acceptance-criteria @happy-path
    Scenario: Agent uses LLM for pattern analysis
      Given a pattern window with 10 order events
      When agent invokes LLM analysis
      Then analysis includes detected patterns
      And analysis includes confidence scores
      And analysis includes reasoning

    @acceptance-criteria @edge-case
    Scenario: Pattern window respects time boundary
      Given events spanning 60 days
      And pattern window duration is 30 days
      When agent analyzes pattern
      Then only events from last 30 days are considered

    @acceptance-criteria @edge-case
    Scenario: Pattern window loads events lazily for memory efficiency
      Given pattern window duration is 30 days
      And 1000 events exist within the pattern window
      When pattern trigger is evaluated
      Then events should be loaded in batches
      And memory usage should remain bounded
      And all relevant events should still be considered for pattern detection

    @acceptance-criteria @validation
    Scenario Outline: Pattern definition validation
      Given a pattern definition with <violation>
      When the pattern is registered
      Then it should fail with code "<error_code>"

      Examples:
        | violation              | error_code              |
        | no trigger function    | TRIGGER_REQUIRED        |
        | empty name             | PATTERN_NAME_REQUIRED   |
        | negative minEvents     | INVALID_MIN_EVENTS      |
        | duration not parseable | INVALID_DURATION_FORMAT |

  Rule: Agent emits commands with explainability

    Commands include reasoning and suggested action.

    **Command Emission API:**
    """typescript
    // Agent emits command with full explainability
    await agentBC.emitCommand({
      type: 'SuggestCustomerOutreach',
      payload: {
        customerId: pattern.customerId,
        suggestedAction: 'Proactive support call',
      },
      metadata: {
        patternId: pattern.id,
        confidence: 0.85,
        reason: 'Multiple order cancellations detected',
        analysis: analysisResult,  // Full LLM response
        eventIds: triggeringEvents.map(e => e.id),
      }
    });
    """

    **LLM Fault Isolation (Optional Enhancement):**
    For production deployments, wrap LLM calls with Phase 18's circuit breaker:
    """typescript
    const analysis = await withCircuitBreaker(ctx, "llm-provider", async () => {
      return await agent.analyze({ event, history });
    }, { failureThreshold: 5, resetTimeoutMs: 60000 });
    """
    This triggers fallback to rule-based analysis when LLM is unavailable,
    preventing cascade failures during LLM provider outages.

    @acceptance-criteria @happy-path
    Scenario: Agent emits recommendation command
      Given a detected ChurnRisk pattern
      When agent decides to act
      Then SuggestCustomerOutreach command should be emitted
      And command should include:
        | field | value |
        | reason | Multiple order cancellations detected |
        | suggestedAction | Proactive support call |
        | confidence | 0.85 |

    @acceptance-criteria @happy-path
    Scenario: Command includes triggering event references
      Given a detected pattern from events E1, E2, E3
      When agent emits command
      Then command.metadata.eventIds contains [E1.id, E2.id, E3.id]
      And events can be traced back from command

    @acceptance-criteria @validation
    Scenario: Command requires minimum metadata
      Given an agent attempting to emit command without reason
      When emitCommand is called
      Then an error is thrown with code "REASON_REQUIRED"

    @acceptance-criteria @edge-case
    Scenario: LLM rate limit is handled with exponential backoff
      Given an agent attempting LLM analysis
      And LLM API returns 429 rate limit error
      When agent retries the analysis
      Then retry should use exponential backoff
      And event processing queue should not be blocked
      And retry attempts should be logged for observability

    @acceptance-criteria @validation
    Scenario Outline: Command validation
      Given an agent command with <violation>
      When emitCommand is called
      Then it should fail with code "<error_code>"

      Examples:
        | violation               | error_code           |
        | missing reason          | REASON_REQUIRED      |
        | missing confidence      | CONFIDENCE_REQUIRED  |
        | empty triggering events | EVENTS_REQUIRED      |
        | invalid command type    | INVALID_COMMAND_TYPE |

    @acceptance-criteria @validation
    Scenario Outline: LLM error handling
      Given an agent attempting LLM analysis
      And LLM API returns <error_type>
      When the error is handled
      Then recovery action should be "<recovery>"
      And error should be logged with code "<error_code>"

      Examples:
        | error_type        | error_code           | recovery              |
        | 429 rate limit    | LLM_RATE_LIMITED     | exponential backoff   |
        | 500 server error  | LLM_UNAVAILABLE      | circuit breaker trip  |
        | timeout           | LLM_TIMEOUT          | retry with backoff    |
        | invalid response  | LLM_INVALID_RESPONSE | log and skip event    |
        | auth error        | LLM_AUTH_FAILED      | alert and pause agent |

  Rule: Human-in-loop controls automatic execution

    High-confidence actions can auto-execute; low-confidence require approval.

    **Human-in-Loop Configuration:**
    """typescript
    // Configure approval requirements
    const humanInLoopConfig = {
      confidenceThreshold: 0.8,  // Below this → require approval
      requiresApproval: [
        'HighValueOrder',         // Always require approval
        'AccountSuspension',      // Always require approval
      ],
      autoApprove: [
        'LowRiskNotification',    // Always auto-execute
      ],
      approvalTimeout: '24h',     // Expire pending approvals
    };
    """

    **Approval Timeout Implementation (Workflow sleepUntil):**
    Race approval event vs timeout using workflow primitives:
    """typescript
    const expirationTime = Date.now() + config.approvalTimeoutMs;
    const approval = await Promise.race([
      ctx.awaitEvent({ name: "humanApproval", filter: { actionId } }),
      ctx.sleepUntil(expirationTime).then(() => ({ expired: true as const })),
    ]);
    if ("expired" in approval && approval.expired) {
      await ctx.runMutation(internal.agent.expireApproval, { actionId });
      return { status: "expired" };
    }
    """
    Using workflow `sleepUntil()` racing with `awaitEvent()` is simpler than
    scheduler-based timeouts because workflow state is inherently durable.

    @acceptance-criteria @happy-path
    Scenario Outline: Action based on confidence threshold
      Given confidence threshold is 0.8
      And agent detects pattern with confidence <confidence>
      When determining action
      Then execution mode should be "<mode>"

      Examples:
        | confidence | mode |
        | 0.95 | auto-execute |
        | 0.75 | flag-for-review |
        | 0.50 | flag-for-review |

    @acceptance-criteria @happy-path
    Scenario: High-risk actions always require approval
      Given an action type in requiresApproval list
      And agent confidence is 0.99
      When determining action
      Then execution mode should be "flag-for-review"

    @acceptance-criteria @happy-path
    Scenario: Pending approval expires after timeout
      Given an action flagged for review
      And approval timeout is 24 hours
      When 24 hours pass without approval
      Then action status becomes "expired"
      And AgentActionExpired event is recorded

  Rule: LLM calls are rate-limited to prevent abuse and manage costs

    Rate limiting protects against runaway costs and API throttling.

    **Rate Limit Configuration:**
    """typescript
    const rateLimitConfig = {
      maxRequestsPerMinute: 60,    // LLM API calls per minute
      maxConcurrent: 5,            // Concurrent LLM calls
      queueDepth: 100,             // Max queued events before backpressure
      costBudget: {
        daily: 100.00,             // USD per day
        alertThreshold: 0.8,       // Alert at 80% of budget
      },
    };
    """

    @acceptance-criteria @happy-path
    Scenario: Rate limiter throttles excessive LLM calls
      Given rate limit is 60 requests per minute
      And agent has made 60 LLM calls this minute
      When another event triggers LLM analysis
      Then the call should be queued
      And processed when rate limit window resets

    @acceptance-criteria @edge-case
    Scenario: Queue overflow triggers backpressure
      Given queue depth limit is 100
      And 100 events are queued for LLM analysis
      When another event arrives
      Then event should be sent to dead letter queue
      And AgentQueueOverflow alert should be emitted

    @acceptance-criteria @validation
    Scenario: Cost budget exceeded pauses agent
      Given daily cost budget is 100.00 USD
      And agent has spent 100.00 USD today
      When another LLM call is attempted
      Then agent should be paused
      And AgentBudgetExceeded alert should be emitted

  Rule: All agent decisions are audited

    Audit trail captures pattern detection, reasoning, and outcomes.

    **Audit Event Structure:**
    """typescript
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
    """

    @acceptance-criteria @happy-path
    Scenario: Agent decision creates audit event
      Given an agent decision to emit SuggestCustomerOutreach
      When the command is emitted
      Then AgentDecisionMade event should be recorded
      And event should include pattern, reasoning, and action

    @acceptance-criteria @happy-path
    Scenario: Audit includes LLM metadata
      Given an agent using LLM for pattern analysis
      When decision is made
      Then AgentDecisionMade includes llmContext
      And llmContext has model, tokens, duration

    @acceptance-criteria @happy-path
    Scenario: Query agent decision history
      Given agent has made 10 decisions
      When I query AgentDecisionMade events for agent BC
      Then I receive all 10 decision records
      And each includes full audit trail

    @acceptance-criteria @happy-path
    Scenario: Audit captures rejected actions
      Given an agent decision that was flagged for review
      And human reviewer rejected the action
      When AgentActionRejected event is recorded
      Then it includes reviewerId and rejectionReason
