@libar-docs
@libar-docs-implements:ProductionHardening
@acceptance-criteria
@libar-docs-status:roadmap
@libar-docs-phase:18
@libar-docs-product-area:Platform
Feature: Rate Limiting - API Protection

  As a platform developer
  I want to rate limit commands and admin operations
  So that the system is protected from abuse and overload

  This is the implementation proof for the roadmap spec at:
  delivery-process/specs/platform/production-hardening.feature

  # ===========================================================================
  # TEST CONTEXT
  # ===========================================================================

  Background:
    Given the test environment is initialized
    And rate limiter component is mounted

  # ===========================================================================
  # Rule: Rate limiting protects command dispatch
  #
  # vitest-cucumber SYNTAX: In step definitions, this becomes:
  #   Rule("Rate limiting protects command dispatch", ({ RuleScenario }) => {...})
  # ===========================================================================

  Rule: Rate limiting protects command dispatch

    Commands are rate limited using @convex-dev/rate-limiter with token bucket
    algorithm. The middleware integrates via RateLimitChecker interface.

    @happy-path
    Scenario: Requests within rate limit succeed
      # Implementation placeholder - stub scenario
      Given rate limit "commandDispatch" allows 100 requests per minute
      And 50 requests have been made in the current window
      When a new command is dispatched
      Then the command should proceed to handler
      And rate limit bucket should show 51 consumed

    @validation
    Scenario: Requests exceeding rate limit are rejected
      # Implementation placeholder - stub scenario
      Given rate limit "commandDispatch" allows 100 requests per minute
      And 100 requests have been made in the current window
      When a new command is dispatched
      Then the command should be rejected with "RATE_LIMITED"
      And response should include "retryAfterMs"

    @edge-case
    Scenario: Token bucket refills over time
      # Implementation placeholder - stub scenario
      Given rate limit "commandDispatch" with rate 100/minute and capacity 150
      And bucket is depleted to 0 tokens
      When 30 seconds pass
      Then bucket should have approximately 50 tokens available

    @edge-case
    Scenario: Rate limit key isolation by user
      # Implementation placeholder - stub scenario
      Given rate limit key strategy is "byUserId"
      And user "alice" has exhausted her rate limit
      When user "bob" dispatches a command
      Then "bob"'s command should proceed
      And "alice" should remain rate limited

  # ===========================================================================
  # Rule: Admin operations have separate rate limits
  #
  # vitest-cucumber SYNTAX: In step definitions, this becomes:
  #   Rule("Admin operations have separate rate limits", ({ RuleScenario }) => {...})
  # ===========================================================================

  Rule: Admin operations have separate rate limits

    Admin operations like projection rebuilds use fixed window rate limits
    to prevent operational abuse while allowing legitimate maintenance.

    @happy-path
    Scenario: Admin rebuild respects hourly limit
      # Implementation placeholder - stub scenario
      Given rate limit "adminRebuild" allows 10 rebuilds per hour
      And 5 rebuilds have been triggered this hour
      When admin triggers another rebuild
      Then the rebuild should start
      And rebuild count should be 6

    @validation
    Scenario: Admin rebuild blocked when limit exceeded
      # Implementation placeholder - stub scenario
      Given rate limit "adminRebuild" allows 10 rebuilds per hour
      And 10 rebuilds have been triggered this hour
      When admin triggers another rebuild
      Then the operation should be rejected
      And response should indicate "Rate limit exceeded for adminRebuild"

  # ===========================================================================
  # Rule: Rate limiter adapter integrates with middleware
  #
  # vitest-cucumber SYNTAX: In step definitions, this becomes:
  #   Rule("Rate limiter adapter integrates with middleware", ({ RuleScenario }) => {...})
  # ===========================================================================

  Rule: Rate limiter adapter integrates with middleware

    The createConvexRateLimitAdapter bridges the existing RateLimitChecker interface
    to the @convex-dev/rate-limiter component for production use.

    @happy-path
    Scenario: Adapter converts component response to RateLimitResult
      # Implementation placeholder - stub scenario
      Given a rate limiter with "commandDispatch" limit configured
      When createConvexRateLimitAdapter is called
      Then it returns a function compatible with RateLimitChecker interface
      And the function returns { allowed: boolean, retryAfterMs?: number }

    @validation
    Scenario: Adapter handles component errors gracefully
      # Implementation placeholder - stub scenario
      Given rate limiter component throws an error
      When the adapter is invoked
      Then the error should propagate to caller
      And middleware should handle the error appropriately
