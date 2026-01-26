Feature: Workflow Configuration for Planning Sessions
  Configure delivery workflows at monorepo level to define session outputs.

  **Problem:**
  - Base process specs (PROCESS_MODEL.md, PROCESS_SETUP.md) define workflows
  - Monorepo needs customized workflow configuration for planning sessions
  - Not all sessions produce code - some produce designs, requirements, analysis
  - Need to define what each workflow type should output

  **Solution:**
  - Review base process specs for default workflows
  - Configure monorepo-specific workflow phases (Inception, Elaboration, etc.)
  - Define session types with expected artifacts:
    - Requirements: Feature files, PRD content
    - Analysis: Investigation notes, gap identification
    - Design: ADRs, architecture decisions
    - Implementation: Code, tests
    - Validation: DoD verification, acceptance testing
  - Create reusable session templates for each workflow type

  **Configuration Inheritance Architecture:**
  ```
  Universal (Package)                    Instance (Monorepo)
  ─────────────────────────────────────────────────────────
  deps/libar-dev-packages/packages/tooling/delivery-process/   delivery-process/
    catalogue/                              ├── fragments/
      ├── workflows/       ──(reference)──► ├── workflows/     (extend)
      ├── tag-sets/        ──(reference)──► ├── tag-sets/      (extend)
      ├── checklists/      ──(reference)──► ├── checklists/    (extend)
      ├── templates/       ──(reference)──► └── templates/     (extend)
      └── ...
  ```
  - Universal process definitions live in package catalogue/
  - Instance configurations reference exact versions or extend with overrides
  - Templates can be included in session prompts as instructions

  **Workflow Phases (from PROCESS_MODEL.md):**
  ```
  INCEPTION (Scoping) -> ELABORATION (Design) -> SESSION (Planning) ->
  CONSTRUCTION (Build) -> VALIDATION (DoD) -> RETROSPECTIVE (Review)
  ```

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location | Release |
      | Review PROCESS_MODEL.md workflows for applicability | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/PROCESS_MODEL.md | - |
      | Review PROCESS_SETUP.md session selection workflow | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/PROCESS_SETUP.md | - |
      | Define Requirements workflow artifacts for monorepo | Pending | No | - | - |
      | Define Analysis workflow artifacts for monorepo | Pending | No | - | - |
      | Define Design workflow artifacts for monorepo | Pending | No | - | - |
      | Create session template for Requirements sessions | Pending | No | delivery-process/templates/ | - |
      | Create session template for Analysis sessions | Pending | No | delivery-process/templates/ | - |
      | Create session template for Design sessions | Pending | No | delivery-process/templates/ | - |
      | Configure 6-phase-standard workflow for monorepo | Pending | No | delivery-process/workflows/ | - |
      | Document workflow configuration in CLAUDE.md | Pending | No | CLAUDE.md | - |
      | Design configuration inheritance architecture | Pending | No | - | - |
      | Create delivery-process/workflows/ directory structure | Pending | No | delivery-process/workflows/ | - |
      | Create delivery-process/checklists/ directory structure | Pending | No | delivery-process/checklists/ | - |
      | Create delivery-process/templates/ directory structure | Pending | No | delivery-process/templates/ | - |
      | Define how templates are included in session prompts | Pending | No | - | - |

  @acceptance-criteria
  Scenario: Planning sessions have defined outputs
    Given workflow configuration is complete
    When starting a planning session
    Then the expected artifacts for that workflow type are clear
    And session templates guide what to produce

  @acceptance-criteria
  Scenario: Non-code sessions are supported
    Given the delivery process supports multiple workflows
    When running an Analysis or Design session
    Then the process accommodates investigation and documentation
    And does not require code commits

  @acceptance-criteria
  Scenario: Configuration inheritance works
    Given universal process definitions exist in package catalogue/
    When configuring monorepo instance in delivery-process/
    Then instance can reference package definitions by name
    And instance can extend/override with repo-specific customizations
    And templates can be included in session prompts
