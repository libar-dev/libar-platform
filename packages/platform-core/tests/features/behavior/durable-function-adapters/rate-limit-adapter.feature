@libar-docs-implements:DurableFunctionAdapters
@libar-docs-status:active
@libar-docs-phase:18a
@libar-docs-product-area:Platform
@acceptance-criteria
Feature: Rate Limit Adapter

  As a platform developer
  I want the middleware rate limiter to use @convex-dev/rate-limiter
  So that rate limiting is production-grade with persistence and sharding

  Background: Rate limiter component configured
    Given rate limit "testLimit" is configured with 10 requests per minute

  # ============================================================================
  # Happy Path
  # ============================================================================

  Rule: Adapter implements RateLimitChecker interface

    @happy-path
    Scenario: Adapter allows request within rate limit
      Given 5 requests have been made for key "user:alice"
      When checking rate limit for key "user:alice"
      Then the result should have allowed = true
      And retryAfterMs should be undefined

    @validation
    Scenario: Adapter rejects request exceeding rate limit
      Given 10 requests have been made for key "user:alice"
      When checking rate limit for key "user:alice"
      Then the result should have allowed = false
      And retryAfterMs should be greater than 0

  # ============================================================================
  # Key Isolation
  # ============================================================================

  Rule: Rate limits are isolated by key

    @edge-case
    Scenario: Different keys have independent limits
      Given user "alice" has exhausted her rate limit
      When checking rate limit for key "user:bob"
      Then the result should have allowed = true

    @edge-case
    Scenario: Same user different command types have independent limits
      Given user "alice" has exhausted limit for "commandA"
      When checking rate limit for "user:alice:commandB"
      Then the result should have allowed = true
