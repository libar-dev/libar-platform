Feature: Modular CLAUDE.md with Hybrid Generation
  Transform CLAUDE.md from monolithic file to modular, partially-generated system.

  **Problem:**
  - Current CLAUDE.md is 896 lines of organically accumulated content (2 weeks rapid iteration)
  - No variation support - same content for all work contexts
  - Manual maintenance burden - updates lag code changes
  - Mixed content types: some should be generated, some static
  - No evidence-based effectiveness tracking
  - Difficult to compose different "views" for different session types

  **Solution:**
  - Extract CLAUDE.md build system to delivery-process package
  - Create hybrid architecture: generated + manual modules
  - Support tag-based variations (patterns, process, security, etc.)
  - Integrate with @libar-docs annotations for auto-generated pattern docs
  - Enable session templates as includable prompt content
  - Add effectiveness tracking for evidence-based content decisions

  **Architecture:**
  ```
  Universal Layer (delivery-process)     Instance Layer (project)
  ─────────────────────────────────────────────────────────────
  catalogue/                             delivery-process/
    ├── claude-md/                         ├── claude-md/
    │   ├── critical-rules/                │   ├── metadata.json
    │   ├── patterns/                      │   ├── generated/
    │   └── workflows/                     │   └── manual/
    └── metadata/                          └── templates/
        └── claude-md.schema.json

  Output: CLAUDE.md (default), CLAUDE-patterns.md, CLAUDE-process.md
  ```

  **Content Classification:**
  | Content Type | Generation | Source |
  |--------------|------------|--------|
  | Project vision | Manual | Static repo description |
  | Architecture | Generated | @libar-docs annotations |
  | Commands | Manual | package.json (changes rarely) |
  | Patterns | Generated | @libar-docs-pattern tags |
  | Key Rules | Manual | Critical constraints |
  | Skills | Generated | Skills definitions |
  | Active Phase | Generated | .feature @libar-process-status:active |

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location | Release |
      | Design metadata.json schema for CLAUDE.md | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/catalogue/metadata/ | - |
      | Extract claude-md build scripts to package | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/src/claude-md/ | - |
      | Create claude-md generator in delivery-process | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/src/generators/built-in/claude-md/ | - |
      | Create universal critical-rules templates | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/catalogue/claude-md/critical-rules/ | - |
      | Create universal patterns templates | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/catalogue/claude-md/patterns/ | - |
      | Create universal workflows templates | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/catalogue/claude-md/workflows/ | - |
      | Create instance delivery-process/claude-md/ directory | Pending | No | delivery-process/claude-md/ | - |
      | Create instance metadata.json configuration | Pending | No | delivery-process/claude-md/metadata.json | - |
      | Decompose current CLAUDE.md into modules | Pending | No | delivery-process/claude-md/manual/ | - |
      | Identify content for @libar-docs generation | Pending | No | - | - |
      | Wire claude-md generator to package.json | Pending | No | package.json | - |
      | Create docs:claude-md command | Pending | No | package.json | - |
      | Implement tag-based variation filtering | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/src/claude-md/ | - |
      | Create default variation (core-mandatory) | Pending | No | delivery-process/claude-md/metadata.json | - |
      | Create patterns variation (architecture focus) | Pending | No | delivery-process/claude-md/metadata.json | - |
      | Create process variation (delivery focus) | Pending | No | delivery-process/claude-md/metadata.json | - |
      | Integrate session templates as includable content | Pending | No | - | - |
      | Add effectiveness tracking schema | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/catalogue/metadata/ | - |
      | Migrate current CLAUDE.md content to new structure | Pending | No | CLAUDE.md | - |
      | Verify generated CLAUDE.md matches or improves current | Pending | No | - | - |
      | Document modular CLAUDE.md in PROCESS_SETUP.md | Pending | No | deps/libar-dev-packages/packages/tooling/delivery-process/PROCESS_SETUP.md | - |

  @acceptance-criteria
  Scenario: CLAUDE.md is generated from modules
    Given metadata.json defines sections and variations
    And modules exist in manual/ and generated/ directories
    When running pnpm docs:claude-md
    Then CLAUDE.md is compiled from modules
    And section numbering is automatic
    And token count is reported

  @acceptance-criteria
  Scenario: Variations produce different outputs
    Given multiple variations are configured (default, patterns, process)
    When building each variation
    Then each produces appropriately filtered content
    And token budgets are respected per variation

  @acceptance-criteria
  Scenario: Pattern content is auto-generated
    Given @libar-docs-pattern annotations exist in code
    When running docs:claude-md
    Then pattern modules are generated in generated/patterns/
    And changes to code annotations update CLAUDE.md

  @acceptance-criteria
  Scenario: Session templates are includable
    Given session templates exist in catalogue/templates/
    When starting a specific session type (inception, elaboration, etc.)
    Then appropriate templates can be included in session prompt
    And templates reference current CLAUDE.md content
