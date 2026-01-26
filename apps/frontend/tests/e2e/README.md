# Frontend E2E Testing Guide

End-to-end tests for the frontend application using Playwright with BDD (playwright-bdd).

## Quick Start

```bash
# Run tests (auto-starts backend if not running)
pnpm test:e2e

# Run tests with completely fresh state (resets Docker volumes)
pnpm test:e2e:clean

# Run tests in headed mode for debugging
pnpm test:e2e:headed

# Run tests in debug mode
pnpm test:e2e:debug
```

### Port Separation

E2E tests are **completely isolated** from both local development AND integration tests:

| Environment           | Backend Port | Frontend Port | Dashboard | Purpose                  |
| --------------------- | ------------ | ------------- | --------- | ------------------------ |
| **Local dev**         | 3220         | 3000          | 6791      | Your development work    |
| **Integration tests** | 3210         | -             | -         | Unit/integration tests   |
| **E2E tests**         | 3230         | 3001          | 6792      | Playwright browser tests |

This means:

- E2E tests won't pollute your dev database
- E2E tests won't conflict with integration tests
- You can run all three environments simultaneously

---

## Why This Architecture?

> **Important:** Read this section before writing or debugging tests. The testing patterns here are a direct consequence of how this project implements DDD bounded contexts.

### The Component Isolation Constraint

This project implements DDD bounded contexts as **Convex components** — a novel approach that provides true database isolation at the infrastructure level. Each component has its own isolated database:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Parent App Runtime                           │
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────┐ │
│  │ App Tables        │  │ Projections       │  │ Sagas           │ │
│  │ (CAN clear)       │  │ (CAN clear)       │  │ (CAN clear)     │ │
│  └───────────────────┘  └───────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              ▲ Can access
                              │
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                              │
                              ✗ CANNOT access
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                    Mounted Components (Isolated DBs)                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Workpool    │ │ Workflow    │ │ Orders CMS  │ │ Event Store │   │
│  │ (NO clear)  │ │ (NO clear)  │ │ (NO clear*) │ │ (can clear) │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                     * Would require exposing cleanup API (anti-pattern)
```

**Key implication:** The parent app CANNOT clear Workpool job queues, Workflow journals, or bounded context internal state. These are physically isolated databases.

### Why Traditional Cleanup Doesn't Work

| Approach            | Problem                                      |
| ------------------- | -------------------------------------------- |
| `DELETE FROM table` | Tables in components are invisible to parent |
| Expose cleanup API  | Anti-pattern (testing code in production)    |
| Mock the database   | Workpool/Workflow don't execute in mocks     |
| Truncate tables     | No access to component tables                |

### The Solution: Namespace-Based Isolation

Instead of cleaning up data between tests, we ensure tests never conflict:

```typescript
// Each test run gets a unique ID
export const testRunId = `r${Date.now().toString(36).slice(-4)}`; // e.g., "r1a2b"

// All entities are prefixed with this ID
prefixName("Widget Pro"); // → "r1a2b Widget Pro"
prefixSku("WIDGET-001"); // → "R1A2B-WIDGET-001"
```

Tests search for their own prefixed entities, ignoring data from other runs.

**See also:**

- [Component Isolation Architecture](../../../../docs/architecture/COMPONENT_ISOLATION.md)
- [ADR-031: Namespace-Based E2E Test Isolation](../../../../docs/architecture/decisions/ADR-031-namespace-based-e2e-test-isolation.md)

---

## Understanding Eventual Consistency

### Why Projections Are Async

This architecture uses **DDD/ES/CQRS** with the dual-write pattern:

```
Command → CMS Update + Event Append → Trigger Workpool → Projection Updates
              (sync)                       (async)            (async)
```

When a command executes:

1. **CMS (Command Model State)** updates immediately (same transaction)
2. **Event** is appended to Event Store (same transaction)
3. **Workpool** is triggered to process projections (returns immediately)
4. **Projections** update asynchronously (may take 1-5 seconds)

### Why Sagas Take Time

Sagas (cross-context workflows) use **Convex Workflow** for durability:

```
Order Created → Reserve Inventory Saga
                    │
                    ├── Step 1: Reserve stock (Inventory context)
                    ├── Step 2: Wait for confirmation
                    └── Step 3: Update order status (Orders context)

                    Each step: ~1-3 seconds
                    Total: ~5-15 seconds
