@libar-docs
@libar-docs-status:roadmap
@libar-docs-implements:IntegrationPatterns21a
@libar-docs-phase:21
@libar-docs-product-area:PlatformCore
@integration
Feature: Anti-Corruption Layer (ACL)

  As a platform developer
  I want ACL utilities to translate external models
  So that domain code remains clean of foreign concepts

  This feature validates ACL base types and translation
  patterns for external system integration.

  Background: Integration Module
    Given the integration module is imported from platform-core
    And ACL utilities are available

  # ============================================================================
  # ACL Definition
  # ============================================================================

  Rule: ACL defines translation interface

    ACLs provide a clean interface for external model translation.

    @acceptance-criteria @happy-path
    Scenario: Define ACL for payment gateway
      Given an external payment gateway with model { txn_id, amt, ccy, status }
      When I define a PaymentACL with fromGateway() method
      Then the ACL can translate gateway responses to domain models
      And domain models have { transactionId, amount, currency, status }

    @acceptance-criteria @happy-path
    Scenario: ACL translates field names
      Given external field "txn_id" maps to domain "transactionId"
      When ACL processes { txn_id: 'abc123' }
      Then result has { transactionId: 'abc123' }
      And result does NOT have txn_id

    @acceptance-criteria @happy-path
    Scenario: ACL transforms field values
      Given external "amt" is in cents (15000)
      And domain "amount.value" is in dollars
      When ACL processes { amt: 15000 }
      Then result has { amount: { value: 150.00 } }

  # ============================================================================
  # Bidirectional Translation
  # ============================================================================

  Rule: ACL supports bidirectional translation

    Some integrations require sending data TO external systems.

    @acceptance-criteria @happy-path
    Scenario: ACL translates domain to external
      Given a domain PaymentRequest { transactionId, amount, currency }
      When I call paymentACL.toGateway(domainModel)
      Then result has { txn_id, amt, ccy }
      And amounts are converted to cents

    @acceptance-criteria @happy-path
    Scenario: Round-trip translation preserves data
      Given a domain model
      When I call toGateway() then fromGateway()
      Then the result equals the original domain model

  # ============================================================================
  # Validation
  # ============================================================================

  Rule: ACL validates external input

    External data must be validated before translation.

    @acceptance-criteria @validation
    Scenario: Missing required external field
      Given external response missing "txn_id"
      When ACL processes the response
      Then an error is thrown with code "INVALID_EXTERNAL_RESPONSE"
      And error.field equals "txn_id"

    @acceptance-criteria @validation
    Scenario: Invalid external field type
      Given external response with amt: "not a number"
      When ACL processes the response
      Then an error is thrown with code "INVALID_EXTERNAL_RESPONSE"
      And error.field equals "amt"

    @acceptance-criteria @validation
    Scenario: Unknown external status
      Given external response with status: "unknown_status"
      When ACL processes the response
      Then an error is thrown with code "UNMAPPED_VALUE"
      And error.field equals "status"

  # ============================================================================
  # Multiple External Systems
  # ============================================================================

  Rule: Different ACLs for different external systems

    Each external system gets its own ACL.

    @acceptance-criteria @happy-path
    Scenario: Multiple payment gateways with different schemas
      Given StripeACL for Stripe responses { id, amount, currency }
      And PayPalACL for PayPal responses { transaction_id, value, cur_code }
      When processing responses from both systems
      Then both produce consistent domain PaymentConfirmation models
