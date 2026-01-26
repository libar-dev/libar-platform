@integration @durable-adapters @rate-limiting
Feature: Rate Limiting Middleware (App Integration)
  As a developer using the order-management app
  I want commands to be rate limited at the middleware level
  So that the system is protected from excessive requests

  The rate limiting demonstrates the Layered Infrastructure Pattern:
  - Middleware Pipeline: Rate limit check before business logic
  - CommandOrchestrator: Receives middleware rejection
  - BC Components: Never reached if rate limited (pure domain protected)

  Rate limit configuration:
  - commandDispatch: 100 req/min with burst capacity 150
  - testLimit: 10 req/min (used for testing)

  Background:
    Given the backend is running and clean

  Rule: Rate limit adapter implements RateLimitChecker interface

    @happy-path
    Scenario: Normal requests pass rate limiting
      Given the rate limit quota is not exhausted
      When I check the rate limit for user "alice" and command "CreateOrder"
      Then the rate limit should allow the request
      And retryAfterMs should not be present

    @rate-limited
    Scenario: Exhausted rate limit rejects request
      Given the rate limit quota is exhausted for user "bob"
      When I check the rate limit for user "bob" and command "CreateOrder"
      Then the rate limit should reject the request
      And retryAfterMs should be greater than 0

  Rule: Rate limits are isolated by key

    @key-isolation
    Scenario: Different users have independent limits
      Given user "alice" has exhausted her testLimit quota
      When I check the rate limit for user "bob" with testLimit
      Then the rate limit should allow the request

    @key-isolation
    Scenario: Same user different command types have independent limits
      Given user "charlie" has exhausted limit for "CreateOrder"
      When I check the rate limit for user "charlie" and command "AddOrderItem"
      Then the rate limit should allow the request

  Rule: Rate limiting integrates with CommandOrchestrator

    @middleware-integration
    Scenario: Rate limited command returns standard rejection
      Given the testLimit quota is exhausted for user "dave"
      When user "dave" executes a CreateOrder command
      Then the command should be rejected with code "RATE_LIMITED"
      And the result should include retryAfterMs in context

    @skip-list
    Scenario: Health check commands bypass rate limiting
      Given the rate limit quota is exhausted for user "system"
      When user "system" executes a GetSystemHealth command
      Then the command should succeed
      And rate limiting should be skipped

  Rule: Rate limiter uses sharding for high throughput

    @sharding
    Scenario: High-volume rate limit uses sharded counting
      Given the commandDispatch rate limit has 50 shards configured
      When multiple concurrent requests are checked
      Then requests should be distributed across shards
      And total rate should approximate the configured limit
