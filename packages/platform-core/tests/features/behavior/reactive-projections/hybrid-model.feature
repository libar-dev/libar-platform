@architect
@architect-pattern:ReactiveProjectionHybridModel
@architect-implements:ReactiveProjections
@architect-status:completed
@architect-unlock-reason:value-transfer-add-reverse-tags-and-enrich-rule-blocks-per-new-architect-doctrine
@architect-phase:17
@architect-product-area:Platform
@acceptance-criteria
Feature: Hybrid Model - Durable + Reactive Projections

  As a frontend developer
  I want projections that combine durability with instant feedback
  So that users see optimistic updates while maintaining data integrity

  Background: Hybrid projection setup
    # Implementation placeholder - stub setup
    Given the reactive projection system is initialized
    And a view projection "orderSummary" is registered

  # ============================================================================
  # Instant Optimistic Update
  # ============================================================================

  @happy-path
  Scenario: Client receives instant update then durable confirmation
  # Implementation placeholder - stub scenario
  Given an order is submitted
  When the OrderSubmitted event is published
  Then client sees optimistic update within 50ms
  And Workpool updates durable projection within 500ms
  And client state converges to durable state

  # ============================================================================
  # Workpool Backlog Handling
  # ============================================================================

  @validation
  Scenario: Optimistic update works during Workpool backlog
    # Implementation placeholder - stub scenario
    Given the Workpool has a processing backlog
    When an event is published
    Then client sees optimistic update immediately
    And optimistic state includes pending event
    And durable state catches up when Workpool processes

  # ============================================================================
  # State Convergence
  # ============================================================================

  @happy-path
  Scenario: Durable state takes precedence after convergence
    # Implementation placeholder - stub scenario
    Given optimistic state from events A, B
    And Workpool processes events A, B
    When durable projection is updated
    Then optimistic overlay clears for processed events
    And client shows durable state

  # ============================================================================
  # Non-executable Invariants
  # ============================================================================

  # Invariant: Workpool handles durable persistence (100-500ms latency) while
  # a reactive layer pushes optimistic updates to clients within 50ms. Both
  # systems operate on the same projection without interference: optimistic
  # state is overlaid on the durable base, and converges to the durable state
  # once Workpool catches up.
  # Rationale: Workpool alone yields 100-500ms latency, which feels sluggish
  # for direct user actions. Pure client-side optimism alone loses durability.
  # Combining the two preserves Convex-native durability while delivering UI
  # feedback at perceptual-instant latency, with graceful degradation when
  # optimism conflicts with durable truth.
  # Covered by executable hybrid-model scenarios above.
