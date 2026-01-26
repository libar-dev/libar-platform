@integration @durability @publication
Feature: Durable Cross-Context Publication (App Integration)
  As a developer using event sourcing
  I want cross-context event publications to be tracked and retryable
  So that events are reliably delivered even when target contexts fail

  Cross-context events use Workpool-backed publication with tracking,
  retry, and dead letter handling. This ensures reliable communication
  between bounded contexts.

  Background:
    Given the backend is running and clean
    And durable publication is configured with maxAttempts 3

  Rule: Publications create tracking records

    @tracking
    Scenario: Publishing creates records for each target context
      Given an event "evt-pub-001" to publish to contexts "inventory" and "notifications"
      When publishing the event via durable publisher
      Then 2 publication records should exist in eventPublications
      And each record should have status "pending"
      And each record should have attemptCount 0
      And each record should have a unique publicationId

    @tracking
    Scenario: Publication records contain event metadata
      Given an event "evt-pub-002" with correlationId "corr-pub-002"
      And target context "inventory"
      When publishing the event via durable publisher
      Then the publication record should have correlationId "corr-pub-002"
      And the publication record should have sourceContext "orders"
      And the publication record should have targetContext "inventory"

  Rule: Publication results provide tracking information

    @result
    Scenario: Publish result contains publication IDs
      Given an event "evt-pub-003" to publish to contexts "inventory" and "analytics"
      When publishing the event via durable publisher
      Then the result should have eventId "evt-pub-003"
      And the result should have 2 publications
      And each publication should have a publicationId starting with "pub_"
      And each publication should have status "pending"

  Rule: Publication status can be queried

    @query
    Scenario: Query publications by event ID
      Given 3 publications exist for event "evt-pub-004"
      When querying publications for event "evt-pub-004"
      Then 3 publication records should be returned

    @query
    Scenario: Query returns empty for unknown event
      Given no publications exist for event "evt-pub-unknown"
      When querying publications for event "evt-pub-unknown"
      Then 0 publication records should be returned

    @query
    Scenario: Query publications by status
      Given publications exist with various statuses
      When querying publications with status "delivered"
      Then only delivered publications should be returned

  Rule: Publication stats provide visibility

    @monitoring
    Scenario: Stats show counts by status
      Given multiple publications with various statuses exist
      When querying publication stats
      Then stats should show correct counts per status

  Rule: Multiple events maintain isolation

    @isolation
    Scenario: Publications for different events are isolated
      Given two events are published to different contexts
      When querying publications for the first event
      Then only that event's publication should be returned
