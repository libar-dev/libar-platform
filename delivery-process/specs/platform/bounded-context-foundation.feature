@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:BoundedContextFoundation
@libar-docs-status:completed
@libar-docs-phase:11
@libar-docs-effort:4w
@libar-docs-product-area:Platform
@libar-docs-depends-on:EventStoreFoundation,CommandBusFoundation
@libar-docs-completed:2026-01-18
@libar-docs-completed-before-delivery-process
@libar-docs-unlock-reason:initial-completion
Feature: Bounded Context Foundation - Physical Isolation and Contracts

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

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | BoundedContextIdentity interface | complete | @libar-dev/platform-bc/src/contracts/identity.ts |
      | DualWriteContextContract interface | complete | @libar-dev/platform-bc/src/contracts/dual-write-contract.ts |
      | Type helpers (ExtractCommandTypes, ExtractEventTypes, ExtractCMSTableNames) | complete | @libar-dev/platform-bc/src/contracts/dual-write-contract.ts |
      | CMSTypeDefinition interface | complete | @libar-dev/platform-bc/src/definitions/cms-definition.ts |
      | CommandTypeDefinition interface | complete | @libar-dev/platform-bc/src/definitions/command-definition.ts |
      | EventTypeDefinition interface | complete | @libar-dev/platform-bc/src/definitions/event-definition.ts |
      | ProcessManagerDefinition interface | complete | @libar-dev/platform-bc/src/definitions/process-manager-definition.ts |
      | Result helpers (success, rejected) | complete | @libar-dev/platform-decider/src/types.ts |
      | Component isolation documentation | complete | docs/architecture/COMPONENT_ISOLATION.md |

  # =============================================================================
  # RULE 1: Component Database Isolation
  # =============================================================================

  Rule: Components have isolated databases that parent cannot query directly

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

    @acceptance-criteria
    Scenario: Direct table query fails across component boundary
      Given a bounded context "orders" with table "orderCMS"
      When the parent app attempts to query "orderCMS" directly
      Then the query fails because the table doesn't exist in parent database

    @acceptance-criteria
    Scenario: Component API access succeeds
      Given a bounded context "orders" with handler "createOrder"
      When the parent app calls ctx.runMutation(components.orders.handlers.createOrder)
      Then the handler executes successfully

  # =============================================================================
  # RULE 2: Sub-Transaction Atomicity
  # =============================================================================

  Rule: Sub-transactions are atomic within components

    When a component handler is called, all writes within that handler
    commit atomically. If the handler throws and the caller catches:
    - Only the component's writes roll back
    - Parent writes (before the call) are preserved

    This enables partial failure handling while maintaining consistency
    within each bounded context.

  # =============================================================================
  # RULE 3: No Auth Passthrough
  # =============================================================================

  Rule: ctx.auth does not cross component boundaries

    Authentication context (ctx.auth) is NOT passed to component handlers.
    If a component needs user identity:
    - Pass userId explicitly as a handler argument
    - Component validates/uses the explicit userId

    This explicit passing prevents implicit coupling to auth infrastructure
    and makes security requirements clear in the API.

    @acceptance-criteria
    Scenario: User ID passed explicitly to component
      Given a command requiring user authorization
      When calling the bounded context handler
      Then userId is passed as an explicit argument
      And the component does not access ctx.auth

  # =============================================================================
  # RULE 4: IDs Become Strings at Boundary
  # =============================================================================

  Rule: Id<"table"> inside component becomes string at API boundary

    Convex typed IDs (Id<"table">) are scoped to their database. Since
    components have isolated databases:
    - Inside component: Use Id<"orderCMS"> normally
    - At API boundary: Convert to/from string

    This ensures type safety within components while enabling inter-context
    communication.

    @acceptance-criteria
    Scenario: ID conversion at boundary
      Given an order with internal ID of type Id<"orderCMS">
      When returning the order through the component API
      Then the ID is converted to string format
      And external callers receive a string identifier

  # =============================================================================
  # RULE 5: Contracts Define the Public API
  # =============================================================================

  Rule: DualWriteContextContract formalizes the bounded context API

    Each bounded context should define a contract that specifies:
    - **identity**: Name, description, version, streamTypePrefix
    - **executionMode**: "dual-write" for CMS + Event pattern
    - **commandTypes**: List of commands the context handles
    - **eventTypes**: List of events the context produces
    - **cmsTypes**: CMS tables with schema versions
    - **errorCodes**: Domain errors that can be returned

    This contract serves as documentation and enables type-safe integration.

    @acceptance-criteria
    Scenario: Contract provides type safety for commands
      Given a DualWriteContextContract with commandTypes ["CreateOrder", "SubmitOrder"]
      When using ExtractCommandTypes helper
      Then the result type is "CreateOrder" | "SubmitOrder"
      And invalid command types cause compile errors
