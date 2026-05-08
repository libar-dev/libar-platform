@architect
@architect-pattern:BoundedContextFoundationExecutableTests
@architect-implements:BoundedContextFoundation
@architect-status:completed
@architect-unlock-reason:refactoring-carve-out-executable-tests-for-shipped-pattern-predates-implements-convention
@architect-product-area:PlatformBC
Feature: BoundedContextFoundation Executable Tests

  **Provenance:** This file was authored under the refactoring carve-out
  to expose BoundedContextFoundation in the PatternGraph. The pattern was
  originally implemented before the `@architect-implements:` convention.
  Rule invariants and rationales below are transferred verbatim from
  `libar-platform/architect/specs/platform/bounded-context-foundation.feature`.
  A sibling file `bc-contracts.feature` covers helper-function unit
  contracts; this file covers the foundational physical-isolation
  invariants that span Convex components. Many scenarios require Convex
  integration runtime to fully verify and are shape-only stubs at
  file-creation time.

  **Transitional status:** This carrier is graph-continuity scaffolding,
  not runnable coverage yet. Every scenario below is intentionally tagged
  `@stub` until backlog item `T5-009` wires the harness and step
  definitions. Backlog item `T5-010` expands the current transfer set with
  concurrency and edge-case coverage once wiring is real.

  Background:
    Given the platform-bc contracts and definitions are available

  # =============================================================================
  # RULE 1: Component Database Isolation
  # =============================================================================

  Rule: Components have isolated databases that parent cannot query directly

    **Invariant:** A parent app cannot directly query a Convex component's tables — communication must go through the component API.

    **Rationale:** Each Convex component (bounded context) has its own
    isolated database. Physical isolation prevents accidental coupling
    between contexts and enforces communication through well-defined
    APIs.

    **Verified by:** Direct table query fails across component boundary, Component API access succeeds

    @happy-path @stub
    Scenario: Direct table query fails across component boundary
      Given a bounded context "orders" with table "orderCMS"
      When the parent app attempts to query "orderCMS" directly
      Then the query fails because the table doesn't exist in parent database

    @happy-path @stub
    Scenario: Component API access succeeds
      Given a bounded context "orders" with handler "createOrder"
      When the parent app calls ctx.runMutation(components.orders.handlers.createOrder)
      Then the handler executes successfully

  # =============================================================================
  # RULE 2: Sub-Transaction Atomicity
  # =============================================================================

  Rule: Sub-transactions are atomic within components

    **Invariant:** All writes within a component handler commit atomically; if the handler throws and the caller catches, only the component's writes roll back.

    **Rationale:** Sub-transaction atomicity enables partial failure
    handling while maintaining consistency within each bounded context.
    Parent writes performed before the call are preserved even when the
    component sub-transaction fails.

    **Verified by:** Component handler writes commit atomically on success, Caught component failure rolls back only the component writes

    @happy-path @stub
    Scenario: Component handler writes commit atomically on success
      Given a component handler that performs two writes
      When the handler completes successfully
      Then both writes are visible after commit

    @validation @stub
    Scenario: Caught component failure rolls back only the component writes
      Given a parent mutation that writes row X then calls a component handler that throws
      When the parent catches the exception
      Then row X is preserved
      And the component handler's writes are rolled back

  # =============================================================================
  # RULE 3: No Auth Passthrough
  # =============================================================================

  Rule: ctx.auth does not cross component boundaries

    **Invariant:** Component handlers do not receive ctx.auth — user identity must be passed explicitly as an argument.

    **Rationale:** Explicit passing prevents implicit coupling to auth
    infrastructure and makes security requirements clear in the API.

    **Verified by:** User ID passed explicitly to component

    @happy-path @stub
    Scenario: User ID passed explicitly to component
      Given a command requiring user authorization
      When calling the bounded context handler
      Then userId is passed as an explicit argument
      And the component does not access ctx.auth

  # =============================================================================
  # RULE 4: IDs Become Strings at Boundary
  # =============================================================================

  Rule: Id<"table"> inside component becomes string at API boundary

    **Invariant:** Convex typed IDs are scoped to the component database; at the component API boundary they are converted to/from string.

    **Rationale:** Typed IDs cannot meaningfully cross between isolated
    databases. String conversion at the boundary preserves type safety
    inside the component while enabling inter-context communication.

    **Verified by:** ID conversion at boundary

    @happy-path @stub
    Scenario: ID conversion at boundary
      Given an order with internal ID of type Id<"orderCMS">
      When returning the order through the component API
      Then the ID is converted to string format
      And external callers receive a string identifier

  # =============================================================================
  # RULE 5: Contracts Define the Public API
  # =============================================================================

  Rule: DualWriteContextContract formalizes the bounded context API

    **Invariant:** Each bounded context exposes a typed contract describing identity, executionMode, commandTypes, eventTypes, cmsTypes, and errorCodes.

    **Rationale:** The contract serves as documentation and enables
    type-safe integration. Type helpers like ExtractCommandTypes derive
    union types directly from the contract, making invalid command
    types compile errors.

    **Verified by:** Contract provides type safety for commands

    @happy-path @stub
    Scenario: Contract provides type safety for commands
      Given a DualWriteContextContract with commandTypes ["CreateOrder", "SubmitOrder"]
      When using ExtractCommandTypes helper
      Then the result type is "CreateOrder" | "SubmitOrder"
      And invalid command types cause compile errors
