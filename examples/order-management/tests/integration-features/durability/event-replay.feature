@integration @durability @event-replay
Feature: Event Replay Infrastructure (App Integration)
  As a developer maintaining projections
  I want to rebuild projections from event history
  So that I can recover from bugs or add new projections

  Replay operations use checkpoints to track progress and enable
  resumption of long-running rebuilds.

  Background:
    Given the backend is running and clean

  Rule: Checkpoints track replay progress

    @checkpoint
    Scenario: Create a running checkpoint for replay
      When creating a checkpoint for projection "orderSummary"
      Then a checkpoint should exist in replayCheckpoints
      And the checkpoint status should be "running"
      And the checkpoint eventsProcessed should be 0

    @checkpoint
    Scenario: Update checkpoint progress
      Given a running checkpoint for projection "testProjection"
      When updating the checkpoint with 50 events processed
      Then the checkpoint eventsProcessed should be 50
      And the updatedAt timestamp should be recent

  Rule: Concurrent replays are prevented

    @idempotency
    Scenario: Cannot start replay for already running projection
      Given a running replay exists for projection "orderSummary"
      When attempting to start another replay for "orderSummary"
      Then the result should indicate REPLAY_ALREADY_ACTIVE

  Rule: Replay status can be queried

    @query
    Scenario: Query checkpoint by replayId
      Given a checkpoint exists with replayId "replay-test-001"
      When querying checkpoint by replayId
      Then the checkpoint should be returned with correct details

    @query
    Scenario: List checkpoints by status
      Given multiple checkpoints with different statuses exist
      When listing checkpoints with status "running"
      Then only running checkpoints should be returned
