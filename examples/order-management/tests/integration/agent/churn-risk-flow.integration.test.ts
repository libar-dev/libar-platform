/**
 * Churn Risk Full Pipeline Integration Tests
 *
 * Verifies the complete flow from cancellation to outreach record creation:
 * cancellation -> agent -> LLM -> command -> outreach record + OutreachCreated event.
 *
 * This test exercises every stage of the pipeline:
 * 1. Orders are created and auto-cancelled (0-stock product)
 * 2. Agent picks up OrderCancelled events via EventBus subscription
 * 3. Workpool action calls OpenRouter (Gemini Flash) for LLM analysis
 * 4. PatternDetected audit event is recorded with analysisMethod === "llm"
 * 5. SuggestCustomerOutreach command is emitted
 * 6. Command bridge routes to outreach handler (dual-write pattern)
 * 7. outreachTasks CMS record created + OutreachCreated event appended
 * 8. AgentCommandRouted audit event confirms successful routing
 *
 * Environment:
 * - OPENROUTER_INTEGRATION_TEST_API_KEY: must be set on the vitest runner
 *   (Justfile exports it from .env.local or shell env)
 * - OPENROUTER_API_KEY: must be set on the Convex backend via `convex env set`
 *   (Justfile `set-openrouter-key` recipe handles this)
 *
 * @see agent-llm.integration.test.ts for LLM-only tests (detection + audit)
 * @see agent.integration.test.ts for rule-based agent tests (always run)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../convex/_generated/api";
import { generateOrderId, generateCustomerId } from "../../fixtures/orders";
import { generateProductId, generateSku } from "../../fixtures/inventory";
import { waitUntil, DEFAULT_TIMEOUT_MS } from "../../support/localBackendHelpers";
import { testMutation, testQuery } from "../../support/integrationHelpers";
import { CHURN_RISK_AGENT_ID } from "../../../convex/contexts/agent/_config";

// Full pipeline: LLM call + command routing + outreach handler = generous timeout
const PIPELINE_TIMEOUT = DEFAULT_TIMEOUT_MS * 5; // ~100s

// ---------------------------------------------------------------------------
// Test-scoped shared state: all tests in this describe share one expensive
// setup (3 cancelled orders -> agent processing -> command routing -> outreach).
// This avoids repeating the ~30-60s setup per test.
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.OPENROUTER_INTEGRATION_TEST_API_KEY)(
  "Churn Risk Full Pipeline Integration Tests",
  () => {
    let t: ConvexTestingHelper;
    let customerId: string;
    let orderIds: string[];
    let testStartTimestamp: number;

    // Captured after setup -- all `it` blocks assert against these
    let patternAuditEvents: Array<{
      agentId: string;
      eventType: string;
      decisionId: string;
      timestamp: number;
      payload: Record<string, unknown>;
    }>;
    let llmAuditEvent: (typeof patternAuditEvents)[number] | undefined;
    let routedAuditEvents: Array<{
      agentId: string;
      eventType: string;
      decisionId: string;
      timestamp: number;
      payload: Record<string, unknown>;
    }>;
    let outreachTasks: Array<{
      outreachId: string;
      customerId: string;
      agentId: string;
      riskLevel: string;
      cancellationCount: number;
      correlationId: string;
      triggeringPatternId: string;
      status: string;
      createdAt: number;
      updatedAt: number;
    }>;

    beforeAll(async () => {
      testStartTimestamp = Date.now();
      t = new ConvexTestingHelper({
        backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
      });

      // Create product with NO stock -- saga compensation will cancel all orders
      const productId = generateProductId();
      const sku = generateSku();
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Pipeline Test Widget",
        sku,
        availableQuantity: 0,
      });

      customerId = generateCustomerId();
      orderIds = [];

      // Create 3 orders that will be auto-cancelled (no stock -> saga compensation)
      for (let i = 0; i < 3; i++) {
        const orderId = generateOrderId();
        orderIds.push(orderId);

        await testMutation(t, api.orders.createOrder, { orderId, customerId });
        await testMutation(t, api.orders.addOrderItem, {
          orderId,
          productId,
          productName: "Pipeline Test Widget",
          quantity: 1,
          unitPrice: 30 + i,
        });
        await testMutation(t, api.orders.submitOrder, { orderId });

        // Wait for saga compensation to cancel
        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order?.status === "cancelled";
          },
          { message: `Order ${i + 1} cancelled by saga`, timeoutMs: PIPELINE_TIMEOUT }
        );

        // Wait for cancellation projection
        await waitUntil(
          async () => {
            const projection = await testQuery(t, api.testing.getTestCustomerCancellations, {
              customerId,
            });
            return projection !== null && projection.cancellationCount >= i + 1;
          },
          { message: `Customer cancellation ${i + 1} recorded`, timeoutMs: PIPELINE_TIMEOUT }
        );
      }

      // ---- Stage 1: Wait for PatternDetected audit event (LLM analysis) ----
      await waitUntil(
        async () => {
          const events = await testQuery(t, api.queries.agent.getAuditEvents, {
            agentId: CHURN_RISK_AGENT_ID,
            eventType: "PatternDetected",
            limit: 50,
          });
          return events.length > 0;
        },
        { message: "PatternDetected audit event created", timeoutMs: PIPELINE_TIMEOUT }
      );

      // Capture PatternDetected audit events
      patternAuditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
        agentId: CHURN_RISK_AGENT_ID,
        eventType: "PatternDetected",
        limit: 50,
      });

      // Find the LLM-produced event
      llmAuditEvent = patternAuditEvents.find(
        (e) => (e.payload as Record<string, unknown>)?.analysisMethod === "llm"
      );

      // ---- Stage 2: Wait for AgentCommandRouted audit event (command bridge) ----
      await waitUntil(
        async () => {
          const events = await testQuery(t, api.queries.agent.getAuditEvents, {
            agentId: CHURN_RISK_AGENT_ID,
            eventType: "AgentCommandRouted",
            limit: 50,
          });
          return events.length > 0;
        },
        { message: "AgentCommandRouted audit event created", timeoutMs: PIPELINE_TIMEOUT }
      );

      // Capture AgentCommandRouted audit events
      routedAuditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
        agentId: CHURN_RISK_AGENT_ID,
        eventType: "AgentCommandRouted",
        limit: 50,
      });

      // ---- Stage 3: Wait for outreach task CMS record ----
      await waitUntil(
        async () => {
          const tasks = await testQuery(t, api.testing.getTestOutreachTasks, {
            customerId,
          });
          return tasks.length > 0;
        },
        { message: "Outreach task created for customer", timeoutMs: PIPELINE_TIMEOUT }
      );

      // Capture outreach tasks
      outreachTasks = await testQuery(t, api.testing.getTestOutreachTasks, {
        customerId,
      });
    }, PIPELINE_TIMEOUT);

    afterAll(async () => {
      await t.close();
    });

    // -----------------------------------------------------------------------
    // Test 1: LLM analysis produces detection with command suggestion
    // -----------------------------------------------------------------------
    it(
      "should produce LLM analysis with SuggestCustomerOutreach command",
      () => {
        expect(patternAuditEvents.length).toBeGreaterThan(0);
        expect(llmAuditEvent).toBeDefined();

        const payload = llmAuditEvent!.payload as Record<string, unknown>;
        expect(payload.analysisMethod).toBe("llm");
        expect(payload.patternDetected).toBe("SuggestCustomerOutreach");
        expect(payload.confidence).toBeTypeOf("number");
        expect(payload.confidence).toBeGreaterThanOrEqual(0.7);
      },
      PIPELINE_TIMEOUT
    );

    // -----------------------------------------------------------------------
    // Test 2: Command is routed successfully through the bridge
    // -----------------------------------------------------------------------
    it(
      "should route SuggestCustomerOutreach command through bridge",
      () => {
        expect(routedAuditEvents.length).toBeGreaterThan(0);

        const routedEvent = routedAuditEvents[0];
        const payload = routedEvent.payload as Record<string, unknown>;

        expect(payload.commandType).toBe("SuggestCustomerOutreach");
        expect(payload.boundedContext).toBe("agent");
        expect(payload.correlationId).toBeTypeOf("string");
      },
      PIPELINE_TIMEOUT
    );

    // -----------------------------------------------------------------------
    // Test 3: Outreach task CMS record created (dual-write CMS side)
    // -----------------------------------------------------------------------
    it(
      "should create outreach task CMS record for the customer",
      () => {
        expect(outreachTasks.length).toBeGreaterThan(0);

        const task = outreachTasks[0];
        expect(task.customerId).toBe(customerId);
        expect(task.agentId).toBe(CHURN_RISK_AGENT_ID);
        expect(task.status).toBe("pending");
        expect(task.cancellationCount).toBeGreaterThanOrEqual(3);
        expect(["high", "medium", "low"]).toContain(task.riskLevel);
        expect(task.outreachId).toBeTypeOf("string");
        expect(task.correlationId).toBeTypeOf("string");
        expect(task.triggeringPatternId).toBeTypeOf("string");
        expect(task.createdAt).toBeTypeOf("number");
      },
      PIPELINE_TIMEOUT
    );

    // -----------------------------------------------------------------------
    // Test 4: No dead letters created on the success path
    // -----------------------------------------------------------------------
    it(
      "should not produce dead letters on the happy path",
      async () => {
        const allDeadLetters = await testQuery(t, api.queries.agent.getDeadLetters, {
          agentId: CHURN_RISK_AGENT_ID,
          status: "pending",
        });
        // Filter to only dead letters created during THIS test run
        // to avoid cross-test contamination from other concurrent test files
        const deadLetters = allDeadLetters.filter(
          (dl: { failedAt?: number }) => (dl.failedAt ?? 0) >= testStartTimestamp
        );
        expect(deadLetters.length).toBe(0);
      },
      PIPELINE_TIMEOUT
    );
  }
);
