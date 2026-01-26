# Testing Utilities - BDD Infrastructure for Convex-Native ES

> **Pattern:** Gherkin-based testing with isolation patterns for event-sourced systems
> **Package:** `@libar-dev/platform-core/testing`

---

## Overview

The testing utilities module provides comprehensive infrastructure for Behavior-Driven Development (BDD) testing in Convex-native event-sourced applications. It addresses key challenges unique to event sourcing: testing pure domain logic without infrastructure, handling eventual consistency in projections, and ensuring test isolation when background jobs (Workpool, Workflow) persist state.

**Key insight:** Pure deciders enable unit tests without Docker. Integration tests require isolation patterns because Convex components have no cleanup API.

---

## 1. The Philosophy: Gherkin as Exclusive Testing Approach

### 1.1 Why Gherkin-Only?

The platform enforces **Gherkin as the exclusive testing approach** for domain logic. This is not a preference but a policy designed to maximize the value of event sourcing.

| Traditional Testing | Gherkin-Only Testing |
|---------------------|---------------------|
| Tests as implementation detail | Tests as living documentation |
| Developers-only readability | Domain expert readability |
| Duplicated test setup | Reusable step definitions |
| Scattered test organization | Feature-organized specifications |
| Tests divorced from requirements | Executable acceptance criteria |

### 1.2 The Perfect Mapping

Deciders map perfectly to Given/When/Then:

```
Traditional Decider Test          Gherkin Equivalent
─────────────────────────         ─────────────────────────────────
const state = {...}               Given the order is in "draft" status
const command = {...}             When SubmitOrder command is issued
const result = decide(...)        Then the result should be success
expect(result.event).toBe(...)    And OrderSubmitted event should be emitted
```

### 1.3 Migration Pattern

| From (.test.ts) | To (.feature) |
|-----------------|---------------|
| `describe/it` blocks with expect assertions | `Scenario` with Given/When/Then steps |
| `decideSubmitOrder(null, command, context)` | `Given no existing order, When SubmitOrder command` |
| `expect(result.isSuccess).toBe(true)` | `Then the result should be success` |
| `expect(result.event.type).toBe(...)` | `And OrderSubmitted event should be emitted` |

### 1.4 Testing Layers

```
Layer 1: Pure Deciders (No Docker)
├── Given/When/Then with pure functions
├── No database, no components
├── Fast (< 100ms), deterministic
└── Perfect for domain logic

Layer 2: Handlers (Docker Required)
├── Full command lifecycle
├── CMS + Event Store writes
├── Component interactions
└── Projection verification

Layer 3: Projections (Docker Required)
├── Event replay scenarios
├── State consistency checks
├── Workpool verification
└── Eventual consistency patterns

Layer 4: Sagas (Docker Required)
├── Multi-step workflows
├── Compensation logic
├── External event triggers
└── Long-running processes
```

---

## 2. Pure Decider Testing (No Docker Needed)

### 2.1 Why Deciders Enable Fast Testing

Deciders are **pure functions** with no side effects:

```typescript
// Decider signature - pure function
function decideSubmitOrder(
  state: OrderCMS | null,    // Current state (or null for creation)
  command: SubmitOrderCommand,
  context: DeciderContext
): DeciderOutput<OrderSubmittedEvent, Partial<OrderCMS>>
```

**No `ctx`**, **no I/O**, **no database** = test without infrastructure.

### 2.2 BDD Pattern for Deciders

```gherkin
Feature: Order Submission Decider

  Scenario: Submit new order successfully
    Given no existing order
    And command data:
      | field      | value       |
      | orderId    | ord_test_1  |
      | customerId | cust_123    |
    When SubmitOrder command is executed
    Then the result should be success
    And OrderSubmitted event should be emitted
    And the state update should set status to "submitted"

  Scenario: Reject submission of already submitted order
    Given an existing order with status "submitted"
    When SubmitOrder command is executed
    Then the result should be rejected
    And rejection code should be "ORDER_ALREADY_SUBMITTED"
```

### 2.3 Step Definition Pattern

