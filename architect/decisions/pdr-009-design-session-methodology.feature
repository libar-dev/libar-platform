@architect
@architect-adr:009
@architect-adr-status:accepted
@architect-adr-category:process
@architect-pattern:PDR009DesignSessionMethodology
@architect-status:completed
@architect-completed:2026-02-05
@architect-release:v0.2.0
@architect-phase:22
@architect-quarter:Q1-2026
@architect-product-area:Process
Feature: PDR-009 Design Session Methodology

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Stub management rules | Complete | PDR-009 (this file) |
      | Design category for ADR taxonomy | Complete | PDR-009 Rule 3 |
      | Design session prompt template | Complete | libar-platform/architect/DESIGN-SESSION-GUIDE.md |

  Rule: Context - Design sessions needed structured outputs beyond plan-level specs

    Plan-level specs (Gherkin feature files) capture WHAT to build: rules, acceptance criteria,
    deliverables. But design sessions also need to produce HOW decisions and interface contracts
    that bridge planning to implementation.

    Without a defined methodology:
    - Design documents (markdown) were created that duplicated spec content
    - Code stubs placed in real source folders broke compilation (missing _generated/server)
    - No clear pattern for where design-time artifacts live vs implementation artifacts
    - Architectural decisions scattered across prose documents without structured traceability

  Rule: Decision - Design sessions produce decision specs and code stubs

    Design sessions produce two types of outputs:

    | Output | Format | Location | Purpose |
    | Decision specs | Gherkin .feature | libar-platform/architect/decisions/ | Architectural decisions with lasting value |
    | Code stubs | TypeScript .ts | libar-platform/architect/stubs/{pattern-name}/ | Interface contracts, schemas, handler signatures |

    Design sessions do NOT produce:
    | Avoided Output | Why |
    | Design documents (markdown) | Decision specs provide better traceability with structured tags |
    | Implementation code | Design defines contracts; implementation is a separate session |

    @acceptance-criteria
    Scenario: Design session produces decision specs not documents
      Given a design session for a new bounded context component
      When architectural decisions are made during the session
      Then each lasting decision is recorded as a PDR in libar-platform/architect/decisions/
      And no markdown design documents are created in docs/

    @acceptance-criteria
    Scenario: Design session produces code stubs
      Given a design session that defines API contracts
      When handler signatures and schemas are specified
      Then code stubs are created in libar-platform/architect/stubs/{pattern-name}/
      And each stub has @architect-implements linking to the parent pattern
      And the real destination is indicated by an @architect-target tag in the JSDoc

  Rule: Decision - Stubs live outside compilation in libar-platform/architect/stubs/

    Code stubs created during design sessions would break compilation and linting if
    placed in real source folders:

    | Problem | Example |
    | Missing _generated/server | Convex component handler stubs import from generated code |
    | Unused variables | Handler args in stub bodies trigger eslint |
    | Progressive compilation | Cannot selectively enable parts of stub files |

    Solution: All stubs live in libar-platform/architect/stubs/{pattern-name}/ which is outside
    all package tsconfig and eslint scopes. Zero configuration changes needed.

    Stub rules:
    | Rule | Description |
    | @architect-implements | Each stub uses @architect-implements to link to the parent pattern |
    | @architect-target annotation | Each stub has an @architect-target tag indicating its real destination path |
    | @architect-* tags first | All @architect-* tags MUST appear first in the JSDoc block |
    | Pattern-based naming | Folder names use the pattern/feature name, not session numbers |
    | Implementation moves stubs | During implementation, stubs move from stubs/ to @architect-target locations |
    | Step definition stubs | Use existing tests/planning-stubs/ pattern (already excluded from test runner) |

    Naming convention: libar-platform/architect/stubs/{pattern-name-kebab-case}/

    | Correct | Incorrect |
    | agent-component-isolation/ | ds-1-component-isolation/ |
    | agent-handler-architecture/ | ds-2-handler-architecture/ |
    | agent-llm-integration/ | ds-3-llm-integration/ |

    Session numbers (ds-1, ds-2) are ephemeral internal designations. Pattern names
    are stable and meaningful beyond the current planning cycle.

    @acceptance-criteria
    Scenario: Stub file has target annotation
      Given a code stub in libar-platform/architect/stubs/agent-component-isolation/
      When reviewing the stub file
      Then @architect-* tags appear first in the JSDoc block
      And it contains @architect-implements linking to the parent pattern
      And the real destination is indicated by an @architect-target tag

    @acceptance-criteria
    Scenario: Stubs use pattern-based folder naming
      Given a design session for agent handler architecture
      When creating stubs
      Then the folder is named "agent-handler-architecture" not "ds-2-handler-architecture"

  Rule: Decision - Add design category for decision records

    The existing @architect-adr-category values (process, architecture) do not cover
    design-session scoped decisions about API shapes, schema strategies, and interface
    contracts that are specific to a feature but have lasting reference value.

    Updated category taxonomy:

    | Category | Scope | Examples |
    | process | Delivery methodology | Spec structure, FSM rules, tooling |
    | architecture | System-level technical | Data flow, component boundaries, protocols |
    | design | Design-session scoped | API shape, handler patterns, schema decisions |

    Additional categories (testing, integration) may be added when needed by future
    design sessions.

    Note: ADR/PDR numbering unification is deferred until after the Agent-as-BC
    design sessions complete. New decisions continue from PDR-009+ with appropriate
    category tags.

    @acceptance-criteria
    Scenario: Design-session decision uses design category
      Given a PDR recording an API shape decision from a design session
      When creating the decision record
      Then it uses @architect-adr-category:design

  Rule: Consequences - Clean separation of design-time and implementation artifacts

    Positive outcomes:
    - Stubs never break compilation or linting
    - Zero tsconfig/eslint configuration changes for design sessions
    - Decision specs provide structured traceability with tags
    - Pattern-based naming is stable across planning cycles
    - @architect-implements + @architect-target annotations create clear link from design to implementation

    Negative outcomes:
    - Stubs are not type-checked until implementation moves them to target locations
    - Additional step needed during implementation to move stubs
    - Design category adds a third taxonomy value to track
