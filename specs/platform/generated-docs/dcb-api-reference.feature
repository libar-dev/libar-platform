@libar-docs
@libar-docs-pattern:DCBAPIReference
@libar-docs-status:roadmap
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
