@libar-docs-implements:DurableFunctionAdapters
@libar-docs-status:active
@libar-docs-phase:18a
@libar-docs-product-area:Platform
@acceptance-criteria
Feature: Adapter Integration Patterns

  As a platform developer
  I want adapters to integrate seamlessly with existing infrastructure
  So that I can adopt production patterns without refactoring

  Background: Platform infrastructure configured
    Given platform infrastructure is configured for integration tests

  # ============================================================================
  # Middleware Integration
  # ============================================================================

  Rule: Rate limit adapter integrates with middleware pipeline

    @integration
    Scenario: Adapter plugs into existing middleware
        Given rate limit middleware at order 50
      And ConvexRateLimitAdapter is configured
      When a command is dispatched
      Then rate limit should be checked via the adapter
      And middleware order should be preserved

    @integration
    Scenario: Rate limited command returns standard rejection
        Given rate limit is exhausted for current user
      When a command is dispatched
      Then the result should have status "rejected"
      And the code should be "RATE_LIMITED"
      And context should include retryAfterMs

  # ============================================================================
  # DCB Integration
  # ============================================================================

  Rule: DCB retry integrates with Workpool infrastructure

    @integration
    Scenario: DCB retry uses separate Workpool
        Given dcbRetryPool is configured with maxParallelism 10
      And projectionPool is configured separately
      When a DCB conflict triggers retry
      Then retry should be enqueued to dcbRetryPool
      And projectionPool should not be affected

    @integration
    Scenario: Retry mutation receives correct arguments
        Given a DCB operation with scope "tenant:t1:res:r1"
      When conflict triggers retry
      Then retry mutation should receive updated expectedVersion
      And retry mutation should receive incremented attempt
      And retry mutation should receive original DCB config

    @integration
    Scenario: DCB retry with onComplete callback integration
        Given dcbRetryPool supports onComplete callbacks
      And a DCB operation with onComplete configured
      When conflict triggers retry that eventually succeeds
      Then onComplete mutation should receive the success result
      And parallel DCB operations should each track independently

    @integration
    Scenario: Workpool does not retry DCB mutations - clarification
        # Note: DCB conflicts return { status: "conflict" } which is a successful return,
      # not an exception. Workpool only retries on exceptions.
      Given dcbRetryPool has maxAttempts 1 at Workpool level
      And withDCBRetry has maxAttempts 5 at DCB level
      When a DCB mutation throws an exception - not OCC conflict
      Then Workpool should NOT retry as exception is final failure
      And onComplete should receive failed result

  # ============================================================================
  # Component Mounting
  # ============================================================================

  Rule: Convex components mount correctly

    @integration
    Scenario: Rate limiter component creates tables
        Given convex.config.ts includes rate limiter component
      When deployment runs
      Then rate limiter internal tables should exist
      And rate limiter API should be accessible

    @integration
    Scenario: Multiple Workpools can coexist
        Given convex.config.ts includes projectionPool
      And convex.config.ts includes dcbRetryPool
      When deployment runs
      Then both Workpools should have independent state
      And both should be addressable by name
