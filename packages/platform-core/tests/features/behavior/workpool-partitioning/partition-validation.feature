@libar-docs
@libar-docs-implements:WorkpoolPartitioningStrategy
Feature: Command Config Partition Key Validation

  As a platform developer
  I want command configs validated for partition keys
  So that missing or invalid partition keys are caught at startup

  Background: Validation error codes
    Given the validation error codes MISSING_PARTITION_KEY, INVALID_PARTITION_KEY_SHAPE, EMPTY_PARTITION_VALUE

  # ============================================================================
  # Valid Configuration
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Valid result for config with getPartitionKey
    Given a command config for "CreateOrder" with projection "orderSummary" using createEntityPartitionKey
    When I call validateCommandConfigPartitions
    Then the result should be valid
    And there should be 0 errors

  @acceptance-criteria @happy-path
  Scenario: Valid result for inline partition key function
    Given a command config for "CreateOrder" with projection "orderSummary" using inline function
    When I call validateCommandConfigPartitions
    Then the result should be valid

  @acceptance-criteria @happy-path
  Scenario: Validates secondary projections with getPartitionKey
    Given a command config with primary projection with getPartitionKey
    And secondary projections with getPartitionKey
    When I call validateCommandConfigPartitions
    Then the result should be valid

  @acceptance-criteria @happy-path
  Scenario: Validates failed projection with getPartitionKey
    Given a command config with primary projection with getPartitionKey
    And failed projection with getPartitionKey
    When I call validateCommandConfigPartitions
    Then the result should be valid

  # ============================================================================
  # Missing getPartitionKey Errors
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: Returns MISSING_PARTITION_KEY error for missing getPartitionKey
    Given a command config for "CreateOrder" with projection "orderSummary" missing getPartitionKey
    When I call validateCommandConfigPartitions
    Then the result should be invalid
    And there should be 1 error
    And the error code should be "MISSING_PARTITION_KEY"

  @acceptance-criteria @edge-case
  Scenario: Includes projection name in error
    Given a command config for "CreateOrder" with projection "orderSummary" missing getPartitionKey
    When I call validateCommandConfigPartitions
    Then the error projectionName should be "orderSummary"

  @acceptance-criteria @edge-case
  Scenario: Includes config path in error
    Given a command config for "CreateOrder" with projection "orderSummary" missing getPartitionKey
    When I call validateCommandConfigPartitions
    Then the error configPath should be "CreateOrder.projection"

  @acceptance-criteria @edge-case
  Scenario: Suggests helper functions in error message
    Given a command config for "CreateOrder" with projection "orderSummary" missing getPartitionKey
    When I call validateCommandConfigPartitions
    Then the error message should contain "createEntityPartitionKey"
    And the error message should contain "createCustomerPartitionKey"
    And the error message should contain "createSagaPartitionKey"
    And the error message should contain "GLOBAL_PARTITION_KEY"

  # ============================================================================
  # Invalid Partition Key Shape Errors
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: Returns INVALID_PARTITION_KEY_SHAPE when returning null
    Given a command config with getPartitionKey returning null
    When I call validateCommandConfigPartitions
    Then the result should be invalid
    And the error code should be "INVALID_PARTITION_KEY_SHAPE"

  @acceptance-criteria @edge-case
  Scenario: Returns INVALID_PARTITION_KEY_SHAPE when returning wrong type
    Given a command config with getPartitionKey returning a string
    When I call validateCommandConfigPartitions
    Then the result should be invalid
    And the error code should be "INVALID_PARTITION_KEY_SHAPE"

  @acceptance-criteria @edge-case
  Scenario: Returns INVALID_PARTITION_KEY_SHAPE when missing name
    Given a command config with getPartitionKey returning object with only value
    When I call validateCommandConfigPartitions
    Then the result should be invalid
    And the error code should be "INVALID_PARTITION_KEY_SHAPE"

  @acceptance-criteria @edge-case
  Scenario: Returns INVALID_PARTITION_KEY_SHAPE when missing value
    Given a command config with getPartitionKey returning object with only name
    When I call validateCommandConfigPartitions
    Then the result should be invalid
    And the error code should be "INVALID_PARTITION_KEY_SHAPE"

  @acceptance-criteria @edge-case
  Scenario: Returns INVALID_PARTITION_KEY_SHAPE when value is number
    Given a command config with getPartitionKey returning value as number
    When I call validateCommandConfigPartitions
    Then the result should be invalid
    And the error code should be "INVALID_PARTITION_KEY_SHAPE"

  # ============================================================================
  # Empty Partition Value Errors
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: Returns EMPTY_PARTITION_VALUE for empty string
    Given a command config with getPartitionKey returning empty string value
    When I call validateCommandConfigPartitions
    Then the result should be invalid
    And the error code should be "EMPTY_PARTITION_VALUE"

  @acceptance-criteria @edge-case
  Scenario: Returns EMPTY_PARTITION_VALUE for whitespace-only string
    Given a command config with getPartitionKey returning whitespace-only value
    When I call validateCommandConfigPartitions
    Then the result should be invalid
    And the error code should be "EMPTY_PARTITION_VALUE"

  # ============================================================================
  # Multiple Projection Validation
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: Collects errors from all projections
    Given a command config with all projections missing getPartitionKey
    When I call validateCommandConfigPartitions
    Then there should be 3 errors

  @acceptance-criteria @edge-case
  Scenario: Reports correct config paths for secondary projections
    Given a command config with valid primary projection
    And 2 secondary projections missing getPartitionKey
    When I call validateCommandConfigPartitions
    Then error 0 configPath should be "CreateOrder.secondaryProjections[0]"
    And error 1 configPath should be "CreateOrder.secondaryProjections[1]"

  @acceptance-criteria @edge-case
  Scenario: Reports correct config path for failed projection
    Given a command config with valid primary projection
    And failed projection missing getPartitionKey
    When I call validateCommandConfigPartitions
    Then the error configPath should be "CreateOrder.failedProjection"

  # ============================================================================
  # assertValidPartitionKeys Array Validation
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Does not throw for valid configs array
    Given an array of valid command configs
    When I call assertValidPartitionKeys
    Then no error should be thrown

  @acceptance-criteria @happy-path
  Scenario: Does not throw for empty array
    Given an empty array of command configs
    When I call assertValidPartitionKeys
    Then no error should be thrown

  @acceptance-criteria @edge-case
  Scenario: Throws on first invalid config
    Given an array with one invalid command config
    When I call assertValidPartitionKeys
    Then an error should be thrown with message containing "Partition key validation failed"

  @acceptance-criteria @edge-case
  Scenario: Includes all errors in thrown message
    Given an array with 2 invalid command configs
    When I call assertValidPartitionKeys
    Then an error should be thrown with message containing "2 projection(s)"

  @acceptance-criteria @edge-case
  Scenario: Includes error codes in thrown message
    Given an array with one config missing getPartitionKey
    When I call assertValidPartitionKeys
    Then an error should be thrown with message containing "MISSING_PARTITION_KEY"

  @acceptance-criteria @edge-case
  Scenario: Includes config path in thrown message
    Given an array with one config for "CreateOrder" missing getPartitionKey on primary projection
    When I call assertValidPartitionKeys
    Then an error should be thrown with message containing "CreateOrder.projection"
