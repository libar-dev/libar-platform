Feature: Agent as Bounded Context
  Demonstrate AI agent as event reactor pattern with autonomous command emission.

  Implement AI agent as first-class bounded context subscribing to domain events via
  EventBus and emitting commands autonomously. Build Agent BC example demonstrating
  pattern detection (e.g., order submission → inventory reservation) with autonomous
  command emission. Integrate with @convex-dev/agent for LLM reasoning. Establish
  patterns for agent state management, EventBus subscriptions, and command validation.
  Demonstrate culminating pattern integrating Deciders, ECST, Reactive Projections,
  and Integration Patterns.

  Sessions:
  - 22.1: Agent BC Pattern Documentation + EventBus Subscriptions — Planned
  - 22.2: Example Agent BC (pattern detection, command emission) — Planned

  Key Deliverables:
  - Agent BC example in examples/order-management/convex/contexts/agent/
  - EventBus subscription patterns for agents
  - Agent state management patterns
  - Integration with @convex-dev/agent
  - Pattern detection logic (order submission → inventory check)
  - Autonomous command emission with validation
  - Agent BC documentation and guidelines

  Major Patterns Introduced:
  - Agent as Bounded Context pattern
  - AI-driven event reactors
  - Autonomous command emission
  - Agent state management
  - LLM integration with event-sourced systems

  Implemented in: examples/order-management/convex/contexts/agent/, docs/architecture/AGENT_AS_BC.md

  Background: Key Deliverables
    Given the following deliverables are planned:
      | Deliverable                      | Status | Tests | Location                                      |
      | Agent BC example implementation  | 🔲     | 0     | examples/order-management/convex/contexts/agent/ |
      | EventBus subscription patterns   | 🔲     | 0     | examples/order-management/convex/contexts/agent/ |
      | Agent state management           | 🔲     | 0     | examples/order-management/convex/contexts/agent/ |
      | @convex-dev/agent integration    | 🔲     | 0     | examples/order-management/convex/contexts/agent/ |
      | Pattern detection logic          | 🔲     | 0     | examples/order-management/convex/contexts/agent/ |
      | Autonomous command emission      | 🔲     | 0     | examples/order-management/convex/contexts/agent/ |
      | Agent BC documentation           | 🔲     | 0     | docs/architecture/AGENT_AS_BC.md              |