```typescript
// steps/decider/order-submission.steps.ts
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { decideSubmitOrder } from "../../../src/deciders/order";

const feature = loadFeature("tests/features/deciders/order-submission.feature");

// State shared across steps within a scenario
let state: OrderCMS | null;
let command: SubmitOrderCommand;
let result: DeciderOutput;
let context: DeciderContext;

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = null;
    command = {} as SubmitOrderCommand;
    result = undefined!;
    context = { timestamp: Date.now(), userId: "test-user" };
  });

  Scenario("Submit new order successfully", ({ Given, When, Then, And }) => {
    Given("no existing order", () => {
      state = null;
    });

    Given("command data:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      command = {
        orderId: getRequiredField(data, "orderId"),
        customerId: getRequiredField(data, "customerId"),
      };
    });

    When("SubmitOrder command is executed", () => {
      result = decideSubmitOrder(state, command, context);
    });

    Then("the result should be success", () => {
      expect(result.isSuccess).toBe(true);
    });

    And("OrderSubmitted event should be emitted", () => {
      expect(result.event?.type).toBe("OrderSubmitted");
    });

    And(/the state update should set status to "(.+)"/, (_ctx, status: string) => {
      expect(result.stateUpdate?.status).toBe(status);
    });
  });
});
```

---

## 3. Test Isolation Patterns

### 3.1 The Isolation Problem

Convex components (Workpool, Workflow, Action Retrier) have **isolated databases with no cleanup API**. The parent app cannot access component-internal state.

| Anti-Pattern | Problem |
|--------------|---------|
| `clearAll()` before each test | Kills Workpool loop, causes OCC errors |
| Manual table truncation | Race conditions with background jobs |
| Shared entity IDs | State pollution between tests |

### 3.2 Solution: Namespace Prefixing

Every entity ID is prefixed with a unique test run identifier:

```typescript
import {
  testRunId,
  withPrefix,
  generateTestRunId
} from "@libar-dev/platform-core/testing";

// Module-level singleton (shared within test suite)
console.log(testRunId); // "r1a2bxy"

// Prefix any ID
const orderId = withPrefix("ord_test_123");
// Result: "r1a2bxy_ord_test_123"

// Custom prefix for isolated test context
const customRunId = generateTestRunId();
const isolatedId = withCustomPrefix(customRunId, "ord_123");
```

### 3.3 Test Run ID Format

```
Format: "r" + last 4 chars of base36 timestamp + 2 random chars
Example: "r1a2bxy"
Length: 7 characters
```

**API Reference:**

| Function | Purpose |
|----------|---------|
| `generateTestRunId()` | Create unique 7-char test run ID |
| `testRunId` | Module-level singleton (consistent within suite) |
| `withPrefix(id)` | Prefix ID with singleton testRunId |
| `withCustomPrefix(runId, id)` | Prefix with custom run ID |

### 3.4 Docker Restart Pattern

For complete isolation between test suites, Docker restart is the authoritative method:

```
Test Suite A → Docker Restart → Test Suite B
     ↓                              ↓
All state wiped               Fresh state
```

**Environment-Specific Commands:**

| Environment | Command | Port |
|-------------|---------|------|
| Integration tests | `just restart` | 3210 |
| Infrastructure tests | `just restart-infra` | 3215 |
| Local development | `just dev-reset` | 3220 |
| E2E tests | `just e2e-restart` | 3230 |

### 3.5 When to Use Each Pattern

| Pattern | Use When |
|---------|----------|
| Namespace prefixing | Within a test suite, tests run in parallel |
| Docker restart | Between test suites, need guaranteed clean state |
| Both combined | Maximum isolation for integration test suites |

---

## 4. Polling Utilities (Async Condition Waiting)

### 4.1 The Eventual Consistency Challenge

Projections processed via Workpool are **eventually consistent**. After a command succeeds, the projection may not be updated for 100-500ms.

```
Command Success → Event Appended → Workpool Job Queued → Projection Updated
                                                              ↑
                                              Test must wait for this
```

### 4.2 Core Polling Functions

#### `sleep(ms)`

Simple delay utility:

```typescript
import { sleep } from "@libar-dev/platform-core/testing";

await sleep(1000); // Wait 1 second
```

#### `waitUntil(check, options)`

Poll until a condition returns a truthy value:

