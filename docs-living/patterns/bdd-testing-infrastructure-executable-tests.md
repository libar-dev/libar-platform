# ✅ Bdd Testing Infrastructure Executable Tests

**Purpose:** Detailed documentation for the Bdd Testing Infrastructure Executable Tests pattern

---

## Overview

| Property | Value                  |
| -------- | ---------------------- |
| Status   | completed              |
| Category | Testing Infrastructure |
| Phase    | 19                     |

## Description

As a platform maintainer
  I want all platform packages to have BDD test coverage
  So that public APIs are documented through executable specifications

  This feature validates that each @libar-dev/platform-* package has
  appropriate BDD test coverage for its public APIs, following the
  Gherkin-only testing policy.

  Coverage Requirements: All platform packages (core, decider, fsm, store, bus, bc)
  must have tests/features/behavior/ directories with BDD coverage for public APIs.

## Acceptance Criteria

**Package has feature directory - platform-core**

- Given package @libar-dev/platform-core
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-decider**

- Given package @libar-dev/platform-decider
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-fsm**

- Given package @libar-dev/platform-fsm
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-store**

- Given package @libar-dev/platform-store
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-bus**

- Given package @libar-dev/platform-bus
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-bc**

- Given package @libar-dev/platform-bc
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Exported function has feature coverage**

- Given an exported function "createDeciderHandler"
- When checking BDD coverage
- Then a feature file should document its behavior
- And scenarios should cover happy path and edge cases

**Missing coverage is detected**

- Given an exported function without feature coverage
- When running coverage analysis
- Then a warning should be generated
- And the missing function should be listed

**Step definitions follow naming convention**

- Given package @libar-dev/platform-core
- When checking step definition organization
- Then steps should be in tests/steps/ directory
- And each feature area has its own step file
- And no duplicate step patterns exist across files

**Step file matches feature file**

- Given feature file "decider-outputs.feature"
- When looking for step definitions
- Then steps should be in "steps/decider/outputs.steps.ts" or "steps/decider.steps.ts"

## Business Rules

**Each platform package must have a tests/features/ directory**

**Invariant:** Every @libar-dev/platform-* package contains a tests/features/
    directory with at least one .feature file. Public APIs are documented
    through executable BDD specifications, not standalone .test.ts files.

    **Rationale:** BDD as the exclusive testing approach for platform packages
    yields living documentation in business terms, ensures domain-expert
    readability of behavioural contracts, and prevents the package family from
    drifting back to opaque unit-test conventions.

    **Verified by:** Package has feature directory - platform-core,
    Package has feature directory - platform-decider,
    Package has feature directory - platform-fsm,
    Package has feature directory - platform-store,
    Package has feature directory - platform-bus,
    Package has feature directory - platform-bc

    Platform packages expose public APIs that need BDD coverage.
    The tests/features/ directory is the standard location.

_Verified by: Package has feature directory - platform-core, Package has feature directory - platform-decider, Package has feature directory - platform-fsm, Package has feature directory - platform-store, Package has feature directory - platform-bus, Package has feature directory - platform-bc_

**Public APIs must have corresponding feature files**

**Invariant:** Every exported function or type that is part of a platform
    package's public API has a feature file documenting its behaviour with
    happy-path and edge-case scenarios. Missing coverage is detected and
    surfaced by the coverage analyser.

    **Rationale:** Public-API drift between code and specification is the
    fastest way for living documentation to become misleading. Tying coverage
    to exports keeps the executable surface aligned with what consumers see.

    **Verified by:** Exported function has feature coverage,
    Missing coverage is detected

    Each exported function or type that is part of the public API
    should have BDD coverage demonstrating its behavior.

_Verified by: Exported function has feature coverage, Missing coverage is detected_

**Step definitions must be organized by domain**

**Invariant:** Step definitions are placed under tests/steps/ in per-domain
    files. No two step files declare the same Given/When/Then pattern; pattern
    conflicts are reported at load time rather than silently shadowing earlier
    bindings.

    **Rationale:** vitest-cucumber resolves duplicate step patterns by silently
    shadowing — only the last-loaded binding runs. Domain-scoped organisation
    prevents the silent-shadow class of bug entirely and keeps step ownership
    legible to reviewers.

    **Verified by:** Step definitions follow naming convention,
    Step file matches feature file

    To prevent step definition conflicts, each package organizes
    steps by feature area in separate files.

_Verified by: Step definitions follow naming convention, Step file matches feature file_

---

[← Back to Pattern Registry](../PATTERNS.md)
