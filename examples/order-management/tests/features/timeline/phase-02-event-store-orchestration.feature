Feature: Event Store and Orchestration Infrastructure
  Centralized event storage with orchestration infrastructure for reliable projections.

  Delivered stream-based event persistence with optimistic concurrency control, atomic
  globalPosition allocation, and comprehensive database schema. Integrated Workpool for
  projection processing, Action Retrier for external APIs, and Workflow for saga execution.
  Supports exactly-once processing with checkpoint-based resumability. Implemented in
  packages/@convex-es/event-store across 5 sessions with external Convex component dependencies.
