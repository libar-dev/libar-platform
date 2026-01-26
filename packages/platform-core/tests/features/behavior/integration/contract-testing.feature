@libar-docs
@libar-docs-status:roadmap
@libar-docs-implements:IntegrationPatterns21b
@libar-docs-phase:21
@libar-docs-product-area:PlatformCore
@integration
Feature: Contract Testing Utilities

  As a platform developer
  I want utilities for contract testing integration events
  So that producer-consumer compatibility is validated

  This feature validates contract sample generation,
  producer tests, and consumer tests.

  Background: Integration Module
    Given the integration module is imported from platform-core
    And contract testing utilities are available

  # ============================================================================
  # Contract Sample Generation
  # ============================================================================

  Rule: Generate valid contract samples

    Samples are generated from registered schemas for testing.

    @acceptance-criteria @happy-path
    Scenario: Generate sample from schema
      Given a registered schema "OrderSubmittedV1"
      When I call createContractSample('OrderSubmittedV1')
      Then a valid sample event is generated
      And it passes OrderSubmittedV1 schema validation

    @acceptance-criteria @happy-path
    Scenario: Generate sample with overrides
      Given a registered schema "OrderSubmittedV1"
      When I call createContractSample('OrderSubmittedV1', { orderId: 'custom_123' })
      Then sample.orderId equals "custom_123"
      And other fields have generated values

    @acceptance-criteria @happy-path
    Scenario: Generate multiple samples
      Given a registered schema "OrderSubmittedV1"
      When I call createContractSamples('OrderSubmittedV1', 10)
      Then I receive 10 unique sample events
      And all pass schema validation

  # ============================================================================
  # Producer Contract Tests
  # ============================================================================

  Rule: Validate producer emits valid events

    Producers must emit events matching the contract schema.

    @acceptance-criteria @happy-path
    Scenario: Producer emits valid event
      Given a producer function that creates OrderSubmitted events
      When I run createProducerContractTest('OrderSubmittedV1', producer)
      Then test passes when producer emits valid V1 events

    @acceptance-criteria @validation
    Scenario: Producer emits invalid event
      Given a producer that emits events missing "orderId"
      When I run createProducerContractTest('OrderSubmittedV1', producer)
      Then test fails with "SCHEMA_VALIDATION_FAILED"
      And error identifies missing field

    @acceptance-criteria @validation
    Scenario: Producer emits wrong version
      Given a producer emitting V2 events
      When I run createProducerContractTest('OrderSubmittedV1', producer)
      Then test fails with "VERSION_MISMATCH"

  # ============================================================================
  # Consumer Contract Tests
  # ============================================================================

  Rule: Validate consumer handles valid events

    Consumers must correctly process events matching the contract.

    @acceptance-criteria @happy-path
    Scenario: Consumer processes valid event
      Given a consumer handler for OrderSubmitted
      When I run createConsumerContractTest('OrderSubmittedV1', consumer)
      Then test passes when consumer processes sample events

    @acceptance-criteria @happy-path
    Scenario: Consumer handles all sample variations
      Given a consumer handler for OrderSubmitted
      When I run createConsumerContractTest with 100 samples
      Then consumer successfully processes all 100 samples

    @acceptance-criteria @validation
    Scenario: Consumer rejects valid event
      Given a consumer that throws on valid V1 events
      When I run createConsumerContractTest('OrderSubmittedV1', consumer)
      Then test fails with "CONSUMER_REJECTED_VALID_EVENT"

  # ============================================================================
  # Contract Compatibility
  # ============================================================================

  Rule: Detect producer-consumer mismatches

    Contract tests catch version mismatches early.

    @acceptance-criteria @happy-path
    Scenario: Compatible producer and consumer
      Given producer emitting OrderSubmittedV1
      And consumer expecting OrderSubmittedV1
      When I run verifyContractCompatibility(producer, consumer, 'OrderSubmittedV1')
      Then verification passes

    @acceptance-criteria @validation
    Scenario: Incompatible versions detected
      Given producer emitting OrderSubmittedV2
      And consumer expecting OrderSubmittedV1
      And no downcaster registered
      When I run verifyContractCompatibility(producer, consumer)
      Then verification fails with "SCHEMA_MISMATCH"
      And suggestion mentions "register downcaster V2 → V1"

    @acceptance-criteria @happy-path
    Scenario: Compatible with downcaster
      Given producer emitting OrderSubmittedV2
      And consumer expecting OrderSubmittedV1
      And downcaster V2 → V1 is registered
      When I run verifyContractCompatibility(producer, consumer)
      Then verification passes

  # ============================================================================
  # Contract Violation Detection (Phase 18 integration)
  # ============================================================================

  Rule: Contract violations are detected and recorded

    Violation detection integrates with Phase 18 metrics infrastructure.

    @acceptance-criteria @happy-path
    Scenario: Contract violation is recorded
      Given a schema mismatch detected at runtime
      When violation detection processes the mismatch
      Then a ContractViolation is created
      And it includes eventType, producerVersion, consumerExpectedVersion
      And it includes timestamp and details
      And it is passed to ContractMetrics.recordViolation()

    @acceptance-criteria @happy-path
    Scenario: Query contract violations
      Given multiple contract violations have been recorded
      When I call contractMetrics.getViolations()
      Then I receive all recorded violations
      And they are sorted by timestamp descending

    @acceptance-criteria @happy-path
    Scenario: Query violations since timestamp
      Given violations recorded at different times
      When I call contractMetrics.getViolations({ since: oneHourAgo })
      Then I receive only violations from the last hour

    @acceptance-criteria @edge-case
    Scenario: No violations returns empty array
      Given no contract violations have been recorded
      When I call contractMetrics.getViolations()
      Then I receive an empty array
