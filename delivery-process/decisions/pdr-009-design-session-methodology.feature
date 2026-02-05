@libar-docs
@libar-docs-adr:009
@libar-docs-adr-status:accepted
@libar-docs-adr-category:process
@libar-docs-pattern:PDR009DesignSessionMethodology
@libar-docs-status:completed
@libar-docs-completed:2026-02-05
@libar-docs-release:v0.2.0
@libar-docs-phase:22
@libar-docs-quarter:Q1-2026
@libar-docs-product-area:Process
Feature: PDR-009 Design Session Methodology

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Stub management rules | Complete | PDR-009 (this file) |
      | Design category for ADR taxonomy | Complete | PDR-009 Rule 3 |
      | Design session prompt template | Complete | DESIGN-SESSION-GUIDE.md |

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
    | Decision specs | Gherkin .feature | delivery-process/decisions/ | Architectural decisions with lasting value |
    | Code stubs | TypeScript .ts | delivery-process/stubs/{pattern-name}/ | Interface contracts, schemas, handler signatures |

    Design sessions do NOT produce:
    | Avoided Output | Why |
    | Design documents (markdown) | Decision specs provide better traceability with structured tags |
    | Implementation code | Design defines contracts; implementation is a separate session |

    @acceptance-criteria
    Scenario: Design session produces decision specs not documents
      Given a design session for a new bounded context component
      When architectural decisions are made during the session
      Then each lasting decision is recorded as a PDR in delivery-process/decisions/
      And no markdown design documents are created in docs/

    @acceptance-criteria
    Scenario: Design session produces code stubs
      Given a design session that defines API contracts
      When handler signatures and schemas are specified
      Then code stubs are created in delivery-process/stubs/{pattern-name}/
      And each stub has a @target JSDoc comment indicating its real destination

  Rule: Decision - Stubs live outside compilation in delivery-process/stubs/

    Code stubs created during design sessions would break compilation and linting if
    placed in real source folders:

    | Problem | Example |
    | Missing _generated/server | Convex component handler stubs import from generated code |
    | Unused variables | Handler args in stub bodies trigger eslint |
    | Progressive compilation | Cannot selectively enable parts of stub files |

    Solution: All stubs live in delivery-process/stubs/{pattern-name}/ which is outside
    all package tsconfig and eslint scopes. Zero configuration changes needed.

    Stub rules:
    | Rule | Description |
    | @target comment | Each stub file has a @target JSDoc indicating its real destination path |
    | Pattern-based naming | Folder names use the pattern/feature name, not session numbers |
    | Implementation moves stubs | During implementation, stubs move from stubs/ to @target locations |
    | Step definition stubs | Use existing tests/planning-stubs/ pattern (already excluded from test runner) |

    Naming convention: delivery-process/stubs/{pattern-name-kebab-case}/

    | Correct | Incorrect |
    | agent-component-isolation/ | ds-1-component-isolation/ |
    | agent-handler-architecture/ | ds-2-handler-architecture/ |
    | agent-llm-integration/ | ds-3-llm-integration/ |

    Session numbers (ds-1, ds-2) are ephemeral internal designations. Pattern names
    are stable and meaningful beyond the current planning cycle.

    @acceptance-criteria
    Scenario: Stub file has target annotation
      Given a code stub in delivery-process/stubs/agent-component-isolation/
      When reviewing the stub file
      Then it contains a @target JSDoc comment like "@target platform-core/src/agent/component/checkpoints.ts"

    @acceptance-criteria
    Scenario: Stubs use pattern-based folder naming
      Given a design session for agent handler architecture
      When creating stubs
      Then the folder is named "agent-handler-architecture" not "ds-2-handler-architecture"

  Rule: Decision - Add design category for decision records

    The existing @libar-docs-adr-category values (process, architecture) do not cover
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
      Then it uses @libar-docs-adr-category:design

  Rule: Consequences - Clean separation of design-time and implementation artifacts

    Positive outcomes:
    - Stubs never break compilation or linting
    - Zero tsconfig/eslint configuration changes for design sessions
    - Decision specs provide structured traceability with tags
    - Pattern-based naming is stable across planning cycles
    - @target comments create clear link from design to implementation

    Negative outcomes:
    - Stubs are not type-checked until implementation moves them to target locations
    - Additional step needed during implementation to move stubs
    - Design category adds a third taxonomy value to track