```

### How to Handle This in Tests

```typescript
import { waitUntilProjection } from "../support/wait-helpers";

// DON'T: Assert immediately after action
await page.click('[data-testid="submit-order"]');
await expect(page.getByTestId("order-status")).toHaveText("Confirmed"); // FAILS!

// DO: Wait for eventual consistency
await page.click('[data-testid="submit-order"]');
await waitUntilProjection(
  async () => {
    const status = await page.getByTestId("order-status").textContent();
    return status === "Confirmed";
  },
  { timeout: 30000 }
);
```

### Debugging Timing Issues

1. **Check E2E backend health:**

   ```bash
   just e2e-health-check
   ```

2. **Watch Workpool processing:**

   ```bash
   just e2e-logs | grep -i workpool
   ```

3. **Open E2E dashboard for state inspection:**

   ```bash
   just e2e-dashboard  # Opens http://localhost:6792
   ```

4. **Increase timeout for investigation:**

   ```typescript
   await waitUntilProjection(async () => { ... }, { timeout: 60000 });
   ```

5. **Add debug logging:**
   ```typescript
   await waitUntilProjection(async () => {
     const status = await page.getByTestId("order-status").textContent();
     console.log(`Current status: ${status}`); // Visible in test output
     return status === "Confirmed";
   });
   ```

---

## Test Isolation Strategy

### How It Works

```typescript
// support/testRunId.ts
export const testRunId = `r${Date.now().toString(36).slice(-4)}`;

export function prefixName(name: string): string {
  return `${testRunId} ${name}`;
}

export function prefixSku(sku: string): string {
  return `${testRunId.toUpperCase()}-${sku}`;
}
```

When tests create entities:

```typescript
Given("a product {string} exists", async (name) => {
  const prefixedName = prefixName(name); // "r1a2b Test Widget"
  // Create product with prefixedName
});
```

When tests verify entities:

```typescript
Then("I should see product {string}", async (name) => {
  const prefixedName = prefixName(name);
  await expect(page.getByText(prefixedName)).toBeVisible();
});
```

---

## Test Ordering

Empty-state tests **MUST** run first before any data is created. The `_0-empty-states/` folder prefix ensures alphabetical ordering:

```
features/
├── _0-empty-states/        # Runs FIRST (alphabetically)
│   └── empty-catalog.feature
├── admin/                  # Runs after empty states
├── orders/
└── products/
```

This is configured in `playwright.config.ts`:

```typescript
const testDir = defineBddConfig({
  features: [
    "./features/**/*.feature", // _0 prefix sorts first
  ],
  steps: "./steps/**/*.ts",
});
```

---

## Running Tests

| Command                | Purpose                       | When to Use                           |
| ---------------------- | ----------------------------- | ------------------------------------- |
| `pnpm test:e2e`        | Standard run (excludes @skip) | Dev iteration, uses existing backend  |
| `pnpm test:e2e:all`    | All tests (includes @skip)    | After fresh Docker reset              |
| `pnpm test:e2e:clean`  | Reset Docker + all tests      | Full validation, CI simulation        |
| `pnpm test:e2e:ci`     | CI mode (excludes @skip)      | Automated CI (unless fresh container) |
| `pnpm test:e2e:headed` | Headed mode                   | Visual debugging                      |
| `pnpm test:e2e:debug`  | Debug mode                    | Step-by-step debugging                |

### Using justfile Commands

From the repository root:

```bash
# Full E2E cycle with auto-restart for fresh state
just test-e2e           # restart → deploy → test → stop

# Interactive modes (don't auto-stop, dashboard available at 6792)
just test-e2e-headed    # Headed mode for visual debugging
just test-e2e-debug     # Debug mode for step-by-step

# Run tests only (assumes E2E backend already running on port 3230)
just test-e2e-only

# Run ALL tests including @skip (for empty state tests)
just test-e2e-clean