```typescript
import { waitUntil } from "@libar-dev/platform-core/testing";

// Wait for order to be confirmed, return the order
const order = await waitUntil(
  async () => {
    const o = await getOrder(orderId);
    return o?.status === "confirmed" ? o : null;
  },
  {
    message: `Order ${orderId} to be confirmed`,
    timeoutMs: 10000,
    pollIntervalMs: 100
  }
);
```

**Behavior:**
- Returns the truthy value when condition is met
- Throws on timeout with descriptive message
- First call happens immediately (no initial delay)

#### `waitFor(predicate, options)`

Simpler boolean-only variant:

```typescript
import { waitFor } from "@libar-dev/platform-core/testing";

// Wait for order to be confirmed (no return value needed)
await waitFor(
  async () => (await getOrder(orderId))?.status === "confirmed",
  { message: "Order to be confirmed" }
);
```

### 4.3 Options Reference

```typescript
interface WaitOptions {
  /** Maximum time to wait. Default: 30000ms (30 seconds) */
  timeoutMs?: number;

  /** Polling interval. Default: 100ms */
  pollIntervalMs?: number;

  /** Error message on timeout. Default: "Condition not met" */
  message?: string;
}
```

### 4.4 Default Constants

```typescript
import {
  DEFAULT_TIMEOUT_MS,      // 30000 (30 seconds)
  DEFAULT_POLL_INTERVAL_MS // 100 (100ms)
} from "@libar-dev/platform-core/testing";
```

### 4.5 Common Patterns

#### Waiting for Projection Update

```typescript
// After executing SubmitOrder command
await waitUntil(
  async () => {
    const summary = await testQuery(t, api.orders.getOrderSummary, { orderId });
    return summary?.status === "submitted" ? summary : null;
  },
  { message: `Order ${orderId} projection to be updated` }
);
```

#### Waiting for Workpool Job Completion

```typescript
// After triggering a projection job
await waitFor(
  async () => {
    const job = await testQuery(t, api.workpool.getJobStatus, { jobId });
    return job?.status === "completed";
  },
  { message: "Projection job to complete", timeoutMs: 15000 }
);
```

#### Waiting with Early Exit on Failure

```typescript
// Fail fast if error state detected
const result = await waitUntil(
  async () => {
    const order = await getOrder(orderId);
    if (order?.status === "failed") {
      throw new Error(`Order unexpectedly failed: ${order.failureReason}`);
    }
    return order?.status === "confirmed" ? order : null;
  },
  { message: "Order confirmation" }
);
```

---

## 5. Environment Guards (Production Safety)

### 5.1 The Security Problem

Test utilities that create entities directly (bypassing commands) must never run in production:

```typescript
// This mutation should ONLY exist for tests
export const createTestOrder = mutation({
  handler: async (ctx, args) => {
    // Directly insert into CMS, bypassing business rules
    await ctx.db.insert("orderCMS", { ...args });
  },
});
```

### 5.2 Guard Functions

#### `ensureTestEnvironment()`

Throws if called in production:

```typescript
import { ensureTestEnvironment } from "@libar-dev/platform-core/testing";

export const createTestOrder = mutation({
  handler: async (ctx, args) => {
    ensureTestEnvironment(); // Throws in production!

    // Safe to proceed - only reachable in test environments
    await ctx.db.insert("orderCMS", { ...args });
  },
});
```

#### `isTestEnvironment()`

Safe boolean check (never throws):

```typescript
import { isTestEnvironment } from "@libar-dev/platform-core/testing";

if (isTestEnvironment()) {
  // Optional test-only behavior
  console.log("Running in test mode");
}
```

### 5.3 Detection Logic

The guard uses a multi-layer detection strategy:

| Check | Environment | Result |
|-------|-------------|--------|
| `globalThis.__CONVEX_TEST_MODE__ === true` | convex-test unit tests | Allow |
| `process` is undefined | convex-test runtime | Allow |
| `process.env.IS_TEST` is set | Explicit test mode | Allow |
| `CONVEX_CLOUD_URL` is NOT set | Self-hosted Docker | Allow |
| `CONVEX_CLOUD_URL` IS set | Cloud production | **Block** |

