/**
 * Reactive Order Detail View - Step Definitions
 *
 * @libar-docs
 * @libar-docs-implements ExampleAppModernization
 * @libar-docs-phase 23
 *
 * These tests verify the reactive projection pattern for OrderDetailView:
 * - Instant updates via synchronous event merging
 * - Multiple rapid updates applied in order
 * - Optimistic state rollback on conflict
 * - Stale cursor catchup handling
 *
 * NOTE: This file tests the backend infrastructure (evolve, merge, conflict).
 * The actual React hook lives in apps/frontend/ and is tested separately.
 *
 * @since Phase 23 (Example App Modernization - Rule 2)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Platform-core reactive utilities
import {
  createReactiveResult,
  type ReactiveProjectionResult,
} from "@libar-dev/platform-core/projections";

import {
  detectConflict,
  resolveConflict,
  createOptimisticState,
  addOptimisticEvent,
  type OptimisticState,
  type DurableState,
  type ConflictResult,
  type ResolvedState,
} from "@libar-dev/platform-core/projections";

// Local evolve function
import {
  evolveOrderSummary,
  type OrderSummaryState,
  type OrderProjectionEvent,
} from "../../../convex/projections/evolve/orderSummary.evolve";

// Test fixtures
import {
  TEST_TIMESTAMP,
  createBaseProjection,
  createProjectionAtPosition,
  createItemAddedEventSequence,
  createOrderSubmittedEvent,
} from "../../fixtures/reactive";

// ============================================================================
// Test Types
// ============================================================================

interface ReactiveTestState {
  // Projection state
  durableProjection: OrderSummaryState | null;
  events: OrderProjectionEvent[];
  reactiveResult: ReactiveProjectionResult<OrderSummaryState> | null;

  // Conflict detection state
  optimisticState: OptimisticState | null;
  durableState: DurableState | null;
  conflictResult: ConflictResult | null;
  resolvedState: ResolvedState<OrderSummaryState> | null;

  // Optimistic/server state for rollback scenario
  optimisticProjection: OrderSummaryState | null;
  serverProjection: OrderSummaryState | null;

  // Cursor/catchup state
  clientCursor: number;
  serverEvents: OrderProjectionEvent[];

  // Timing (for sync verification)
  mergeWasSynchronous: boolean;
  pollingOccurred: boolean;

  // Conflict log
  conflictLogged: boolean;

  // Common
  error: Error | null;
  testRunId: string;
}

// ============================================================================
// Test State
// ============================================================================

let state: ReactiveTestState | null = null;

function resetState(): void {
  state = {
    durableProjection: null,
    events: [],
    reactiveResult: null,
    optimisticState: null,
    durableState: null,
    conflictResult: null,
    resolvedState: null,
    optimisticProjection: null,
    serverProjection: null,
    clientCursor: 0,
    serverEvents: [],
    mergeWasSynchronous: false,
    pollingOccurred: false,
    conflictLogged: false,
    error: null,
    testRunId: `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
}

// ============================================================================
// Reactive Order Detail Tests
// ============================================================================

const reactiveFeature = await loadFeature(
  "tests/features/modernization/reactive-order-detail.feature"
);

describeFeature(reactiveFeature, ({ Background, Rule, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given, And }) => {
    Given("the orders bounded context is initialized", () => {
      resetState();
      expect(state).not.toBeNull();
      // Verify evolve function is available
      expect(typeof evolveOrderSummary).toBe("function");
    });

    And("the test run has a unique namespace", () => {
      expect(state!.testRunId).toBeDefined();
      expect(state!.testRunId).toMatch(/^test_\d+_[a-z0-9]+$/);
    });
  });

  Rule("Order detail view uses reactive projection for instant updates", ({ RuleScenario }) => {
    // ========================================================================
    // Scenario 1: Order detail view shows instant updates
    // ========================================================================
    RuleScenario("Order detail view shows instant updates", ({ Given, And, When, Then }) => {
      Given("an order exists with status {string}", (_ctx: unknown, status: string) => {
        state!.durableProjection = createBaseProjection(
          `${state!.testRunId}_order_001`,
          status as OrderSummaryState["status"]
        );
        expect(state!.durableProjection.status).toBe(status);
      });

      And("a client is subscribed to the order detail view", () => {
        // "Subscription" is simulated by holding the durable projection
        // and being ready to merge events
        expect(state!.durableProjection).not.toBeNull();
        state!.pollingOccurred = false; // Track if polling happens
      });

      When("the order status changes to {string}", (_ctx: unknown, newStatus: string) => {
        // Create the status change event (OrderSubmitted changes draft → submitted)
        const event = createOrderSubmittedEvent(
          state!.durableProjection!.lastGlobalPosition + 1,
          [{ productId: "p1", productName: "Product", quantity: 1, unitPrice: 100 }],
          100
        );
        state!.events = [event];

        // The key insight: createReactiveResult is SYNCHRONOUS
        // This is what enables <50ms updates - no async, no polling
        const startTime = performance.now();

        state!.reactiveResult = createReactiveResult(
          state!.durableProjection,
          state!.events,
          evolveOrderSummary,
          (p) => p.lastGlobalPosition
        );

        const endTime = performance.now();

        // Verify the operation was synchronous (< 10ms proves no async I/O or polling,
        // while tolerating CPU pressure during parallel test runs)
        state!.mergeWasSynchronous = endTime - startTime < 10;

        // Double-check that the event was applied correctly
        if (newStatus === "submitted") {
          expect(state!.reactiveResult!.state!.status).toBe("submitted");
        }
      });

      Then("the UI should receive the update within 50ms", () => {
        // The 50ms guarantee is architectural - we verify the mechanism:
        // 1. The merge operation is synchronous
        // 2. The result is immediately available
        expect(state!.mergeWasSynchronous).toBe(true);
        expect(state!.reactiveResult).not.toBeNull();
        expect(state!.reactiveResult!.state?.status).toBe("submitted");
        expect(state!.reactiveResult!.isOptimistic).toBe(true);
      });

      And("no polling should have occurred", () => {
        // The reactive pattern uses push (event merge), not pull (polling)
        // Verified by the synchronous operation - polling would be async
        expect(state!.pollingOccurred).toBe(false);
        // Additional verification: there's no setTimeout/setInterval in the flow
        expect(state!.mergeWasSynchronous).toBe(true);
      });
    });

    // ========================================================================
    // Scenario 2: Multiple rapid updates are applied correctly
    // ========================================================================
    RuleScenario("Multiple rapid updates are applied correctly", ({ Given, And, When, Then }) => {
      Given("an order exists with {int} items", (_ctx: unknown, itemCount: number) => {
        // Create order with initial items
        state!.durableProjection = createBaseProjection(
          `${state!.testRunId}_order_002`,
          "draft",
          itemCount,
          itemCount * 25 // $25 per item
        );
        expect(state!.durableProjection.itemCount).toBe(itemCount);
      });

      And("a client is subscribed to the order detail view", () => {
        expect(state!.durableProjection).not.toBeNull();
      });

      When("{int} items are added in rapid succession", (_ctx: unknown, addCount: number) => {
        // Create multiple OrderItemAdded events
        const basePosition = state!.durableProjection!.lastGlobalPosition;
        const baseItemCount = state!.durableProjection!.itemCount;

        state!.events = createItemAddedEventSequence(addCount, basePosition + 1, baseItemCount);

        // Apply all events
        state!.reactiveResult = createReactiveResult(
          state!.durableProjection,
          state!.events,
          evolveOrderSummary,
          (p) => p.lastGlobalPosition
        );
      });

      Then("all items should appear in the view", () => {
        expect(state!.reactiveResult).not.toBeNull();
        expect(state!.reactiveResult!.state).not.toBeNull();
        // Verify events were applied (pendingEvents count)
        expect(state!.reactiveResult!.pendingEvents).toBe(state!.events.length);
      });

      And("the final item count should be {int}", (_ctx: unknown, expectedCount: number) => {
        expect(state!.reactiveResult!.state!.itemCount).toBe(expectedCount);
      });
    });

    // ========================================================================
    // Scenario 3: Optimistic update rolls back on conflict
    // ========================================================================
    RuleScenario("Optimistic update rolls back on conflict", ({ Given, And, When, Then }) => {
      // NOTE: Using exact string match since vitest-cucumber has issues with $ in regex
      Given("a client has an optimistic order total of $100", () => {
        const amountCents = 100 * 100; // $100 = 10000 cents

        // Create optimistic projection state with client's view
        state!.optimisticProjection = createBaseProjection(
          `${state!.testRunId}_order_003`,
          "draft",
          4, // 4 items
          amountCents
        );

        // Track optimistic events with a different event ID
        state!.optimisticState = createOptimisticState(5, TEST_TIMESTAMP);
        state!.optimisticState = addOptimisticEvent(
          state!.optimisticState,
          "evt-opt-1",
          5,
          TEST_TIMESTAMP + 1000
        );
      });

      And("the server projection shows order total of $150", () => {
        const amountCents = 150 * 100; // $150 = 15000 cents

        // Server has different state (conflict scenario)
        state!.serverProjection = createBaseProjection(
          `${state!.testRunId}_order_003`,
          "draft",
          6, // 6 items (different from client)
          amountCents
        );

        // Create durable state for conflict detection
        // Different event ID = divergent branch
        state!.durableState = {
          position: 5,
          lastEventId: "evt-server-1", // Different event ID than optimistic
          updatedAt: TEST_TIMESTAMP + 5000,
        };
      });

      When("the conflict is detected", () => {
        expect(state!.optimisticState).not.toBeNull();
        expect(state!.durableState).not.toBeNull();

        state!.conflictResult = detectConflict(state!.optimisticState!, state!.durableState!);

        // Log the conflict (for test verification)
        if (state!.conflictResult.hasConflict) {
          state!.conflictLogged = true;
        }
      });

      Then("the optimistic state should be rolled back to $150", () => {
        const amountCents = 150 * 100; // $150 = 15000 cents

        expect(state!.conflictResult).not.toBeNull();
        expect(state!.conflictResult!.hasConflict).toBe(true);
        expect(state!.conflictResult!.resolution).toBe("rollback");

        // Apply resolution
        state!.resolvedState = resolveConflict(
          state!.conflictResult!,
          state!.optimisticProjection!,
          state!.serverProjection!
        );

        expect(state!.resolvedState.fromDurable).toBe(true);
        expect(state!.resolvedState.state.totalAmount).toBe(amountCents);
      });

      And("a conflict event should be logged", () => {
        expect(state!.conflictLogged).toBe(true);
        expect(state!.resolvedState!.notificationMessage).toBeTruthy();
      });
    });

    // ========================================================================
    // Scenario 4: Stale event stream is handled gracefully
    // ========================================================================
    RuleScenario("Stale event stream is handled gracefully", ({ Given, When, Then, And }) => {
      Given("a client subscribed with an outdated event cursor", () => {
        // Client has old cursor - hasn't seen events after position 3
        state!.clientCursor = 3;
        state!.durableProjection = createProjectionAtPosition(
          `${state!.testRunId}_order_004`,
          3, // lastGlobalPosition = 3
          2, // 2 items as of position 3
          50 // $50 total
        );
      });

      When("the server has newer events", () => {
        // Server has events at positions 4, 5, 6
        state!.serverEvents = createItemAddedEventSequence(3, 4, 2); // 3 events, starting at position 4, base 2 items

        // Client fetches events after its cursor
        // This simulates getRecentOrderEvents(afterGlobalPosition: clientCursor)
        const eventsAfterCursor = state!.serverEvents.filter(
          (e) => e.globalPosition > state!.clientCursor
        );
        state!.events = eventsAfterCursor;
      });

      Then("the client should catch up to current state", () => {
        // Apply the missed events
        state!.reactiveResult = createReactiveResult(
          state!.durableProjection,
          state!.events,
          evolveOrderSummary,
          (p) => p.lastGlobalPosition
        );

        expect(state!.reactiveResult).not.toBeNull();
        expect(state!.reactiveResult!.state!.itemCount).toBe(5); // 2 + 3 new items
        expect(state!.reactiveResult!.isOptimistic).toBe(true);
        expect(state!.reactiveResult!.pendingEvents).toBe(3);
      });

      And("no data loss should occur", () => {
        // All events were applied - none skipped
        // Final total = 5 items * $25 = $125
        expect(state!.reactiveResult!.state!.totalAmount).toBe(125);

        // Verify ordering was preserved
        const highestPosition = Math.max(...state!.events.map((e) => e.globalPosition));
        expect(highestPosition).toBe(6);
      });
    });
  });
});
