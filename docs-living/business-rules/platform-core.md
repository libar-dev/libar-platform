# Platform Core Business Rules

**Purpose:** Business rules for the Platform Core product area

---

**6 rules** from 2 features. 6 rules have explicit invariants.

---

## Phase 19

### Bdd Testing Infrastructure Executable Tests

*As a platform developer*

---

#### Docker restart provides clean state between test suites

> **Invariant:** Between integration test suites, a Docker restart wipes the backend database, Workpool queue, and scheduled-function table. After restart, no entity, queued job, or scheduled function from a prior run is observable.
>
> **Rationale:** Workpool and Scheduler internal state is opaque — there is no programmatic cleanup API. Docker restart is the only deterministic way to guarantee a fresh state, which is required for integration tests to be reproducible. Skipping the restart causes state pollution to leak across suites in non-obvious ways.

**Verified by:**
- Fresh state after Docker restart
- Detect state pollution without restart
- Detect state pollution without restart

    Integration tests require a fresh database state. The Docker restart
    pattern ensures no state pollution from previous test runs.

---

#### Each test uses unique namespace to prevent collisions

> **Invariant:** Every test prefixes its logical entity ids and correlation ids with a unique per-test namespace. Two tests creating entities with the same logical id produce distinct stored ids and never collide.
>
> **Rationale:** Within a Docker-restart boundary, multiple individual tests share state. A unique namespace per test is what allows them to run independently within that boundary, and propagating the namespace into correlation ids enables event-trace attribution back to the specific test.

**Verified by:**
- Unique namespace per test
- Namespace applied to correlation IDs
- Namespace applied to correlation IDs

    Test namespacing allows multiple tests to run without entity ID
    collisions
- even when Docker is not restarted between individual tests.

---

#### Background jobs are isolated between tests

> **Invariant:** Workpool jobs and scheduled functions enqueued by one test are isolated from subsequent tests. Pending jobs from a previous test are not observable to the next test, and scheduled functions carry the originating test's namespace so cleanup can identify them.
>
> **Rationale:** Background jobs run asynchronously and may outlive the test that scheduled them. Without isolation, slow jobs from test-1 silently influence test-2's assertions. Namespacing scheduled functions allows targeted cleanup; full isolation across suites still requires a Docker restart.

**Verified by:**
- Workpool jobs from previous test don't interfere
- Scheduled functions use test-specific context
- Scheduled functions use test-specific context

    Workpool jobs and scheduled functions from one test should not
    affect another test's results.

*integration-isolation.feature*

### Bdd Testing Infrastructure Executable Tests

*As a platform maintainer*

---

#### Each platform package must have a tests/features/ directory

> **Invariant:** Every @libar-dev/platform-* package contains a tests/features/ directory with at least one .feature file. Public APIs are documented through executable BDD specifications, not standalone .test.ts files.
>
> **Rationale:** BDD as the exclusive testing approach for platform packages yields living documentation in business terms, ensures domain-expert readability of behavioural contracts, and prevents the package family from drifting back to opaque unit-test conventions.

**Verified by:**
- Package has feature directory - platform-core
- Package has feature directory - platform-decider
- Package has feature directory - platform-fsm
- Package has feature directory - platform-store
- Package has feature directory - platform-bus
- Package has feature directory - platform-bc
- Package has feature directory - platform-bc

    Platform packages expose public APIs that need BDD coverage.
    The tests/features/ directory is the standard location.

---

#### Public APIs must have corresponding feature files

> **Invariant:** Every exported function or type that is part of a platform package's public API has a feature file documenting its behaviour with happy-path and edge-case scenarios. Missing coverage is detected and surfaced by the coverage analyser.
>
> **Rationale:** Public-API drift between code and specification is the fastest way for living documentation to become misleading. Tying coverage to exports keeps the executable surface aligned with what consumers see.

**Verified by:**
- Exported function has feature coverage
- Missing coverage is detected
- Missing coverage is detected

    Each exported function or type that is part of the public API
    should have BDD coverage demonstrating its behavior.

---

#### Step definitions must be organized by domain

> **Invariant:** Step definitions are placed under tests/steps/ in per-domain files. No two step files declare the same Given/When/Then pattern; pattern conflicts are reported at load time rather than silently shadowing earlier bindings.
>
> **Rationale:** vitest-cucumber resolves duplicate step patterns by silently shadowing — only the last-loaded binding runs. Domain-scoped organisation prevents the silent-shadow class of bug entirely and keeps step ownership legible to reviewers.

**Verified by:**
- Step definitions follow naming convention
- Step file matches feature file
- Step file matches feature file

    To prevent step definition conflicts
- each package organizes
    steps by feature area in separate files.

*platform-coverage.feature*

---

[← Back to Business Rules](../BUSINESS-RULES.md)