### 5.4 Usage in Bounded Context Components

```typescript
// convex/orders/testing.ts (test-only mutations)
import { mutation } from "./_generated/server";
import { ensureTestEnvironment } from "@libar-dev/platform-core/testing";
import { v } from "convex/values";

/**
 * Create test order directly in CMS (bypasses command flow).
 * ONLY available in test environments.
 */
export const createTestOrder = mutation({
  args: {
    orderId: v.string(),
    customerId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    return await ctx.db.insert("orderCMS", {
      orderId: args.orderId,
      customerId: args.customerId,
      status: args.status,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
```

---

## 6. World/State Management for BDD

### 6.1 What is a "World"?

In BDD testing, the **World** is the shared context across all steps within a single scenario. It holds:

- Test backend reference (`t`)
- Results from operations (`lastResult`, `lastError`)
- Scenario-specific data (`scenario` object)

### 6.2 Base World Interfaces

#### Unit Test World

```typescript
import {
  BaseUnitTestWorld,
  createBaseUnitTestWorld
} from "@libar-dev/platform-core/testing";

// Extend for domain-specific fields
interface OrderUnitTestWorld extends BaseUnitTestWorld {
  scenario: {
    orderId?: string;
    customerId?: string;
    deciderResult?: DeciderOutput;
  };
}

// Create in test setup
const t = convexTest(schema);
const world = createBaseUnitTestWorld(t) as OrderUnitTestWorld;
```

#### Integration Test World

```typescript
import {
  BaseIntegrationTestWorld,
  createBaseIntegrationTestWorld
} from "@libar-dev/platform-core/testing";

// Extend for domain-specific fields
interface OrderIntegrationTestWorld extends BaseIntegrationTestWorld {
  createdOrderIds: Set<string>;
  scenario: {
    orderId?: string;
    commandResult?: CommandResult;
  };
}

// Create in test setup
const t = new ConvexTestingHelper(backendUrl);
const world = createBaseIntegrationTestWorld(t) as OrderIntegrationTestWorld;
```

### 6.3 World API Reference

| Type | Field | Purpose |
|------|-------|---------|
| `BaseTestWorld<T>` | `t` | Test backend instance |
| | `lastResult` | Result from last operation |
| | `lastError` | Error from last operation (null if success) |
| | `scenario` | Scenario-specific key-value storage |
| `BaseIntegrationTestWorld` | `backendUrl` | Backend URL for connection info |

### 6.4 Reset Between Scenarios

```typescript
import { resetWorldState } from "@libar-dev/platform-core/testing";

describeFeature(feature, ({ AfterEachScenario }) => {
  AfterEachScenario(() => {
    resetWorldState(world);
    // world.lastResult = null
    // world.lastError = null
    // world.scenario = {}
    // world.t is preserved
  });
});
```

### 6.5 Complete World Pattern

```typescript
// tests/steps/order.steps.ts
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  createBaseIntegrationTestWorld,
  resetWorldState,
  testMutation,
  testQuery,
  waitUntil,
  withPrefix
} from "@libar-dev/platform-core/testing";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../convex/_generated/api";

const feature = loadFeature("tests/features/order-lifecycle.feature");

interface OrderWorld extends BaseIntegrationTestWorld {
  scenario: {
    orderId?: string;
    customerId?: string;
  };
}

let world: OrderWorld;

describeFeature(feature, ({ BeforeAllScenarios, AfterEachScenario, Scenario }) => {
  BeforeAllScenarios(async () => {
    const t = new ConvexTestingHelper("http://127.0.0.1:3210");
    world = createBaseIntegrationTestWorld(t) as OrderWorld;
  });

  AfterEachScenario(() => {
    resetWorldState(world);
  });

  Scenario("Create and submit order", ({ Given, When, Then }) => {
    Given("a new order ID {string}", async (_ctx, orderId: string) => {
      world.scenario.orderId = withPrefix(orderId);
    });

    When("I submit the order", async () => {
      try {
        world.lastResult = await testMutation(world.t, api.orders.submitOrder, {
          orderId: world.scenario.orderId!,
          customerId: withPrefix("cust_123"),
        });
      } catch (e) {
        world.lastError = e as Error;
      }
    });

    Then("the order should be in submitted status", async () => {
      const order = await waitUntil(
        () => testQuery(world.t, api.orders.getOrderSummary, {
          orderId: world.scenario.orderId!,
        }),
        { message: "Order to appear in projection" }
      );
      expect(order.status).toBe("submitted");
    });
  });
});
```

