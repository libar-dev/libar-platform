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
| Usage Example | THIS DECISION | Fenced code block |

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

  Rule: Consequences - When to Use DCB vs Alternatives

| Criterion | DCB | Saga | Regular Decider |
| --- | --- | --- | --- |
| Scope | Single BC | Cross-BC | Single entity |
| Consistency | Atomic | Eventual | Atomic |
| Use Case | Multi-product reservation | Order fulfillment | Simple updates |
