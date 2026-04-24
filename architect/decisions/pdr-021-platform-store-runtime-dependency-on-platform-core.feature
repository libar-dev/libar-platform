@architect
@architect-adr:021
@architect-adr-status:accepted
@architect-adr-category:architecture
@architect-pattern:PDR021PlatformStoreRuntimeDependencyOnPlatformCore
@architect-status:completed
@architect-completed:2026-04-24
@architect-release:vNEXT
@architect-quarter:Q2-2026
@architect-product-area:Platform
@architect-depends-on:PDR017Tranche3PlatformArchitectureGate
Feature: PDR-021 - platform-store Runtime Dependency on platform-core Accepted with Constraints

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Decision spec (this file) | accepted | libar-platform/architect/decisions/pdr-021-platform-store-runtime-dependency-on-platform-core.feature |
      | AC4 disposition alignment | complete | REMEDIATION_PLAN.md |
      | AC2 deferral back-reference | complete | REMEDIATION_PLAN.md and libar-platform/architect/decisions/pdr-017-tranche-3-platform-architecture-gate.feature |

  Rule: Context - AC4 was raised as a phantom dependency, but live code already uses a narrow public runtime subset

    `@libar-dev/platform-store` still declares `@libar-dev/platform-core` because package managers operate at the
    package boundary, not at the import-subpath boundary. The relevant remediation question is therefore not whether
    the dependency exists, but whether the live imports stay inside a narrow, stable, public seam.

    Current live imports observed in repo source:

    | platform-store surface | Current public platform-core import |
    | `src/client/index.ts` | `@libar-dev/platform-core/events` |
    | `src/client/index.ts` | `@libar-dev/platform-core/security` |
    | `src/component/lib.ts` | `@libar-dev/platform-core/events` |
    | `src/component/lib.ts` | `@libar-dev/platform-core/durability` |
    | `src/component/lib.ts` | `@libar-dev/platform-core/validation` |
    | `src/component/lib.ts` | `@libar-dev/platform-core/processManager` |
    | `src/component/schema.ts` | `@libar-dev/platform-core/validation` |

    This is a constrained shared-runtime seam, not evidence that the full platform-core split from AC2 should happen
    inside this packet. AC2 remains deferred to PDR-017 follow-on work.

  Rule: Decision - Keep the runtime dependency only for the approved public subpaths and forbid all broader reach-throughs

    Approved import set for `@libar-dev/platform-store`:

    | Allowed public subpath | Why it is allowed now |
    | `@libar-dev/platform-core/events` | Shared global-position/event-row invariants must stay identical across store and consumers |
    | `@libar-dev/platform-core/security` | Verification-proof creation is already part of the live client contract |
    | `@libar-dev/platform-core/durability` | Idempotency fingerprinting and stable serialization are shared runtime invariants |
    | `@libar-dev/platform-core/validation` | Store validators already depend on the published boundary helpers |
    | `@libar-dev/platform-core/processManager` | Process-manager lifecycle helpers remain shared until a later extraction is approved |

    Forbidden imports for `@libar-dev/platform-store`:

    | Forbidden surface | Policy |
    | `@libar-dev/platform-core` root barrel | Forbidden |
    | `@libar-dev/platform-core/src/**` | Forbidden |
    | Private or non-exported internal paths | Forbidden |
    | Agent, orchestration, reservations, DCB, monitoring, testing, or any other platform-core surface outside the approved set | Forbidden |

    Growth rule:
    - The approved set is intentionally narrow and frozen to the five public subpaths listed above.
    - New imports outside that set are not allowed as incremental convenience changes.
    - If `platform-store` needs additional `platform-core` surfaces, the follow-up work must extract or publish a smaller
      dedicated package or boundary under the tranche-3 architecture path instead of widening this allowlist.
    - `platform-store` must not create new cyclic dependency growth with `platform-core`; future seam expansion requires an
      explicit follow-up decision rather than silent coupling drift.

    @acceptance-criteria @happy-path
    Scenario: AC4 is closed by a constrained dependency decision rather than a package rewrite
      Given `@libar-dev/platform-store` still declares `@libar-dev/platform-core`
      When the live imports are audited
      Then only the approved public subpaths are allowed
      And the dependency is accepted with constraints instead of being described as phantom

    @acceptance-criteria @validation
    Scenario: The constrained dependency does not reopen the deferred platform-core split
      Given AC2 remains a tranche-3 architecture concern
      When the remediation sources are reviewed
      Then AC4 is recorded as `resolved-via-PDR-021`
      And AC2 is recorded as `deferred-to-Tranche-3-PDR-017`
      And no approval is implied for agent, orchestration, reservations, DCB, monitoring, testing, or other new platform-core imports

  Rule: Consequences - The repo keeps truthful dependency metadata while freezing the seam from growing silently

    Positive outcomes:
    - AC4 is resolved by recording the real dependency shape instead of pretending the live runtime seam does not exist
    - The allowed public-subpath set is explicit enough for README, layer-policy, and future extraction work to agree
    - The decision keeps shared invariants centralized without turning this packet into a package-split migration

    Negative outcomes:
    - `platform-store` still carries a package-level dependency on `@libar-dev/platform-core` until a later extraction occurs
    - Future growth beyond the approved set now requires a deliberate follow-up decision instead of a quick import addition