---

## 7. Integration Test Helpers

### 7.1 The TS2589 Problem

`ConvexTestingHelper` methods can cause TypeScript depth limit errors (TS2589) when used with complex generated API types.

### 7.2 Type-Safe Wrappers

```typescript
import {
  testMutation,
  testQuery,
  testAction
} from "@libar-dev/platform-core/testing";
import { api } from "../convex/_generated/api";

// Instead of: await t.mutation(api.orders.createOrder, args)
const result = await testMutation(t, api.orders.createOrder, {
  orderId: "ord_123",
  customerId: "cust_456",
});

// Instead of: await t.query(api.orders.getOrderSummary, args)
const order = await testQuery(t, api.orders.getOrderSummary, {
  orderId: "ord_123",
});

// Instead of: await t.action(api.actions.sendNotification, args)
const sent = await testAction(t, api.actions.sendNotification, {
  userId: "user_123",
  message: "Hello!",
});
```

### 7.3 API Reference

| Function | Purpose |
|----------|---------|
| `testMutation(t, mutation, args)` | Type-safe mutation call |
| `testQuery(t, query, args)` | Type-safe query call |
| `testAction(t, action, args)` | Type-safe action call |

---

## 8. DataTable Parsing Utilities

### 8.1 Gherkin DataTables

DataTables in Gherkin pass structured data to steps:

```gherkin
Given order details:
  | field      | value       |
  | orderId    | ord_123     |
  | customerId | cust_456    |
  | total      | 100.00      |
```

### 8.2 Parsing Functions

```typescript
import {
  tableRowsToObject,
  parseTableValue,
  getRequiredField,
  getOptionalField,
  type DataTableRow
} from "@libar-dev/platform-core/testing";

// In step definition
Given("order details:", (_ctx: unknown, table: DataTableRow[]) => {
  // Convert to object
  const data = tableRowsToObject(table);
  // { orderId: "ord_123", customerId: "cust_456", total: "100.00" }

  // Get required fields (throws if missing)
  const orderId = getRequiredField(data, "orderId");

  // Get optional fields with defaults
  const status = getOptionalField(data, "status", "draft");

  // Parse typed values
  const total = parseTableValue(data.total, "float"); // 100.00
});
```

### 8.3 Type Parsing

```typescript
parseTableValue("42", "int")       // 42 (number)
parseTableValue("3.14", "float")   // 3.14 (number)
parseTableValue("true", "boolean") // true (boolean)
parseTableValue("yes", "boolean")  // true
parseTableValue("1", "boolean")    // true
parseTableValue("hello", "string") // "hello"
```

---

## 9. Step Definition Organization

### 9.1 File Structure

```
tests/
├── features/
│   └── behavior/
│       ├── orders/
│       │   ├── order-submission.feature
│       │   └── order-confirmation.feature
│       └── inventory/
│           └── stock-reservation.feature
└── steps/
    ├── orders/
    │   ├── submission.steps.ts
    │   └── confirmation.steps.ts
    └── inventory/
        └── reservation.steps.ts
```

### 9.2 Preventing Step Conflicts

Each domain area has its own step file to prevent pattern conflicts:

```typescript
// steps/orders/submission.steps.ts
Given("an order with ID {string}", ...);  // Order-specific

// steps/inventory/reservation.steps.ts
Given("a product with ID {string}", ...); // Inventory-specific
```

**Rule:** No duplicate step patterns across files within the same test suite.

---

## Related Documents

- [Decider Pattern](./decider-pattern.md) - Pure business logic functions that enable infrastructure-free testing
- [DCB Architecture](./dcb-architecture.md) - Multi-entity testing patterns
- [Workpool Partitioning](./workpool-partitioning.md) - Understanding projection processing for test timing
- [Event Store Durability](./event-store-durability.md) - Event verification in integration tests
