# ✅ Package Architecture

**Purpose:** Detailed requirements for the Package Architecture feature

---

## Overview

| Property       | Value                                                |
| -------------- | ---------------------------------------------------- |
| Status         | completed                                            |
| Product Area   | Platform                                             |
| Business Value | focused packages for consumers with clear boundaries |
| Phase          | 13                                                   |

## Description

**Problem:**
The original @convex-es/core package grew to 25+ modules, creating issues:

- Large bundle size for consumers who only need specific patterns
- Unclear API surface (what's core vs experimental?)
- Testing sprawl (decider tests in example app, not package)
- Difficult to release patterns independently

**Solution:**
Extract focused pattern packages under @libar-dev/platform-\* namespace
with a layered architecture enforcing strict dependency direction.

Naming rationale:

- "Libar" means book/library, repository of knowledge/wisdom
- Events ARE the institutional memory - the "libar" of the system
- "Platform" indicates infrastructure for building applications

**Layered Architecture:**

Layer 0 - Foundation (Pure TypeScript, No Convex Dependencies):

- @libar-dev/platform-fsm: State machine definitions (defineFSM, canTransition)
- @libar-dev/platform-decider: Functional ES pattern (decide, evolve, Decider types)

Layer 1 - Infrastructure (Convex Components):

- @libar-dev/platform-store: Event store component (streams, globalPosition)
- @libar-dev/platform-bus: Command bus component (idempotency, correlation)

Layer 2 - Patterns (Framework Glue):

- @libar-dev/platform-core: Events, commands, ids, CMS types, middleware
  (includes DCB and Orchestrator as internal modules)

Layer 3 - Bounded Context:

- @libar-dev/platform-bc: BC contracts, definitions, cross-context patterns

**Known Gaps (deferred):**

- @libar-dev/platform-dcb not extracted (lives in platform-core/src/dcb/)
- @libar-dev/platform-orchestrator not extracted (lives in platform-core/src/orchestration/)
- Some duplicate tests remain in platform-core for FSM/Decider
- Testing-infrastructure feature files still in examples/ (minor)

## Acceptance Criteria

**platform-fsm has no dependencies**

- Given the @libar-dev/platform-fsm package
- When checking its dependencies
- Then it should have zero @libar-dev dependencies
- And it should have zero convex dependencies
- And it should be usable in pure Node.js/browser environments

**platform-decider depends only on platform-fsm**

- Given the @libar-dev/platform-decider package
- When checking its dependencies
- Then it should only depend on @libar-dev/platform-fsm
- And it should have zero convex dependencies

**Decider package is independently usable**

- Given a consumer wants to use only the decider pattern
- When they install @libar-dev/platform-decider
- Then they get decider types and factory functions
- And they do NOT get event-store, command-bus, or orchestration code
- And bundle size is minimal

**Packages are independently publishable**

- Given all @libar-dev/platform-\* packages
- When publishing to NPM
- Then each package can be versioned independently
- And consumers can install individual packages

**Framework tests live in framework packages**

- Given the @libar-dev/platform-decider package
- When checking the package contents
- Then tests/features/behavior/ contains BDD feature files
- And tests/steps/ contains step definitions
- And consumers can run tests to validate their environment

**Existing imports continue to work**

- Given existing code importing from @libar-dev/platform-core
- When platform-core re-exports from platform-fsm and platform-decider
- Then existing imports continue to work
- And no code changes required for consumers

**Platform namespace avoids conflicts**

- Given the @libar-dev namespace
- Then @libar-dev/platform-\* does not conflict with @libar-dev/core
- And @libar-dev/platform-_ does not conflict with @libar-dev/convex-_

## Business Rules

**Layer 0 packages have no framework dependencies**

_Verified by: platform-fsm has no dependencies, platform-decider depends only on platform-fsm_

**Consumers can install individual packages**

_Verified by: Decider package is independently usable, Packages are independently publishable_

**Tests ship with framework packages**

_Verified by: Framework tests live in framework packages_

**Backward compatibility is maintained**

_Verified by: Existing imports continue to work_

**No naming conflicts with libar-ai project**

_Verified by: Platform namespace avoids conflicts_

## Deliverables

- @libar-dev/platform-fsm package (complete)
- @libar-dev/platform-decider package (complete)
- @libar-dev/platform-store package (complete)
- @libar-dev/platform-bus package (complete)
- @libar-dev/platform-core package (complete)
- @libar-dev/platform-bc package (complete)
- Layer 0 zero-dependency enforcement (complete)
- Decider test migration to package (complete)
- FSM test migration to package (complete)
- Backward compatibility re-exports (complete)
- @libar-dev/platform-dcb extraction (deferred)
- @libar-dev/platform-orchestrator extraction (deferred)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
