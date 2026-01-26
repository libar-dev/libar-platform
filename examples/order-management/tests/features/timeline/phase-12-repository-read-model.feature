Feature: Repository & Read Model Infrastructure
  Projection registry, lifecycle management, and query abstraction layer.

  Delivered comprehensive read model infrastructure with projection registry system
  supporting primary, secondary, and cross-context projections. Implemented projection
  lifecycle state machine with 10 valid transitions (active, rebuilding, paused, error).
  Created query abstraction layer with support for single, list, paginated, and count
  queries. Built cursor-based pagination helpers with configurable page sizes (default
  20, max 100). Migrated all 4 example projections to defineProjection() pattern with
  automatic rebuild ordering.

  Key Deliverables:
  - Projection registry (createProjectionRegistry) with event subscription lookup
  - Projection lifecycle state machine (10 transitions: active/rebuilding/paused/error)
  - projectionStatus table in Event Store for lifecycle tracking
  - Query abstraction (defineQuery, createReadModelQuery, createPaginatedQuery)
  - Pagination helpers (encodeCursor, decodeCursor, normalizePaginationOptions)
  - Projection type taxonomy (primary, secondary, cross-context)
  - Rebuild order management (primary before cross-context)
  - ~60 unit tests for projection system

  Major Patterns Introduced:
  - Projection registry with definition pattern
  - Projection lifecycle state machine
  - Query factory pattern with type inference
  - Cursor-based pagination
  - Rebuild order dependency management
  - Cross-context projection support

  Implemented in: packages/@convex-es/bounded-context/src/definitions/projection.ts, deps/libar-dev-packages/packages/platform/core/src/projections/, deps/libar-dev-packages/packages/platform/core/src/queries/
