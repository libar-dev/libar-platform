/**
 * Agent LLM Integration Tests
 *
 * Verifies the full LLM analysis path: EventBus → Workpool action → OpenRouter
 * (Gemini Flash) → audit persistence. These tests are skipped when no API key
 * is configured, preserving the existing rule-based-only test behavior.
 *
 * Environment:
 * - OPENROUTER_INTEGRATION_TEST_API_KEY: must be set on the vitest runner
 *   (Justfile exports it from .env.local or shell env)
 * - OPENROUTER_API_KEY: must be set on the Convex backend via `convex env set`
 *   (Justfile `set-openrouter-key` recipe handles this)
 *
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

// LLM calls add 3-10s latency; use generous timeout
const LLM_TEST_TIMEOUT = DEFAULT_TIMEOUT_MS * 4.5; // 90s

// ---------------------------------------------------------------------------
// Test-scoped shared state: all tests in this describe share one expensive
// setup (3 cancelled orders → agent processing → audit event). This avoids
// repeating the ~30-60s setup per test.
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.OPENROUTER_INTEGRATION_TEST_API_KEY)(
  "Agent LLM Integration Tests",
  () => {
    let t: ConvexTestingHelper;
    let customerId: string;
    let orderIds: string[];

    // Captured after setup — all `it` blocks assert against these
    let auditEvents: Array<{
      agentId: string;
      eventType: string;
      decisionId: string;
      timestamp: number;
      payload: Record<string, unknown>;
    }>;
    let llmAuditEvent: (typeof auditEvents)[number] | undefined;

    beforeAll(async () => {
      t = new ConvexTestingHelper({
        backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
      });

      // Create product with NO stock — saga compensation will cancel all orders
      const productId = generateProductId();
      const sku = generateSku();
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "LLM Test Widget",
        sku,
        availableQuantity: 0,
      });

      customerId = generateCustomerId();
      orderIds = [];

      // Create 3 orders that will be auto-cancelled (no stock → saga compensation)
      for (let i = 0; i < 3; i++) {
        const orderId = generateOrderId();
        orderIds.push(orderId);

        await testMutation(t, api.orders.createOrder, { orderId, customerId });
        await testMutation(t, api.orders.addOrderItem, {
          orderId,
          productId,
          productName: "LLM Test Widget",
          quantity: 1,
          unitPrice: 25 + i,
        });
        await testMutation(t, api.orders.submitOrder, { orderId });

        // Wait for saga compensation to cancel
        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order?.status === "cancelled";
          },
          { message: `Order ${i + 1} cancelled by saga`, timeout: LLM_TEST_TIMEOUT }
        );

        // Wait for cancellation projection
        await waitUntil(
          async () => {
            const projection = await testQuery(t, api.testing.getTestCustomerCancellations, {
              customerId,
            });
            return projection !== null && projection.cancellationCount >= i + 1;
          },
          { message: `Customer cancellation ${i + 1} recorded`, timeout: LLM_TEST_TIMEOUT }
        );
      }

      // Wait for the agent to process events and produce a PatternDetected audit event.
      // With the real LLM key, churnRiskPattern.analyze() calls OpenRouter. If the LLM
      // returns confidence >= 0.7, we get analysisMethod === "llm". Otherwise we fall
      // through to highValueChurnPattern (rule-based).
      await waitUntil(
        async () => {
          const events = await testQuery(t, api.queries.agent.getAuditEvents, {
            agentId: CHURN_RISK_AGENT_ID,
            eventType: "PatternDetected",
            limit: 50,
          });
          return events.length > 0;
        },
        { message: "PatternDetected audit event created", timeout: LLM_TEST_TIMEOUT }
      );

      // Capture all PatternDetected audit events
      auditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
        agentId: CHURN_RISK_AGENT_ID,
        eventType: "PatternDetected",
        limit: 50,
      });

      // Find the one with analysisMethod === "llm" (if any)
      llmAuditEvent = auditEvents.find(
        (e) => (e.payload as Record<string, unknown>)?.analysisMethod === "llm"
      );
    }, LLM_TEST_TIMEOUT);

    afterAll(async () => {
      await t.close();
    });

    // -----------------------------------------------------------------------
    // Test 1: The real LLM was called and produced a high-confidence detection
    // -----------------------------------------------------------------------
    it(
      "should use LLM analysis path when OpenRouter key is configured",
      () => {
        // At least one audit event should exist
        expect(auditEvents.length).toBeGreaterThan(0);

        // The churnRiskPattern has an `analyze` function that calls OpenRouter.
        // With 3 cancellations, the LLM should return confidence >= 0.7,
        // resulting in analysisMethod === "llm".
        expect(llmAuditEvent).toBeDefined();
        expect((llmAuditEvent!.payload as Record<string, unknown>).analysisMethod).toBe("llm");
      },
      LLM_TEST_TIMEOUT
    );

    // -----------------------------------------------------------------------
    // Test 2: The LLM-produced audit event has the expected payload structure
    // -----------------------------------------------------------------------
    it(
      "should include pattern detection details in LLM audit event",
      () => {
        expect(llmAuditEvent).toBeDefined();
        const payload = llmAuditEvent!.payload as Record<string, unknown>;

        // Structural assertions — these fields are always set by oncomplete-handler
        expect(payload.analysisMethod).toBe("llm");
        expect(payload.confidence).toBeTypeOf("number");
        expect(payload.confidence).toBeGreaterThanOrEqual(0.7); // churnRiskPattern detection threshold
        expect(payload.confidence).toBeLessThanOrEqual(1);
        expect(payload.reasoning).toBeTypeOf("string");
        expect((payload.reasoning as string).length).toBeGreaterThan(0);

        // triggeringEvents should reference the cancellation events
        expect(Array.isArray(payload.triggeringEvents)).toBe(true);
        expect((payload.triggeringEvents as string[]).length).toBeGreaterThanOrEqual(3);

        // sourceEventId references the specific event that triggered processing
        expect(payload.sourceEventId).toBeTypeOf("string");
      },
      LLM_TEST_TIMEOUT
    );

    // -----------------------------------------------------------------------
    // Test 3: LLM detection above threshold produces a command
    // -----------------------------------------------------------------------
    it(
      "should emit SuggestCustomerOutreach command when LLM detects churn risk",
      () => {
        expect(llmAuditEvent).toBeDefined();
        const payload = llmAuditEvent!.payload as Record<string, unknown>;

        // When churnRiskPattern.analyze() returns confidence >= 0.7 and detected: true,
        // it includes a command suggestion for SuggestCustomerOutreach.
        // The oncomplete handler records this as action in the audit payload.
        expect(payload.patternDetected).toBe("SuggestCustomerOutreach");
        expect(payload.action).toBeDefined();

        const action = payload.action as { type: string; executionMode: string };
        expect(action.type).toBe("SuggestCustomerOutreach");
        expect(["auto-execute", "flag-for-review"]).toContain(action.executionMode);
      },
      LLM_TEST_TIMEOUT
    );
  }
);
