@architect
@architect-pattern:CommandBusFoundationExecutableTests
@architect-implements:CommandBusFoundation
@architect-status:completed
@architect-product-area:PlatformBus
Feature: CommandBusFoundation Executable Tests

  **Provenance:** This file was authored under the refactoring carve-out
  (per `_shared/spec-pattern-relationships.md`) to expose
  CommandBusFoundation in the PatternGraph. The pattern was originally
  implemented before the `@architect-implements:` convention. Rule
  invariants and rationales below are transferred verbatim from
  `libar-platform/architect/specs/platform/command-bus-foundation.feature`.
  A sibling file `idempotency.feature` carries the in-package pattern
  `CommandBusIdempotency`; this file covers the broader foundation.
  Scenario bodies are shape-only stubs at file-creation time and will be
  wired up to step definitions in a follow-up `architect-refactor-session`.

  Background:
    Given the platform-bus CommandBus client is available
    And the platform-core CommandOrchestrator is available

  # =============================================================================
  # RULE 1: Command Idempotency
  # =============================================================================

  Rule: Commands are idempotent via commandId deduplication

    **Invariant:** Same commandId always returns same result without re-execution.

    **Rationale:** Every command has a unique commandId. Recording checks
    for existence: new commands proceed to execution; duplicates return
    the cached result. This makes retries safe — network failures don't
    cause duplicate domain state changes.

    **Verified by:** First command execution is recorded, Duplicate command returns cached result

    @happy-path
    Scenario: First command execution is recorded
      Given no command exists with id "cmd-123"
      When recording command "cmd-123" of type "CreateOrder"
      Then the command is recorded with status "pending"
      And the response indicates isNew = true

    @happy-path
    Scenario: Duplicate command returns cached result
      Given command "cmd-123" exists with status "executed" and result "success"
      When recording command "cmd-123" again
      Then the response indicates isNew = false
      And the cached result is returned

  # =============================================================================
  # RULE 2: Command Status Lifecycle
  # =============================================================================

  Rule: Status tracks the complete command lifecycle

    **Invariant:** Status transitions are atomic with result — pending to executed, rejected, or failed.

    **Rationale:** Commands progress through well-defined states
    (pending, executed, rejected, failed). The status is updated
    atomically with the command result, ensuring consistent state under
    concurrent access.

    **Verified by:** Successful command transitions to executed, Business rejection transitions to rejected, Unexpected error transitions to failed

    @happy-path
    Scenario: Successful command transitions to executed
      Given a command in "pending" status
      When the command handler returns success
      Then the status becomes "executed"
      And the result contains success data

    @validation
    Scenario: Business rejection transitions to rejected
      Given a command in "pending" status
      When the command handler returns rejected with code "INVALID_STATUS"
      Then the status becomes "rejected"
      And the result contains the rejection code

    @validation
    Scenario: Unexpected error transitions to failed
      Given a command in "pending" status
      When the command handler throws an unexpected error
      Then the status becomes "failed"
      And the result contains error details

  # =============================================================================
  # RULE 3: The 7-Step CommandOrchestrator
  # =============================================================================

  Rule: The CommandOrchestrator is the only command execution path

    **Invariant:** Every command flows through the same 7-step orchestration — no bypass allowed.

    **Rationale:** The 7 steps (record, middleware, handler, rejection
    check, append event, trigger projection, update status) ensure
    consistent dual-write semantics, automatic projection triggering,
    and consistent error handling.

    **Verified by:** Successful command runs all 7 orchestrator steps, Rejected command short-circuits before event append

    @happy-path @stub
    Scenario: Successful command runs all 7 orchestrator steps
      Given a CommandOrchestrator wired with a successful handler
      When dispatching a command
      Then the command is recorded
      And middleware executes
      And the handler is called
      And an event is appended
      And the projection workpool is enqueued
      And the command status is finalized

    @validation @stub
    Scenario: Rejected command short-circuits before event append
      Given a CommandOrchestrator wired with a handler returning rejected
      When dispatching a command
      Then no event is appended
      And the command status is finalized as "rejected"

  # =============================================================================
  # RULE 4: Correlation Enables Distributed Tracing
  # =============================================================================

  Rule: correlationId links commands, events, and projections

    **Invariant:** correlationId flows from command through handler to event metadata to projection.

    **Rationale:** A single correlationId carried end-to-end enables
    tracing a user action through all system components and supports
    debugging and audit trail reconstruction. The
    commandEventCorrelations table tracks which events were produced by
    each command for forward lookups.

    **Verified by:** Correlation id is propagated to emitted event metadata, getByCorrelation returns the events for a command

    @happy-path @stub
    Scenario: Correlation id is propagated to emitted event metadata
      Given a command dispatched with correlationId "corr-1"
      When the orchestrator appends an event
      Then the event metadata carries correlationId "corr-1"

    @happy-path @stub
    Scenario: getByCorrelation returns the events for a command
      Given a command dispatched with correlationId "corr-2" that produced one event
      When calling getByCorrelation with "corr-2"
      Then the resulting entry lists the produced eventId

  # =============================================================================
  # RULE 5: Middleware Pipeline
  # =============================================================================

  Rule: Middleware provides composable cross-cutting concerns

    **Invariant:** Middleware executes in registration order with early exit on failure.

    **Rationale:** A composable pipeline separates infrastructure
    concerns (validation, authorization, logging, rate limiting) from
    domain logic. Early exit on failure prevents downstream side effects.

    **Verified by:** Registered middleware run in order, Middleware failure halts the pipeline

    @happy-path @stub
    Scenario: Registered middleware run in order
      Given two middlewares registered in order A then B
      When a command is dispatched
      Then middleware A executes before middleware B

    @validation @stub
    Scenario: Middleware failure halts the pipeline
      Given a middleware that fails
      When a command is dispatched
      Then no subsequent middleware runs
      And the handler is not invoked
