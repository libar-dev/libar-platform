Feature: Process Manager Abstraction
  Event-triggered process managers with idempotent processing and logging infrastructure.

  Delivered comprehensive process manager infrastructure with event/time/hybrid trigger
  support. Implemented PM lifecycle state machine with 6 valid transitions (idle →
  processing → completed/failed). Built checkpoint-based idempotent processing with
  globalPosition tracking and dead letter recording. Created multi-PM executor for
  routing events to multiple process managers with correlation-based instance resolution.
  Introduced scoped logging infrastructure with 6-level logger aligned with Workpool,
  command logging helpers, and environment-based configuration (DEBUG for self-hosted,
  INFO for Convex Cloud).

  Key Deliverables:
  - Process manager definition types (defineProcessManager, trigger types: event/time/hybrid)
  - PM lifecycle state machine (6 transitions: idle/processing/completed/failed)
  - PM state CRUD operations (getOrCreatePMState, transitionPMState, recordPMDeadLetter)
  - PM checkpoint helper (withPMCheckpoint) for idempotent processing with globalPosition
  - PM executor (createProcessManagerExecutor, createMultiPMExecutor) with correlation routing
  - EventBus PM subscription helpers with default priority 200 (after projections, before sagas)
  - Logging module (createScopedLogger, command helpers: logCommandStart/Success/Rejected/Failed/Error)
  - processManagerStates and processManagerDeadLetters tables in Event Store
  - Environment-based log level configuration (PLATFORM_LOG_LEVEL)
  - ~86 new tests (78 unit + 8 integration)

  Major Patterns Introduced:
  - Process manager definition pattern
  - PM lifecycle state machine (6 transitions)
  - Checkpoint-based idempotent processing
  - Multi-PM executor routing
  - Correlation-based instance resolution
  - Dead letter recording for fault tolerance
  - Scoped logging infrastructure with prefix patterns
  - Command logging helpers pattern

  Architecture Decision Records:
  - ADR-033: Process Manager vs Saga Distinction

  Implemented in: deps/libar-dev-packages/packages/platform/bc/src/definitions/processManager.ts, deps/libar-dev-packages/packages/platform/core/src/processManager/, deps/libar-dev-packages/packages/platform/core/src/logging/, deps/libar-dev-packages/packages/platform/store/src/component/processManagerState.ts
