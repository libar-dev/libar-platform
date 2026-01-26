Feature: Command Bus Component
  Centralized command routing with middleware and idempotency.

  Delivered synchronous and asynchronous command dispatch with middleware pipeline,
  idempotent command execution via commandId deduplication, and atomic status transitions.
  Includes command result persistence, event correlation tracking, and CommandOrchestrator
  integration for the 7-step dual-write pattern. Implemented in packages/@convex-es/command-bus
  across 5 sessions with comprehensive schema and middleware infrastructure.
