@libar-docs
@libar-docs-implements:WorkpoolPartitioningStrategy
Feature: Projection Complexity Classifier

  As a platform developer
  I want projections classified by complexity characteristics
  So that I can select appropriate partition strategies

  Background: Classification decision tree
    Given the decision tree priority is global > saga > customer > entity

  # ============================================================================
  # Single Entity Projections (Default)
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Single entity projections recommend entity strategy
    Given projection characteristics with singleEntity true and all others false
    When I call classifyProjection
    Then the strategy should be "entity"

  @acceptance-criteria @happy-path
  Scenario: Single entity projections return simple complexity
    Given projection characteristics with singleEntity true and all others false
    When I call classifyProjection
    Then the complexity should be "simple"

  @acceptance-criteria @happy-path
  Scenario: Single entity projections include rationale about streamId
    Given projection characteristics with singleEntity true and all others false
    When I call classifyProjection
    Then the rationale should contain "streamId"
    And the rationale should contain "per-entity ordering"

  @acceptance-criteria @edge-case
  Scenario: Classification defaults to entity when all flags are false
    Given projection characteristics with all flags false
    When I call classifyProjection
    Then the strategy should be "entity"

  # ============================================================================
  # Global Rollup Projections
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Global rollup projections recommend global strategy
    Given projection characteristics with globalRollup true and singleEntity false
    When I call classifyProjection
    Then the strategy should be "global"

  @acceptance-criteria @happy-path
  Scenario: Global rollup projections return complex complexity
    Given projection characteristics with globalRollup true and singleEntity false
    When I call classifyProjection
    Then the complexity should be "complex"

  @acceptance-criteria @happy-path
  Scenario: Global rollup projections include rationale about OCC conflicts
    Given projection characteristics with globalRollup true and singleEntity false
    When I call classifyProjection
    Then the rationale should contain "OCC conflicts"

  @acceptance-criteria @validation
  Scenario: Global strategy prioritizes over other flags
    Given projection characteristics with all flags true
    When I call classifyProjection
    Then the strategy should be "global"

  # ============================================================================
  # Cross-Context Projections
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Cross-context projections recommend saga strategy
    Given projection characteristics with crossContext true and globalRollup false
    When I call classifyProjection
    Then the strategy should be "saga"

  @acceptance-criteria @happy-path
  Scenario: Cross-context projections return complex complexity
    Given projection characteristics with crossContext true and globalRollup false
    When I call classifyProjection
    Then the complexity should be "complex"

  @acceptance-criteria @happy-path
  Scenario: Cross-context projections include rationale about correlationId
    Given projection characteristics with crossContext true and globalRollup false
    When I call classifyProjection
    Then the rationale should contain "correlationId"
    And the rationale should contain "causal ordering"

  @acceptance-criteria @validation
  Scenario: Saga strategy prioritizes over customer and entity
    Given projection characteristics with singleEntity true, customerScoped true, crossContext true, globalRollup false
    When I call classifyProjection
    Then the strategy should be "saga"

  # ============================================================================
  # Customer-Scoped Projections
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Customer-scoped projections recommend customer strategy
    Given projection characteristics with customerScoped true and crossContext false and globalRollup false
    When I call classifyProjection
    Then the strategy should be "customer"

  @acceptance-criteria @happy-path
  Scenario: Customer-scoped projections return moderate complexity
    Given projection characteristics with customerScoped true and crossContext false and globalRollup false
    When I call classifyProjection
    Then the complexity should be "moderate"

  @acceptance-criteria @happy-path
  Scenario: Customer-scoped projections include rationale about customerId
    Given projection characteristics with customerScoped true and crossContext false and globalRollup false
    When I call classifyProjection
    Then the rationale should contain "customerId"
    And the rationale should contain "per-customer ordering"

  @acceptance-criteria @validation
  Scenario: Customer strategy prioritizes over entity
    Given projection characteristics with singleEntity true, customerScoped true, crossContext false, globalRollup false
    When I call classifyProjection
    Then the strategy should be "customer"

  # ============================================================================
  # Decision Tree Priority
  # ============================================================================

  @acceptance-criteria @validation
  Scenario: Decision tree follows priority global > saga > customer > entity
    Given projection characteristics with all flags true
    Then classifying should return strategy "global"
    Given projection characteristics with globalRollup false but all others true
    Then classifying should return strategy "saga"
    Given projection characteristics with globalRollup false, crossContext false, but customerScoped and singleEntity true
    Then classifying should return strategy "customer"
    Given projection characteristics with only singleEntity true
    Then classifying should return strategy "entity"

  # ============================================================================
  # PARALLELISM_BY_STRATEGY Constants
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario Outline: Strategy parallelism values
    When I access PARALLELISM_BY_STRATEGY for "<strategy>"
    Then the parallelism should be <parallelism>

    Examples:
      | strategy | parallelism |
      | entity   | 10          |
      | customer | 5           |
      | saga     | 5           |
      | global   | 1           |

  # ============================================================================
  # getRecommendedParallelism Function
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario Outline: Get recommended parallelism by strategy
    When I call getRecommendedParallelism with "<strategy>"
    Then the result should be <parallelism>

    Examples:
      | strategy | parallelism |
      | entity   | 10          |
      | customer | 5           |
      | saga     | 5           |
      | global   | 1           |