# E2E environment management
just e2e-start          # Start E2E backend + dashboard
just e2e-stop           # Stop E2E environment
just e2e-restart        # Restart with fresh state
just e2e-dashboard      # Open dashboard at http://localhost:6792
just e2e-logs           # View E2E container logs
just e2e-health-check   # Check E2E backend health
```

---

## Writing New Tests

### 1. Always Use Prefixed Names

```typescript
import { prefixName, prefixSku } from "../support/testRunId";

// Creating entities
const productName = prefixName("My Product");
const productSku = prefixSku("SKU-001");

// Finding entities
const productCard = page.locator('[data-testid^="product-card"]').filter({ hasText: prefixedName });
```

### 2. Never Assert on Exact Counts

Data accumulates across test runs. Instead of:

```typescript
// BAD: Will fail when previous test data exists
await expect(products).toHaveCount(0);
```

Do this:

```typescript
// GOOD: Check for specific prefixed product
await expect(page.getByText(prefixName("Widget"))).toBeVisible();
```

Or check for absence of specific test's data:

```typescript
// GOOD: Check empty state message or specific condition
await expect(page.getByTestId("empty-catalog-message")).toBeVisible();
```

### 3. Search by Specific Prefixed Names

```typescript
// BAD: Matches any product
const product = page.locator('[data-testid^="product-card"]').first();

// GOOD: Matches only our test's product
const product = page
  .locator('[data-testid^="product-card"]')
  .filter({ hasText: prefixName("My Test Product") });
```

### 4. Wait for Specific Products, Not Counts

```typescript
// BAD: May match products from previous test runs
await waitUntilProjection(async () => {
  const count = await productCards.count();
  return count >= 2;
});

// GOOD: Wait for our specific prefixed products
await waitUntilProjection(async () => {
  const product1 = page
    .locator('[data-testid^="product-card"]')
    .filter({ hasText: prefixName("Widget Pro") });
  const product2 = page
    .locator('[data-testid^="product-card"]')
    .filter({ hasText: prefixName("Gadget Plus") });
  return (await product1.count()) > 0 && (await product2.count()) > 0;
});
```

### 5. Use `waitUntilProjection` for Eventual Consistency

```typescript
import { waitUntilProjection } from "../support/wait-helpers";

// Wait for projection to update (30s timeout)
await waitUntilProjection(
  async () => {
    const statusBadge = page.getByTestId("order-status-badge");
    const text = await statusBadge.textContent();
    return text?.toLowerCase() === "confirmed";
  },
  { timeout: 30000 }
);
```

---

## Timeouts

| Setting                 | Value      | Reason                        |
| ----------------------- | ---------- | ----------------------------- |
| Default projection wait | 30 seconds | Saga workflow processing time |
| Test timeout            | 60 seconds | Full test including setup     |
| Expect timeout          | 30 seconds | Individual assertions         |

These are configured in:

- `playwright.config.ts` - `timeout` and `expect.timeout`
- `support/wait-helpers.ts` - `DEFAULT_TIMEOUT`

---

## Project Structure

```
tests/e2e/
├── features/                  # Gherkin feature files
│   ├── _0-empty-states/       # Empty state tests (run first)
│   ├── admin/                 # Admin panel features
│   ├── dashboard/             # Dashboard features
│   ├── e2e-journeys/          # Full user journeys
│   ├── orders/                # Order management features
│   └── products/              # Product catalog features
├── steps/                     # Step definitions
│   ├── admin.steps.ts         # Admin form interactions
│   ├── common.steps.ts        # Shared navigation/waiting
│   ├── dashboard.steps.ts     # Dashboard steps
│   ├── index.ts               # Step exports
│   ├── order.steps.ts         # Order workflow steps
│   └── product.steps.ts       # Product catalog steps
├── support/                   # Test utilities
│   ├── testRunId.ts           # Namespace generation
│   ├── test-data.ts           # Test data generators
│   └── wait-helpers.ts        # Eventual consistency helpers
├── playwright.config.ts       # Playwright + BDD configuration
└── README.md                  # This file
```

---

## Troubleshooting

### Quick Diagnostic Reference

| Symptom                      | Likely Cause                | Solution                                     |
| ---------------------------- | --------------------------- | -------------------------------------------- |
| "Element not found"          | Missing prefix              | Use `prefixName()` in both create and verify |
| "Timeout waiting for status" | Saga still processing       | Increase timeout or check backend health     |
| Empty state test fails       | Data from previous run      | Run with `pnpm test:e2e:clean`               |
| Wrong product selected       | `.first()` matched old data | Filter by specific prefixed name             |
| Count assertion fails        | Data accumulates            | Search for specific entities, not counts     |

### Tests fail with "element not found"

1. Check if you're using prefixed names correctly
2. Verify the testRunId matches between create and verify steps
3. Check timeout - projections may need more time

**Debug approach:**

```typescript
// Log what we're looking for
console.log(`Looking for: ${prefixName("Widget")}`);

