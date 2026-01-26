@products @empty-state @requires-clean-docker
Feature: Empty Product Catalog
  Tests that verify empty state UI when no products exist.

  IMPORTANT: This test REQUIRES a fresh Docker environment.
  Run with: pnpm test:e2e:clean

  This test will fail if run against a database with existing products
  from previous test runs, because our namespace-based isolation strategy
  means old data persists (see ADR-031).

  @skip
  Scenario: Empty product catalog shows message
    Given no products exist
    When I navigate to the products page
    Then I should see the empty state message
