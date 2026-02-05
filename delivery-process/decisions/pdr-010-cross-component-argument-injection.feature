@libar-docs
@libar-docs-adr:010
@libar-docs-adr-status:accepted
@libar-docs-adr-category:architecture
@libar-docs-pattern:PDR010CrossComponentArgumentInjection
@libar-docs-status:completed
@libar-docs-completed:2026-02-05
@libar-docs-release:v0.2.0
@libar-docs-phase:22a
@libar-docs-quarter:Q1-2026
@libar-docs-product-area:Platform
@libar-docs-depends-on:AgentBCComponentIsolation
@libar-docs-infra
Feature: PDR-010 Cross-Component Argument Injection Pattern

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Pattern definition | Complete | PDR-010 (this file) |
      | Type stubs | Complete | delivery-process/stubs/agent-component-isolation/cross-bc-query.ts |

  Rule: Context - Components cannot query outside their isolated database

    Convex components have isolated databases. A component's handlers can only access
    tables defined in that component's schema. This is by design — it enforces bounded
    context isolation at the infrastructure level.

    When a component needs data from outside its boundary (e.g., an app-level projection
    or another component's data), it cannot query that data directly:

    | Constraint | Implication |
    | Isolated databases | Component handlers cannot ctx.db.query app-level tables |
    | No cross-component joins | Cannot combine component data with app data in a single query |
    | API boundary only | All cross-component data access goes through handler arguments or return values |

    This creates a challenge: How does a component receive data it needs from outside
    its boundary without violating isolation?

    Alternatives considered:

    | Option | Pros | Cons |
    | A: Argument injection (chosen) | Caller controls data loading; component stays pure; no coupling | Caller must know what data to load; additional handler args |
    | B: Callback pattern | Component requests data via callback | Complex; breaks transactional guarantees; component aware of external schema |
    | C: Duplicate data into component | Fast reads; no cross-boundary queries | Redundant storage; consistency risk; event subscription needed |
    | D: Shared database layer | Simplest queries | Violates BC isolation; defeats purpose of components |

  Rule: Decision - Caller pre-loads external data and passes as handler arguments

    When a component handler needs data from outside its boundary, the app-level caller
    loads that data and passes it as an argument to the handler.

    The pattern:

    | Step | Actor | Action |
    | 1 | App-level code | Queries app-level projection or other component |
    | 2 | App-level code | Shapes data into typed container |
    | 3 | App-level code | Passes container as argument to component handler |
    | 4 | Component handler | Receives pre-loaded data; processes without external queries |

    Type contract: Each component defines an InjectedData interface that declares
    what external data its handlers may receive. All fields are optional (data may
    not be available for all invocations).

    This keeps the component "pure" — it processes data it receives without
    knowledge of where that data came from or how it was loaded.

    @acceptance-criteria
    Scenario: Agent handler receives projection data as argument
      Given the agent component needs customer cancellation history
      And the customerCancellations projection lives at the app level
      When the app-level subscription handler triggers the agent
      Then it pre-loads cancellation data from the projection
      And passes it as an argument to the agent component handler
      And the agent handler does not query any app-level tables

    @acceptance-criteria
    Scenario: Missing external data is handled gracefully
      Given a new customer with no cancellation history in the projection
      When the agent handler receives an event for this customer
      Then the injected customerHistory field is undefined
      And the handler proceeds with available data
      And no error is thrown

    @acceptance-criteria
    Scenario: InjectedData interface is extensible
      Given the agent component currently only needs cancellation history
      When a future pattern requires order frequency data
      Then a new optional field is added to AgentEventHandlerInjectedData
      And existing handlers continue to work without changes

  Rule: Consequences - Clean isolation at the cost of caller complexity

    Positive outcomes:
    - Component remains truly isolated — no knowledge of external schema
    - Caller has full control over data loading (can optimize, cache, batch)
    - Typed InjectedData interface provides compile-time safety
    - Pattern is testable — inject mock data in tests without projections
    - Applicable to any BC component, not just Agent

    Negative outcomes:
    - Caller must know what data the component needs (coupling at orchestration layer)
    - Additional argument overhead on handler signatures
    - If component needs different external data for different operations,
      the InjectedData container may grow large
