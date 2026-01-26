@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:CommandBusFoundation
@libar-docs-status:completed
@libar-docs-phase:03
@libar-docs-effort:3w
@libar-docs-product-area:Platform
@libar-docs-depends-on:EventStoreFoundation
@libar-docs-completed:2026-01-18
@libar-docs-completed-before-delivery-process
@libar-docs-unlock-reason:initial-completion
Feature: Command Bus Foundation - Command Idempotency and Orchestration

  **Problem:** Command execution requires idempotency (same command = same result),
  status tracking, and a standardized flow from receipt through execution. Without
  infrastructure-level idempotency, duplicate requests could corrupt domain state.

  **Solution:** The Command Bus component provides:
  - Infrastructure-level idempotency via commandId deduplication
  - Status lifecycle tracking (pending -> executed | rejected | failed)
  - The 7-step CommandOrchestrator pattern for dual-write execution
  - Correlation tracking via correlationId for distributed tracing
  - TTL-based cleanup of expired command records

  **Note:** This pattern was implemented before the delivery process existed
  and is documented retroactively to provide context for IntegrationPatterns
  and AgentAsBoundedContext phases.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Command table schema (commandId, status, result, TTL) | complete | @libar-dev/platform-bus/src/component/schema.ts |
      | Command-Event correlations table | complete | @libar-dev/platform-bus/src/component/schema.ts |
      | recordCommand API | complete | @libar-dev/platform-bus/src/component/lib.ts |
      | updateCommandResult API | complete | @libar-dev/platform-bus/src/component/lib.ts |
      | getCommandStatus API | complete | @libar-dev/platform-bus/src/component/lib.ts |
      | getByCorrelation API | complete | @libar-dev/platform-bus/src/component/lib.ts |
      | cleanupExpired API | complete | @libar-dev/platform-bus/src/component/lib.ts |
      | CommandBus client wrapper | complete | @libar-dev/platform-bus/src/client/index.ts |
      | CommandOrchestrator (7-step pattern) | complete | @libar-dev/platform-core/src/orchestration/CommandOrchestrator.ts |
      | Middleware pipeline infrastructure | complete | @libar-dev/platform-core/src/middleware/ |
      | Correlation chain utilities | complete | @libar-dev/platform-core/src/correlation/ |

  # =============================================================================
  # RULE 1: Command Idempotency
  # =============================================================================

  Rule: Commands are idempotent via commandId deduplication

    Every command has a unique commandId. When a command is recorded, the
    Command Bus checks if that commandId already exists:
    - If new: Record command with status "pending", proceed to execution
    - If duplicate: Return cached result without re-execution

    This ensures retries are safe - network failures don't cause duplicate
    domain state changes.

    @acceptance-criteria
    Scenario: First command execution is recorded
      Given no command exists with id "cmd-123"
      When recording command "cmd-123" of type "CreateOrder"
      Then the command is recorded with status "pending"
      And the response indicates isNew = true

    @acceptance-criteria
    Scenario: Duplicate command returns cached result
      Given command "cmd-123" exists with status "executed" and result "success"
      When recording command "cmd-123" again
      Then the response indicates isNew = false
      And the cached result is returned

  # =============================================================================
  # RULE 2: Command Status Lifecycle
  # =============================================================================

  Rule: Status tracks the complete command lifecycle

    Commands progress through well-defined states:
    - **pending**: Command received, execution in progress
    - **executed**: Command succeeded, event(s) emitted
    - **rejected**: Business rule violation, no event emitted
    - **failed**: Unexpected error during execution

    The status is updated atomically with the command result, ensuring
    consistent state even under concurrent access.

    @acceptance-criteria
    Scenario: Successful command transitions to executed
      Given a command in "pending" status
      When the command handler returns success
      Then the status becomes "executed"
      And the result contains success data

    @acceptance-criteria
    Scenario: Business rejection transitions to rejected
      Given a command in "pending" status
      When the command handler returns rejected with code "INVALID_STATUS"
      Then the status becomes "rejected"
      And the result contains the rejection code

    @acceptance-criteria
    Scenario: Unexpected error transitions to failed
      Given a command in "pending" status
      When the command handler throws an unexpected error
      Then the status becomes "failed"
      And the result contains error details

  # =============================================================================
  # RULE 3: The 7-Step CommandOrchestrator
  # =============================================================================

  Rule: The CommandOrchestrator is the only command execution path

    Every command in the system flows through the same 7-step orchestration:

    | Step | Action | Component | Purpose |
    | 1 | Record command | Command Bus | Idempotency check |
    | 2 | Middleware | - | Auth, logging, validation |
    | 3 | Call handler | Bounded Context | CMS update via Decider |
    | 4 | Handle rejection | - | Early exit if business rule violated |
    | 5 | Append event | Event Store | Audit trail |
    | 6 | Trigger projection | Workpool | Update read models |
    | 7 | Update status | Command Bus | Final status + result |

    This standardized flow ensures:
    - Consistent dual-write semantics (CMS + Event in same transaction)
    - Automatic projection triggering
    - Consistent error handling and status reporting

  # =============================================================================
  # RULE 4: Correlation Enables Distributed Tracing
  # =============================================================================

  Rule: correlationId links commands, events, and projections

    Every command carries a correlationId that flows through the entire
    execution path:
    - Command -> Handler -> Event metadata -> Projection processing
    - Enables tracing a user action through all system components
    - Supports debugging and audit trail reconstruction

    The commandEventCorrelations table tracks which events were produced
    by each command, enabling forward (command -> events) lookups.

  # =============================================================================
  # RULE 5: Middleware Pipeline
  # =============================================================================

  Rule: Middleware provides composable cross-cutting concerns

    The CommandOrchestrator supports a middleware pipeline that wraps
    command execution with before/after hooks:

    - **Validation middleware**: Schema validation before handler
    - **Authorization middleware**: Permission checks
    - **Logging middleware**: Structured command logging
    - **Rate limiting**: Throttling by user/context

    Middleware executes in registration order, with early exit on failure.
    This separates infrastructure concerns from domain logic.
