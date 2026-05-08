@architect
@architect-pattern:ReactiveProjectionEligibility
@architect-implements:ReactiveProjections
@architect-status:completed
@architect-unlock-reason:value-transfer-add-reverse-tags-and-enrich-rule-blocks-per-new-architect-doctrine
@architect-phase:17
@architect-product-area:Platform
@acceptance-criteria
Feature: Reactive Eligibility by Category

  As a platform developer
  I want only view projections to support reactive updates
  So that system resources are optimized

  Background: Category validation setup
    # Implementation placeholder - stub setup
    Given the projection registry is available
    And projections are categorized by type

  # ============================================================================
  # Category-Based Eligibility
  # ============================================================================

  @happy-path
  Scenario Outline: Category determines reactive eligibility
  # Implementation placeholder - stub scenario
  Given a projection with category "<category>"
  Then it should <eligibility> for reactive updates

  Examples:
    | category    | eligibility       |
    | view        | be eligible       |
    | logic       | not be eligible   |
    | reporting   | not be eligible   |
    | integration | not be eligible   |

  # ============================================================================
  # Non-View Rejection
  # ============================================================================

  @validation
  Scenario: Non-view projection rejects reactive subscription
    # Implementation placeholder - stub scenario
    Given a projection with category "logic"
    When useReactiveProjection is called
    Then it should fail with code "REACTIVE_NOT_SUPPORTED"
    And error message should suggest using regular useQuery

  # ============================================================================
  # View Projection Full Functionality
  # ============================================================================

  @happy-path
  Scenario: View projection enables full reactive functionality
    # Implementation placeholder - stub scenario
    Given a projection with category "view"
    When useReactiveProjection is called
    Then reactive subscription is established
    And optimistic updates are enabled
    And conflict detection is active

  # ============================================================================
  # Initial Loading State
  # ============================================================================

  @unit
  Scenario: Initial reactive result represents loading state
  # Tests createInitialReactiveResult() returns correct loading state
  When createInitialReactiveResult is called
  Then state should be null
  And isLoading should be true
  And isOptimistic should be false
  And durablePosition should be 0
  And pendingEvents should be 0
  And error should be null

  # ============================================================================
  # Non-executable Invariants
  # ============================================================================

  # Invariant: Reactive subscriptions are accepted only for projections
  # declared with category "view". Logic, Reporting, and Integration projections
  # reject reactive subscription attempts with REACTIVE_NOT_SUPPORTED and direct
  # callers to plain useQuery or the appropriate alternative surface.
  # Rationale: Reactive infrastructure (WebSocket connections, change
  # detection, client-side optimistic state) is expensive. Limiting eligibility
  # to View projections keeps that cost proportional to user-visible benefit.
  # Logic, Reporting, and Integration projections target validation, analytics,
  # and cross-BC sync respectively; none gain from real-time push.
  # Covered by executable eligibility and rejection scenarios above.

  # Invariant: The hook returns a result object exposing a merged state
  # field (null when no durable projection exists yet), an isOptimistic flag
  # indicating whether optimistic events are currently overlaid, a
  # durablePosition cursor for the last processed global position, and a
  # pendingEvents count of unconfirmed optimistic events. Initial calls
  # represent a loading state with state=null, durablePosition=0, and
  # pendingEvents=0.
  # Rationale: Consumers of optimistic UI need to know not just the value
  # but also how confident to be in it (durable vs optimistic) and how many
  # events are still in flight. Surfacing those signals as first-class fields
  # on the hook return type lets components render appropriate confidence
  # affordances without reimplementing the merge logic.
  # Covered by the executable initial loading-state scenario above.
