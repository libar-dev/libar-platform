Feature: Production Hardening
  Production-ready observability, monitoring, and operational tooling.

  Comprehensive production hardening including advanced observability, monitoring
  dashboards, error tracking, performance profiling, and operational tooling. Build
  on existing logging infrastructure (Phase 13) with metrics collection, distributed
  tracing, and health check endpoints. Implement circuit breakers, rate limiting
  refinements, and graceful degradation patterns. Create admin tooling for projection
  rebuilds, dead letter management, and system diagnostics.

  Sessions:
  - 18.1: Observability & Monitoring — Planned
  - 18.2: Error Tracking & Alerting — Planned
  - 18.3: Operational Tooling — Planned

  Key Deliverables:
  - Metrics collection and dashboards (Prometheus/Grafana integration)
  - Distributed tracing (OpenTelemetry integration)
  - Health check endpoints and liveness probes
  - Circuit breaker patterns for external dependencies
  - Admin tooling (projection rebuild, DLQ management)
  - Performance profiling and optimization tools
  - Graceful degradation patterns

  Major Patterns Introduced:
  - Production observability patterns
  - Circuit breaker pattern
  - Health check patterns
  - Admin tooling patterns
  - Performance profiling strategies

  Implemented in: deps/libar-dev-packages/packages/platform/core/src/monitoring/, examples/order-management/convex/admin/

  Background: Key Deliverables
    Given the following deliverables are planned:
      | Deliverable                        | Status | Tests | Location                                  |
      | Metrics collection integration     | 🔲     | 0     | @libar-dev/platform-core/src/monitoring/           |
      | Distributed tracing (OpenTelemetry)| 🔲     | 0     | @libar-dev/platform-core/src/monitoring/           |
      | Health check endpoints             | 🔲     | 0     | @libar-dev/platform-core/src/monitoring/           |
      | Circuit breaker implementation     | 🔲     | 0     | @libar-dev/platform-core/src/monitoring/           |
      | Admin tooling (projection rebuild) | 🔲     | 0     | examples/order-management/convex/admin/   |
      | Performance profiling tools        | 🔲     | 0     | @libar-dev/platform-core/src/monitoring/           |
      | Graceful degradation patterns      | 🔲     | 0     | @libar-dev/platform-core/src/monitoring/           |