// Check what's on the page
const allProducts = await page.locator('[data-testid^="product-card"]').allTextContents();
console.log(`Products on page: ${allProducts}`);
```

### Empty state tests fail

1. Ensure they're in the `_0-empty-states/` folder (alphabetically first)
2. Run with `pnpm test:e2e:clean` to reset Docker volumes

**Why this happens:** Empty state tests verify UI when no products exist. Once ANY test creates products, empty state is no longer testable without Docker reset.

### Timeout errors on projections

1. Increase timeout in `waitUntilProjection` call
2. Check if backend is healthy: `just dev-health-check`
3. Check logs: `just dev-logs`
4. Verify saga is executing: look for Workflow logs

**Common causes:**

- Backend not deployed after code changes
- Workpool not processing (check for errors)
- Saga step failed (check Workflow logs)

### Tests pass locally but fail in CI

1. CI uses fresh Docker container (no prior state)
2. Check if test depends on data from other tests
3. Ensure proper test isolation with prefixing

**Key difference:** Local dev may have accumulated data. CI always starts fresh.

### Wrong product gets selected

This happens when using `.first()` which matches products from previous runs:

```typescript
// WRONG: Selects first matching product (could be old data)
await page.locator('[data-testid^="product-card"]').first().click();

// RIGHT: Select by specific prefixed name
await page
  .locator('[data-testid^="product-card"]')
  .filter({ hasText: prefixName("Widget Pro") })
  .click();
```

---

## Known Limitations

### Empty State Tests Are Skipped by Default

Tests tagged with `@skip` (like the empty catalog test) are excluded from normal runs because they require a fresh Docker environment with no data.

**To run ALL tests including empty state tests:**

```bash
pnpm test:e2e:clean    # Resets Docker and runs all tests including @skip
pnpm test:e2e:all      # Runs all tests without Docker reset (for fresh CI containers)
```

**Why?** The namespace-based isolation strategy means old test data persists. Empty state tests verify UI when no products exist, which is only possible with a fresh database.

### Duplicate Data from Previous Runs

If you see "strict mode violation" errors (multiple elements found), this usually means:

- A previous test run created data with the same testRunId timing
- Solution: Run with `pnpm test:e2e:clean` to reset, or the tests use `.first()` to handle gracefully

---

## CI/CD Integration

The CI workflow:

1. Starts fresh Docker containers (guaranteed clean state)
2. Deploys the app
3. Runs `pnpm test:e2e:ci`
4. Stops containers after tests

Because CI starts with clean state, the first test run succeeds. Entity namespacing ensures subsequent CI runs (if containers are reused) don't conflict.

---

## The "Inverted Test Pyramid"

This project has more integration tests than typical applications. This is intentional:

| Test Type            | Traditional | This Project | Reason                            |
| -------------------- | ----------- | ------------ | --------------------------------- |
| Unit (convex-test)   | 70%         | 40%          | Mocked DB, no Workpool/Workflow   |
| Integration (Docker) | 20%         | 50%          | Real backend, full infrastructure |
| E2E (Playwright)     | 10%         | 10%          | User journey validation           |

**Why?** Convex-test provides a mocked database where Workpool and Workflow don't execute. Since ~50% of meaningful behavior depends on these (projections, sagas), integration tests are required.

---

## Future Improvements

Documented in `docs/project-management/ideation/integration-test-isolation/`:

- Parallel Docker containers for CI speedup
- Full `@convex-es/testing` package with TestIdGenerator
- testRunId field on entities for filtered queries
- Namespace-based cleanup of app-level tables
