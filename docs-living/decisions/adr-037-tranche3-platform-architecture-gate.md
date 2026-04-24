# ADR-037: ADR 037 Tranche3 Platform Architecture Gate

**Purpose:** Architecture decision record for ADR 037 Tranche3 Platform Architecture Gate

---

## Overview

| Property | Value        |
| -------- | ------------ |
| Status   | accepted     |
| Category | architecture |

## Context

| Work family                      | Cost profile    | Current repo evidence                                                                                                 |
| -------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Shared contracts extraction      | Cheap and local | EventCategory, ProcessManagerStatus, and DCB scope-key contracts are duplicated or mirrored across packages           |
| Cleanup and layering enforcement | Medium          | platform-core root exports are broad and platform-bus/platform-store still reach into platform-core surfaces          |
| Full package splits              | Expensive       | platform-core and platform-store are still entangled with broad consumer usage in order-management and frontend infra |

| Observation                                                                                                                | Evidence                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| platform-core root index exports many non-kernel modules                                                                   | libar-platform/packages/platform-core/src/index.ts                                                                      |
| platform-store currently duplicates EventCategory and imports scope/global-position/auth helpers across package boundaries | libar-platform/packages/platform-store/src/client/index.ts, libar-platform/packages/platform-store/src/component/lib.ts |
| platform-bus still advertises a platform-core dependency and agent subscription helper tied to core event types            | libar-platform/packages/platform-bus/package.json, libar-platform/packages/platform-bus/src/agent-subscription.ts       |
| Existing completed package-architecture spec already documents a layered target but also records deferred extraction gaps  | libar-platform/architect/specs/platform/package-architecture.feature                                                    |

The remediation plan identified three kinds of tranche-3 work:


    Concrete repo observations from this design session:


    The gate therefore must prefer the smallest decision that reduces duplication immediately without forcing a migration wave across every platform consumer.

## Decision

| Question                                                                               | Decision                                                          | Rationale                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Split platform-core into kernel + agent + reservations + dcb + testing?                | No, not in tranche-3 packet 9                                     | Too many current consumers still import broad platform-core surfaces. A split now would turn one design gate into a multi-package migration program.                                                               |
| Split platform-store into events + pm-state + dcb-scopes + projection-status?          | No, not in tranche-3 packet 9                                     | platform-store still reaches into platform-core utility modules. Splitting before those utility seams are reduced would freeze accidental boundaries into new packages.                                            |
| Extract scope-key / EventCategory / ProcessManagerStatus to a zero-dependency package? | Yes, now                                                          | This is the cheapest high-value boundary improvement and directly reduces duplication between core, store, BC definitions, and bus-facing typed contracts.                                                         |
| Keep CommandBus / EventStore client classes?                                           | No long-term; defer runtime migration to follow-on cleanup packet | The classes are thin wrappers and should eventually be replaced by functions, but consumers currently instantiate them in app/frontend infrastructure. The design question is resolved; the migration is deferred. |

Design-gate answers:


    Chosen tranche-3 path for packet 9:

    1. Finalize ADR-037.
    2. Land P36 now via `@libar-dev/platform-contracts-shared`.
    3. Keep the repo on the non-split path.
    4. Execute P41 now as a non-split transitional guard that blocks new layering regressions while known reach-through debt remains explicitly enumerated.
    5. Explicitly reject P42 and P43 for this packet.

    This decision means no split migration document is required in this packet because the split path is not approved.

## Rules

### Shared contracts package is the only tranche-3 implementation authorized in this packet

| Contract                                                | Why it moves                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| EventCategory + EVENT_CATEGORIES + guard                | Shared by BC definitions, platform-core event routing, and platform-store client contracts |
| ProcessManagerStatus + PROCESS_MANAGER_STATUSES + guard | Shared by platform-core PM lifecycle types and platform-store PM state surfaces            |
| DCB scope-key types and parsing/validation helpers      | Shared boundary contract for scope keys without forcing store/core to duplicate the format |

| Consumer       | Required outcome                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| platform-core  | Re-export the shared contracts from existing public modules so external imports remain stable             |
| platform-store | Stop defining its own EventCategory copy in the client surface                                            |
| platform-bc    | Stop owning a second EventCategory tuple/guard implementation                                             |
| platform-bus   | Consume the shared EventCategory type where its public agent-subscription contract exposes event category |

The zero-dependency shared package is the implementation consequence of this decision.

    Required contents for `@libar-dev/platform-contracts-shared`:


    Required migration consequence:

### Transitional layering enforcement is required on the non-split path

| Guard behavior                                         | Required outcome                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Enforce allowed package dependency directions          | No new package manifest dependency may violate the non-split layering matrix            |
| Enforce package-name imports by layer                  | Foundation/shared packages cannot start importing higher layers                         |
| Track cross-package relative source imports explicitly | Only the known bus/store reach-throughs may remain; new reach-throughs fail the command |
| Exit non-zero on drift                                 | `pnpm lint:layers` must fail if the matrix or the acknowledged debt inventory regresses |

The no-split path still needs a real guardrail in this packet. Because bus/store retain a small number of
    known cross-package source reach-throughs, the layering command for packet 9 is transitional rather than
    aspirational:


    This command is intentionally honest about current debt: it does not claim zero cross-layer violations, but it
    does prevent the repo from sliding further away from the chosen non-split architecture.

### Revised tranche-3 execution list after the gate

| Pattern ID                            | Decision after ADR-037               | Notes                                                                                                       |
| ------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| P36 shared contracts package          | Approved and executed in this packet | Foundational, low blast radius                                                                              |
| P37 re-export shim deletion           | Deferred follow-on                   | Depends on import migration planning after P36 lands                                                        |
| P38 client classes -> functions       | Deferred follow-on                   | Decision made here: remove eventually, but not in this packet                                               |
| P39 bus agent-subscription relocation | Deferred follow-on                   | Still touches public imports and should land atomically with consumer rewiring                              |
| P40 platform-core root index slimming | Deferred follow-on                   | Safer after shared contracts are centralized and consumers are mapped                                       |
| P41 layering rules command            | Approved and executed in this packet | Implemented as a transitional non-split guard that enforces the matrix and freezes known reach-through debt |
| P42 platform-core split               | Rejected for this packet             | Not approved by ADR-037                                                                                     |
| P43 platform-store split              | Rejected for this packet             | Not approved by ADR-037                                                                                     |

Revised non-split pattern list:


    Consequences:
    - Positive: tranche-3 closes real duplication now without starting an uncontrolled migration wave.
    - Positive: the design questions are resolved enough for later cleanup packets to proceed deliberately.
    - Negative: root-export slimming and client cleanup remain follow-on work instead of closing in one packet.
    - Negative: bus/store source-level reach-throughs remain technical debt, but the new layering command now freezes that debt from growing.

---

[← Back to All Decisions](../DECISIONS.md)
