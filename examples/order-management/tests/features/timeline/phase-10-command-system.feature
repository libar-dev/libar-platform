Feature: Command System Enhancement
  Command categorization, registry, middleware pipeline, and batch execution.

  Delivered comprehensive command infrastructure with 4-tier categorization taxonomy
  (aggregate, process, system, batch) and enforced verb-first naming policy. Implemented
  CommandRegistry for centralized command lookup and introspection. Built extensible
  middleware pipeline with 5 built-in middlewares (validation, authorization, logging,
  rate limiting). Created batch execution system supporting both atomic (all-or-nothing)
  and partial (best-effort) semantics. Introduced 4-tier error categorization with
  recovery guidance (DOMAIN, VALIDATION, CONCURRENCY, INFRASTRUCTURE).

  Key Deliverables:
  - Command categorization (ADR-030): aggregate, process, system, batch
  - Command naming policy with verb-first enforcement (Create*, Submit*, Cancel*, etc.)
  - CommandRegistry with defineAggregateCommand, defineProcessCommand helpers
  - Middleware pipeline with ordering (10-Structure, 20-Domain, 30-Auth, 40-Logging, 50-RateLimit)
  - Batch execution with atomic (sequential) and partial (concurrent) modes
  - Error categorization (DOMAIN, VALIDATION, CONCURRENCY, INFRASTRUCTURE)
  - ~285 new tests for commands, commandEventCorrelations table

  Major Patterns Introduced:
  - Command categorization taxonomy
  - Verb-first command naming convention
  - Middleware pipeline with ordered execution
  - Command registry with introspection
  - Dual-mode batch execution (atomic vs partial)
  - Error recovery guidance by category

  Architecture Decision Records:
  - ADR-030: Command Categorization and Naming Policy

  Implemented in: deps/libar-dev-packages/packages/platform/core/src/commands/, deps/libar-dev-packages/packages/platform/core/src/middleware/, deps/libar-dev-packages/packages/platform/core/src/batch/
