# CMSRepository

**Purpose:** Detailed patterns for CMSRepository

---

## Summary

**Progress:** [████████████████████] 3/3 (100%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 3     |
| 🚧 Active    | 0     |
| 📋 Planned   | 0     |
| **Total**    | 3     |

---

## ✅ Completed Patterns

### ✅ Bounded Context Foundation

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 4w        |

**Problem:** DDD Bounded Contexts need clear boundaries with physical enforcement,
type-safe contracts, and domain purity (no infrastructure coupling in domain logic).
Without physical isolation, accidental coupling between contexts undermines the
benefits of domain-driven design.

**Solution:** Convex Components provide physical database isolation for bounded
contexts. The platform-bc package defines:

- BoundedContextIdentity for context identification
- DualWriteContextContract for type-safe BC public APIs
- CMSTypeDefinition and other type definitions

**Note:** This pattern was implemented before the delivery process existed
and is documented retroactively to provide context for IntegrationPatterns
and AgentAsBoundedContext phases.

#### Dependencies

- Depends on: EventStoreFoundation
- Depends on: CommandBusFoundation

#### Acceptance Criteria

**Direct table query fails across component boundary**

- Given a bounded context "orders" with table "orderCMS"
- When the parent app attempts to query "orderCMS" directly
- Then the query fails because the table doesn't exist in parent database

**Component API access succeeds**

- Given a bounded context "orders" with handler "createOrder"
- When the parent app calls ctx.runMutation(components.orders.handlers.createOrder)
- Then the handler executes successfully

**User ID passed explicitly to component**

- Given a command requiring user authorization
- When calling the bounded context handler
- Then userId is passed as an explicit argument
- And the component does not access ctx.auth

**ID conversion at boundary**

- Given an order with internal ID of type Id<"orderCMS">
- When returning the order through the component API
- Then the ID is converted to string format
- And external callers receive a string identifier

**Contract provides type safety for commands**

- Given a DualWriteContextContract with commandTypes ["CreateOrder", "SubmitOrder"]
- When using ExtractCommandTypes helper
- Then the result type is "CreateOrder" | "SubmitOrder"
- And invalid command types cause compile errors

#### Business Rules

**Components have isolated databases that parent cannot query directly**

Each Convex component (bounded context) has its own isolated database.
The parent application CANNOT directly query component tables:

    ```typescript
    // FAILS - table doesn't exist in parent database
    ctx.db.query("orderCMS");

    // WORKS - uses component API
    ctx.runMutation(components.orders.handlers.createOrder, args);
    ```

    This physical isolation prevents accidental coupling between contexts
    and enforces communication through well-defined APIs.

_Verified by: Direct table query fails across component boundary, Component API access succeeds_

**Sub-transactions are atomic within components**

When a component handler is called, all writes within that handler
commit atomically. If the handler throws and the caller catches: - Only the component's writes roll back - Parent writes (before the call) are preserved

    This enables partial failure handling while maintaining consistency
    within each bounded context.

**ctx.auth does not cross component boundaries**

Authentication context (ctx.auth) is NOT passed to component handlers.
If a component needs user identity: - Pass userId explicitly as a handler argument - Component validates/uses the explicit userId

    This explicit passing prevents implicit coupling to auth infrastructure
    and makes security requirements clear in the API.

_Verified by: User ID passed explicitly to component_

**Id<"table"> inside component becomes string at API boundary**

Convex typed IDs (Id<"table">) are scoped to their database. Since
components have isolated databases: - Inside component: Use Id<"orderCMS"> normally - At API boundary: Convert to/from string

    This ensures type safety within components while enabling inter-context
    communication.

_Verified by: ID conversion at boundary_

**DualWriteContextContract formalizes the bounded context API**

Each bounded context should define a contract that specifies: - **identity**: Name, description, version, streamTypePrefix - **executionMode**: "dual-write" for CMS + Event pattern - **commandTypes**: List of commands the context handles - **eventTypes**: List of events the context produces - **cmsTypes**: CMS tables with schema versions - **errorCodes**: Domain errors that can be returned

    This contract serves as documentation and enables type-safe integration.

_Verified by: Contract provides type safety for commands_

---

### ✅ CMS Repository

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## CMS Repository - Entity Access with Auto-Upcast

Factory for typed data access with automatic schema upcasting in dual-write handlers.
Eliminates 5-line boilerplate for loading, validating, and upcasting CMS entities.

### When to Use

- Loading CMS entities in command handlers (load, tryLoad, loadMany)
- Persisting CMS updates with version tracking
- Building typed repositories for specific aggregate types

### Problem Solved

Before:

```typescript
const rawCMS = await ctx.db
  .query("orderCMS")
  .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
  .first();
assertOrderExists(rawCMS);
const cms = upcastOrderCMS(rawCMS);
```

After:

```typescript
const { cms, _id } = await orderRepo.load(ctx, orderId);
```

---

### ✅ Invariant Framework

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## Invariant Framework - Declarative Business Rules

Factory for declarative business rule validation with typed error codes.
Creates invariants with check(), assert(), and validate() methods from
a single configuration object for consistent, type-safe validation.

### When to Use

- Defining domain business rules that must hold true for valid state
- Both throwing (assert) and non-throwing (check, validate) validation
- Typed error codes and context for debugging invariant failures

---

[← Back to Roadmap](../ROADMAP.md)
