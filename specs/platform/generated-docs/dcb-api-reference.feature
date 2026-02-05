@libar-docs
@libar-docs-pattern:DCBAPIReference
@libar-docs-status:active
@libar-docs-phase:99
@libar-docs-core
@libar-docs-ddd
@libar-docs-claude-md-section:platform
Feature: DCB API Reference - Auto-Generated Documentation

  This feature file demonstrates code-first documentation generation.
  The API reference is extracted directly from annotated TypeScript source files,
  proving that documentation can be a projection of code.

  **Key Insight:** DCB enables cross-entity invariant validation within a single
  bounded context with scope-based OCC.

  Rule: Source Mapping - Content Extraction Configuration

    The following table defines which content is extracted from which source files:

| Section | Source File | Extraction Method |
| --- | --- | --- |
| Core Types | packages/platform-core/src/dcb/types.ts | @extract-shapes tag |
| Scope Key Utilities | packages/platform-core/src/dcb/scopeKey.ts | @extract-shapes tag |
| executeWithDCB Flow | THIS DECISION | Fenced code block (Mermaid) |
| Usage Example | THIS DECISION | Fenced code block |
| Constraints | THIS DECISION | Rule block table |
| Guarantees | THIS DECISION | Rule block table |

    **Usage Example:**

    """typescript
    import { executeWithDCB, createScopeKey } from "@libar-dev/platform-core/dcb";

    const result = await executeWithDCB(ctx, {
      scopeKey: createScopeKey("tenant_1", "reservation", "res_123"),
      expectedVersion: 0,
      boundedContext: "inventory",
      streamType: "Reservation",
      schemaVersion: 1,
      entities: {
        streamIds: ["product-1", "product-2"],
        loadEntity: async (ctx, streamId) => {
          const product = await inventoryRepo.tryLoad(ctx, streamId);
          return product ? { cms: product, _id: product._id } : null;
        },
      },
      decider: reserveMultipleDecider,
      command: { orderId: "order_456", items },
      applyUpdate: async (ctx, _id, cms, update, version, timestamp) => {
        await ctx.db.patch(_id, { ...update, version, updatedAt: timestamp });
      },
      commandId: "cmd_789",
      correlationId: "corr_abc",
    });

    switch (result.status) {
      case "success":
        // Append result.events to Event Store
        break;
      case "rejected":
        // Business rule violation - result.code, result.reason
        break;
      case "conflict":
        // OCC conflict - retry with fresh state
        break;
    }
    """

  Rule: Context - Why DCB Exists

    **Problem:** Traditional approaches to multi-entity coordination have significant
    drawbacks:
    - **Saga coordination** provides only eventual consistency
    - **Sequential commands** create race condition windows
    - **Aggregate enlargement** violates single responsibility

    **Solution:** DCB provides atomic validation across multiple entities with
    scope-based optimistic concurrency control (OCC), all within a single
    bounded context.

  Rule: Decision - Scope-Based OCC

    DCB uses a scope key to coordinate multiple entities atomically.

    **Scope Key Format:** `tenant:${tenantId}:${scopeType}:${scopeId}`

    The tenant prefix is mandatory to ensure multi-tenant isolation at the scope level.

  Rule: Decision - executeWithDCB Flow

    The following diagram shows the step-by-step flow of the `executeWithDCB` function:

    """mermaid
    flowchart TD
        A[1. Validate Scope Key] --> B[2. Load All Entities]
        B --> C[3. Build Aggregated State]
        C --> D[4. Execute Pure Decider]
        D --> E{Result Status?}
        E -->|rejected| F[Return Rejection<br/>No events, no state changes]
        E -->|failed| G[Return Failure<br/>With failure event]
        E -->|success| H[5. Check Scope Version OCC]
        H --> I{Version Match?}
        I -->|no| J[Return Conflict<br/>currentVersion in result]
        I -->|yes| K[6. Apply State Updates]
        K --> L[7. Return Success<br/>data + scopeVersion + events]

        style A fill:#e1f5fe
        style D fill:#fff3e0
        style E fill:#fce4ec
        style I fill:#fce4ec
        style L fill:#e8f5e9
    """

    **Step Details:**

    1. **Validate Scope Key** - Ensures tenant prefix is present for isolation
    2. **Load All Entities** - Calls `loadEntity()` for each streamId in config
    3. **Build Aggregated State** - Creates `DCBAggregatedState` with all entities
    4. **Execute Pure Decider** - Calls decider function with aggregated state
    5. **Check Scope Version** - OCC validation via `scopeOperations.commitScope()`
    6. **Apply State Updates** - Calls `applyUpdate()` for each entity with changes
    7. **Return Success** - Returns data, new scopeVersion, and events to append

  Rule: Consequences - When to Use DCB vs Alternatives

| Criterion | DCB | Saga | Regular Decider |
| --- | --- | --- | --- |
| Scope | Single BC | Cross-BC | Single entity |
| Consistency | Atomic | Eventual | Atomic |
| Use Case | Multi-product reservation | Order fulfillment | Simple updates |

  Rule: Consequences - Constraints and Error Codes

    **Mandatory Constraints:**

| Constraint | Enforcement | Error Code |
| --- | --- | --- |
| Single bounded context only | Runtime validation | CROSS_BC_NOT_ALLOWED |
| Tenant-aware scope key | Scope key format | TENANT_ID_REQUIRED |
| Non-empty scope components | Scope key validation | SCOPE_KEY_EMPTY |
| Valid scope key format | Regex validation | INVALID_SCOPE_KEY_FORMAT |
| Decider must be pure | Design pattern | N/A (enforced by types) |

    **Scope Key Validation:**
    - The `tenant:` prefix is mandatory in all scope keys
    - Empty `tenantId`, `scopeType`, or `scopeId` are rejected
    - Colons are not allowed in `tenantId` or `scopeType` (but allowed in `scopeId`)

  Rule: Consequences - Guarantees

    **System Guarantees:**

| Guarantee | How Enforced |
| --- | --- |
| Tenant isolation | Scope key must include tenant prefix; validated at creation |
| Atomicity | All state updates + scope commit in same Convex mutation |
| OCC protection | Scope version checked before commit; conflict returns currentVersion |
| No partial updates | Rejected/failed status means no CMS changes persisted |
| Decider purity | Type system enforces no ctx/I/O in decider function signature |
| Event immutability | Events returned for caller to append; not modified by DCB |

    **Conflict Resolution:**
    When an OCC conflict occurs (`status: "conflict"`), the caller should:
    1. Reload the current scope version from the result
    2. Re-fetch entity state
    3. Retry the operation with updated `expectedVersion`

    The `withDCBRetry` helper automates this pattern via Workpool scheduling.
