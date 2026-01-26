@libar-docs
@libar-docs-implements:ProductionHardening
@acceptance-criteria
@libar-docs-status:roadmap
@libar-docs-phase:18
@libar-docs-product-area:Platform
Feature: Health Endpoints - Kubernetes Probes

  As a Kubernetes operator
  I want health check endpoints
  So that I can configure readiness and liveness probes for the application

  This is the implementation proof for the roadmap spec at:
  delivery-process/specs/platform/production-hardening.feature

  # ===========================================================================
  # TEST CONTEXT
  # ===========================================================================

  Background:
    Given the test environment is initialized
    And health check endpoints are configured

  # ===========================================================================
  # Rule: Health endpoints support Kubernetes probes
  #
  # vitest-cucumber SYNTAX: In step definitions, this becomes:
  #   Rule("Health endpoints support Kubernetes probes", ({ RuleScenario }) => {...})
  # ===========================================================================

  Rule: Health endpoints support Kubernetes probes

    /health/ready for readiness (dependencies OK), /health/live for liveness (process running).
    Implemented via Convex httpAction for HTTP access.

    @happy-path
    Scenario: Readiness probe checks dependencies
      # Implementation placeholder - stub scenario
      Given the health endpoint is configured
      When event store is reachable
      And projections are within lag threshold
      Then /health/ready should return 200
      And response body should include component statuses

    @validation
    Scenario: Unhealthy dependency fails readiness
      # Implementation placeholder - stub scenario
      Given event store is unreachable
      When /health/ready is called
      Then response should be 503
      And response body should identify failed component

    @happy-path
    Scenario: Liveness probe always succeeds
      # Implementation placeholder - stub scenario
      Given the health endpoint is configured
      When /health/live is called
      Then response should be 200
      And no dependency checks should be performed

    @edge-case
    Scenario: Projection lag threshold determines health
      # Implementation placeholder - stub scenario
      Given a projection with lag above threshold (100 events)
      When /health/ready is called
      Then response should be 503
      And response body should identify "projection_lag" as degraded

    @edge-case
    Scenario: Health response includes all component statuses
      # Implementation placeholder - stub scenario
      Given event store is healthy
      And projections have zero lag
      And workpool has pending jobs
      When /health/ready is called
      Then response should include status for "event_store", "projections", "workpool"
